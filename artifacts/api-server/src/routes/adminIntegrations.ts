import { Router, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { integrationsTable } from "@workspace/db/schema";
import { requireSuperAdmin } from "../middleware/auth.js";

const router = Router();

function maskValue(value: string): string {
  if (!value || value.length <= 8) return "••••••••";
  return "••••••••" + value.slice(-4);
}

router.get("/admin/integrations", requireSuperAdmin, async (req: Request, res: Response) => {
  const rows = await db.select().from(integrationsTable).orderBy(integrationsTable.category, integrationsTable.label);
  res.json(rows.map(r => ({ ...r, value: maskValue(r.value), hasValue: !!r.value })));
});

router.post("/admin/integrations", requireSuperAdmin, async (req: Request, res: Response) => {
  const { name, label, value, description, category } = req.body as {
    name: string; label: string; value: string; description?: string; category: string;
  };
  if (!name?.trim() || !label?.trim()) {
    res.status(400).json({ error: "Name and label are required" });
    return;
  }
  const [row] = await db.insert(integrationsTable)
    .values({ name: name.trim().toUpperCase().replace(/\s+/g, "_"), label: label.trim(), value: value ?? "", description, category })
    .returning();
  res.json({ ...row, value: maskValue(row.value), hasValue: !!row.value });
});

router.put("/admin/integrations/:id", requireSuperAdmin, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const { label, value, description, category } = req.body as {
    label?: string; value?: string; description?: string; category?: string;
  };
  const updates: Partial<typeof integrationsTable.$inferInsert> = { updatedAt: new Date() };
  if (label !== undefined) updates.label = label;
  if (value !== undefined && value !== "") updates.value = value;
  if (description !== undefined) updates.description = description;
  if (category !== undefined) updates.category = category;

  const [row] = await db.update(integrationsTable).set(updates).where(eq(integrationsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...row, value: maskValue(row.value), hasValue: !!row.value });
});

router.delete("/admin/integrations/:id", requireSuperAdmin, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  await db.delete(integrationsTable).where(eq(integrationsTable.id, id));
  res.json({ success: true });
});

