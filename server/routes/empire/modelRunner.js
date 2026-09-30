import express from "express";
import { spawn } from "child_process";
import fs from "fs";
import crypto from "crypto";
import path from "path";
import yaml from "yaml";
import { resolveRepoPath } from "../../utils/paths.js";
import { appendLine, endRun, tryStartRun } from "../../utils/runState.js";
import { sendEmail } from "../../utils/emailService.js";
import Config from "../../models/Config.js";
import Run from "../../models/Run.js";
import User from "../../models/User.js";
import { buildDatasetSnapshotFromUserOverrides, buildEffectiveDatasetDigest } from "../../utils/datasetOverrides.js";
import SavedDataset from "../../models/SavedDataset.js";
import {
  buildRunId,
  copyResultsFromWindows,
  expandTemplate,
  getWindowsCommandTemplate,
  spawnWindowsSshCommand,
  streamChildOutput,
  waitForExit,
  windowsRunnerEnabled,
} from "../../utils/windowsRemoteRun.js";

const router = express.Router();

// Define the path to the shell script
// NOTE: If you change this, update the file transfer method in ensolve:_run yaml
const shellScriptPath = resolveRepoPath(
  "OpenEMPIRE",
  "scripts",
  "ensolve_worker.sh"
);

const SIMPLE_DEFAULT_FILE = resolveRepoPath("OpenEMPIRE", "config", "testrun.yaml");
const OPENEMPIRE_ROOT = path.resolve(resolveRepoPath("OpenEMPIRE"));
const RUN_INPUTS_ROOT = resolveRepoPath("OpenEMPIRE", "Data handler", "run_inputs");

async function notifyCompletionEmail({ userId, runName, runId, success, details }) {
  if (!userId) return;

  const user = await User.findById(userId).lean();
  if (!user?.email) return;

  const frontendUrl = String(process.env.FRONTEND_URL || "").replace(/\/$/, "");
  const resultsLink = frontendUrl ? `${frontendUrl}/models/empire/results` : "";

  const subject = success
    ? `[EMPIRE] Run completed: ${runName}`
    : `[EMPIRE] Run failed: ${runName}`;

  const text = success
    ? `Run ${runName} (${runId}) completed successfully. ${resultsLink ? `Results: ${resultsLink}` : ""}`
    : `Run ${runName} (${runId}) failed. ${details || "No additional details."}`;

  const html = success
    ? `<p>Run <b>${runName}</b> (${runId}) completed successfully.</p>${resultsLink ? `<p>Results: <a href="${resultsLink}">${resultsLink}</a></p>` : ""}`
    : `<p>Run <b>${runName}</b> (${runId}) failed.</p><pre>${String(details || "No additional details.")}</pre>`;

  await sendEmail({ to: user.email, subject, text, html });
}

function normalizeForHash(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeForHash(item));
  }
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = normalizeForHash(value[key]);
        return acc;
      }, {});
  }
  return value;
}

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function resolveDatasetAbsolutePath(datasetName, datasetPathArg) {
  if (!datasetPathArg) {
    return path.resolve(resolveRepoPath("OpenEMPIRE", "Data handler", datasetName));
  }

  const rawPath = String(datasetPathArg).trim();
  const candidate = path.isAbsolute(rawPath)
    ? rawPath
    : path.resolve(OPENEMPIRE_ROOT, rawPath);
  const absolute = path.resolve(candidate);

  if (absolute !== OPENEMPIRE_ROOT && !absolute.startsWith(OPENEMPIRE_ROOT + path.sep)) {
    throw new Error("datasetPath must be inside OpenEMPIRE repository");
  }

  return absolute;
}

