// server/routes/ukraine/modelRunner.js
//
// Run orchestration for the Ukraine FBMC model (plan task 2.2, D4).
// Anatomy (mirrors routes/empire/modelRunner.js, transcomp-style awaits):
//   GET /run-script?runName=&configId=&forceRerun=
//     1. resolve the user's config (configId or selected doc, else defaults)
//     2. validate (hour-precision window, 7-day cap D6, manifest scenario,
//        strategy whitelists, VOLL range) -> 400 on errors
//     3. duplicate-run detection via run signature -> reused response
//     4. global single-run lock (runState.tryStartRun) -> 409 if held
//     5. materialize the run yaml from config/web_template.yaml into
//        PyPSA-Ukraine/results/web_runs/_work/<run_id>/config.yaml
//     6. spawn the worker:
//        - SSH mode (Linux server): sync the input dir to the Windows box
//          (copyDirectoryToWindows -> C:\model-results\_work\<run_id>),
//          then run scripts/run_ukraine_remote.ps1 there via the
//          "ukraine" command template; output streams back over SSH
//        - local mode (server on the Windows box): spawn the same
//          run_ukraine_remote.ps1 directly (no SSH hop; used for the
//          Phase 2.6 e2e and single-box deployments)
//     7. SSE lines via runState.appendLine (client subscribes to
//        /api/ukraine/runHistory/stream)
//     8. on success: copy slim web results back (scp) when remote,
//        write run_signature.json, save the Run doc, notify by email
//     9. release the lock on every path

import express from "express";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { resolveRepoPath } from "../../utils/paths.js";
import { appendLine, endRun, tryStartRun } from "../../utils/runState.js";
import { sendEmail } from "../../utils/emailService.js";
import User from "../../models/User.js";
import Run from "../../models/Run.js";
import Config from "../../models/Config.js";
import {
  buildRunId,
  copyDirectoryToWindows,
  copyResultsFromWindows,
  expandTemplate,
  getWindowsCommandTemplate,
  spawnWindowsSshCommand,
  streamChildOutput,
  waitForExit,
  windowsRunnerEnabled,
} from "../../utils/windowsRemoteRun.js";
import {
  MODEL_KEY,
  DISPLAY_NAME,
  RUNS_ROOT,
  WORK_ROOT,
  buildRunSignature,
  ensureDir,
  getScenarioEntry,
  materializeRunYaml,
  resolveRepoFile,
  sanitizeRunName,
  validateValues,
} from "./shared.js";

const router = express.Router();
// scripts/run_ukraine_remote.ps1 lives in the website_clone checkout; the
// same candidate resolution as the package root handles both the production
// container (/workspace) and bare dev runs.
const LOCAL_WORKER_SCRIPT = resolveRepoFile("scripts", "run_ukraine_remote.ps1");

// Plan 4.1: hard ceiling so a hung worker (SSH drop, stuck solve) cannot hold
// the global single-run lock forever. 360 min covers a 7-day N-1 window
// (~7 x 25 min + overhead) with headroom; per-deploy override.
const RUN_TIMEOUT_MINUTES = Math.max(
  1,
  Number(process.env.UKRAINE_RUN_TIMEOUT_MINUTES || "360") || 360
);

async function notifyCompletionEmail({ userId, runName, runId, success, details }) {
  if (!userId) return;

  const user = await User.findById(userId).lean();
  if (!user?.email) return;

  const frontendUrl = String(process.env.FRONTEND_URL || "").replace(/\/$/, "");
  const resultsLink = frontendUrl ? `${frontendUrl}/models/ukraine/results` : "";

  const subject = success
    ? `[Ukraine] Run completed: ${runName}`
    : `[Ukraine] Run failed: ${runName}`;

  const text = success
    ? `Run ${runName} (${runId}) of ${DISPLAY_NAME} completed successfully. ${resultsLink ? `Results: ${resultsLink}` : ""}`
    : `Run ${runName} (${runId}) of ${DISPLAY_NAME} failed. ${details || "No additional details."}`;

  const html = success
    ? `<p>Run <b>${runName}</b> (${runId}) of ${DISPLAY_NAME} completed successfully.</p>${resultsLink ? `<p>Results: <a href="${resultsLink}">${resultsLink}</a></p>` : ""}`
    : `<p>Run <b>${runName}</b> (${runId}) of ${DISPLAY_NAME} failed.</p><pre>${String(details || "No additional details.")}</pre>`;

  await sendEmail({ to: user.email, subject, text, html });
}

