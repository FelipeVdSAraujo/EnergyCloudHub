import express from "express";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { appendLine, endRun, tryStartRun } from "../../utils/runState.js";
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
import {
  GCAM_RUN_ROOT,
  MODEL_KEY,
  ensureDir,
  getActiveConfig,
  sanitizeRunName,
  writeJson,
} from "./shared.js";

const router = express.Router();

function copyIfExists(sourcePath, destinationPath) {
  if (!fs.existsSync(sourcePath)) return;
  ensureDir(path.dirname(destinationPath));
  fs.copyFileSync(sourcePath, destinationPath);
}

function copyDirIfExists(sourceDir, destinationDir) {
  if (!fs.existsSync(sourceDir)) return false;
  ensureDir(destinationDir);
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const src = path.join(sourceDir, entry.name);
    const dst = path.join(destinationDir, entry.name);
    if (entry.isDirectory()) {
      copyDirIfExists(src, dst);
    } else {
      fs.copyFileSync(src, dst);
    }
  }
  return true;
}

function getFileSize(filePath) {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return null;
  }
}

function getDirSize(dirPath) {
  let total = 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        total += getDirSize(full);
      } else {
        total += getFileSize(full) || 0;
      }
    }
  } catch {
    // ignore
  }
  return total;
}

function resolveGcamExeDir(config) {
  const root = String(config?.gcamHome || "").trim();
  return path.join(root, "exe");
}

// Patch a GCAM configuration.xml string with the given values.
// Returns { xml, changed, changes } where changes is a list of field names that were updated.
function patchConfigurationXml(xml, values) {
  const changes = [];
  let patched = xml;

  const setValue = (name, rawValue) => {
    if (rawValue === undefined || rawValue === null) return;
    const value = String(rawValue);
    const escaped = value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const pattern = new RegExp(
      `(<Value[^>]*\\bname=["']${name}["'][^>]*>)([\\s\\S]*?)(</Value>)`,
      "i"
    );
    if (pattern.test(patched)) {
      patched = patched.replace(pattern, `$1${escaped}$3`);
      changes.push(name);
    }
  };

  if (values.scenarioName) setValue("scenarioName", values.scenarioName);
  if (typeof values.createCostCurve === "boolean") {
    setValue("createCostCurve", values.createCostCurve ? "1" : "0");
  }
  if (typeof values.findPath === "boolean") {
    setValue("find-path", values.findPath ? "1" : "0");
  }

  return { xml: patched, changed: changes.length > 0, changes };
}

