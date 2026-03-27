import { Router, type IRouter } from "express";
import { db, contactsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
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

  res.status(201).json(contact);
});

router.get("/contacts", requireAdmin, async (_req, res) => {
  const contacts = await db.select().from(contactsTable).orderBy(contactsTable.createdAt);
  res.json(contacts);
});

router.patch("/contacts/:id", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id ?? "0"), 10);
  const { replied } = req.body as { replied?: boolean };

  const [updated] = await db
    .update(contactsTable)
    .set({ replied: replied ?? false })
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

export default router;