// Only ever deletes inside the server-side work root (per-run input dirs).
function safeRmWorkDir(targetPath) {
  if (!targetPath) return;
  const absoluteTarget = path.resolve(targetPath);
  const allowedRoot = path.resolve(WORK_ROOT);
  if (absoluteTarget.startsWith(allowedRoot + path.sep) && fs.existsSync(absoluteTarget)) {
    fs.rmSync(absoluteTarget, { recursive: true, force: true });
  }
}

// Plan 4.1: kill the whole worker process tree. Local mode spawns powershell
// on win32 whose python children survive a plain child.kill(); taskkill /T
// takes the whole tree down. SSH mode kills the ssh client — the remote
// process on the compute box may linger (see Docs/Ukraine_Ops_Runbook.md).
function killChildTree(child, mode) {
  if (!child || child.exitCode !== null) return;
  if (mode === "local" && process.platform === "win32" && child.pid) {
    spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"]);
  } else {
    try {
      child.kill("SIGKILL");
    } catch {
      // already gone
    }
  }
}

router.get("/run-script", async (req, res) => {
  const requestedRunName = sanitizeRunName(req.query.runName);
  const { configId, forceRerun } = req.query;
  const shouldForceRerun = String(forceRerun || "false").toLowerCase() === "true";
  let runInputDir = null;
  let lockHeld = false;
  let responseSent = false;

  try {
    // 1. Resolve the user's config (explicit configId, selected doc, defaults)
    let configDoc = null;
    if (configId) {
      configDoc = await Config.findOne({ _id: configId, owner: req.user.id, model: MODEL_KEY });
      if (!configDoc) {
        return res.status(404).json({ error: "Selected config was not found for this user." });
      }
    } else {
      configDoc = await Config.findOne({ owner: req.user.id, model: MODEL_KEY, isSelected: true }).sort({ updatedAt: -1 });
    }
    const configContent = configDoc?.content && typeof configDoc.content === "object" ? configDoc.content : {};
    const resolvedConfigId = configDoc ? String(configDoc._id) : null;

    // 2. Validate (plan D6: hour-precision window, 7-day cap, whitelists)
    const validation = validateValues(configContent);
    if (!validation.normalized) {
      return res.status(400).json({
        error: "Ukraine config is invalid",
        errors: validation.errors,
        warnings: validation.warnings,
      });
    }
    const effective = validation.normalized;
    const scenario = getScenarioEntry(effective.scenario);

    // 3. Duplicate-run detection (mirrors the EMPIRE runner)
    const runSignature = buildRunSignature({ scenario, values: effective });
    if (!shouldForceRerun) {
      // Intentionally no owner filter — run results are public on this platform.
      // Plan 4.1: only successful runs count as "already exists" — failed
      // runs are persisted too (below) and must not block a retry of the
      // same config.
      const existingRun = await Run.findOne({ modelName: MODEL_KEY, runSignature, status: "success" }).sort({ _id: -1 }).lean();
      if (existingRun) {
        return res.json({
          reused: true,
          runSignature,
          output: `Identical run already exists: "${existingRun.runName}" (${existingRun.submittedAt}).`,
          existingRun: {
            id: String(existingRun._id),
            runName: existingRun.runName,
            submittedAt: existingRun.submittedAt,
            modelName: existingRun.modelName,
          },
        });
      }
    }

    // 4. Global single-run lock (plan rule 5)
    const startResult = tryStartRun(MODEL_KEY, requestedRunName, {
      ownerId: req.user?.id ? String(req.user.id) : null,
      ownerUsername: req.user?.username || null,
    });
    if (!startResult.ok) {
      return res.status(409).json({
        error: "Run already in progress",
        message: startResult.current?.ownerUsername
          ? `Your run was not started. ${startResult.current.ownerUsername} is already running${startResult.current.runName ? ` "${startResult.current.runName}"` : ""}.`
          : "Your run was not started because another run is already in progress.",
        current: startResult.current,
      });
    }
    lockHeld = true;

    // 5. Materialize the run yaml into the server-side work dir
    const runId = buildRunId(MODEL_KEY);
    // Captured at submission; used by both the success and failure docs.
    const submittedAt = new Date().toISOString();
    ensureDir(WORK_ROOT);
    runInputDir = path.join(WORK_ROOT, runId);
    ensureDir(runInputDir);
    const runOutputDir = path.join(RUNS_ROOT, runId);
    const configPath = path.join(runInputDir, "config.yaml");

    const windowsCommandTemplate = getWindowsCommandTemplate(MODEL_KEY);
    const useWindows = windowsRunnerEnabled() && Boolean(windowsCommandTemplate);
    const resultsRoot = process.env.REMOTE_RESULTS_ROOT || "C:\\model-results";
    const workerOutputDir = useWindows ? `${resultsRoot}\\${runId}` : runOutputDir;

    fs.writeFileSync(
      configPath,
      materializeRunYaml({ values: effective, scenario, outputsDir: workerOutputDir }),
      "utf8"
    );
    fs.writeFileSync(
      path.join(runInputDir, "input-manifest.json"),
      JSON.stringify(
        {
          modelName: MODEL_KEY,
          runId,
          runName: requestedRunName,
          scenario: { key: scenario.key, file: scenario.file, sha256: scenario.sha256 },
          window: { start: effective.window_start, end: effective.window_end },
          security: effective.security,
          gsk_strategy: effective.gsk_strategy,
          base_case_strategy: effective.base_case_strategy,
          voll: effective.voll,
          configId: resolvedConfigId,
          createdAt: new Date().toISOString(),
        },
        null,
        2
      ),
      "utf8"
    );

    // 6. Spawn the worker
    let child;
    let mode;
    let combinedOutput = "";
    const handleLine = (line) => {
      appendLine(MODEL_KEY, line);
      combinedOutput += (combinedOutput ? "\n" : "") + line;
    };

    if (useWindows) {
      mode = "windows-remote";
      const windowsWorkDir = `${resultsRoot}\\_work\\${runId}`;
      const windowsConfigPath = `${windowsWorkDir}\\config.yaml`;

      await copyDirectoryToWindows({
        sourceDir: runInputDir,
        destinationDir: windowsWorkDir,
        onLine: handleLine,
        retries: 3,
      });

      const command = expandTemplate(windowsCommandTemplate, {
        RUN_ID: runId,
        RUN_NAME: requestedRunName,
        CONFIG_PATH: windowsConfigPath,
        WINDOW_START: effective.window_start,
        WINDOW_END: effective.window_end,
        REMOTE_RESULTS_ROOT: resultsRoot,
      });
      handleLine(`Starting remote Ukraine run (runId=${runId})`);
      child = spawnWindowsSshCommand(command);
    } else if (process.platform === "win32") {
      mode = "local";
      if (!fs.existsSync(LOCAL_WORKER_SCRIPT)) {
        throw new Error(`Local worker script not found: ${LOCAL_WORKER_SCRIPT}`);
      }
      handleLine(`Starting local Ukraine run (runId=${runId})`);
      child = spawn(
        "powershell",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          LOCAL_WORKER_SCRIPT,
          "-RunName",
          requestedRunName,
          "-ConfigPath",
          configPath,
          "-Start",
          effective.window_start,
          "-End",
          effective.window_end,
          "-OutputDir",
          workerOutputDir,
        ],
        { cwd: resolveRepoPath(".") }
      );
    } else {
      throw new Error(
        "Ukraine runner is misconfigured: no remote command template is set and this server is not Windows. " +
          "Set REMOTE_RUNNER_HOST/REMOTE_RUNNER_USER (server/.env) and a ukraine entry in server/config/windows-command-templates.json, or run the server on the Windows compute box."
      );
    }

    // 7. Stream worker output (SSE) and wait for exit
    streamChildOutput(child, handleLine);
    let exitCode;
    try {
      // Plan 4.1: hard ceiling so a hung worker cannot hold the global lock.
      exitCode = await waitForExit(child, RUN_TIMEOUT_MINUTES);
    } catch (err) {
      if (err?.code !== "RUN_TIMEOUT") throw err;
      handleLine(
        `TIMEOUT: the run exceeded ${RUN_TIMEOUT_MINUTES} minutes (UKRAINE_RUN_TIMEOUT_MINUTES) — ` +
          "killing the worker process tree and marking the run failed."
      );
      killChildTree(child, mode);
      exitCode = await waitForExit(child);
      handleLine(
        "TIMEOUT: worker terminated. In windows-remote mode the compute-box process may " +
          "linger — see Docs/Ukraine_Ops_Runbook.md for stray-process cleanup."
      );
    }

    if (exitCode !== 0) {
      endRun(MODEL_KEY, exitCode);
      safeRmWorkDir(runInputDir);
      runInputDir = null;

      // Plan 4.1: persist failed runs so history shows them (mirrors the
      // success path; Run docs are public — owner stored for provenance).
      try {
        const run = new Run({
          modelName: MODEL_KEY,
          runName: requestedRunName,
          submittedAt,
          shellOutput: (combinedOutput.trim() || "no worker output").slice(-8000),
          owner: req.user?.id,
          runSignature,
          datasetName: scenario.key,
          datasetPath: scenario.file,
          configId: resolvedConfigId,
          selectedDatasetName: scenario.label,
          reused: false,
          status: "failed",
        });
        await run.save();
      } catch (err) {
        console.error("[ukraine] Failed to save failed run to DB:", err.message);
      }

      await notifyCompletionEmail({
        userId: req.user?.id,
        runName: requestedRunName,
        runId,
        success: false,
        details: combinedOutput.slice(-1500),
      }).catch((err) => {
        console.error("[ukraine] completion email failed:", err.message);
      });

      responseSent = true;
      return res.status(500).json({
        error: mode === "windows-remote" ? "Windows remote Ukraine run failed" : "Ukraine run failed",
        details: combinedOutput,
        runId,
        mode,
      });
    }

    // 8. Success: copy results back when remote, then persist + notify
    if (mode === "windows-remote") {
      ensureDir(runOutputDir);
      await copyResultsFromWindows({ runId, destinationDir: runOutputDir, onLine: handleLine, retries: 3 });
    }

    // Write run_signature.json into the results folder for auditability
    // (plan rule 6): the run is self-documenting independent of the DB.
    try {
      fs.writeFileSync(
        path.join(runOutputDir, "run_signature.json"),
        JSON.stringify(
          {
            signature: runSignature,
            modelKey: MODEL_KEY,
            displayName: DISPLAY_NAME,
            runId,
            runName: requestedRunName,
            scenario: { key: scenario.key, file: scenario.file, sha256: scenario.sha256 },
            configId: resolvedConfigId,
            submittedAt,
            mode,
          },
          null,
          2
        ),
        "utf8"
      );
    } catch (err) {
      console.error("[ukraine] Failed to write run_signature.json:", err.message);
    }

    // Save run server-side — reliable, not dependent on the client completing its request.
    try {
      const run = new Run({
        modelName: MODEL_KEY,
        runName: requestedRunName,
        submittedAt,
        shellOutput: combinedOutput.trim(),
        owner: req.user?.id,
        runSignature,
        datasetName: scenario.key,
        datasetPath: scenario.file,
        configId: resolvedConfigId,
        selectedDatasetName: scenario.label,
        reused: false,
        status: "success",
      });
      await run.save();
    } catch (err) {
      console.error("[ukraine] Failed to save run to DB:", err.message);
    }

    endRun(MODEL_KEY, 0);
    safeRmWorkDir(runInputDir);
    runInputDir = null;
    await notifyCompletionEmail({
      userId: req.user?.id,
      runName: requestedRunName,
      runId,
      success: true,
    }).catch((err) => {
      console.error("[ukraine] completion email failed:", err.message);
    });

    responseSent = true;
    return res.json({
      output: combinedOutput.trim(),
      runSignature,
      runId,
      runName: requestedRunName,
      scenario: scenario.key,
      configId: resolvedConfigId,
      reused: false,
      mode,
    });
  } catch (error) {
    if (lockHeld) {
      endRun(MODEL_KEY, 1);
      lockHeld = false;
    }
    safeRmWorkDir(runInputDir);
    console.error("[ukraine] run failed:", error);
    if (responseSent || res.headersSent) {
      return;
    }
    responseSent = true;
    return res.status(500).json({
      error: "Failed to execute Ukraine run",
      details: error.message,
    });
  }
});

export default router;