async function testIntegrationKey(name: string, key: string): Promise<{ ok: boolean; message: string }> {
  if (!key) return { ok: false, message: "No key stored" };
  try {
    if (name.includes("OPENAI") || name.includes("GPT")) {
      const r = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${key}` },
      });
      return r.ok
        ? { ok: true, message: "Connected — OpenAI responded successfully" }
        : { ok: false, message: `OpenAI returned ${r.status}: ${r.statusText}` };
    }
    if (name.includes("ANTHROPIC") || name.includes("CLAUDE")) {
      const r = await fetch("https://api.anthropic.com/v1/models", {
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
      });
      return r.ok
        ? { ok: true, message: "Connected — Anthropic responded successfully" }
        : { ok: false, message: `Anthropic returned ${r.status}: ${r.statusText}` };
    }
    if (name.includes("GEMINI") || name.includes("GOOGLE")) {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
      return r.ok
        ? { ok: true, message: "Connected — Gemini responded successfully" }
        : { ok: false, message: `Gemini returned ${r.status}: ${r.statusText}` };
    }
    if (name.includes("GROK") || name.includes("XAI")) {
      const r = await fetch("https://api.x.ai/v1/models", {
        headers: { Authorization: `Bearer ${key}` },
      });
      return r.ok
        ? { ok: true, message: "Connected — Grok/xAI responded successfully" }
        : { ok: false, message: `Grok returned ${r.status}: ${r.statusText}` };
    }
    if (name.includes("STRIPE")) {
      const r = await fetch("https://api.stripe.com/v1/balance", {
        headers: { Authorization: `Basic ${Buffer.from(key + ":").toString("base64")}` },
      });
      return r.ok
        ? { ok: true, message: "Connected — Stripe key is valid" }
        : { ok: false, message: `Stripe returned ${r.status}: ${r.statusText}` };
    }
    if (name.includes("SENDGRID")) {
      const r = await fetch("https://api.sendgrid.com/v3/user/profile", {
        headers: { Authorization: `Bearer ${key}` },
      });
      return r.ok
        ? { ok: true, message: "Connected — SendGrid key is valid" }
        : { ok: false, message: `SendGrid returned ${r.status}: ${r.statusText}` };
    }
    if (name === "RESEND_WEBHOOK_SECRET" || name.includes("WEBHOOK_SECRET")) {
      if (key.startsWith("whsec_")) {
        return { ok: true, message: "Webhook secret format is valid (whsec_ prefix detected)" };
      }
      return key.length > 10
        ? { ok: true, message: "Webhook secret saved — will be used to verify incoming webhooks" }
        : { ok: false, message: "Secret looks too short — check the value from Resend → Webhooks" };
    }
    if (name.includes("RESEND")) {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "test@resend.dev",
          to: ["delivered@resend.dev"],
          subject: "Advantix Connection Test",
          html: "<p>Test</p>",
        }),
      });
      if (r.ok) {
        return { ok: true, message: "Connected — Resend key is valid and email delivery works" };
      }
      const body = await r.json().catch(() => null);
      const msg = body?.message || r.statusText;
      if (r.status === 401 || r.status === 403) {
        return { ok: false, message: `Resend authentication failed: ${msg}` };
      }
      return { ok: false, message: `Resend returned ${r.status}: ${msg}` };
    }
    if (name.includes("OPENROUTER")) {
      const r = await fetch("https://openrouter.ai/api/v1/models", {
        headers: { Authorization: `Bearer ${key}`, "HTTP-Referer": "https://advantix.digital" },
      });
      return r.ok
        ? { ok: true, message: "Connected — OpenRouter key is valid" }
        : { ok: false, message: `OpenRouter returned ${r.status}: ${r.statusText}` };
    }
    if (name.includes("SLACK") && key.startsWith("https://")) {
      const r = await fetch(key, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "🔌 Advantix integration test ping" }),
      });
      return r.ok
        ? { ok: true, message: "Connected — Slack webhook delivered" }
        : { ok: false, message: `Slack webhook returned ${r.status}` };
    }
    return { ok: false, message: "No test available for this integration type" };
  } catch (err: any) {
    return { ok: false, message: `Connection error: ${err?.message ?? "Unknown error"}` };
  }
}

router.post("/admin/integrations/:id/test", requireSuperAdmin, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const [row] = await db.select().from(integrationsTable).where(eq(integrationsTable.id, id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  const result = await testIntegrationKey(row.name, row.value);
  res.json(result);
});

/* ── Assistant AI provider/model settings ──────────────────────────────── */

async function upsertSetting(name: string, value: string, label: string) {
  const existing = await db.select().from(integrationsTable).where(eq(integrationsTable.name, name));
  if (existing.length > 0) {
    await db.update(integrationsTable).set({ value, updatedAt: new Date() }).where(eq(integrationsTable.name, name));
  } else {
    await db.insert(integrationsTable).values({ name, label, value, category: "AI", description: `Advantix Assistant setting: ${label}` });
  }
}

router.get("/admin/settings/assistant-ai", requireSuperAdmin, async (_req: Request, res: Response) => {
  const rows = await db.select().from(integrationsTable)
    .where(eq(integrationsTable.category, "AI"));
  const byName = Object.fromEntries(rows.map(r => [r.name, r.value]));
  res.json({
    provider: byName["ASSISTANT_PROVIDER"] || "anthropic",
    model: byName["ASSISTANT_MODEL"] || "",
  });
});

router.post("/admin/settings/assistant-ai", requireSuperAdmin, async (req: Request, res: Response) => {
  const { provider, model } = req.body as { provider?: string; model?: string };
  if (provider) await upsertSetting("ASSISTANT_PROVIDER", provider, "Assistant AI Provider");
  if (model !== undefined) await upsertSetting("ASSISTANT_MODEL", model, "Assistant AI Model");
  res.json({ ok: true });
});

export default router;
