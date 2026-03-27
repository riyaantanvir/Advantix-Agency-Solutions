import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, toolUsersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

declare module "express-session" {
  interface SessionData {
    toolUserId?: number;
    toolUserEmail?: string;
    toolUserName?: string;
  }
}

router.post("/tools/auth/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      res.status(400).json({ error: "name, email, and password are required" });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: "Password must be at least 6 characters" });
      return;
    }

    const [existing] = await db
      .select({ id: toolUsersTable.id })
      .from(toolUsersTable)
      .where(eq(toolUsersTable.email, email.toLowerCase().trim()))
      .limit(1);

    if (existing) {
      res.status(409).json({ error: "An account with this email already exists" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const [user] = await db
      .insert(toolUsersTable)
      .values({ name: name.trim(), email: email.toLowerCase().trim(), passwordHash })
      .returning({ id: toolUsersTable.id, name: toolUsersTable.name, email: toolUsersTable.email });

    req.session.toolUserId = user.id;
    req.session.toolUserEmail = user.email;
    req.session.toolUserName = user.name;

    res.json({ user: { id: user.id, name: user.name, email: user.email } });
  } catch (err) {
    res.status(500).json({ error: "Registration failed" });
  }
});

router.post("/tools/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: "email and password are required" });
      return;
    }

    const [user] = await db
      .select()
      .from(toolUsersTable)
      .where(eq(toolUsersTable.email, email.toLowerCase().trim()))
      .limit(1);

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    req.session.toolUserId = user.id;
    req.session.toolUserEmail = user.email;
    req.session.toolUserName = user.name;

    res.json({ user: { id: user.id, name: user.name, email: user.email } });
  } catch (err) {
    res.status(500).json({ error: "Login failed" });
  }
});

router.get("/tools/auth/me", (req, res) => {
  if (!req.session.toolUserId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  res.json({
    user: {
      id: req.session.toolUserId,
      name: req.session.toolUserName,
      email: req.session.toolUserEmail,
    },
  });
});

router.post("/tools/auth/logout", (req, res) => {
  req.session.toolUserId = undefined;
  req.session.toolUserEmail = undefined;
  req.session.toolUserName = undefined;
  res.json({ ok: true });
});

export default router;
