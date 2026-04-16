import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, toolUsersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { requireAdmin } from "../middleware/auth.js";
import { ADMIN_TOOL_USER_ID, ADMIN_TOOL_USER_NAME, ADMIN_TOOL_USER_EMAIL } from "../middleware/toolAuth.js";
import { sendEmail } from "../services/resendMailer.js";
import { applyDefaultPermissions } from "./toolPermissions.js";

const router = Router();

declare module "express-session" {
  interface SessionData {
    toolUserId?: number;
    toolUserEmail?: string;
    toolUserName?: string;
    oauthState?: string;
  }
}

// ── Cloudflare Turnstile verification ────────────────────────────────────────
async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  const secret = process.env.CF_TURNSTILE_SECRET_KEY;
  if (!secret) return true; // not configured → skip
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, response: token, remoteip: ip }),
    });
    const data = await res.json() as { success: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

// ── Email helpers ─────────────────────────────────────────────────────────────
function generate6DigitCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendVerificationEmail(to: string, name: string, code: string): Promise<void> {
  await sendEmail({
    to,
    from: "Advantix Portal <noreply@advantix.digital>",
    subject: `${code} — Your Advantix verification code`,
    html: `
      <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;background:#0a0a0f;color:#fff;border-radius:16px;overflow:hidden">
        <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);padding:32px 40px;text-align:center">
          <div style="display:inline-block;width:56px;height:56px;background:rgba(99,102,241,0.15);border-radius:14px;line-height:56px;font-size:28px;margin-bottom:16px">🔐</div>
          <h1 style="margin:0;font-size:22px;font-weight:800;color:#fff">Verify your email</h1>
          <p style="margin:8px 0 0;color:#94a3b8;font-size:14px">Hi ${name}, enter this code to complete sign-up</p>
        </div>
        <div style="padding:32px 40px;text-align:center">
          <div style="background:#111827;border:2px solid rgba(99,102,241,0.3);border-radius:12px;padding:24px;margin-bottom:24px">
            <div style="font-size:42px;font-weight:800;letter-spacing:12px;color:#818cf8">${code}</div>
            <p style="margin:8px 0 0;color:#64748b;font-size:12px">Expires in 15 minutes</p>
          </div>
          <p style="color:#64748b;font-size:13px;margin:0">If you didn't create an Advantix account, you can safely ignore this email.</p>
        </div>
      </div>
    `,
  });
}

async function sendPasswordResetEmail(to: string, name: string, token: string, origin: string): Promise<void> {
  const resetUrl = `${origin}/reset-password?token=${token}`;
  await sendEmail({
    to,
    from: "Advantix Portal <noreply@advantix.digital>",
    subject: "Reset your Advantix password",
    html: `
      <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;background:#0a0a0f;color:#fff;border-radius:16px;overflow:hidden">
        <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);padding:32px 40px;text-align:center">
          <div style="display:inline-block;width:56px;height:56px;background:rgba(99,102,241,0.15);border-radius:14px;line-height:56px;font-size:28px;margin-bottom:16px">🔑</div>
          <h1 style="margin:0;font-size:22px;font-weight:800;color:#fff">Reset your password</h1>
          <p style="margin:8px 0 0;color:#94a3b8;font-size:14px">Hi ${name}, click the button below</p>
        </div>
        <div style="padding:32px 40px;text-align:center">
          <a href="${resetUrl}" style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700;font-size:15px;margin-bottom:24px">Reset Password</a>
          <p style="color:#64748b;font-size:13px;margin:0">This link expires in 1 hour. If you didn't request a reset, ignore this email.</p>
          <p style="color:#475569;font-size:11px;margin-top:16px;word-break:break-all">${resetUrl}</p>
        </div>
      </div>
    `,
  });
}

// ── Register ──────────────────────────────────────────────────────────────────
router.post("/tools/auth/register", async (req, res) => {
  try {
    const { name, email, password, turnstileToken } = req.body;
    if (!name || !email || !password) {
      res.status(400).json({ error: "name, email, and password are required" });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: "Password must be at least 6 characters" });
      return;
    }

    // Cloudflare Turnstile
    if (turnstileToken !== undefined) {
      const ip = (req.headers["cf-connecting-ip"] as string) || req.ip || "";
      const valid = await verifyTurnstile(turnstileToken, ip);
      if (!valid) { res.status(400).json({ error: "Bot check failed. Please try again." }); return; }
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
      .values({
        name: name.trim(),
        email: email.toLowerCase().trim(),
        passwordHash,
        emailVerified: true,
      })
      .returning({ id: toolUsersTable.id, name: toolUsersTable.name, email: toolUsersTable.email });

    // Apply default tool permissions (non-blocking)
    applyDefaultPermissions(user.id).catch(() => {});

    // Auto-subscribe to blog
    db.execute(sql`
      INSERT INTO email_subscribers (email, name, source, active)
      VALUES (${user.email}, ${user.name}, 'blog', true)
      ON CONFLICT (email) DO NOTHING
    `).catch(() => {});

    // Log in immediately — no email verification step
    req.session.toolUserId = user.id;
    req.session.toolUserEmail = user.email;
    req.session.toolUserName = user.name;

    req.session.save((err) => {
      if (err) {
        console.error("[register] session save error:", err);
        res.status(500).json({ error: "Registration failed" });
        return;
      }
      res.json({ user: { id: user.id, name: user.name, email: user.email } });
    });
  } catch (err) {
    console.error("[register]", err);
    res.status(500).json({ error: "Registration failed" });
  }
});

