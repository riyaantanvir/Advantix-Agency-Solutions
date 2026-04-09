import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, toolUsersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAdmin } from "../middleware/auth.js";
import { ADMIN_TOOL_USER_ID, ADMIN_TOOL_USER_NAME, ADMIN_TOOL_USER_EMAIL } from "../middleware/toolAuth.js";

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

    // Auto-subscribe new tool user to blog notifications (fire-and-forget)
    db.execute(sql`
      INSERT INTO email_subscribers (email, name, source, active)
      VALUES (${user.email}, ${user.name}, 'blog', true)
      ON CONFLICT (email) DO NOTHING
    `).catch(() => {});

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
  if (req.session.toolUserId) {
    res.json({
      user: {
        id: req.session.toolUserId,
        name: req.session.toolUserName,
        email: req.session.toolUserEmail,
        isAdmin: !!(req.session as any).adminId,
      },
    });
    return;
  }
  const adminSession = req.session as { adminId?: number; username?: string };
  if (adminSession.adminId) {
    req.session.toolUserId = ADMIN_TOOL_USER_ID;
    req.session.toolUserName = ADMIN_TOOL_USER_NAME;
    req.session.toolUserEmail = ADMIN_TOOL_USER_EMAIL;
    res.json({
      user: {
        id: ADMIN_TOOL_USER_ID,
        name: adminSession.username ?? ADMIN_TOOL_USER_NAME,
        email: ADMIN_TOOL_USER_EMAIL,
        isAdmin: true,
      },
    });
    return;
  }
  res.status(401).json({ error: "Not authenticated" });
});

router.get("/tools/auth/profile", async (req, res) => {
  if (!req.session.toolUserId) { res.status(401).json({ error: "Not authenticated" }); return; }
  try {
    const [user] = await db.select().from(toolUsersTable).where(eq(toolUsersTable.id, req.session.toolUserId)).limit(1);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      companyName: (user as any).company_name ?? null,
      phone: (user as any).phone ?? null,
      website: (user as any).website ?? null,
    });
  } catch { res.status(500).json({ error: "Server error" }); }
});

router.patch("/tools/auth/profile", async (req, res) => {
  if (!req.session.toolUserId) { res.status(401).json({ error: "Not authenticated" }); return; }
  try {
    const { name, companyName, phone, website } = req.body as {
      name?: string; companyName?: string; phone?: string; website?: string;
    };
    if (!name?.trim()) { res.status(400).json({ error: "Name is required" }); return; }

    await db.execute(sql`
      UPDATE tool_users
      SET name = ${name.trim()},
          company_name = ${companyName?.trim() || null},
          phone = ${phone?.trim() || null},
          website = ${website?.trim() || null}
      WHERE id = ${req.session.toolUserId}
    `);

    req.session.toolUserName = name.trim();
    res.json({ ok: true, name: name.trim() });
  } catch { res.status(500).json({ error: "Update failed" }); }
});

router.post("/tools/auth/change-password", async (req, res) => {
  if (!req.session.toolUserId) { res.status(401).json({ error: "Not authenticated" }); return; }
  try {
    const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
    if (!currentPassword || !newPassword) { res.status(400).json({ error: "Both passwords are required" }); return; }
    if (newPassword.length < 6) { res.status(400).json({ error: "New password must be at least 6 characters" }); return; }

    const [user] = await db.select().from(toolUsersTable).where(eq(toolUsersTable.id, req.session.toolUserId)).limit(1);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) { res.status(400).json({ error: "Current password is incorrect" }); return; }

    const newHash = await bcrypt.hash(newPassword, 12);
    await db.update(toolUsersTable).set({ passwordHash: newHash }).where(eq(toolUsersTable.id, user.id));

    res.json({ ok: true });
  } catch { res.status(500).json({ error: "Password change failed" }); }
});

router.post("/tools/auth/logout", (req, res) => {
  req.session.toolUserId = undefined;
  req.session.toolUserEmail = undefined;
  req.session.toolUserName = undefined;
  res.json({ ok: true });
});

/* POST /api/admin/tools/auto-login
   Called from admin panel to silently authenticate as a tool user.
   Finds or creates a special admin tool account, then sets the tool session. */
router.post("/admin/tools/auto-login", requireAdmin, async (req, res) => {
  try {
    const adminSession = req.session as { adminId?: number; username?: string };
    const adminEmail = `admin-${adminSession.adminId ?? 0}@advantix.local`;
    const adminName = adminSession.username ?? "Admin";

    let [user] = await db
      .select()
      .from(toolUsersTable)
      .where(eq(toolUsersTable.email, adminEmail))
      .limit(1);

    if (!user) {
      const passwordHash = await bcrypt.hash(Math.random().toString(36), 10);
      [user] = await db
        .insert(toolUsersTable)
        .values({ name: adminName, email: adminEmail, passwordHash })
        .returning();
    }

    req.session.toolUserId = user.id;
    req.session.toolUserEmail = user.email;
    req.session.toolUserName = user.name;

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Auto-login failed" });
  }
});

export default router;
