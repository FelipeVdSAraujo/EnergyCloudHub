import express from "express";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import SavedDataset from "../../models/SavedDataset.js";
import { resolveRepoPath } from "../../utils/paths.js";
import { appendLine, endRun, tryStartRun } from "../../utils/runState.js";
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
  ALLOWED_DATASET_FILES,
  getCurrentOverrideSummary,
  getEffectiveDatasetFilePath,
  getEffectiveDatasetFiles,
} from "../../utils/transcompDatasetOverrides.js";
import { getActiveConfig, MODEL_KEY, sanitizeRunName, TRANS_COMP_INPUT_ROOT, TRANS_COMP_RUN_ROOT } from "./shared.js";

const router = express.Router();
const PROJECT_DIR = resolveRepoPath("TransCompModel");
const REPO_ROOT = path.dirname(PROJECT_DIR);
const RUNNER_SCRIPT = "server/scripts/transcomp_run.jl";
const IAMC_SCRIPT_CANDIDATES = [
  resolveRepoPath("TransCompModel", "TransComp_to_IAMC.py"),
  path.join(REPO_ROOT, "website_clone", "TransCompModel", "TransComp_to_IAMC.py"),
];
const IAMC_DEFINITIONS_CANDIDATES = [
  resolveRepoPath("EMX", "idesignres-workflow", "definitions"),
  path.join(REPO_ROOT, "website_clone", "EMX", "idesignres-workflow", "definitions"),
];

