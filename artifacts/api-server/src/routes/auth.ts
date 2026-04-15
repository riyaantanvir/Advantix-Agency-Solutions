import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { adminsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { loginLimiter } from "../lib/rateLimiter.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

router.post("/auth/login", loginLimiter, async (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };

  if (!username || !password) {
    res.status(400).json({ error: "Username and password are required" });
    return;
  }

  const [admin] = await db.select().from(adminsTable).where(eq(adminsTable.username, username)).limit(1);

  if (!admin) {
    logger.warn({ username }, "[auth] Login failed: unknown username");
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(password, admin.passwordHash);
  if (!valid) {
    logger.warn({ username }, "[auth] Login failed: wrong password");
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const session = req.session as { adminId?: number; username?: string; isSuperAdmin?: boolean };
  session.adminId = admin.id;
  session.username = admin.username;
  session.isSuperAdmin = admin.isSuperAdmin;

  req.session.save((err) => {
    if (err) {
      console.error("[admin/login] session save error:", err);
      res.status(500).json({ error: "Login failed" });
      return;
    }
    res.json({ success: true, username: admin.username, isSuperAdmin: admin.isSuperAdmin });
  });
});

router.post("/auth/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      res.status(500).json({ error: "Could not log out" });
      return;
    }
    res.json({ message: "Logged out successfully" });
  });
});

router.get("/auth/me", async (req, res) => {
  const session = req.session as { adminId?: number; username?: string; isSuperAdmin?: boolean };
  if (!session.adminId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  // Always fetch fresh isSuperAdmin from DB so promotions take effect without re-login.
  const [admin] = await db
    .select({ username: adminsTable.username, isSuperAdmin: adminsTable.isSuperAdmin })
    .from(adminsTable)
    .where(eq(adminsTable.id, session.adminId))
    .limit(1);

  if (!admin) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  // Keep session in sync so requireSuperAdmin middleware reflects the promotion immediately.
  if (session.isSuperAdmin !== admin.isSuperAdmin) {
    session.isSuperAdmin = admin.isSuperAdmin;
    req.session.save(() => {});
  }

  res.json({ authenticated: true, username: admin.username, isSuperAdmin: admin.isSuperAdmin });
});

export default router;