function collectGcamOutputs({ gcamExeDir, gcamHome, outputDir, scenarioName, onLine }) {
  const manifest = {
    capturedAt: new Date().toISOString(),
    scenarioName: scenarioName || null,
    files: [],
  };

  const addEntry = (entry) => {
    manifest.files.push(entry);
  };

  // 1. BaseX database (main results)
  const basexSrc = path.join(gcamHome, "output", "database_basexdb");
  const basexDst = path.join(outputDir, "database_basexdb");
  if (copyDirIfExists(basexSrc, basexDst)) {
    addEntry({
      type: "directory",
      name: "database_basexdb",
      path: "database_basexdb",
      description: "GCAM BaseX XML database (main results)",
      size: getDirSize(basexDst),
      captured: true,
    });
    onLine(`Copied BaseX database from ${basexSrc}`);
  } else {
    addEntry({
      type: "directory",
      name: "database_basexdb",
      path: "database_basexdb",
      description: "GCAM BaseX XML database (main results)",
      captured: false,
    });
    onLine(`BaseX database not found at ${basexSrc}`);
  }

  // 2. Debug XML (scenario-specific filename)
  const debugName = scenarioName ? `debug-${scenarioName}.xml` : "debug.xml";
  const debugSrc = path.join(gcamExeDir, debugName);
  const debugDst = path.join(outputDir, debugName);
  if (fs.existsSync(debugSrc)) {
    ensureDir(path.dirname(debugDst));
    fs.copyFileSync(debugSrc, debugDst);
    addEntry({
      type: "file",
      name: debugName,
      path: debugName,
      description: "GCAM debug XML output",
      size: getFileSize(debugDst),
      captured: true,
    });
    onLine(`Copied debug XML: ${debugName}`);
  } else {
    const altSrc = path.join(gcamExeDir, "debug.xml");
    if (fs.existsSync(altSrc)) {
      ensureDir(path.dirname(debugDst));
      fs.copyFileSync(altSrc, debugDst);
      addEntry({
        type: "file",
        name: "debug.xml",
        path: "debug.xml",
        description: "GCAM debug XML output",
        size: getFileSize(debugDst),
        captured: true,
      });
      onLine(`Copied debug XML: debug.xml`);
    } else {
      addEntry({
        type: "file",
        name: debugName,
        path: debugName,
        description: "GCAM debug XML output",
        captured: false,
      });
      onLine(`Debug XML not found`);
    }
  }

  // 3. Hector CSV
  const hectorName = "gcam-hector-outputstream.csv";
  const hectorSrc = path.join(gcamHome, "output", hectorName);
  const hectorDst = path.join(outputDir, hectorName);
  if (fs.existsSync(hectorSrc)) {
    ensureDir(path.dirname(hectorDst));
    fs.copyFileSync(hectorSrc, hectorDst);
    addEntry({
      type: "file",
      name: hectorName,
      path: hectorName,
      description: "Hector climate model output stream",
      size: getFileSize(hectorDst),
      captured: true,
    });
    onLine(`Copied Hector output CSV`);
  } else {
    addEntry({
      type: "file",
      name: hectorName,
      path: hectorName,
      description: "Hector climate model output stream",
      captured: false,
    });
    onLine(`Hector output CSV not found`);
  }

  // 4. Restart files
  const restartSrc = path.join(gcamExeDir, "restart");
  const restartDst = path.join(outputDir, "restart");
  if (copyDirIfExists(restartSrc, restartDst)) {
    addEntry({
      type: "directory",
      name: "restart",
      path: "restart",
      description: "GCAM restart files (for continuation runs)",
      size: getDirSize(restartDst),
      captured: true,
    });
    onLine(`Copied restart files`);
  } else {
    addEntry({
      type: "directory",
      name: "restart",
      path: "restart",
      description: "GCAM restart files (for continuation runs)",
      captured: false,
    });
    onLine(`Restart directory not found`);
  }

  // 5. Main log
  const logName = "logs/main_log.txt";
  const logSrc = path.join(gcamExeDir, "logs", "main_log.txt");
  const logDst = path.join(outputDir, logName);
  if (fs.existsSync(logSrc)) {
    ensureDir(path.dirname(logDst));
    fs.copyFileSync(logSrc, logDst);
    addEntry({
      type: "file",
      name: logName,
      path: logName,
      description: "GCAM runtime log",
      size: getFileSize(logDst),
      captured: true,
    });
    onLine(`Copied main log`);
  } else {
    addEntry({
      type: "file",
      name: logName,
      path: logName,
      description: "GCAM runtime log",
      captured: false,
    });
    onLine(`Main log not found`);
  }

  writeJson(path.join(outputDir, "manifest.json"), manifest);
  onLine(`Wrote results manifest`);

  return manifest;
}

