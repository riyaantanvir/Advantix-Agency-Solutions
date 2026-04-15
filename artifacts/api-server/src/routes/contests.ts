import { Router, type IRouter } from "express";
import { formLimiter } from "../lib/rateLimiter.js";
import {
  db,
  contestsTable,
  contestParticipantsTable,
  contestSubmissionsTable,
} from "@workspace/db";
import { eq, desc, and, sql, count } from "drizzle-orm";
import { requireAdmin } from "../middleware/auth.js";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const uploadsDir = path.resolve(__dirname, "../../../uploads/contests");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination(_req, _file, cb) { cb(null, uploadsDir); },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname);
    const safe = Date.now() + "-" + Math.random().toString(36).slice(2, 8) + ext;
    cb(null, safe);
  },
});
const ALLOWED_MIMES = [
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "application/pdf", "application/zip",
  "application/x-zip-compressed",
  "application/postscript",
];
const ALLOWED_EXTS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".pdf", ".zip", ".ai", ".psd"];

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === ".svg" || ext === ".html" || ext === ".htm" || ext === ".js") {
      return cb(new Error("File type not allowed"));
    }
    if (ALLOWED_EXTS.includes(ext) || ALLOWED_MIMES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("File type not allowed. Accepted: images, PDF, ZIP, AI, PSD"));
    }
  },
});

const router: IRouter = Router();

/* ── Admin: List all contests ─────────────────────────────── */
router.get("/admin/contests", requireAdmin, async (_req, res) => {
  const contests = await db.select().from(contestsTable).orderBy(desc(contestsTable.createdAt));
  const enriched = await Promise.all(
    contests.map(async (c) => {
      const [pCount] = await db.select({ count: count() }).from(contestParticipantsTable).where(eq(contestParticipantsTable.contestId, c.id));
      const [sCount] = await db.select({ count: count() }).from(contestSubmissionsTable).where(eq(contestSubmissionsTable.contestId, c.id));
      return { ...c, participantCount: pCount?.count ?? 0, submissionCount: sCount?.count ?? 0 };
    })
  );
  res.json(enriched);
});

/* ── Admin: Get single contest with submissions ───────────── */
router.get("/admin/contests/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const [contest] = await db.select().from(contestsTable).where(eq(contestsTable.id, id));
  if (!contest) return res.status(404).json({ error: "Contest not found" });

  const participants = await db.select().from(contestParticipantsTable)
    .where(eq(contestParticipantsTable.contestId, id))
    .orderBy(desc(contestParticipantsTable.createdAt));

  const submissions = await db.select().from(contestSubmissionsTable)
    .where(eq(contestSubmissionsTable.contestId, id))
    .orderBy(desc(contestSubmissionsTable.submittedAt));

  const submissionsWithParticipant = submissions.map((s) => {
    const p = participants.find((p) => p.id === s.participantId);
    return { ...s, participantName: p?.name ?? "Unknown", participantEmail: p?.email ?? "" };
  });

  res.json({ ...contest, participants, submissions: submissionsWithParticipant });
});

/* ── Admin: Create contest ────────────────────────────────── */
router.post("/admin/contests", requireAdmin, async (req, res) => {
  const { title, description, type, instructions, rules, prize, deadline, coverImageUrl, isActive } = req.body;
  if (!title || !description || !deadline) return res.status(400).json({ error: "Title, description, and deadline are required" });

  const [contest] = await db.insert(contestsTable).values({
    title,
    description,
    type: type || "logo",
    instructions: instructions || null,
    rules: rules || null,
    prize: prize || null,
    coverImageUrl: coverImageUrl || null,
    deadline: new Date(deadline),
    status: isActive ? "active" : "draft",
    isActive: isActive ?? false,
  }).returning();

  res.status(201).json(contest);
});

