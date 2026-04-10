import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, adminsTable, toolUsersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin, requireSuperAdmin } from "../middleware/auth.js";

const router = Router();

router.get("/admin/users", requireAdmin, async (_req, res) => {
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

router.post("/admin/users", requireAdmin, async (req, res) => {
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

router.delete("/admin/users/:id", requireAdmin, async (req, res) => {
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

router.get("/admin/admins", requireAdmin, async (_req, res) => {
  try {
    const admins = await db
      .select({ id: adminsTable.id, username: adminsTable.username, isSuperAdmin: adminsTable.isSuperAdmin, createdAt: adminsTable.createdAt })
      .from(adminsTable)
      .orderBy(adminsTable.createdAt);
    res.json(admins);
  } catch {
    res.status(500).json({ error: "Failed to fetch admins" });
  }
});

router.post("/admin/admins", requireSuperAdmin, async (req, res) => {
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
      .values({ username: username.trim(), passwordHash, isSuperAdmin: false })
      .returning({ id: adminsTable.id, username: adminsTable.username, isSuperAdmin: adminsTable.isSuperAdmin, createdAt: adminsTable.createdAt });

    res.status(201).json(admin);
  } catch {
    res.status(500).json({ error: "Failed to create admin" });
  }
});

router.patch("/admin/admins/:id/super-admin", requireSuperAdmin, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid admin id" });
      return;
    }

    const session = req.session as { adminId?: number };
    if (session.adminId === id) {
      res.status(400).json({ error: "Cannot change your own super admin status" });
      return;
    }

    const { isSuperAdmin } = req.body as { isSuperAdmin?: boolean };
    if (typeof isSuperAdmin !== "boolean") {
      res.status(400).json({ error: "isSuperAdmin (boolean) is required" });
      return;
    }

    const [updated] = await db
      .update(adminsTable)
      .set({ isSuperAdmin })
      .where(eq(adminsTable.id, id))
      .returning({ id: adminsTable.id, username: adminsTable.username, isSuperAdmin: adminsTable.isSuperAdmin, createdAt: adminsTable.createdAt });

    if (!updated) {
      res.status(404).json({ error: "Admin not found" });
      return;
    }

    res.json(updated);
  } catch {
    res.status(500).json({ error: "Failed to update super admin status" });
  }
});

router.delete("/admin/admins/:id", requireSuperAdmin, async (req, res) => {
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