function firstExistingPath(candidates) {
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function resolvePythonExe() {
  if (process.env.TRANSCOMP_IAMC_PYTHON_EXE) {
    return process.env.TRANSCOMP_IAMC_PYTHON_EXE;
  }
  if (process.platform === "win32") {
    return path.join(REPO_ROOT, ".venv", "Scripts", "python.exe");
  }
  return path.join(REPO_ROOT, ".venv", "bin", "python");
}

function resolveWindowsPythonExe() {
  return process.env.TRANSCOMP_IAMC_PYTHON_EXE_WINDOWS || "C:/EnSolveCloud/.venv/Scripts/python.exe";
}

function resolveWindowsIamcScript() {
  return process.env.TRANSCOMP_IAMC_SCRIPT_WINDOWS || "C:/EnSolveCloud/website_clone/TransCompModel/TransComp_to_IAMC.py";
}

function resolveWindowsDefinitionsPath() {
  return process.env.TRANSCOMP_IAMC_DEFINITIONS_WINDOWS ||
    "C:/EnSolveCloud/website_clone/EMX/idesignres-workflow/definitions";
}

function psQuote(value) {
  return `'${String(value || "").replaceAll("'", "''")}'`;
}

function toPowerShellEncodedCommand(scriptText) {
  return Buffer.from(String(scriptText || ""), "utf16le").toString("base64");
}

function asPosixPath(inputPath) {
  return String(inputPath || "").replaceAll("\\", "/");
}

async function runIamcPostProcess({ runId, outputDir, datasetInputDir, onLine }) {
  const enabled = String(process.env.TRANSCOMP_ENABLE_IAMC || "true").toLowerCase() !== "false";
  if (!enabled) {
    return {
      status: "skipped",
      message: "IAMC conversion disabled by TRANSCOMP_ENABLE_IAMC=false",
      validationPassed: false,
      filePath: null,
      relativePath: null,
    };
  }

  const iamcScriptPath = firstExistingPath(IAMC_SCRIPT_CANDIDATES);
  if (!iamcScriptPath) {
    return {
      status: "failed",
      message: `IAMC conversion script not found in any candidate path: ${IAMC_SCRIPT_CANDIDATES.join(", ")}`,
      validationPassed: false,
      filePath: null,
      relativePath: null,
    };
  }

  const pythonExe = resolvePythonExe();
  if (!fs.existsSync(pythonExe)) {
    return {
      status: "failed",
      message: `Python executable not found for IAMC conversion: ${pythonExe}`,
      validationPassed: false,
      filePath: null,
      relativePath: null,
    };
  }

  const iamcFilePath = path.join(outputDir, "transcomp_iamc.csv");
  const args = [
    iamcScriptPath,
    "--results-dir",
    outputDir,
    "--data-dir",
    datasetInputDir,
    "--model",
    "TransComp",
    "--scenario",
    runId,
    "--region",
    process.env.TRANSCOMP_IAMC_REGION || "ES21",
    "--out",
    iamcFilePath,
    "--validate",
  ];

  const definitionsPath = firstExistingPath(IAMC_DEFINITIONS_CANDIDATES);
  if (definitionsPath) {
    args.push("--definitions", definitionsPath);
  }
  if (String(process.env.TRANSCOMP_IAMC_USE_F_FOR_MODE || "false").toLowerCase() === "true") {
    args.push("--use-f-for-mode");
  }

  onLine("[IAMC] Starting TransComp IAMC conversion");
  const child = spawn(pythonExe, args, { cwd: REPO_ROOT });
  streamChildOutput(child, (line) => onLine(`[IAMC] ${line}`));
  const exitCode = await waitForExit(child);

  if (exitCode !== 0) {
    return {
      status: "failed",
      message: `IAMC conversion failed (exit ${exitCode})`,
      validationPassed: false,
      filePath: null,
      relativePath: null,
    };
  }

  if (!fs.existsSync(iamcFilePath)) {
    return {
      status: "failed",
      message: "IAMC conversion finished but transcomp_iamc.csv was not found",
      validationPassed: false,
      filePath: null,
      relativePath: null,
    };
  }

  const relativePath = asPosixPath(path.relative(TRANS_COMP_RUN_ROOT, iamcFilePath));
  return {
    status: "success",
    message: "IAMC conversion and validation completed",
    validationPassed: true,
    filePath: iamcFilePath,
    relativePath,
  };
}

async function runIamcPostProcessWindows({ runId, windowsResultsRoot, windowsInputDir, onLine }) {
  const enabled = String(process.env.TRANSCOMP_ENABLE_IAMC || "true").toLowerCase() !== "false";
  if (!enabled) {
    return {
      status: "skipped",
      message: "IAMC conversion disabled by TRANSCOMP_ENABLE_IAMC=false",
      validationPassed: false,
      filePath: null,
      relativePath: null,
    };
  }

  const pythonExe = resolveWindowsPythonExe();
  const scriptPath = resolveWindowsIamcScript();
  const definitionsPath = resolveWindowsDefinitionsPath();
  const windowsOutputDir = `${windowsResultsRoot}\\${runId}`;
  const csvOut = `${windowsOutputDir}\\transcomp_iamc.csv`;
  const xlsxOut = `${windowsOutputDir}\\transcomp_iamc.xlsx`;
  const region = process.env.TRANSCOMP_IAMC_REGION || "ES21";
  const includeFMode = String(process.env.TRANSCOMP_IAMC_USE_F_FOR_MODE || "false").toLowerCase() === "true";

  const command = [
    "$ErrorActionPreference = 'Stop'",
    `& ${psQuote(pythonExe)} ${psQuote(scriptPath)} --results-dir ${psQuote(windowsOutputDir)} --data-dir ${psQuote(
      windowsInputDir
    )} --model 'TransComp' --scenario ${psQuote(runId)} --region ${psQuote(region)} --out ${psQuote(csvOut)} --validate --definitions ${psQuote(
      definitionsPath
    )}`,
  ];

  if (includeFMode) {
    command[1] += " --use-f-for-mode";
  }

  command.push(
    `if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }`,
    `& ${psQuote(pythonExe)} ${psQuote(scriptPath)} --results-dir ${psQuote(windowsOutputDir)} --data-dir ${psQuote(
      windowsInputDir
    )} --model 'TransComp' --scenario ${psQuote(runId)} --region ${psQuote(region)} --out ${psQuote(xlsxOut)} --definitions ${psQuote(
      definitionsPath
    )}`
  );

  if (includeFMode) {
    command[3] += " --use-f-for-mode";
  }

  command.push("if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }");
  const encoded = toPowerShellEncodedCommand(command.join("; "));
  const fullCommand = `powershell -NoProfile -EncodedCommand ${encoded}`;

  onLine("[IAMC] Starting TransComp IAMC conversion on Windows compute node");
  const child = spawnWindowsSshCommand(fullCommand);
  streamChildOutput(child, (line) => onLine(`[IAMC] ${line}`));
  const exitCode = await waitForExit(child);

  if (exitCode !== 0) {
    return {
      status: "failed",
      message: `IAMC conversion failed on Windows (exit ${exitCode})`,
      validationPassed: false,
      filePath: null,
      relativePath: null,
    };
  }

  const relativePath = asPosixPath(path.join(runId, "transcomp_iamc.csv"));
  return {
    status: "success",
    message: "IAMC conversion and validation completed on Windows before copy",
    validationPassed: true,
    filePath: path.join(TRANS_COMP_RUN_ROOT, runId, "transcomp_iamc.csv"),
    relativePath,
  };
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function resolveCurrentDatasetSelection(userId) {
  return SavedDataset.findOne({
    owner: userId,
    model: MODEL_KEY,
    isSelected: true,
  })
    .sort({ updatedAt: -1 })
    .lean()
    .then((selectedDataset) => {
      if (selectedDataset) {
        return {
          displayName: selectedDataset.name,
          source: "saved",
          datasetId: String(selectedDataset._id),
          changedFiles: selectedDataset.changedFiles || [],
          sizeBytes: selectedDataset.sizeBytes || 0,
        };
      }

      const currentOverride = getCurrentOverrideSummary(userId);
      if (currentOverride.changedFiles.length === 0) {
        return {
          displayName: "Baseline",
          source: "baseline",
          datasetId: null,
          changedFiles: [],
          sizeBytes: 0,
        };
      }

      return {
        displayName: "User_Defined",
        source: "runtime",
        datasetId: null,
        changedFiles: currentOverride.changedFiles,
        sizeBytes: currentOverride.sizeBytes,
      };
    });
}

function copyEffectiveDataset(userId, targetDir) {
  ensureDir(targetDir);
  for (const filename of getEffectiveDatasetFiles(userId)) {
    const sourcePath = getEffectiveDatasetFilePath(userId, filename);
    fs.copyFileSync(sourcePath, path.join(targetDir, filename));
  }
}

function buildManifest(userId, requestedRunName, runId, selectedDataset, datasetInputDir) {
  const effectiveFiles = ALLOWED_DATASET_FILES.filter((filename) =>
    fs.existsSync(getEffectiveDatasetFilePath(userId, filename))
  );

  return {
    modelName: MODEL_KEY,
    runId,
    runName: requestedRunName,
    selectedDataset,
    effectiveFiles,
    inputDirectory: datasetInputDir,
    createdAt: new Date().toISOString(),
  };
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

  const runId = buildRunId(MODEL_KEY);
  const runInputDir = path.join(TRANS_COMP_INPUT_ROOT, runId);
  const datasetInputDir = path.join(runInputDir, "dataset");
  const outputDir = path.join(TRANS_COMP_RUN_ROOT, runId);

  ensureDir(runInputDir);
  ensureDir(outputDir);

  const config = getActiveConfig();
  const selectedDataset = await resolveCurrentDatasetSelection(req.user?.id);
  copyEffectiveDataset(req.user?.id, datasetInputDir);

  const configPath = path.join(runInputDir, "config.json");
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");

  const manifestPath = path.join(runInputDir, "input-manifest.json");
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(buildManifest(req.user?.id, requestedRunName, runId, selectedDataset, datasetInputDir), null, 2),
    "utf8"
  );

  const windowsCommandTemplate = getWindowsCommandTemplate("transcomp");
  const useWindows = windowsRunnerEnabled() && Boolean(windowsCommandTemplate);
  const juliaExe = process.env.JULIA_EXE || "julia";
  let combinedOutput = "";
  let responseSent = false;
  let iamcResult = {
    status: "skipped",
    message: "Model run did not complete; IAMC conversion skipped",
    validationPassed: false,
    filePath: null,
    relativePath: null,
  };

  const handleLine = (line) => {
    appendLine(MODEL_KEY, line);
    combinedOutput += (combinedOutput ? "\n" : "") + line;
  };

  try {
    let child;
    let windowsResultsRoot = process.env.REMOTE_RESULTS_ROOT || "C:\\model-results";
    let windowsInputDir = null;
    if (useWindows) {
      const windowsWorkDir = `${windowsResultsRoot}\\_work\\${runId}`;
      const windowsOutputDir = `${windowsResultsRoot}\\${runId}`;
      windowsInputDir = `${windowsWorkDir}\\dataset`;
      const windowsConfigPath = `${windowsWorkDir}\\config.json`;

      await copyDirectoryToWindows({
        sourceDir: runInputDir,
        destinationDir: windowsWorkDir,
        onLine: handleLine,
        retries: 3,
      });

      const command = expandTemplate(windowsCommandTemplate, {
        RUN_ID: runId,
        RUN_NAME: requestedRunName,
        INPUT_DIR: windowsInputDir,
        OUTPUT_DIR: windowsOutputDir,
        CONFIG_PATH: windowsConfigPath,
        RUNNER_SCRIPT,
        PROJECT_DIR,
        REPO_ROOT,
        REMOTE_RESULTS_ROOT: windowsResultsRoot,
      });
      handleLine(`Starting remote TransComp run (runId=${runId})`);
      child = spawnWindowsSshCommand(command);
    } else {
      if (process.platform !== "win32" && /^[A-Za-z]:\\/.test(juliaExe)) {
        endRun(MODEL_KEY, 1);
        return res.status(500).json({
          error: "TransComp local run is misconfigured",
          details:
            "No remote TransComp command template is configured, and JULIA_EXE points to a Windows path. Set a template in server/config/windows-command-templates.json (or REMOTE_TRANSCOMP_COMMAND_TEMPLATE) for SSH execution, or set JULIA_EXE to a Linux Julia binary.",
        });
      }

      child = spawn(
        juliaExe,
        ["--project", PROJECT_DIR, path.join(REPO_ROOT, RUNNER_SCRIPT), requestedRunName, datasetInputDir, outputDir, configPath],
        { cwd: REPO_ROOT }
      );
    }

    streamChildOutput(child, handleLine);
    const exitCode = await waitForExit(child);

    if (exitCode === 0) {
      if (useWindows) {
        iamcResult = await runIamcPostProcessWindows({
          runId,
          windowsResultsRoot,
          windowsInputDir,
          onLine: handleLine,
        });
        await copyResultsFromWindows({ runId, destinationDir: outputDir, onLine: handleLine, retries: 3 });
        if (iamcResult.status === "success") {
          handleLine("TransComp model run, IAMC conversion, and copy of results complete");
        } else {
          handleLine("TransComp model run and copy of results complete (IAMC conversion failed)");
        }
      } else {
        iamcResult = await runIamcPostProcess({
          runId,
          outputDir,
          datasetInputDir,
          onLine: handleLine,
        });
      }
      if (iamcResult.status === "success") {
        handleLine(`[IAMC] Output written: ${iamcResult.relativePath}`);
      } else {
        handleLine(`[IAMC] ${iamcResult.message}`);
      }
    }

    endRun(MODEL_KEY, exitCode);

    fs.writeFileSync(
      path.join(outputDir, "run-output.json"),
      JSON.stringify(
        {
          exitCode,
          runId,
          runName: requestedRunName,
          selectedDataset,
          outputDir,
          combinedOutput,
          iamc: iamcResult,
          completedAt: new Date().toISOString(),
        },
        null,
        2
      ),
      "utf8"
    );

    if (responseSent) return;
    responseSent = true;

    if (exitCode !== 0) {
      return res.status(500).json({
        error: "TransComp run failed",
        details: combinedOutput,
        outputDir,
        runId,
      });
    }

    return res.json({
      output: combinedOutput.trim(),
      outputDir,
      runId,
      mode: useWindows ? "windows-remote" : "local",
      iamc: iamcResult,
    });
  } catch (error) {
    endRun(MODEL_KEY, 1);
    if (responseSent) return undefined;
    responseSent = true;
    return res.status(500).json({
      error: "Failed to execute TransComp run",
      details: error.message,
      outputDir,
      runId,
    });
  }
});

export default router;