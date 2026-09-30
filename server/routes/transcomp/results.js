import express from "express";
import fs from "fs";
import path from "path";
import { TRANS_COMP_RUN_ROOT } from "./shared.js";

const router = express.Router();

router.get("/list-dir", (req, res) => {
  const relPath = String(req.query.path || "");
  const normalizedPath = path.normalize(relPath);
  const dirToRead = path.resolve(TRANS_COMP_RUN_ROOT, normalizedPath);

  if (dirToRead !== TRANS_COMP_RUN_ROOT && !dirToRead.startsWith(TRANS_COMP_RUN_ROOT + path.sep)) {
    return res.status(400).json({ error: "Invalid directory path" });
  }

  try {
    const entries = fs
      .readdirSync(dirToRead, { withFileTypes: true })
      .filter((entry) => !(normalizedPath === "." || normalizedPath === "") || entry.name !== "_work");

    const contents = entries.map((entry) => ({
      name: entry.name,
      path: path.posix.join(relPath.replaceAll("\\", "/"), entry.name),
      type: entry.isDirectory() ? "folder" : "file",
    }));

    return res.json({ contents });
  } catch (error) {
    return res.status(500).json({ error: "Failed to read TransComp results directory", details: error.message });
  }
});

router.get("/download", (req, res) => {
  const relPath = req.query.path;
  if (!relPath) {
    return res.status(400).json({ error: "Missing path parameter" });
  }

  const fullPath = path.resolve(TRANS_COMP_RUN_ROOT, String(relPath));
  if (!fullPath.startsWith(TRANS_COMP_RUN_ROOT + path.sep)) {
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