// ── Verify email code ─────────────────────────────────────────────────────────
router.post("/tools/auth/verify-email", async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) { res.status(400).json({ error: "email and code are required" }); return; }

    const [user] = await db
      .select()
      .from(toolUsersTable)
      .where(eq(toolUsersTable.email, (email as string).toLowerCase().trim()))
      .limit(1);

    if (!user) { res.status(404).json({ error: "Account not found" }); return; }

    if (user.emailVerified) {
      // Already verified — just log them in
      req.session.toolUserId = user.id;
      req.session.toolUserEmail = user.email;
      req.session.toolUserName = user.name;
      req.session.save((err) => {
        if (err) { res.status(500).json({ error: "Login failed" }); return; }
        res.json({ user: { id: user.id, name: user.name, email: user.email } });
      });
      return;
    }

    if (!user.verificationCode || user.verificationCode !== code.trim()) {
      res.status(400).json({ error: "Invalid verification code" });
      return;
    }

    if (user.verificationExpires && new Date(user.verificationExpires) < new Date()) {
      res.status(400).json({ error: "Verification code has expired. Please request a new one." });
      return;
    }

    // Mark as verified
    await db.execute(sql`
      UPDATE tool_users SET email_verified = true, verification_code = null, verification_expires = null
      WHERE id = ${user.id}
    `);

    req.session.toolUserId = user.id;
    req.session.toolUserEmail = user.email;
    req.session.toolUserName = user.name;

    req.session.save((err) => {
      if (err) { res.status(500).json({ error: "Verification failed" }); return; }
      res.json({ user: { id: user.id, name: user.name, email: user.email } });
    });
  } catch {
    res.status(500).json({ error: "Verification failed" });
  }
});

// ── Resend verification code ──────────────────────────────────────────────────
router.post("/tools/auth/resend-code", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) { res.status(400).json({ error: "email is required" }); return; }

    const [user] = await db
      .select()
      .from(toolUsersTable)
      .where(eq(toolUsersTable.email, (email as string).toLowerCase().trim()))
      .limit(1);

    if (!user) { res.status(404).json({ error: "Account not found" }); return; }

    const code = generate6DigitCode();
    const codeExpires = new Date(Date.now() + 15 * 60 * 1000);

    await db.execute(sql`
      UPDATE tool_users SET verification_code = ${code}, verification_expires = ${codeExpires}
      WHERE id = ${user.id}
    `);

    sendVerificationEmail(user.email, user.name, code).catch(() => {});
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Could not resend code" });
  }
});

// ── Login ─────────────────────────────────────────────────────────────────────
router.post("/tools/auth/login", async (req, res) => {
  try {
    const { email, password, turnstileToken } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: "email and password are required" });
      return;
    }

    if (turnstileToken !== undefined) {
      const ip = (req.headers["cf-connecting-ip"] as string) || req.ip || "";
      const valid = await verifyTurnstile(turnstileToken, ip);
      if (!valid) { res.status(400).json({ error: "Bot check failed. Please try again." }); return; }
    }

    const [user] = await db
      .select()
      .from(toolUsersTable)
      .where(eq(toolUsersTable.email, (email as string).toLowerCase().trim()))
      .limit(1);

    if (!user || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    req.session.toolUserId = user.id;
    req.session.toolUserEmail = user.email;
    req.session.toolUserName = user.name;

    req.session.save((err) => {
      if (err) {
        console.error("[login] session save error:", err);
        res.status(500).json({ error: "Login failed" });
        return;
      }
      res.json({ user: { id: user.id, name: user.name, email: user.email } });
    });
  } catch {
    res.status(500).json({ error: "Login failed" });
  }
});