router.get("/run-script", async (req, res) => {
  const requestedRunName = sanitizeRunName(req.query.runName);
  const startResult = tryStartRun(MODEL_KEY, requestedRunName, {
    ownerId: req.user?.id ? String(req.user.id) : null,
    ownerUsername: req.user?.username || null,
  });

  if (!startResult.ok) {
    return res.status(409).json({
      error: "Run already in progress",
      current: startResult.current,
    });
  }

  const config = getActiveConfig();
  const runId = buildRunId(MODEL_KEY);
  const outputDir = path.join(GCAM_RUN_ROOT, runId);
  ensureDir(outputDir);

  // Scenario name: prefer the query param (typically the run name), fall back to config.
  const queryScenarioName = typeof req.query.scenarioName === "string"
    ? req.query.scenarioName.trim()
    : "";
  const effectiveScenarioName = queryScenarioName || String(config.scenarioName || "").trim();

  const windowsCommandTemplate = getWindowsCommandTemplate(MODEL_KEY);
  const templatePresent = Boolean(windowsCommandTemplate);
  const runnerConfigured = windowsRunnerEnabled();
  const useWindows = templatePresent;
  let combinedOutput = "";

  const handleLine = (line) => {
    appendLine(MODEL_KEY, line);
    combinedOutput += (combinedOutput ? "\n" : "") + line;
  };

  try {
    if (useWindows) {
      const command = expandTemplate(windowsCommandTemplate, {
        RUN_ID: runId,
        RUN_NAME: requestedRunName,
        GCAM_HOME: config.gcamHome,
        CONFIGURATION_FILE: config.configurationFile,
        SCENARIO_NAME: effectiveScenarioName,
        USE_BATCH_MODE: config.useBatchMode ? "true" : "false",
        BATCH_FILE_NAME: config.batchFileName,
        STOP_PERIOD: config.stopPeriod,
        CREATE_COST_CURVE: config.createCostCurve ? "true" : "false",
        FIND_PATH: config.findPath ? "true" : "false",
        REMOTE_RESULTS_ROOT: process.env.REMOTE_RESULTS_ROOT || "C:\\model-results",
      });

      handleLine(`Starting remote GCAM run (runId=${runId})`);
      const child = spawnWindowsSshCommand(command);
      streamChildOutput(child, handleLine);
      const exitCode = await waitForExit(child);

      if (exitCode !== 0) {
        endRun(MODEL_KEY, exitCode);
        return res.status(500).json({
          error: "GCAM remote run failed",
          details: combinedOutput,
          outputDir,
          runId,
        });
      }

      await copyResultsFromWindows({ runId, destinationDir: outputDir, onLine: handleLine, retries: 3 });

      writeJson(path.join(outputDir, "run-output.json"), {
        exitCode: 0,
        runId,
        runName: requestedRunName,
        mode: "windows-remote",
        outputDir,
        config,
        combinedOutput,
        completedAt: new Date().toISOString(),
      });

      endRun(MODEL_KEY, 0);
      return res.json({
        output: combinedOutput.trim(),
        outputDir,
        runId,
        mode: "windows-remote",
      });
    }

    const gcamExeDir = resolveGcamExeDir(config);
    const runBatPath = path.join(gcamExeDir, "run-gcam.bat");
    const sourceConfigPath = path.join(gcamExeDir, String(config.configurationFile || "configuration_ref.xml"));
    const targetConfigPath = path.join(gcamExeDir, "configuration.xml");

    if (templatePresent && !runnerConfigured) {
      endRun(MODEL_KEY, 1);
      return res.status(500).json({
        error: "GCAM remote runner is not configured",
        details:
          "A GCAM remote command template exists, but REMOTE_RUNNER_HOST/REMOTE_RUNNER_USER or REMOTE_RUNNER_ENABLED are not configured for this backend environment.",
      });
    }

    if (!fs.existsSync(runBatPath)) {
      endRun(MODEL_KEY, 1);
      return res.status(500).json({
        error: "GCAM local run is misconfigured",
        details:
          "run-gcam.bat was not found. This backend is using local mode because no GCAM remote template was resolved. Configure server/config/windows-command-templates.json (gcam) or REMOTE_GCAM_COMMAND_TEMPLATE.",
      });
    }

    if (!fs.existsSync(sourceConfigPath)) {
      endRun(MODEL_KEY, 1);
      return res.status(500).json({
        error: "GCAM local run is misconfigured",
        details: `Configuration source file not found: ${sourceConfigPath}`,
      });
    }

    fs.copyFileSync(sourceConfigPath, targetConfigPath);
    handleLine(`Using local config file: ${path.basename(sourceConfigPath)}`);

    // Patch the active configuration.xml with the effective scenario name and
    // the createCostCurve / findPath flags so the local run picks them up.
    try {
      const configXml = fs.readFileSync(targetConfigPath, "utf8");
      const patched = patchConfigurationXml(configXml, {
        scenarioName: effectiveScenarioName,
        createCostCurve: Boolean(config.createCostCurve),
        findPath: Boolean(config.findPath),
      });
      if (patched.changed) {
        fs.writeFileSync(targetConfigPath, patched.xml, "utf8");
        handleLine(`Patched configuration.xml (${patched.changes.join(", ") || "no-op"})`);
      }
    } catch (patchError) {
      handleLine(`Warning: failed to patch configuration.xml: ${patchError.message}`);
    }

    const child = spawn("cmd.exe", ["/c", "run-gcam.bat"], { cwd: gcamExeDir });
    streamChildOutput(child, handleLine);
    const exitCode = await waitForExit(child);

    // Collect all GCAM outputs (BaseX DB, debug XML, Hector CSV, restart, logs)
    // and write a manifest.json describing what was captured.
    const gcamHome = String(config.gcamHome || "").trim();
    const manifest = collectGcamOutputs({
      gcamExeDir,
      gcamHome,
      outputDir,
      scenarioName: effectiveScenarioName,
      onLine: handleLine,
    });
    handleLine(`Captured ${manifest.files.filter((f) => f.captured).length}/${manifest.files.length} output items`);

    writeJson(path.join(outputDir, "run-output.json"), {
      exitCode,
      runId,
      runName: requestedRunName,
      mode: "local",
      outputDir,
      gcamExeDir,
      config,
      combinedOutput,
      completedAt: new Date().toISOString(),
    });

    endRun(MODEL_KEY, exitCode);

    if (exitCode !== 0) {
      return res.status(500).json({
        error: "GCAM run failed",
        details: combinedOutput,
        outputDir,
        runId,
      });
    }

    return res.json({
      output: combinedOutput.trim(),
      outputDir,
      runId,
      mode: "local",
    });
  } catch (error) {
    endRun(MODEL_KEY, 1);
    return res.status(500).json({
      error: "Failed to execute GCAM run",
      details: error.message,
      outputDir,
      runId,
    });
  }
});

export default router;