function buildDatasetDigest(datasetAbsolutePath) {
  if (!fs.existsSync(datasetAbsolutePath)) {
    throw new Error(`Dataset path not found: ${datasetAbsolutePath}`);
  }

  const files = [];
  const stack = [datasetAbsolutePath];

  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  files.sort((a, b) => a.localeCompare(b));

  const digestPayload = files.map((filePath) => {
    const relativePath = path.relative(datasetAbsolutePath, filePath).replaceAll("\\", "/");
    const contentHash = sha256(fs.readFileSync(filePath));
    return `${relativePath}:${contentHash}`;
  });

  return sha256(digestPayload.join("\n"));
}

function buildRunSignature({ modelKey, datasetName, datasetPathArg, datasetDigest, configContent }) {
  const signaturePayload = {
    modelKey,
    datasetName,
    datasetPathArg: datasetPathArg || null,
    datasetDigest,
    config: normalizeForHash(configContent || {}),
  };
  return sha256(JSON.stringify(signaturePayload));
}

function sanitizeSegment(value) {
  return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "unnamed";
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function safeRm(targetPath) {
  if (!targetPath) return;
  const absoluteTarget = path.resolve(targetPath);
  const allowedRoot = path.resolve(RUN_INPUTS_ROOT);
  if (absoluteTarget === allowedRoot || absoluteTarget.startsWith(allowedRoot + path.sep)) {
    if (fs.existsSync(absoluteTarget)) {
      fs.rmSync(absoluteTarget, { recursive: true, force: true });
    }
  }
}

/**
 * Mirrors the run_path logic in scripts/run.py so the server can locate the
 * output folder to write run_signature.json without modifying OpenEMPIRE core.
 */
function resolveRunOutputDir(datasetName, runName) {
  if (datasetName === "test") {
    return path.join(OPENEMPIRE_ROOT, "Results", "basic_run", `dataset_${datasetName}`);
  } else if (datasetName === "uploads") {
    return path.join(OPENEMPIRE_ROOT, "Results", "run_analysis", `ensolve_${runName}`);
  } else {
    return path.join(OPENEMPIRE_ROOT, "Results", "v51", `ensolve_${runName}`);
  }
}


router.get('/run-script', async (req, res) => {
  const { runName, configId, dataset, datasetPath, forceRerun } = req.query;
  const modelKey = "empire";
  const selectedDataset = String(dataset || "uploads").trim() || "uploads";
  const selectedDatasetPath = datasetPath ? String(datasetPath).trim() : "";
  const shouldForceRerun = String(forceRerun || "false").toLowerCase() === "true";
  let lockHeld = false;
  let runInputDir = null;

  const applySelectedConfig = async () => {
    let selectedConfig = null;
    if (configId) {
      selectedConfig = await Config.findOne({ _id: configId, owner: req.user.id });
      if (!selectedConfig) {
        return { error: "Selected config was not found for this user." };
      }
      await Config.updateMany({ owner: req.user.id }, { $set: { isSelected: false } });
      await Config.findByIdAndUpdate(selectedConfig._id, { $set: { isSelected: true } });
    } else {
      selectedConfig = await Config.findOne({ owner: req.user.id, isSelected: true }).sort({ updatedAt: -1 });
    }

    let effectiveConfig = null;
    if (selectedConfig?.content) {
      effectiveConfig = selectedConfig.content;
    } else {
      effectiveConfig = yaml.parse(fs.readFileSync(SIMPLE_DEFAULT_FILE, "utf8")) || {};
    }

    return { ok: true, effectiveConfig, selectedConfigId: selectedConfig?._id || null };
  };

  try {
    const selectedResult = await applySelectedConfig();
    if (selectedResult?.error) {
      return res.status(404).json({ error: selectedResult.error });
    }

    // Compute the effective digest BEFORE materializing uploads/ to avoid a race
    // condition where a concurrent request could overwrite the shared folder while
    // this request is still hashing it.
    let datasetDigest;
    if (selectedDataset === "uploads" && !selectedDatasetPath) {
      datasetDigest = buildEffectiveDatasetDigest(req.user?.id);
    } else {
      const datasetAbsolutePath = resolveDatasetAbsolutePath(selectedDataset, selectedDatasetPath || null);
      datasetDigest = buildDatasetDigest(datasetAbsolutePath);
    }
    const runSignature = buildRunSignature({
      modelKey,
      datasetName: selectedDataset,
      datasetPathArg: selectedDatasetPath || null,
      datasetDigest,
      configContent: selectedResult.effectiveConfig,
    });

    // Runs that use randomly generated scenarios are never true duplicates:
    // the scenarios matrix produced during each run will differ even when config
    // and dataset are identical. Skip duplicate detection for these runs so they
    // are always allowed to proceed.
    const isRandomScenarioRun =
      selectedResult.effectiveConfig?.use_scenario_generation === true &&
      selectedResult.effectiveConfig?.use_fixed_sample !== true;

    if (!shouldForceRerun && !isRandomScenarioRun) {
      // Intentionally no owner filter — all run results are public on this platform.
      // Authentication controls resource/hardware access only. See Run.js for schema note.
      const existingRun = await Run.findOne({ modelName: modelKey, runSignature }).sort({ _id: -1 }).lean();
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

    const startResult = tryStartRun(modelKey, runName, {
      ownerId: req.user?.id ? String(req.user.id) : null,
      ownerUsername: req.user?.username || null,
    });
    if (!startResult.ok) {
      return res.status(409).json({
        error: "Run already in progress",
        message: startResult.current?.ownerUsername
          ? `Your run was not started. ${startResult.current.ownerUsername} is already running${startResult.current.runName ? ` \"${startResult.current.runName}\"` : ""}.`
          : "Your run was not started because another run is already in progress.",
        current: startResult.current
      });
    }
    lockHeld = true;

    ensureDir(RUN_INPUTS_ROOT);
    const runInputKey = `${Date.now()}_${sanitizeSegment(req.user?.id)}_${sanitizeSegment(runName)}`;
    runInputDir = path.join(RUN_INPUTS_ROOT, runInputKey);
    ensureDir(runInputDir);

    const configSnapshotPath = path.join(runInputDir, "config.yaml");
    fs.writeFileSync(configSnapshotPath, yaml.stringify(selectedResult.effectiveConfig || {}), "utf8");

    let workerDatasetName = selectedDataset;
    let workerDatasetPath = selectedDatasetPath || "";

    if (selectedDataset === "uploads" && !selectedDatasetPath) {
      const datasetSnapshotDir = path.join(runInputDir, "dataset");
      buildDatasetSnapshotFromUserOverrides(req.user?.id, datasetSnapshotDir);
      workerDatasetName = "uploads";
      workerDatasetPath = datasetSnapshotDir;
    }

    const workerArgs = [shellScriptPath, runName, workerDatasetName, workerDatasetPath, configSnapshotPath];
    const windowsCommandTemplate = getWindowsCommandTemplate("empire");
    const useWindowsRunner = windowsRunnerEnabled() && Boolean(windowsCommandTemplate);
    const runId = buildRunId(modelKey);
    let combinedOutput = "";
    let responseSent = false;

    const handleLine = (line) => {
      appendLine(modelKey, line);
      combinedOutput += (combinedOutput ? "\n" : "") + line;
    };

    let child;
    if (useWindowsRunner) {
      const command = expandTemplate(windowsCommandTemplate, {
        RUN_ID: runId,
        RUN_NAME: runName,
        DATASET_NAME: workerDatasetName,
        DATASET_PATH: workerDatasetPath,
        CONFIG_PATH: configSnapshotPath,
        REMOTE_RESULTS_ROOT: process.env.REMOTE_RESULTS_ROOT || "C:\\model-results",
      });
      handleLine(`Starting remote EMPIRE run (runId=${runId})`);
      child = spawnWindowsSshCommand(command);
    } else {
      child = spawn("bash", workerArgs);
    }

    streamChildOutput(child, handleLine);

    child.on("close", async (code) => {
      lockHeld = false;

      safeRm(runInputDir);
      runInputDir = null;

      if (responseSent || res.headersSent) {
        return;
      }

      if (code !== 0) {
        endRun(modelKey, code);
        await notifyCompletionEmail({
          userId: req.user?.id,
          runName,
          runId,
          success: false,
          details: combinedOutput.slice(-1500),
        }).catch((err) => {
          console.error("[empire] completion email failed:", err.message);
        });

        responseSent = true;
        return res.status(500).json({
          error: useWindowsRunner ? "Windows remote run failed" : "Shell script failed",
          details: combinedOutput,
          path: shellScriptPath
        });
      }

      const submittedAt = new Date().toISOString();
      const runOutputDir = resolveRunOutputDir(selectedDataset, runName);

      if (useWindowsRunner) {
        ensureDir(runOutputDir);
        try {
          await copyResultsFromWindows({ runId, destinationDir: runOutputDir, onLine: handleLine, retries: 3 });
        } catch (copyErr) {
          endRun(modelKey, 1);
          responseSent = true;
          await notifyCompletionEmail({
            userId: req.user?.id,
            runName,
            runId,
            success: false,
            details: `Result copy failed: ${copyErr.message}`,
          }).catch((err) => {
            console.error("[empire] completion email failed:", err.message);
          });
          return res.status(500).json({
            error: "Remote run completed but result copy failed",
            details: copyErr.message,
            runId,
          });
        }
      }

      // Write run_signature.json inside the results folder for auditability.
      // The run is self-documenting independent of the database.
      if (fs.existsSync(runOutputDir)) {
        try {
          fs.writeFileSync(
            path.join(runOutputDir, "run_signature.json"),
            JSON.stringify({ runSignature, modelKey, datasetName: selectedDataset, datasetPath: selectedDatasetPath || null, configId: String(selectedResult.selectedConfigId || configId || "") || null, submittedAt }, null, 2)
          );
        } catch (err) {
          console.error("[empire] Failed to write run_signature.json:", err.message);
        }
      }

      // Save run server-side — reliable, not dependent on the client completing its request.
      try {
        let selectedDatasetName = null;
        if (selectedDataset === "uploads") {
          const savedDataset = await SavedDataset.findOne({
            owner: req.user?.id,
            model: "empire",
            isSelected: true,
          });
          if (savedDataset) {
            selectedDatasetName = savedDataset.name;
          }
        }

        const run = new Run({
          modelName: modelKey,
          runName,
          submittedAt,
          shellOutput: combinedOutput.trim(),
          owner: req.user?.id,
          runSignature,
          datasetName: selectedDataset,
          datasetPath: selectedDatasetPath || null,
          configId: String(selectedResult.selectedConfigId || configId || "") || null,
          selectedDatasetName,
          reused: false,
          status: "success",
        });
        await run.save();
      } catch (err) {
        console.error("[empire] Failed to save run to DB:", err.message);
      }

      endRun(modelKey, 0);
      await notifyCompletionEmail({
        userId: req.user?.id,
        runName,
        runId,
        success: true,
      }).catch((err) => {
        console.error("[empire] completion email failed:", err.message);
      });

      responseSent = true;
      res.json({
        output: combinedOutput.trim(),
        runSignature,
        datasetName: selectedDataset,
        datasetPath: selectedDatasetPath || null,
        reused: false,
        runId,
        mode: useWindowsRunner ? "windows-remote" : "local",
      });
    });

    child.on("error", (err) => {
      if (lockHeld) {
        endRun(modelKey, 1);
        lockHeld = false;
      }
      safeRm(runInputDir);
      runInputDir = null;
      if (!responseSent && !res.headersSent) {
        responseSent = true;
        res.status(500).json({
          error: "Failed to start shell script",
          details: err.message,
        });
      }
    });
  } catch (error) {
    if (lockHeld) {
      endRun(modelKey, 1);
      lockHeld = false;
    }
    safeRm(runInputDir);
    runInputDir = null;
    return res.status(500).json({
      error: "Failed to prepare run",
      details: error.message,
    });
  }
});


export default router;
