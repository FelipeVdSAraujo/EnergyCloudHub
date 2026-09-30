import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const COMMAND_TEMPLATE_FILE = path.join(__dirname, "..", "config", "windows-command-templates.json");
const MODEL_ENV_KEYS = {
  empire: "REMOTE_EMPIRE_COMMAND_TEMPLATE",
  emx: "REMOTE_EMX_COMMAND_TEMPLATE",
  transcomp: "REMOTE_TRANSCOMP_COMMAND_TEMPLATE",
  gcam: "REMOTE_GCAM_COMMAND_TEMPLATE",
  ukraine: "REMOTE_UKRAINE_COMMAND_TEMPLATE",
};

let commandTemplatesCache;

function splitSshOptions(raw) {
  return String(raw || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function loadCommandTemplates() {
  if (commandTemplatesCache) return commandTemplatesCache;

  try {
    const raw = fs.readFileSync(COMMAND_TEMPLATE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    commandTemplatesCache = parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    commandTemplatesCache = {};
  }

  return commandTemplatesCache;
}

function readEnv(key, fallback = "") {
  const primaryKey = String(key || "");
  const primary = process.env[primaryKey];
  if (primary !== undefined && primary !== null && String(primary).length > 0) {
    return String(primary);
  }

  return fallback;
}

export function getWindowsCommandTemplate(modelKey) {
  const normalized = String(modelKey || "").toLowerCase();
  const envKey = MODEL_ENV_KEYS[normalized];
  const envTemplate = envKey ? readEnv(envKey).trim() : "";
  if (envTemplate) return envTemplate;

  const fileTemplate = String(loadCommandTemplates()[normalized] || "").trim();
  return fileTemplate;
}

export function windowsRunnerEnabled() {
  const host = readEnv("REMOTE_RUNNER_HOST");
  const user = readEnv("REMOTE_RUNNER_USER");
  const enabled = readEnv("REMOTE_RUNNER_ENABLED", "true").toLowerCase() !== "false";
  return Boolean(host && user && enabled);
}

export function buildRunId(prefix) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${stamp}-${rand}`;
}

export function expandTemplate(template, values) {
  return String(template || "").replace(/\{([A-Z0-9_]+)\}/g, (_, key) => {
    const value = values[key];
    return value === undefined || value === null ? "" : String(value);
  });
}

export function streamChildOutput(child, onLine) {
  const handleChunk = (chunk) => {
    chunk
      .toString()
      .split(/\r?\n/)
      .forEach((line) => {
        if (line.length) onLine(line);
      });
  };

  child.stdout.on("data", handleChunk);
  child.stderr.on("data", handleChunk);
}

// Waits for the child to exit. Optional timeoutMinutes (plan 4.1): rejects
// with an Error with code "RUN_TIMEOUT" if the child is still alive after
// that long. Callers that pass nothing keep the old wait-forever behaviour.
export function waitForExit(child, timeoutMinutes = 0) {
  return new Promise((resolve, reject) => {
    let timer = null;
    child.on("error", reject);
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve(code);
    });
    if (timeoutMinutes > 0) {
      timer = setTimeout(() => {
        const err = new Error(`Worker did not exit within ${timeoutMinutes} minute(s).`);
        err.code = "RUN_TIMEOUT";
        err.timeoutMinutes = timeoutMinutes;
        reject(err);
      }, timeoutMinutes * 60 * 1000);
    }
  });
}

export function spawnWindowsSshCommand(command) {
  const host = readEnv("REMOTE_RUNNER_HOST");
  const user = readEnv("REMOTE_RUNNER_USER");
  const target = `${user}@${host}`;
  const sshOptions = splitSshOptions(readEnv("REMOTE_RUNNER_SSH_OPTIONS"));
  return spawn("ssh", [...sshOptions, target, command]);
}

async function runSshCommand(command, onLine) {
  const child = spawnWindowsSshCommand(command);
  if (onLine) streamChildOutput(child, onLine);
  return waitForExit(child);
}

function windowsPathToScpPaths(rawPath) {
  const value = String(rawPath || "").trim();
  const drive = value.match(/^([A-Za-z]):\\(.*)$/);
  if (drive) {
    const driveLower = drive[1].toLowerCase();
    const driveUpper = drive[1].toUpperCase();
    const rest = drive[2].replaceAll("\\", "/");
    return [`${driveUpper}:/${rest}`, `/${driveLower}/${rest}`];
  }

  const unixDrive = value.match(/^\/([A-Za-z])\/(.*)$/);
  if (unixDrive) {
    const driveLower = unixDrive[1].toLowerCase();
    const driveUpper = unixDrive[1].toUpperCase();
    const rest = unixDrive[2].replaceAll("\\", "/");
    return [`${driveUpper}:/${rest}`, `/${driveLower}/${rest}`];
  }

  const normalized = value.replaceAll("\\", "/");
  return [normalized];
}

export async function copyResultsFromWindows({ runId, destinationDir, onLine, retries = 3 }) {
  const host = readEnv("REMOTE_RUNNER_HOST");
  const user = readEnv("REMOTE_RUNNER_USER");
  const target = `${user}@${host}`;
  const sshOptions = splitSshOptions(readEnv("REMOTE_RUNNER_SSH_OPTIONS"));
  const sourceRoots = windowsPathToScpPaths(readEnv("REMOTE_RESULTS_ROOT", "C:\\model-results"));

  fs.mkdirSync(destinationDir, { recursive: true });

  let lastError = null;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    onLine(`Copying results from Windows (attempt ${attempt}/${retries})`);

    for (const sourceRoot of sourceRoots) {
      const source = `${sourceRoot}/${runId}`;
      onLine(`Trying source path: ${sourceRoot}`);
      const scp = spawn("scp", [...sshOptions, "-r", `${target}:${source}/.`, destinationDir]);
      streamChildOutput(scp, onLine);

      // eslint-disable-next-line no-await-in-loop
      const exitCode = await waitForExit(scp);
      if (exitCode === 0) {
        onLine("Result copy completed successfully.");
        return;
      }

      lastError = new Error(`scp exited with code ${exitCode} for source ${sourceRoot}`);
      onLine(`Result copy failed with code ${exitCode} using source ${sourceRoot}.`);
    }
  }

  throw lastError || new Error("Failed to copy results from Windows.");
}

export async function copyDirectoryToWindows({ sourceDir, destinationDir, onLine, retries = 3 }) {
  const host = readEnv("REMOTE_RUNNER_HOST");
  const user = readEnv("REMOTE_RUNNER_USER");
  const target = `${user}@${host}`;
  const sshOptions = splitSshOptions(readEnv("REMOTE_RUNNER_SSH_OPTIONS"));
  const destinationRoots = windowsPathToScpPaths(destinationDir);

  let lastError = null;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    onLine(`Syncing run inputs to Windows (attempt ${attempt}/${retries})`);

    for (const destinationRoot of destinationRoots) {
      onLine(`Trying destination path: ${destinationRoot}`);

      const mkdirCommand = `powershell -NoProfile -Command "New-Item -ItemType Directory -Force -Path '${destinationRoot}' | Out-Null"`;
      // eslint-disable-next-line no-await-in-loop
      const mkdirExit = await runSshCommand(mkdirCommand, onLine);
      if (mkdirExit !== 0) {
        lastError = new Error(`ssh mkdir failed with code ${mkdirExit} for destination ${destinationRoot}`);
        onLine(`Failed to create destination ${destinationRoot} (code ${mkdirExit}).`);
        continue;
      }

      const scp = spawn("scp", [...sshOptions, "-r", `${sourceDir}/.`, `${target}:${destinationRoot}/`]);
      streamChildOutput(scp, onLine);

      // eslint-disable-next-line no-await-in-loop
      const exitCode = await waitForExit(scp);
      if (exitCode === 0) {
        onLine("Input sync to Windows completed successfully.");
        return;
      }

      lastError = new Error(`scp exited with code ${exitCode} for destination ${destinationRoot}`);
      onLine(`Input sync failed with code ${exitCode} using destination ${destinationRoot}.`);
    }
  }

  throw lastError || new Error("Failed to copy input directory to Windows.");
}