// ── Me ────────────────────────────────────────────────────────────────────────
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
    // Use the same @advantix.local email format as auto-login so the website's
    // ToolsUserContext always detects admin correctly via the email pattern.
    const adminEmail = `admin-${adminSession.adminId}@advantix.local`;
    const adminName = adminSession.username ?? ADMIN_TOOL_USER_NAME;
    req.session.toolUserId = ADMIN_TOOL_USER_ID;
    req.session.toolUserName = adminName;
    req.session.toolUserEmail = adminEmail;
    res.json({
      user: {
        id: ADMIN_TOOL_USER_ID,
        name: adminName,
        email: adminEmail,
        isAdmin: true,
      },
    });
    return;
  }
  res.status(401).json({ error: "Not authenticated" });
});

// ── Forgot password ───────────────────────────────────────────────────────────
router.post("/tools/auth/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) { res.status(400).json({ error: "email is required" }); return; }

    const [user] = await db
      .select()
      .from(toolUsersTable)
      .where(eq(toolUsersTable.email, (email as string).toLowerCase().trim()))
      .limit(1);

    // Always respond OK to prevent email enumeration
    if (!user) { res.json({ ok: true }); return; }

    const token = randomBytes(32).toString("hex");
    const tokenExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await db.execute(sql`
      UPDATE tool_users SET reset_token = ${token}, reset_token_expires = ${tokenExpires}
      WHERE id = ${user.id}
    `);

    const origin = `${req.protocol}://${req.get("host")}`;
    sendPasswordResetEmail(user.email, user.name, token, origin).catch(() => {});

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Could not process request" });
  }
});

// ── Reset password ────────────────────────────────────────────────────────────
router.post("/tools/auth/reset-password", async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) { res.status(400).json({ error: "token and password are required" }); return; }
    if ((password as string).length < 6) { res.status(400).json({ error: "Password must be at least 6 characters" }); return; }

    const [user] = await db
      .select()
      .from(toolUsersTable)
      .where(eq(toolUsersTable.resetToken, token))
      .limit(1);

    if (!user) { res.status(400).json({ error: "Invalid or expired reset link" }); return; }

    if (!user.resetTokenExpires || new Date(user.resetTokenExpires) < new Date()) {
      res.status(400).json({ error: "Reset link has expired. Please request a new one." });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await db.execute(sql`
      UPDATE tool_users
      SET password_hash = ${passwordHash}, reset_token = null, reset_token_expires = null, email_verified = true
      WHERE id = ${user.id}
    `);

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Password reset failed" });
  }
});

// ── Auth config (public) ──────────────────────────────────────────────────────
router.get("/tools/auth/config", (_req, res) => {
  res.json({
    googleEnabled: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    turnstileEnabled: !!process.env.CF_TURNSTILE_SECRET_KEY,
  });
});

