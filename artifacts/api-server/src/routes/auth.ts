import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { adminsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.post("/auth/login", async (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };

  if (!username || !password) {
    res.status(400).json({ error: "Username and password are required" });
    return;
  }

  const [admin] = await db.select().from(adminsTable).where(eq(adminsTable.username, username)).limit(1);

  if (!admin) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(password, admin.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const session = req.session as { adminId?: number; username?: string };
  session.adminId = admin.id;
  session.username = admin.username;

  res.json({ success: true, username: admin.username });
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

router.get("/auth/me", (req, res) => {
  const session = req.session as { adminId?: number; username?: string };
  if (session.adminId) {
    res.json({ authenticated: true, username: session.username });
  } else {
    res.status(401).json({ error: "Not authenticated" });
  }
});

export default router;
