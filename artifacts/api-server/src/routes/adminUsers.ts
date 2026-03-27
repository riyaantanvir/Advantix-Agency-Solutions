import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, adminsTable, toolUsersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../middleware/auth.js";

const router = Router();

router.use(requireAdmin);

router.get("/admin/users", async (req, res) => {
  try {
    const users = await db
      .select({ id: toolUsersTable.id, name: toolUsersTable.name, email: toolUsersTable.email, createdAt: toolUsersTable.createdAt })
      .from(toolUsersTable)
      .orderBy(toolUsersTable.createdAt);
    res.json(users);
  } catch {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

router.post("/admin/users", async (req, res) => {
  try {
    const { name, email, password } = req.body as { name?: string; email?: string; password?: string };
    if (!name || !email || !password) {
      res.status(400).json({ error: "name, email, and password are required" });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: "Password must be at least 6 characters" });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const [existing] = await db
      .select({ id: toolUsersTable.id })
      .from(toolUsersTable)
      .where(eq(toolUsersTable.email, normalizedEmail))
      .limit(1);

    if (existing) {
      res.status(409).json({ error: "An account with this email already exists" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const [user] = await db
      .insert(toolUsersTable)
      .values({ name: name.trim(), email: normalizedEmail, passwordHash })
      .returning({ id: toolUsersTable.id, name: toolUsersTable.name, email: toolUsersTable.email, createdAt: toolUsersTable.createdAt });

    res.status(201).json(user);
  } catch {
    res.status(500).json({ error: "Failed to create user" });
  }
});

router.delete("/admin/users/:id", async (req, res) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid user id" });
      return;
    }
    await db.delete(toolUsersTable).where(eq(toolUsersTable.id, id));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to delete user" });
  }
});

router.get("/admin/admins", async (req, res) => {
  try {
    const admins = await db
      .select({ id: adminsTable.id, username: adminsTable.username, createdAt: adminsTable.createdAt })
      .from(adminsTable)
      .orderBy(adminsTable.createdAt);
    res.json(admins);
  } catch {
    res.status(500).json({ error: "Failed to fetch admins" });
  }
});

router.post("/admin/admins", async (req, res) => {
  try {
    const { username, password } = req.body as { username?: string; password?: string };
    if (!username || !password) {
      res.status(400).json({ error: "username and password are required" });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: "Password must be at least 6 characters" });
      return;
    }

    const [existing] = await db
      .select({ id: adminsTable.id })
      .from(adminsTable)
      .where(eq(adminsTable.username, username.trim()))
      .limit(1);

    if (existing) {
      res.status(409).json({ error: "An admin with this username already exists" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const [admin] = await db
      .insert(adminsTable)
      .values({ username: username.trim(), passwordHash })
      .returning({ id: adminsTable.id, username: adminsTable.username, createdAt: adminsTable.createdAt });

    res.status(201).json(admin);
  } catch {
    res.status(500).json({ error: "Failed to create admin" });
  }
});

router.delete("/admin/admins/:id", async (req, res) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid admin id" });
      return;
    }

    const session = req.session as { adminId?: number };
    if (session.adminId === id) {
      res.status(400).json({ error: "Cannot delete your own account" });
      return;
    }

    await db.delete(adminsTable).where(eq(adminsTable.id, id));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to delete admin" });
  }
});

export default router;