// ── Google OAuth — start ──────────────────────────────────────────────────────
router.get("/tools/auth/google", (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    res.status(501).json({ error: "Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET." });
    return;
  }

  const state = randomBytes(16).toString("hex");
  req.session.oauthState = state;

  const redirectUri = `${req.protocol}://${req.get("host")}/api/tools/auth/google/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "offline",
    prompt: "select_account",
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

// ── Google OAuth — callback ───────────────────────────────────────────────────
router.get("/tools/auth/google/callback", async (req, res) => {
  const frontendBase = process.env.SITE_URL || `${req.protocol}://${req.get("host")}`;

  try {
    const { code, state, error: oauthError } = req.query as Record<string, string>;

    if (oauthError) {
      res.redirect(`${frontendBase}/login?error=google_denied`);
      return;
    }

    if (!state || state !== req.session.oauthState) {
      res.redirect(`${frontendBase}/login?error=invalid_state`);
      return;
    }
    req.session.oauthState = undefined;

    const clientId = process.env.GOOGLE_CLIENT_ID!;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
    const redirectUri = `${req.protocol}://${req.get("host")}/api/tools/auth/google/callback`;

    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json() as { access_token?: string; error?: string };
    if (!tokenData.access_token) {
      res.redirect(`${frontendBase}/login?error=google_token_failed`);
      return;
    }

    // Get user info
    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const googleUser = await userInfoRes.json() as {
      sub: string; email: string; name: string; picture?: string;
    };

    if (!googleUser.email) {
      res.redirect(`${frontendBase}/login?error=google_no_email`);
      return;
    }

    // Find or create user
    let [user] = await db
      .select()
      .from(toolUsersTable)
      .where(eq(toolUsersTable.email, googleUser.email.toLowerCase()))
      .limit(1);

    if (user) {
      if (!user.googleId) {
        await db.execute(sql`
          UPDATE tool_users SET google_id = ${googleUser.sub}, email_verified = true
          WHERE id = ${user.id}
        `);
      }
    } else {
      // Create new user
      [user] = await db
        .insert(toolUsersTable)
        .values({
          name: googleUser.name,
          email: googleUser.email.toLowerCase(),
          passwordHash: null,
          googleId: googleUser.sub,
          emailVerified: true,
        })
        .returning();

      // Apply default tool permissions (non-blocking)
      applyDefaultPermissions(user.id).catch(() => {});

      // Auto-subscribe
      db.execute(sql`
        INSERT INTO email_subscribers (email, name, source, active)
        VALUES (${user.email}, ${user.name}, 'blog', true)
        ON CONFLICT (email) DO NOTHING
      `).catch(() => {});
    }

    req.session.toolUserId = user.id;
    req.session.toolUserEmail = user.email;
    req.session.toolUserName = user.name;

    req.session.save((saveErr) => {
      if (saveErr) console.error("[google/callback] session save error:", saveErr);
      res.redirect(`${frontendBase}/tools/dashboard`);
    });
  } catch (err) {
    console.error("[google/callback]", err);
    res.redirect(`${frontendBase}/login?error=google_failed`);
  }
});

// ── Profile ───────────────────────────────────────────────────────────────────
router.get("/tools/auth/profile", async (req, res) => {
  if (!req.session.toolUserId) { res.status(401).json({ error: "Not authenticated" }); return; }
  try {
    const [user] = await db.select().from(toolUsersTable).where(eq(toolUsersTable.id, req.session.toolUserId)).limit(1);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      companyName: user.companyName ?? null,
      phone: user.phone ?? null,
      website: user.website ?? null,
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

    if (!user.passwordHash) { res.status(400).json({ error: "Account uses Google sign-in. Set a password via forgot password." }); return; }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) { res.status(400).json({ error: "Current password is incorrect" }); return; }

    const newHash = await bcrypt.hash(newPassword, 12);
    await db.execute(sql`UPDATE tool_users SET password_hash = ${newHash} WHERE id = ${user.id}`);

    res.json({ ok: true });
  } catch { res.status(500).json({ error: "Password change failed" }); }
});

router.post("/tools/auth/logout", (req, res) => {
  req.session.toolUserId = undefined;
  req.session.toolUserEmail = undefined;
  req.session.toolUserName = undefined;
  res.json({ ok: true });
});

/* POST /api/admin/tools/auto-login */
router.post("/admin/tools/auto-login", requireAdmin, async (req, res) => {
  try {
    const adminSession = req.session as { adminId?: number; username?: string };
    const adminEmail = `admin-${adminSession.adminId ?? 0}@advantix.local`;
    const adminName = adminSession.username ?? "Admin";

    let [user] = await db.select().from(toolUsersTable).where(eq(toolUsersTable.email, adminEmail)).limit(1);

    if (!user) {
      const passwordHash = await bcrypt.hash(Math.random().toString(36), 10);
      [user] = await db.insert(toolUsersTable)
        .values({ name: adminName, email: adminEmail, passwordHash, emailVerified: true })
        .returning();
    }

    req.session.toolUserId = user.id;
    req.session.toolUserEmail = user.email;
    req.session.toolUserName = user.name;

    // MUST await session.save() before responding — the new tab opens
    // immediately after this response, and the session must already be
    // committed to PostgreSQL or the next /api/tools/auth/me will miss it.
    req.session.save((err) => {
      if (err) { res.status(500).json({ error: "Session save failed" }); return; }
      res.json({ ok: true });
    });
  } catch {
    res.status(500).json({ error: "Auto-login failed" });
  }
});

export default router;
