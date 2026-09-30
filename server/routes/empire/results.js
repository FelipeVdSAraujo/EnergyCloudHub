/**
 * results.js
 * 
 * Express router for browsing and downloading model run results in the EnSolve backend.
 * 
 * Features:
 * - Recursively lists the contents of the results directory.
 * - Provides endpoints for listing directory contents and downloading result files.
 * - Ensures secure access to files within the results directory.
 * 
 * Endpoints:
 * - GET /api/results/list-dir?path=... : Lists contents of a specified results subdirectory.
 * - GET /api/results/download?path=... : Downloads a specific result file.
 * 
 * Usage:
 * - Mounted at /api/results in the main server.
 * - Used by the frontend to browse and download analysis results.
 */
import express from "express";
import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import { resolveRepoPath } from "../../utils/paths.js";
import Run from "../../models/Run.js";

const router = express.Router();
const resultsDir = resolveRepoPath("OpenEMPIRE", "Results", "run_analysis");

// Utility: Recursively list directory contents
function getDirectoryTree(dirPath, basePath = dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  return entries.map(entry => {
    const fullPath = path.join(dirPath, entry.name);
    const relativePath = path.relative(basePath, fullPath);
    if (entry.isDirectory()) {
      return {
        name: entry.name,
        path: relativePath,
        type: 'folder',
        children: getDirectoryTree(fullPath, basePath)
      };
    } else {
      return {
        name: entry.name,
        path: relativePath,
        type: 'file'
      };
    }
  });
}

// Route: List specific directory
router.get('/list-dir', (req, res) => {
  const relPath = String(req.query.path || '');
  const normalizedPath = path.normalize(relPath);
  const dirToRead = path.resolve(resultsDir, normalizedPath);

  if (dirToRead !== resultsDir && !dirToRead.startsWith(resultsDir + path.sep)) {
    return res.status(400).json({ error: 'Invalid directory path' });
  }

  try {
    const entries = fs.readdirSync(dirToRead, { withFileTypes: true });
    const contents = entries.map((entry) => ({
      name: entry.name,
      path: path.posix.join(relPath.replaceAll('\\', '/'), entry.name),
      type: entry.isDirectory() ? 'folder' : 'file',
    }));
    return res.json({ contents });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to read directory' });
  }
});

// Route: Export IAMC-compatible xlsx (annual rows only, subannual column removed)
router.get('/iamc-export', async (req, res) => {
  const runName = req.query.run;
  if (!runName) return res.status(400).json({ error: 'Missing run parameter' });

  const modelName = req.query.modelName || 'EMPIRE v1.0.0/v51-test';

  const safeName = path.basename(runName);
  const filePath = path.join(resultsDir, safeName, 'Output', 'IAMC', 'empire_iamc.csv');

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'No IAMC output found for this run' });
  }

  const defaultScenarioName = safeName.replace(/^ensolve_/i, '') || safeName;
  let scenarioName = defaultScenarioName;
  try {
    const run = await Run.findOne({ runName: safeName }).lean();
    if (run?.selectedDatasetName) {
      scenarioName = run.selectedDatasetName;
    }
  } catch (err) {
    console.warn('Could not resolve scenario name from run:', err.message);
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split(/\r?\n/).filter(l => l.trim() !== '');
  const header = lines[0].split(',');
  const normalizedHeader = header.map((h) => String(h).trim().toLowerCase());
  const subIdx = normalizedHeader.indexOf('subannual');
  const scenarioIdx = normalizedHeader.indexOf('scenario');

  if (subIdx === -1) {
    return res.status(500).json({ error: 'Unexpected format: no subannual column' });
  }

  const drop = (cols) => cols.filter((_, i) => i !== subIdx);

  const rows = [drop(header)];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (String(cols[subIdx] || '').trim().toLowerCase() === 'year') {
      const row = drop(cols);
      row[0] = modelName; // override model column
      if (scenarioIdx !== -1) {
        const scenarioColIdx = scenarioIdx < subIdx ? scenarioIdx : scenarioIdx - 1;
        const rawScenario = String(cols[scenarioIdx] || '');
        const pipeIdx = rawScenario.indexOf('|');
        if (pipeIdx !== -1) {
          const seriesSuffix = rawScenario.slice(pipeIdx + 1).replace(/^scenario/i, 'series');
          row[scenarioColIdx] = `${scenarioName}|${seriesSuffix}`;
        } else {
          row[scenarioColIdx] = scenarioName;
        }
      }
      rows.push(row);
    }
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('IAMC');
  sheet.addRows(rows);

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}_iamc.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
});

