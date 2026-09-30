/**
 * runRoutes.js
 * 
 * Express router for managing model run history in the EnSolve backend.
 * 
 * Features:
 * - Saves new model run metadata to MongoDB.
 * - Retrieves the history of all model runs, sorted by newest first.
 * 
 * Endpoints:
 * - POST /api/runs/save    : Saves a new run to the database.
 * - GET  /api/runs/history : Retrieves all runs from the database.
 * 
 * Usage:
 * - Mounted at /api/runs in the main server.
 * - Uses the Run Mongoose model for database operations.
 */

import express from "express";
import Run from "../../models/Run.js";
import { addSubscriber, getStatus } from "../../utils/runState.js";

const router = express.Router();

// Save a new run
router.post('/save', async (req, res) => {
  try {
    const run = new Run({
      ...req.body,
      owner: req.user?.id,
    });
    await run.save();
    res.status(201).json({ message: 'Run saved successfully!' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save run', details: error.message });
  }
});

// Get all runs
router.get('/history', async (req, res) => {
  try {
    const runs = await Run.find({modelName: "empire"}).sort({ _id: -1 }); // newest first
    res.json(runs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch runs', details: error.message });
  }
});

// Get current run status
router.get('/status', (req, res) => {
  const status = getStatus("empire");
  const activeOwnerId = status?.activeRun?.ownerId ? String(status.activeRun.ownerId) : null;
  const currentUserId = req.user?.id ? String(req.user.id) : null;
  res.json({
    ...status,
    activeRunOwnedByCurrentUser: Boolean(activeOwnerId && currentUserId && activeOwnerId === currentUserId),
  });
});

router.get('/stream', (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });
  res.flushHeaders && res.flushHeaders();

  const status = getStatus("empire");
  res.write("event: init\n");
  res.write(`data: ${JSON.stringify(status)}\n\n`);

  addSubscriber("empire", res);
});

export default router;
