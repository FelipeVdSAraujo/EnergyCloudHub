import express from "express";
import Run from "../../models/Run.js";
import { addSubscriber, getStatus } from "../../utils/runState.js";
import { MODEL_KEY } from "./shared.js";

const router = express.Router();

router.post("/save", async (req, res) => {
  try {
    const run = new Run({
      ...req.body,
      modelName: MODEL_KEY,
      owner: req.user?.id,
    });
    await run.save();
    res.status(201).json({ message: "Run saved successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to save run", details: error.message });
  }
});

router.get("/history", async (req, res) => {
  try {
    const runs = await Run.find({ modelName: MODEL_KEY }).sort({ _id: -1 });
    res.json(runs);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch runs", details: error.message });
  }
});

router.get("/status", (req, res) => {
  const status = getStatus(MODEL_KEY);
  const activeOwnerId = status?.activeRun?.ownerId ? String(status.activeRun.ownerId) : null;
  const currentUserId = req.user?.id ? String(req.user.id) : null;

  res.json({
    ...status,
    activeRunOwnedByCurrentUser: Boolean(activeOwnerId && currentUserId && activeOwnerId === currentUserId),
  });
});

router.get("/stream", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders && res.flushHeaders();

  const status = getStatus(MODEL_KEY);
  res.write("event: init\n");
  res.write(`data: ${JSON.stringify(status)}\n\n`);

  addSubscriber(MODEL_KEY, res);
});

export default router;