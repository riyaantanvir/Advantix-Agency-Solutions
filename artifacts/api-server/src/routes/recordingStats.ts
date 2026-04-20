import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireToolUser } from "../middleware/toolAuth.js";
import { getEffectiveRecordingMaxSeconds } from "./toolPermissions.js";

const router = Router();

/* Small grace allows for client-side timer/network jitter without rejecting an
   otherwise-legit recording that ended a moment past the cap. */
const DURATION_GRACE_SECONDS = 5;

router.post("/tools/recordings", requireToolUser, async (req, res) => {
  try {
    const session = req.session as { toolUserId?: number };
    const userId = session.toolUserId!;
    const { durationSeconds } = req.body;

    if (typeof durationSeconds !== "number" || !Number.isFinite(durationSeconds) || durationSeconds < 0) {
      return res.status(400).json({ error: "Invalid durationSeconds" });
    }

    /* Enforce the per-user recording cap server-side so a tampered client
       cannot persist a session longer than admin policy allows. We clamp
       (rather than reject) so the recording is still accounted for. */
    const maxSeconds = await getEffectiveRecordingMaxSeconds(userId);
    const clamped = Math.min(Math.floor(durationSeconds), maxSeconds + DURATION_GRACE_SECONDS);

    await db.execute(sql`
      INSERT INTO recording_sessions (user_id, duration_seconds)
      VALUES (${userId}, ${clamped})
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
