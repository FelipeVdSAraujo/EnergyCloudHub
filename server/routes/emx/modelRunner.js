import express from "express";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { appendLine, endRun, tryStartRun } from "../../utils/runState.js";
import { sendEmail } from "../../utils/emailService.js";
import User from "../../models/User.js";
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
  MODEL_KEY,
  PROJECT_DIR,
  RESULTS_DIR,
  getActiveConfig,
  sanitizeRunName,
  writeJson
} from "./shared.js";

const router = express.Router();
const RUN_SCRIPT_PATH = path.join(PROJECT_DIR, "run_files", "run_basecase.jl");
const PROPOSED_RUN_SCRIPT_PATH = path.join(PROJECT_DIR, "..", "..", "website_clone", "scripts", "run_emx_runjl_proposed.jl");

function boolArg(value) {
  return value ? "true" : "false";
}

function getEnabledCountryCodes(selectedCountries = {}) {
  return Object.entries(selectedCountries)
    .filter(([, enabled]) => Boolean(enabled))
    .map(([code]) => code)
    .sort();
}

function getSelectedOutputVariables(values = []) {
  if (!Array.isArray(values)) return [];
  return values.map((value) => String(value)).filter((value, index, arr) => value && arr.indexOf(value) === index);
}

function getRunMode() {
  return String(process.env.EMX_RUN_MODE || "proposed-runjl").trim().toLowerCase();
}

function buildJuliaArgs({ config, outputDir, requestedRunName }) {
  const runMode = getRunMode();

  if (runMode === "proposed-runjl") {
    const selectedCountries = getEnabledCountryCodes(config.selectedCountries);
    const selectedOutputVariables = getSelectedOutputVariables(config.selectedOutputVariables);

    return [
      "--project=.",
      PROPOSED_RUN_SCRIPT_PATH,
      `--project-root=${PROJECT_DIR}`,
      `--run-name=${requestedRunName}`,
      `--output-dir=${outputDir}`,
      `--case-type=${config.caseType}`,
      `--op-periods=${config.opPeriods}`,
      `--optim-hor=${config.optimHor}`,
      `--impl-hor=${config.implHor}`,
      `--generate-dispatch-plot=${boolArg(config.generateDispatchPlot)}`,
      `--emission-price=${config.emissionPrice}`,
      `--opex-electricity-solar-pv-utility-optimal=${config.resOpex?.electricitySolarPvUtilityOptimal}`,
      `--opex-electricity-wind-onshore-average=${config.resOpex?.electricityWindOnshoreAverage}`,
      `--opex-electricity-wind-offshore-transitional=${config.resOpex?.electricityWindOffshoreTransitional}`,
      `--opex-electricity-hydro-run-of-river=${config.resOpex?.electricityHydroRunOfRiver}`,
      `--opex-heat-solar=${config.resOpex?.heatSolar}`,
      `--selected-countries=${selectedCountries.join(",")}`,
      `--selected-output-variables=${selectedOutputVariables.join(",")}`
    ];
  }

  return [
    "--project=.",
    RUN_SCRIPT_PATH,
    `--run-name=${requestedRunName}`,
    `--output-dir=${outputDir}`,
    `--case-type=${config.caseType}`,
    `--op-periods=${config.opPeriods}`,
    `--op-periods-duration=${config.opPeriodsDuration}`,
    `--optim-hor=${config.optimHor}`,
    `--impl-hor=${config.implHor}`,
    `--include-lithium-ion=${boolArg(config.includeLithiumIon)}`,
    `--include-pumped-storage=${boolArg(config.includePumpedStorage)}`,
    `--include-hydro-reservoir=${boolArg(config.includeHydroReservoir)}`,
    `--generate-dispatch-plot=${boolArg(config.generateDispatchPlot)}`
  ];
}

async function notifyCompletionEmail({ userId, runName, runId, success, details }) {
  if (!userId) return;

  const user = await User.findById(userId).lean();
  if (!user?.email) return;

  const frontendUrl = String(process.env.FRONTEND_URL || "").replace(/\/$/, "");
  const resultsLink = frontendUrl ? `${frontendUrl}/models/emx/results` : "";

  const subject = success
    ? `[EMX] Run completed: ${runName}`
    : `[EMX] Run failed: ${runName}`;

  const text = success
    ? `Run ${runName} (${runId}) completed successfully. ${resultsLink ? `Results: ${resultsLink}` : ""}`
    : `Run ${runName} (${runId}) failed. ${details || "No additional details."}`;

  const html = success
    ? `<p>Run <b>${runName}</b> (${runId}) completed successfully.</p>${resultsLink ? `<p>Results: <a href="${resultsLink}">${resultsLink}</a></p>` : ""}`
    : `<p>Run <b>${runName}</b> (${runId}) failed.</p><pre>${String(details || "No additional details.")}</pre>`;

  await sendEmail({ to: user.email, subject, text, html });
}