/* ── Admin: Update contest ────────────────────────────────── */
router.put("/admin/contests/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { title, description, type, instructions, rules, prize, deadline, coverImageUrl, isActive, status } = req.body;

  const [updated] = await db.update(contestsTable).set({
    ...(title !== undefined && { title }),
    ...(description !== undefined && { description }),
    ...(type !== undefined && { type }),
    ...(instructions !== undefined && { instructions }),
    ...(rules !== undefined && { rules }),
    ...(prize !== undefined && { prize }),
    ...(coverImageUrl !== undefined && { coverImageUrl }),
    ...(deadline !== undefined && { deadline: new Date(deadline) }),
    ...(isActive !== undefined && { isActive, status: isActive ? "active" : "draft" }),
    ...(status !== undefined && { status }),
    updatedAt: new Date(),
  }).where(eq(contestsTable.id, id)).returning();

  if (!updated) return res.status(404).json({ error: "Contest not found" });
  res.json(updated);
});

/* ── Admin: Delete contest ────────────────────────────────── */
router.delete("/admin/contests/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(contestSubmissionsTable).where(eq(contestSubmissionsTable.contestId, id));
  await db.delete(contestParticipantsTable).where(eq(contestParticipantsTable.contestId, id));
  await db.delete(contestsTable).where(eq(contestsTable.id, id));
  res.json({ message: "Deleted" });
});

/* ── Admin: Select winner ─────────────────────────────────── */
router.post("/admin/contests/:id/winner", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { submissionId } = req.body;
  if (!submissionId) return res.status(400).json({ error: "submissionId is required" });

  const [submission] = await db.select().from(contestSubmissionsTable)
    .where(and(eq(contestSubmissionsTable.id, Number(submissionId)), eq(contestSubmissionsTable.contestId, id)));
  if (!submission) return res.status(400).json({ error: "Submission not found in this contest" });

  const [updated] = await db.update(contestsTable).set({
    winnerSubmissionId: String(submissionId),
    status: "completed",
    updatedAt: new Date(),
  }).where(eq(contestsTable.id, id)).returning();

  if (!updated) return res.status(404).json({ error: "Contest not found" });
  res.json(updated);
});

/* ── Admin: Upload contest cover image ────────────────────── */
router.post("/admin/contests/upload-image", requireAdmin, upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const url = `/api/uploads/contests/${req.file.filename}`;
  res.json({ url });
});

/* ── Public: List active contests ─────────────────────────── */
router.get("/contests", async (_req, res) => {
  const contests = await db.select().from(contestsTable)
    .where(eq(contestsTable.isActive, true))
    .orderBy(desc(contestsTable.createdAt));

  const enriched = await Promise.all(
    contests.map(async (c) => {
      const [pCount] = await db.select({ count: count() }).from(contestParticipantsTable).where(eq(contestParticipantsTable.contestId, c.id));
      const [sCount] = await db.select({ count: count() }).from(contestSubmissionsTable).where(eq(contestSubmissionsTable.contestId, c.id));

      let winner = null;
      if (c.winnerSubmissionId) {
        const [sub] = await db.select().from(contestSubmissionsTable).where(eq(contestSubmissionsTable.id, Number(c.winnerSubmissionId)));
        if (sub) {
          const [p] = await db.select().from(contestParticipantsTable).where(eq(contestParticipantsTable.id, sub.participantId));
          winner = { ...sub, participantName: p?.name ?? "Unknown" };
        }
      }

      return {
        ...c,
        participantCount: pCount?.count ?? 0,
        submissionCount: sCount?.count ?? 0,
        winner,
      };
    })
  );
  res.json(enriched);
});

