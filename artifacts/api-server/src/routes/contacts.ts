import { Router, type IRouter } from "express";
import { db, contactsTable, adminsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAdmin } from "../middleware/auth.js";

const router: IRouter = Router();

router.post("/contacts", async (req, res) => {
  const { name, email, phone, whatsapp, service, budget, details, message } = req.body as {
    name?: string;
    email?: string;
    phone?: string;
    whatsapp?: string;
    service?: string;
    budget?: string;
    details?: string;
    message?: string;
  };

  if (!name || !email || !message) {
    res.status(400).json({ error: "Name, email, and message are required" });
    return;
  }

  const [contact] = await db
    .insert(contactsTable)
    .values({
      name,
      email,
      phone: phone ?? null,
      whatsapp: whatsapp ?? null,
      service: service ?? null,
      budget: budget ?? null,
      details: details ?? null,
      message,
    })
    .returning();

  // Auto-subscribe contact to blog notifications (fire-and-forget)
  db.execute(sql`
    INSERT INTO email_subscribers (email, name, source, active)
    VALUES (${email.toLowerCase().trim()}, ${name.trim()}, 'blog', true)
    ON CONFLICT (email) DO NOTHING
  `).catch(() => {});

  res.status(201).json(contact);
});

router.get("/contacts", requireAdmin, async (_req, res) => {
  const contacts = await db.select().from(contactsTable).orderBy(contactsTable.createdAt);
  res.json(contacts);
});

router.get("/contacts/admins", requireAdmin, async (_req, res) => {
  const admins = await db
    .select({ id: adminsTable.id, username: adminsTable.username })
    .from(adminsTable)
    .orderBy(adminsTable.username);
  res.json(admins);
});

router.patch("/contacts/:id", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id ?? "0"), 10);
  const { replied, assignedTo, notes } = req.body as {
    replied?: boolean;
    assignedTo?: string | null;
    notes?: string | null;
  };

  const setValues: Record<string, unknown> = {};
  if (replied !== undefined) setValues.replied = replied;
  if (assignedTo !== undefined) setValues.assignedTo = assignedTo;
  if (notes !== undefined) setValues.notes = notes;

  const [updated] = await db
    .update(contactsTable)
    .set(setValues)
    .where(eq(contactsTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Contact not found" });
    return;
  }

  res.json(updated);
});

router.delete("/contacts/:id", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id ?? "0"), 10);
  await db.delete(contactsTable).where(eq(contactsTable.id, id));
  res.json({ message: "Deleted" });
});

router.post("/contacts/import", requireAdmin, async (req, res) => {
  const rows = req.body as Array<{
    name?: string;
    email?: string;
    phone?: string;
    whatsapp?: string;
    service?: string;
    budget?: string;
    message?: string;
    replied?: boolean;
  }>;

  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(400).json({ error: "No rows provided" });
    return;
  }

  const valid = rows.filter(r => r.name && r.email && r.message);
  if (valid.length === 0) {
    res.status(400).json({ error: "No valid rows (name, email, message required)" });
    return;
  }

  const inserted = await db
    .insert(contactsTable)
    .values(
      valid.map(r => ({
        name: r.name!,
        email: r.email!,
        phone: r.phone ?? null,
        whatsapp: r.whatsapp ?? null,
        service: r.service ?? null,
        budget: r.budget ?? null,
        message: r.message!,
        replied: r.replied === true,
      }))
    )
    .returning();

  res.json({ imported: inserted.length });
});

export default router;