// Route: Export IAMC-compatible xlsx (annual rows only, subannual column removed)
router.get('/iamc-export', async (req, res) => {
  const runName = req.query.run;
  if (!runName) return res.status(400).json({ error: 'Missing run parameter' });

  const modelName = req.query.modelName || 'EMPIRE v1.0.0/v51-test';

  const safeName = path.basename(runName);
  const filePath = path.join(resultsDir, safeName, 'Output', 'IAMC', 'empire_iamc.csv');

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'No IAMC output found for this run' });
  }

  const defaultScenarioName = safeName.replace(/^ensolve_/i, '') || safeName;
  let scenarioName = defaultScenarioName;
  try {
    const run = await Run.findOne({ runName: safeName }).lean();
    if (run?.selectedDatasetName) {
      scenarioName = run.selectedDatasetName;
    }
  } catch (err) {
    console.warn('Could not resolve scenario name from run:', err.message);
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split(/\r?\n/).filter(l => l.trim() !== '');
  const header = lines[0].split(',');
  const normalizedHeader = header.map((h) => String(h).trim().toLowerCase());
  const subIdx = normalizedHeader.indexOf('subannual');
  const scenarioIdx = normalizedHeader.indexOf('scenario');

  if (subIdx === -1) {
    return res.status(500).json({ error: 'Unexpected format: no subannual column' });
  }

  const drop = (cols) => cols.filter((_, i) => i !== subIdx);

  const rows = [drop(header)];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (String(cols[subIdx] || '').trim().toLowerCase() === 'year') {
      const row = drop(cols);
      row[0] = modelName; // override model column
      if (scenarioIdx !== -1) {
        const scenarioColIdx = scenarioIdx < subIdx ? scenarioIdx : scenarioIdx - 1;
        const rawScenario = String(cols[scenarioIdx] || '');
        const pipeIdx = rawScenario.indexOf('|');
        if (pipeIdx !== -1) {
          const seriesSuffix = rawScenario.slice(pipeIdx + 1).replace(/^scenario/i, 'series');
          row[scenarioColIdx] = `${scenarioName}|${seriesSuffix}`;
        } else {
          row[scenarioColIdx] = scenarioName;
        }
      }
      rows.push(row);
    }
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('IAMC');
  sheet.addRows(rows);

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}_iamc.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
});

// Route: Download a file
router.get('/download', (req, res) => {
    const relPath = req.query.path;
    if (!relPath) {
      return res.status(400).json({ error: 'Missing path parameter' });
    }
  
    // Resolve the full absolute path
    const fullPath = path.resolve(resultsDir, relPath);
  
    // SECURITY: Ensure the file is inside the resultsDir
    if (!fullPath.startsWith(resultsDir + path.sep)) {
      return res.status(403).json({ error: 'Access denied' });
    }
  
    // Check if file exists and is not a directory
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'File not found' });
    }
  
    if (fs.statSync(fullPath).isDirectory()) {
      return res.status(400).json({ error: 'Cannot download a directory' });
    }
  
    // Send file
    res.download(fullPath, err => {
      if (err) {
        console.error('Download error:', err);
        res.status(500).json({ error: 'Error sending file' });
      }
    });
  });

export default router;