router.get("/run-script", async (req, res) => {
  const requestedRunName = sanitizeRunName(req.query.runName);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const runFolderName = `${requestedRunName}_${timestamp}`;
  const outputDir = path.join(RESULTS_DIR, "web_runs", runFolderName);
  fs.mkdirSync(outputDir, { recursive: true });

  const startResult = tryStartRun(MODEL_KEY, requestedRunName, {
    ownerId: req.user?._id?.toString?.() || req.user?.id?.toString?.() || null,
    ownerUsername: req.user?.username || null
  });
  if (!startResult.ok) {
    return res.status(409).json({
      error: "Run already in progress",
      current: startResult.current
    });
  }

  const config = getActiveConfig();
  writeJson(path.join(outputDir, "requested-config.json"), config);
  const runMode = getRunMode();
  const selectedCountries = getEnabledCountryCodes(config.selectedCountries);
  const selectedOutputVariables = getSelectedOutputVariables(config.selectedOutputVariables);

  const windowsCommandTemplate = getWindowsCommandTemplate("emx");
  const useWindows = windowsRunnerEnabled() && Boolean(windowsCommandTemplate);
  const runId = buildRunId(MODEL_KEY);
  let combinedOutput = "";
  let responseSent = false;

  const handleLine = (line) => {
    appendLine(MODEL_KEY, line);
    combinedOutput += (combinedOutput ? "\n" : "") + line;
  };

  try {
    if (useWindows) {
      const command = expandTemplate(windowsCommandTemplate, {
        RUN_ID: runId,
        RUN_NAME: requestedRunName,
        JULIA_EXE: process.env.JULIA_EXE || "julia",
        REMOTE_RESULTS_ROOT: process.env.REMOTE_RESULTS_ROOT || "C:\\model-results",
        CASE_TYPE: config.caseType,
        OP_PERIODS: config.opPeriods,
        OP_PERIODS_DURATION: config.opPeriodsDuration,
        OPTIM_HOR: config.optimHor,
        IMPL_HOR: config.implHor,
        INCLUDE_LITHIUM_ION: boolArg(config.includeLithiumIon),
        INCLUDE_PUMPED_STORAGE: boolArg(config.includePumpedStorage),
        INCLUDE_HYDRO_RESERVOIR: boolArg(config.includeHydroReservoir),
        GENERATE_DISPATCH_PLOT: boolArg(config.generateDispatchPlot),
        RUN_MODE: runMode,
        EMISSION_PRICE: config.emissionPrice,
        OPEX_ELECTRICITY_SOLAR_PV_UTILITY_OPTIMAL: config.resOpex?.electricitySolarPvUtilityOptimal,
        OPEX_ELECTRICITY_WIND_ONSHORE_AVERAGE: config.resOpex?.electricityWindOnshoreAverage,
        OPEX_ELECTRICITY_WIND_OFFSHORE_TRANSITIONAL: config.resOpex?.electricityWindOffshoreTransitional,
        OPEX_ELECTRICITY_HYDRO_RUN_OF_RIVER: config.resOpex?.electricityHydroRunOfRiver,
        OPEX_HEAT_SOLAR: config.resOpex?.heatSolar,
        SELECTED_COUNTRIES: selectedCountries.join(","),
        SELECTED_OUTPUT_VARIABLES: selectedOutputVariables.join(",")
      });

      handleLine(`Starting remote EMX run (runId=${runId})`);
      const child = spawnWindowsSshCommand(command);
      streamChildOutput(child, handleLine);
      const code = await waitForExit(child);

      if (code !== 0) {
        endRun(MODEL_KEY, code);
        await notifyCompletionEmail({
          userId: req.user?.id || req.user?._id,
          runName: requestedRunName,
          runId,
          success: false,
          details: combinedOutput.slice(-1500)
        }).catch((err) => {
          console.error("[emx] completion email failed:", err.message);
        });

        return res.status(500).json({
          error: "EMX remote run failed",
          details: combinedOutput,
          outputDir,
          runId
        });
      }

      await copyResultsFromWindows({ runId, destinationDir: outputDir, onLine: handleLine, retries: 3 });
      writeJson(path.join(outputDir, "run-output.json"), {
        exitCode: 0,
        mode: "windows-remote",
        runId,
        outputDir,
        requestedRunName,
        combinedOutput
      });

      endRun(MODEL_KEY, 0);
      await notifyCompletionEmail({
        userId: req.user?.id || req.user?._id,
        runName: requestedRunName,
        runId,
        success: true,
      }).catch((err) => {
        console.error("[emx] completion email failed:", err.message);
      });

      return res.json({
        output: combinedOutput.trim(),
        outputDir,
        runId,
        mode: "windows-remote"
      });
    }

    const juliaExe = process.env.JULIA_EXE || "julia";
    const child = spawn(
      juliaExe,
      buildJuliaArgs({ config, outputDir, requestedRunName }),
      { cwd: PROJECT_DIR }
    );

    streamChildOutput(child, handleLine);

    child.on("close", (code) => {
      writeJson(path.join(outputDir, "run-output.json"), {
        exitCode: code,
        scriptPath: RUN_SCRIPT_PATH,
        outputDir,
        requestedRunName,
        combinedOutput
      });

      endRun(MODEL_KEY, code);

      if (responseSent) return;
      responseSent = true;

      if (code !== 0) {
        return res.status(500).json({
          error: "EMX run failed",
          details: combinedOutput,
          outputDir
        });
      }

      res.json({
        output: combinedOutput.trim(),
        outputDir,
        mode: "local"
      });
    });

    child.on("error", (error) => {
      endRun(MODEL_KEY, 1);

      if (responseSent) return;
      responseSent = true;

      res.status(500).json({
        error: "Failed to start EMX run",
        details: error.message
      });
    });
  } catch (error) {
    endRun(MODEL_KEY, 1);
    return res.status(500).json({
      error: "Failed to execute EMX run",
      details: error.message,
      outputDir,
      runId,
    });
  }
});

export default router;
