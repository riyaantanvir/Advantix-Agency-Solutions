import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireToolUser } from "../middleware/toolAuth.js";

const router = Router();

router.post("/tools/recordings", requireToolUser, async (req, res) => {
  try {
    const session = req.session as { toolUserId?: number };
    const userId = session.toolUserId!;
    const { durationSeconds } = req.body;

    if (typeof durationSeconds !== "number" || durationSeconds < 0) {
      return res.status(400).json({ error: "Invalid durationSeconds" });
    }

    await db.execute(sql`
      INSERT INTO recording_sessions (user_id, duration_seconds)
      VALUES (${userId}, ${Math.floor(durationSeconds)})
    `);

    return res.json({ ok: true });
  } catch (err) {
    console.error("Save recording error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.get("/tools/recordings/stats", requireToolUser, async (req, res) => {
  try {
    const session = req.session as { toolUserId?: number };
    const userId = session.toolUserId!;

    const result = await db.execute(sql`
      SELECT
        COUNT(*)::int AS total_recordings,
        COALESCE(SUM(duration_seconds), 0)::int AS total_seconds
      FROM recording_sessions
      WHERE user_id = ${userId}
    `);

    const row = result.rows?.[0] ?? {};

    return res.json({
      totalRecordings: Number(row.total_recordings ?? 0),
      totalSeconds: Number(row.total_seconds ?? 0),
    });
  } catch (err) {
    console.error("Get recording stats error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

export default router;
