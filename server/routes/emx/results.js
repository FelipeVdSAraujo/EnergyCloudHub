import express from "express";
import fs from "fs";
import path from "path";
import { RESULTS_DIR } from "./shared.js";

const router = express.Router();
const EMX_WEB_RUNS_DIR = path.join(RESULTS_DIR, "web_runs");

function listCsvFiles(dataDir) {
  try {
    return fs
      .readdirSync(dataDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".csv"))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));
  } catch (_error) {
    return [];
  }
}

router.get("/list-dir", (req, res) => {
  const relPath = req.query.path || "";
  const safePath = path.normalize(relPath).replace(/^(\.\.(\/|\\|$))+/, "");
  const dirToRead = path.join(RESULTS_DIR, safePath);

  try {
    const entries = fs.readdirSync(dirToRead, { withFileTypes: true });
    const contents = entries.map((entry) => ({
      name: entry.name,
      path: path.join(relPath, entry.name),
      type: entry.isDirectory() ? "folder" : "file"
    }));
    res.json({ contents });
  } catch (error) {
    res.status(500).json({ error: "Failed to read EMX results directory", details: error.message });
  }
});

router.get("/download", (req, res) => {
  const relPath = req.query.path;
  if (!relPath) {
    return res.status(400).json({ error: "Missing path parameter" });
  }

  const fullPath = path.resolve(RESULTS_DIR, relPath);
  if (!fullPath.startsWith(RESULTS_DIR + path.sep)) {
    return res.status(403).json({ error: "Access denied" });
  }
  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ error: "File not found" });
  }
  if (fs.statSync(fullPath).isDirectory()) {
    return res.status(400).json({ error: "Cannot download a directory" });
  }

  res.download(fullPath, (error) => {
    if (error) {
      res.status(500).json({ error: "Error sending file", details: error.message });
    }
  });
});

router.get("/iamc-export", async (req, res) => {
  const runName = String(req.query.run || "").trim();
  if (!runName) {
    return res.status(400).json({ error: "Missing run parameter" });
  }

  const safeRunName = path.basename(runName);
  const runDir = path.join(EMX_WEB_RUNS_DIR, safeRunName);
  if (!fs.existsSync(runDir) || !fs.statSync(runDir).isDirectory()) {
    return res.status(404).json({ error: "Run folder not found" });
  }

  const candidates = [
    path.join(runDir, "Output", "IAMC", "emx_iamc.xlsx"),
    path.join(runDir, "emx_iamc.xlsx"),
  ];

  const iamcDir = path.join(runDir, "Output", "IAMC");
  let timestampedIamc = null;
  if (fs.existsSync(iamcDir) && fs.statSync(iamcDir).isDirectory()) {
    const matches = fs
      .readdirSync(iamcDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /^EMX_IAMC_.+\.xlsx$/i.test(entry.name))
      .map((entry) => path.join(iamcDir, entry.name))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    if (matches.length) {
      timestampedIamc = matches[0];
    }
  }

  const outPath = timestampedIamc
    || candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());

  if (!outPath) {
    return res.status(404).json({
      error: "IAMC file not found for this run",
      availableCsv: listCsvFiles(runDir),
      hint: "IAMC is generated on the Windows compute step. Re-run EMX after deployment if this run predates IAMC generation.",
    });
  }

  return res.download(outPath, `${safeRunName}_iamc.xlsx`, (error) => {
    if (error) {
      if (!res.headersSent) {
        res.status(500).json({ error: "Error sending IAMC file", details: error.message });
      }
    }
  });
});

export default router;