/* ── Public: Get single contest ───────────────────────────── */
router.get("/contests/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [contest] = await db.select().from(contestsTable).where(eq(contestsTable.id, id));
  if (!contest || !contest.isActive) return res.status(404).json({ error: "Contest not found" });

  const [pCount] = await db.select({ count: count() }).from(contestParticipantsTable).where(eq(contestParticipantsTable.contestId, id));
  const [sCount] = await db.select({ count: count() }).from(contestSubmissionsTable).where(eq(contestSubmissionsTable.contestId, id));

  const submissions = await db.select().from(contestSubmissionsTable)
    .where(eq(contestSubmissionsTable.contestId, id))
    .orderBy(desc(contestSubmissionsTable.submittedAt));

  const participants = await db.select().from(contestParticipantsTable)
    .where(eq(contestParticipantsTable.contestId, id));

  const submissionsWithNames = submissions.map((s) => {
    const p = participants.find((p) => p.id === s.participantId);
    return { ...s, participantName: p?.name ?? "Unknown" };
  });

  let winner = null;
  if (contest.winnerSubmissionId) {
    const [sub] = await db.select().from(contestSubmissionsTable).where(eq(contestSubmissionsTable.id, Number(contest.winnerSubmissionId)));
    if (sub) {
      const [p] = await db.select().from(contestParticipantsTable).where(eq(contestParticipantsTable.id, sub.participantId));
      winner = { ...sub, participantName: p?.name ?? "Unknown" };
    }
  }

  res.json({
    ...contest,
    participantCount: pCount?.count ?? 0,
    submissionCount: sCount?.count ?? 0,
    submissions: submissionsWithNames,
    winner,
  });
});

/* ── Public: Sign up for contest ──────────────────────────── */
router.post("/contests/:id/signup", async (req, res) => {
  const contestId = Number(req.params.id);
  const { name, email, phone } = req.body;
  if (!name || !email) return res.status(400).json({ error: "Name and email are required" });

  const [contest] = await db.select().from(contestsTable).where(eq(contestsTable.id, contestId));
  if (!contest || !contest.isActive) return res.status(404).json({ error: "Contest not found" });
  if (new Date() > new Date(contest.deadline)) return res.status(400).json({ error: "Contest deadline has passed" });

  const existing = await db.select().from(contestParticipantsTable)
    .where(and(eq(contestParticipantsTable.contestId, contestId), eq(contestParticipantsTable.email, email)));

  if (existing.length > 0) return res.status(400).json({ error: "You have already signed up for this contest", participantId: existing[0].id });

  const [participant] = await db.insert(contestParticipantsTable).values({
    contestId,
    name,
    email,
    phone: phone || null,
    acceptedRules: true,
  }).returning();

  res.status(201).json(participant);
});

/* ── Public: Submit work ──────────────────────────────────── */
router.post("/contests/:id/submit", formLimiter, upload.single("file"), async (req, res) => {
  const contestId = Number(req.params.id);
  const { participantId, email, description } = req.body;
  if (!participantId && !email) return res.status(400).json({ error: "Email or participantId is required" });
  if (!req.file) return res.status(400).json({ error: "File is required" });

  const [contest] = await db.select().from(contestsTable).where(eq(contestsTable.id, contestId));
  if (!contest || !contest.isActive) return res.status(404).json({ error: "Contest not found" });
  if (new Date() > new Date(contest.deadline)) return res.status(400).json({ error: "Contest deadline has passed. Submissions are closed." });

  let participant;
  if (email) {
    const [found] = await db.select().from(contestParticipantsTable)
      .where(and(eq(contestParticipantsTable.email, email), eq(contestParticipantsTable.contestId, contestId)));
    participant = found;
  } else {
    const [found] = await db.select().from(contestParticipantsTable)
      .where(and(eq(contestParticipantsTable.id, Number(participantId)), eq(contestParticipantsTable.contestId, contestId)));
    participant = found;
  }
  if (!participant) return res.status(400).json({ error: "You must sign up before submitting" });

  const existing = await db.select().from(contestSubmissionsTable)
    .where(and(eq(contestSubmissionsTable.contestId, contestId), eq(contestSubmissionsTable.participantId, participant.id)));
  if (existing.length > 0) return res.status(400).json({ error: "You have already submitted for this contest" });

  const fileUrl = `/api/uploads/contests/${req.file.filename}`;

  const [submission] = await db.insert(contestSubmissionsTable).values({
    contestId,
    participantId: participant.id,
    fileUrl,
    fileName: req.file.originalname,
    description: description || null,
  }).returning();

  res.status(201).json(submission);
});

export default router;
