import { Router, type IRouter } from "express";
import { db, teamMembersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../middleware/auth.js";

const router: IRouter = Router();

router.get("/team", async (_req, res) => {
  const members = await db.select().from(teamMembersTable).orderBy(teamMembersTable.id);
  res.json(members);
});

router.post("/team", requireAdmin, async (req, res) => {
  const { name, role, bio, photoUrl, email, linkedinUrl } = req.body as {
    name?: string;
    role?: string;
    bio?: string;
    photoUrl?: string;
    email?: string;
    linkedinUrl?: string;
  };

  if (!name || !role) {
    res.status(400).json({ error: "Name and role are required" });
    return;
  }

  const [member] = await db
    .insert(teamMembersTable)
    .values({
      name,
      role,
      bio: bio ?? null,
      photoUrl: photoUrl ?? null,
      email: email ?? null,
      linkedinUrl: linkedinUrl ?? null,
    })
    .returning();

  res.status(201).json(member);
});

router.put("/team/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id ?? "0", 10);
  const { name, role, bio, photoUrl, email, linkedinUrl } = req.body as {
    name?: string;
    role?: string;
    bio?: string;
    photoUrl?: string;
    email?: string;
    linkedinUrl?: string;
  };

  if (!name || !role) {
    res.status(400).json({ error: "Name and role are required" });
    return;
  }

  const [updated] = await db
    .update(teamMembersTable)
    .set({
      name,
      role,
      bio: bio ?? null,
      photoUrl: photoUrl ?? null,
      email: email ?? null,
      linkedinUrl: linkedinUrl ?? null,
    })
    .where(eq(teamMembersTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Team member not found" });
    return;
  }

  res.json(updated);
});

router.delete("/team/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id ?? "0", 10);
  await db.delete(teamMembersTable).where(eq(teamMembersTable.id, id));
  res.json({ message: "Deleted" });
});

export default router;
