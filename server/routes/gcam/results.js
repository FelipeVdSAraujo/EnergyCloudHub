import express from "express";
import fs from "fs";
import path from "path";
import { GCAM_RUN_ROOT } from "./shared.js";

const router = express.Router();

router.get("/list-dir", (req, res) => {
  const relPath = String(req.query.path || "");
  const normalizedPath = path.normalize(relPath);
  const dirToRead = path.resolve(GCAM_RUN_ROOT, normalizedPath);

  if (dirToRead !== GCAM_RUN_ROOT && !dirToRead.startsWith(GCAM_RUN_ROOT + path.sep)) {
    return res.status(400).json({ error: "Invalid directory path" });
  }

  try {
    const entries = fs.readdirSync(dirToRead, { withFileTypes: true });
    const contents = entries.map((entry) => ({
      name: entry.name,
      path: path.posix.join(relPath.replaceAll("\\", "/"), entry.name),
      type: entry.isDirectory() ? "folder" : "file",
    }));

    return res.json({ contents });
  } catch (error) {
    return res.status(500).json({ error: "Failed to read GCAM results directory", details: error.message });
  }
});

router.get("/download", (req, res) => {
  const relPath = req.query.path;
  if (!relPath) {
    return res.status(400).json({ error: "Missing path parameter" });
  }

  const fullPath = path.resolve(GCAM_RUN_ROOT, String(relPath));
  if (!fullPath.startsWith(GCAM_RUN_ROOT + path.sep)) {
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

export default router;
