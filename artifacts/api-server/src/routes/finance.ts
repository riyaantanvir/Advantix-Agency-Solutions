import { Router } from "express";
import {
  db,
  financeTagsTable,
  financePaymentMethodsTable,
  financeEntriesTable,
  financePlannedPaymentsTable,
  financeSubscriptionsTable,
  financeSettingsTable,
} from "@workspace/db";
import { and, eq, desc, gte, lte, sql, inArray } from "drizzle-orm";
import { requireToolUser } from "../middleware/toolAuth.js";

const router = Router();

router.use("/tools/finance", requireToolUser);

function uid(req: any): number {
  return req.session.toolUserId as number;
}

async function ensureTagOwned(userId: number, tagId: number | null | undefined): Promise<number | null> {
  if (tagId === null || tagId === undefined || tagId === 0) return null;
  const id = Number(tagId);
  if (!Number.isFinite(id)) return null;
  const [row] = await db.select({ id: financeTagsTable.id }).from(financeTagsTable)
    .where(and(eq(financeTagsTable.id, id), eq(financeTagsTable.userId, userId))).limit(1);
  if (!row) throw Object.assign(new Error("Tag not found or not owned by user"), { status: 403 });
  return id;
}

async function ensurePmOwned(userId: number, pmId: number | null | undefined): Promise<number | null> {
  if (pmId === null || pmId === undefined || pmId === 0) return null;
  const id = Number(pmId);
  if (!Number.isFinite(id)) return null;
  const [row] = await db.select({ id: financePaymentMethodsTable.id }).from(financePaymentMethodsTable)
    .where(and(eq(financePaymentMethodsTable.id, id), eq(financePaymentMethodsTable.userId, userId))).limit(1);
  if (!row) throw Object.assign(new Error("Payment method not found or not owned by user"), { status: 403 });
  return id;
}

function safeCell(v: any): string {
  if (v === null || v === undefined) return '""';
  let s = String(v);
  // Prevent CSV formula injection (Excel/Sheets) — prefix risky leading chars with apostrophe
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  // Always wrap every cell in quotes (matches user's expected import/export format)
  return `"${s.replace(/"/g, '""')}"`;
}

/* ─────────────── SETTINGS ─────────────── */
router.get("/tools/finance/settings", async (req, res) => {
  const u = uid(req);
  const [row] = await db.select().from(financeSettingsTable).where(eq(financeSettingsTable.userId, u)).limit(1);
  if (row) { res.json(row); return; }
  // Auto-create defaults on first access
  const [created] = await db.insert(financeSettingsTable).values({ userId: u }).returning();
  res.json(created);
});

router.put("/tools/finance/settings", async (req, res) => {
  const u = uid(req);
  const code = String(req.body.currencyCode || "").trim().toUpperCase().slice(0, 8);
  const symbol = String(req.body.currencySymbol || "").trim().slice(0, 8);
  if (!code || !symbol) { res.status(400).json({ error: "currencyCode and currencySymbol are required" }); return; }
  const [existing] = await db.select().from(financeSettingsTable).where(eq(financeSettingsTable.userId, u)).limit(1);
  if (!existing) {
    const [row] = await db.insert(financeSettingsTable)
      .values({ userId: u, currencyCode: code, currencySymbol: symbol }).returning();
    res.json(row);
    return;
  }
  const [row] = await db.update(financeSettingsTable)
    .set({ currencyCode: code, currencySymbol: symbol, updatedAt: new Date() })
    .where(eq(financeSettingsTable.userId, u))
    .returning();
  res.json(row);
});

/* ─────────────── TAGS ─────────────── */
router.get("/tools/finance/tags", async (req, res) => {
  const rows = await db.select().from(financeTagsTable)
    .where(eq(financeTagsTable.userId, uid(req)))
    .orderBy(financeTagsTable.name);
  res.json(rows);
});

router.post("/tools/finance/tags", async (req, res) => {
  const name = String(req.body.name || "").trim();
  const color = req.body.color ? String(req.body.color) : null;
  if (!name) { res.status(400).json({ error: "Name required" }); return; }
  try {
    const [row] = await db.insert(financeTagsTable)
      .values({ userId: uid(req), name, color })
      .returning();
    res.json(row);
  } catch (e: any) {
    if (String(e.message || "").includes("uniq")) {
      res.status(409).json({ error: "Tag already exists" });
    } else {
      res.status(500).json({ error: e.message });
    }
  }
});

router.patch("/tools/finance/tags/:id", async (req, res) => {
  const id = Number(req.params.id);
  const updates: any = {};
  if (req.body.name !== undefined) updates.name = String(req.body.name).trim();
  if (req.body.color !== undefined) updates.color = req.body.color || null;
  const [row] = await db.update(financeTagsTable).set(updates)
    .where(and(eq(financeTagsTable.id, id), eq(financeTagsTable.userId, uid(req))))
    .returning();
  res.json(row);
});

router.delete("/tools/finance/tags/:id", async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(financeTagsTable)
    .where(and(eq(financeTagsTable.id, id), eq(financeTagsTable.userId, uid(req))));
  res.json({ ok: true });
});

router.post("/tools/finance/tags/init", async (req, res) => {
  // Create tags from existing entries' details (auto-categorize from common keywords)
  const u = uid(req);
  const defaults = ["Food", "Transport", "Shopping", "Bills", "Rent", "Salary", "Health", "Entertainment", "Other"];
  let created = 0;
  for (const name of defaults) {
    try {
      await db.insert(financeTagsTable).values({ userId: u, name }).onConflictDoNothing();
      created++;
    } catch {}
  }
  const rows = await db.select().from(financeTagsTable).where(eq(financeTagsTable.userId, u));
  res.json({ created, tags: rows });
});

/* ─────────────── PAYMENT METHODS ─────────────── */
router.get("/tools/finance/payment-methods", async (req, res) => {
  const rows = await db.select().from(financePaymentMethodsTable)
    .where(eq(financePaymentMethodsTable.userId, uid(req)))
    .orderBy(financePaymentMethodsTable.name);
  res.json(rows);
});

router.post("/tools/finance/payment-methods", async (req, res) => {
  const name = String(req.body.name || "").trim();
  if (!name) { res.status(400).json({ error: "Name required" }); return; }
  try {
    const [row] = await db.insert(financePaymentMethodsTable)
      .values({ userId: uid(req), name }).returning();
    res.json(row);
  } catch (e: any) {
    res.status(409).json({ error: "Payment method already exists" });
  }
});

router.patch("/tools/finance/payment-methods/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [row] = await db.update(financePaymentMethodsTable)
    .set({ name: String(req.body.name).trim() })
    .where(and(eq(financePaymentMethodsTable.id, id), eq(financePaymentMethodsTable.userId, uid(req))))
    .returning();
  res.json(row);
});

router.delete("/tools/finance/payment-methods/:id", async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(financePaymentMethodsTable)
    .where(and(eq(financePaymentMethodsTable.id, id), eq(financePaymentMethodsTable.userId, uid(req))));
  res.json({ ok: true });
});

/* ─────────────── ENTRIES ─────────────── */
router.get("/tools/finance/entries", async (req, res) => {
  const u = uid(req);
  const { from, to, type, tagId, paymentMethodId, limit, offset } = req.query as Record<string, string>;
  const where: any[] = [eq(financeEntriesTable.userId, u)];
  if (from) where.push(gte(financeEntriesTable.date, from));
  if (to) where.push(lte(financeEntriesTable.date, to));
  if (type) where.push(eq(financeEntriesTable.type, type));
  if (tagId) where.push(eq(financeEntriesTable.tagId, Number(tagId)));
  if (paymentMethodId) where.push(eq(financeEntriesTable.paymentMethodId, Number(paymentMethodId)));

  const lim = Math.min(Number(limit) || 100, 1000);
  const off = Number(offset) || 0;

  const rows = await db.select().from(financeEntriesTable)
    .where(and(...where))
    .orderBy(desc(financeEntriesTable.date), desc(financeEntriesTable.id))
    .limit(lim).offset(off);

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
    .from(financeEntriesTable).where(and(...where));

  res.json({ rows, total: count });
});

router.post("/tools/finance/entries", async (req, res) => {
  try {
    const { date, type, amount, details, tagId, paymentMethodId } = req.body;
    if (!date || !type || !amount) { res.status(400).json({ error: "date, type, amount required" }); return; }
    if (type !== "expense" && type !== "income") { res.status(400).json({ error: "type must be expense or income" }); return; }
    const u = uid(req);
    const safeTag = await ensureTagOwned(u, tagId);
    const safePm = await ensurePmOwned(u, paymentMethodId);
    const [row] = await db.insert(financeEntriesTable).values({
      userId: u, date, type, amount: String(amount),
      details: details || null,
      tagId: safeTag, paymentMethodId: safePm,
    }).returning();
    res.json(row);
  } catch (e: any) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.patch("/tools/finance/entries/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const u = uid(req);
    const updates: any = {};
    for (const k of ["date", "type", "details"]) if (req.body[k] !== undefined) updates[k] = req.body[k];
    if (req.body.amount !== undefined) updates.amount = String(req.body.amount);
    if (req.body.tagId !== undefined) updates.tagId = await ensureTagOwned(u, req.body.tagId);
    if (req.body.paymentMethodId !== undefined) updates.paymentMethodId = await ensurePmOwned(u, req.body.paymentMethodId);
    const [row] = await db.update(financeEntriesTable).set(updates)
      .where(and(eq(financeEntriesTable.id, id), eq(financeEntriesTable.userId, u)))
      .returning();
    res.json(row);
  } catch (e: any) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.delete("/tools/finance/entries/:id", async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(financeEntriesTable)
    .where(and(eq(financeEntriesTable.id, id), eq(financeEntriesTable.userId, uid(req))));
  res.json({ ok: true });
});

router.delete("/tools/finance/entries", async (req, res) => {
  await db.delete(financeEntriesTable).where(eq(financeEntriesTable.userId, uid(req)));
  res.json({ ok: true });
});

/* ─────────────── CSV import / export ─────────────── */
// (use safeCell from above for CSV cells — prevents formula injection)

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else { field += c; }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { cur.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        cur.push(field); rows.push(cur); cur = []; field = "";
      } else { field += c; }
    }
  }
  if (field.length || cur.length) { cur.push(field); rows.push(cur); }
  return rows.filter(r => r.some(c => c.trim() !== ""));
}

router.get("/tools/finance/entries/export.csv", async (req, res) => {
  const u = uid(req);
  const { from, to } = req.query as Record<string, string>;
  const where: any[] = [eq(financeEntriesTable.userId, u)];
  if (from) where.push(gte(financeEntriesTable.date, from));
  if (to) where.push(lte(financeEntriesTable.date, to));

  const rows = await db.select({
    e: financeEntriesTable,
    tag: financeTagsTable.name,
    pm: financePaymentMethodsTable.name,
  }).from(financeEntriesTable)
    .leftJoin(financeTagsTable, and(eq(financeEntriesTable.tagId, financeTagsTable.id), eq(financeTagsTable.userId, u)))
    .leftJoin(financePaymentMethodsTable, and(eq(financeEntriesTable.paymentMethodId, financePaymentMethodsTable.id), eq(financePaymentMethodsTable.userId, u)))
    .where(and(...where))
    .orderBy(desc(financeEntriesTable.date));

  // Header order matches the user-facing import format: Date, Type, Details, Amount (BDT), Tag, Payment Method
  const header = ["Date", "Type", "Details", "Amount (BDT)", "Tag", "Payment Method"].map(safeCell).join(",");
  const lines = [header];
  for (const r of rows) {
    lines.push([r.e.date, r.e.type, r.e.details || "", r.e.amount, r.tag || "", r.pm || ""].map(safeCell).join(","));
  }
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="expenses-export-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(lines.join("\n"));
});

router.get("/tools/finance/entries/template.csv", (_req, res) => {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="finance-template.csv"');
  const header = ["Date", "Type", "Details", "Amount (BDT)", "Tag", "Payment Method"].map(safeCell).join(",");
  const sample1 = ["2026-01-15", "expense", "Lunch", "500.00", "Food", "Cash"].map(safeCell).join(",");
  const sample2 = ["2026-01-20", "income", "Salary", "50000.00", "Salary", "Bank Transfer"].map(safeCell).join(",");
  res.send([header, sample1, sample2].join("\n") + "\n");
});

router.post("/tools/finance/entries/import", async (req, res) => {
  const u = uid(req);
  const csv = String(req.body.csv || "");
  if (!csv.trim()) { res.status(400).json({ error: "Empty CSV" }); return; }
  const rows = parseCsv(csv);
  if (rows.length < 2) { res.status(400).json({ error: "No data rows" }); return; }
  // Normalize header — accept both "Amount" / "Amount (BDT)" and "PaymentMethod" / "Payment Method" etc.
  const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "").replace(/\(.*?\)/g, "");
  const header = rows[0].map(normalize);
  const findIdx = (...candidates: string[]) => {
    for (const c of candidates) {
      const i = header.indexOf(c);
      if (i >= 0) return i;
    }
    return -1;
  };
  const iDate = findIdx("date");
  const iType = findIdx("type");
  const iAmount = findIdx("amount", "amountbdt", "amounttk");
  const iDetails = findIdx("details", "description", "note", "notes");
  const iTag = findIdx("tag", "category");
  const iPm = findIdx("paymentmethod", "payment", "method");
  if (iDate < 0 || iType < 0 || iAmount < 0) {
    res.status(400).json({ error: "CSV must have Date, Type, and Amount (BDT) columns" });
    return;
  }

  // Preload tags & methods for this user
  const tags = await db.select().from(financeTagsTable).where(eq(financeTagsTable.userId, u));
  const pms = await db.select().from(financePaymentMethodsTable).where(eq(financePaymentMethodsTable.userId, u));
  const tagMap = new Map(tags.map(t => [t.name.toLowerCase(), t.id]));
  const pmMap = new Map(pms.map(p => [p.name.toLowerCase(), p.id]));

  let imported = 0, skipped = 0;
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const date = (row[iDate] || "").trim();
    const type = (row[iType] || "").trim().toLowerCase();
    const amount = (row[iAmount] || "").trim();
    if (!date || !type || !amount || isNaN(Number(amount))) { skipped++; continue; }
    if (type !== "expense" && type !== "income") { skipped++; continue; }

    let tagId: number | null = null;
    const tagName = iTag >= 0 ? (row[iTag] || "").trim() : "";
    if (tagName) {
      const key = tagName.toLowerCase();
      if (tagMap.has(key)) tagId = tagMap.get(key)!;
      else {
        try {
          const [t] = await db.insert(financeTagsTable).values({ userId: u, name: tagName }).returning();
          tagMap.set(key, t.id); tagId = t.id;
        } catch {}
      }
    }

    let pmId: number | null = null;
    const pmName = iPm >= 0 ? (row[iPm] || "").trim() : "";
    if (pmName) {
      const key = pmName.toLowerCase();
      if (pmMap.has(key)) pmId = pmMap.get(key)!;
      else {
        try {
          const [p] = await db.insert(financePaymentMethodsTable).values({ userId: u, name: pmName }).returning();
          pmMap.set(key, p.id); pmId = p.id;
        } catch {}
      }
    }

    await db.insert(financeEntriesTable).values({
      userId: u, date, type, amount,
      details: iDetails >= 0 ? (row[iDetails] || "").trim() || null : null,
      tagId, paymentMethodId: pmId,
    });
    imported++;
  }
  res.json({ imported, skipped });
});

/* ─────────────── DASHBOARD ─────────────── */
router.get("/tools/finance/dashboard", async (req, res) => {
  const u = uid(req);
  const { from, to, tagId, paymentMethodId } = req.query as Record<string, string>;
  const where: any[] = [eq(financeEntriesTable.userId, u)];
  if (from) where.push(gte(financeEntriesTable.date, from));
  if (to) where.push(lte(financeEntriesTable.date, to));
  if (tagId) where.push(eq(financeEntriesTable.tagId, Number(tagId)));
  if (paymentMethodId) where.push(eq(financeEntriesTable.paymentMethodId, Number(paymentMethodId)));

  const totals = await db.select({
    type: financeEntriesTable.type,
    sum: sql<string>`COALESCE(SUM(${financeEntriesTable.amount}), 0)`,
  }).from(financeEntriesTable).where(and(...where)).groupBy(financeEntriesTable.type);

  let income = 0, expense = 0;
  for (const t of totals) {
    if (t.type === "income") income = Number(t.sum);
    if (t.type === "expense") expense = Number(t.sum);
  }

  // This-month totals (independent of filters)
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
  const monthRows = await db.select({
    type: financeEntriesTable.type,
    sum: sql<string>`COALESCE(SUM(${financeEntriesTable.amount}), 0)`,
  }).from(financeEntriesTable)
    .where(and(eq(financeEntriesTable.userId, u),
               gte(financeEntriesTable.date, monthStart),
               lte(financeEntriesTable.date, monthEnd)))
    .groupBy(financeEntriesTable.type);

  let monthIncome = 0, monthExpense = 0;
  for (const t of monthRows) {
    if (t.type === "income") monthIncome = Number(t.sum);
    if (t.type === "expense") monthExpense = Number(t.sum);
  }

  // Breakdown by tag (expense) — join scoped to same user to prevent cross-tenant name leak
  const byTag = await db.select({
    tagId: financeEntriesTable.tagId,
    tagName: financeTagsTable.name,
    sum: sql<string>`COALESCE(SUM(${financeEntriesTable.amount}), 0)`,
  }).from(financeEntriesTable)
    .leftJoin(financeTagsTable, and(eq(financeEntriesTable.tagId, financeTagsTable.id), eq(financeTagsTable.userId, u)))
    .where(and(...where, eq(financeEntriesTable.type, "expense")))
    .groupBy(financeEntriesTable.tagId, financeTagsTable.name);

  // Breakdown by payment method (expense)
  const byPm = await db.select({
    pmId: financeEntriesTable.paymentMethodId,
    pmName: financePaymentMethodsTable.name,
    sum: sql<string>`COALESCE(SUM(${financeEntriesTable.amount}), 0)`,
  }).from(financeEntriesTable)
    .leftJoin(financePaymentMethodsTable, and(eq(financeEntriesTable.paymentMethodId, financePaymentMethodsTable.id), eq(financePaymentMethodsTable.userId, u)))
    .where(and(...where, eq(financeEntriesTable.type, "expense")))
    .groupBy(financeEntriesTable.paymentMethodId, financePaymentMethodsTable.name);

  // Daily series (last 30 days within filter window)
  const series = await db.select({
    date: financeEntriesTable.date,
    type: financeEntriesTable.type,
    sum: sql<string>`COALESCE(SUM(${financeEntriesTable.amount}), 0)`,
  }).from(financeEntriesTable).where(and(...where))
    .groupBy(financeEntriesTable.date, financeEntriesTable.type)
    .orderBy(financeEntriesTable.date);

  res.json({
    income, expense, net: income - expense,
    monthIncome, monthExpense, monthNet: monthIncome - monthExpense,
    byTag: byTag.map(b => ({ tagId: b.tagId, tagName: b.tagName || "Untagged", amount: Number(b.sum) })),
    byPaymentMethod: byPm.map(b => ({ pmId: b.pmId, pmName: b.pmName || "Unspecified", amount: Number(b.sum) })),
    series: series.map(s => ({ date: s.date, type: s.type, amount: Number(s.sum) })),
  });
});

/* ─────────────── PLANNED PAYMENTS ─────────────── */
router.get("/tools/finance/planned", async (req, res) => {
  const rows = await db.select().from(financePlannedPaymentsTable)
    .where(eq(financePlannedPaymentsTable.userId, uid(req)))
    .orderBy(desc(financePlannedPaymentsTable.startDate));
  res.json(rows);
});

router.post("/tools/finance/planned", async (req, res) => {
  try {
    const { tagId, amount, frequency, startDate, notes } = req.body;
    if (!amount || !frequency || !startDate) {
      res.status(400).json({ error: "amount, frequency, startDate required" }); return;
    }
    const u = uid(req);
    const safeTag = await ensureTagOwned(u, tagId);
    const [row] = await db.insert(financePlannedPaymentsTable).values({
      userId: u, tagId: safeTag,
      amount: String(amount), frequency, startDate,
      notes: notes || null,
    }).returning();
    res.json(row);
  } catch (e: any) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.patch("/tools/finance/planned/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const u = uid(req);
    const updates: any = {};
    for (const k of ["frequency", "startDate", "notes"]) if (req.body[k] !== undefined) updates[k] = req.body[k];
    if (req.body.amount !== undefined) updates.amount = String(req.body.amount);
    if (req.body.tagId !== undefined) updates.tagId = await ensureTagOwned(u, req.body.tagId);
    const [row] = await db.update(financePlannedPaymentsTable).set(updates)
      .where(and(eq(financePlannedPaymentsTable.id, id), eq(financePlannedPaymentsTable.userId, u)))
      .returning();
    res.json(row);
  } catch (e: any) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.delete("/tools/finance/planned/:id", async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(financePlannedPaymentsTable)
    .where(and(eq(financePlannedPaymentsTable.id, id), eq(financePlannedPaymentsTable.userId, uid(req))));
  res.json({ ok: true });
});

/* ─────────────── SUBSCRIPTIONS ─────────────── */
router.get("/tools/finance/subscriptions", async (req, res) => {
  const rows = await db.select().from(financeSubscriptionsTable)
    .where(eq(financeSubscriptionsTable.userId, uid(req)))
    .orderBy(financeSubscriptionsTable.nextDueDate);
  res.json(rows);
});

router.post("/tools/finance/subscriptions", async (req, res) => {
  const { name, amount, frequency, nextDueDate, notes, active } = req.body;
  if (!name || !amount || !frequency || !nextDueDate) {
    res.status(400).json({ error: "name, amount, frequency, nextDueDate required" }); return;
  }
  const [row] = await db.insert(financeSubscriptionsTable).values({
    userId: uid(req),
    name: String(name),
    amount: String(amount),
    frequency,
    nextDueDate,
    notes: notes || null,
    active: active !== false,
  }).returning();
  res.json(row);
});

router.patch("/tools/finance/subscriptions/:id", async (req, res) => {
  const id = Number(req.params.id);
  const updates: any = {};
  for (const k of ["name", "frequency", "nextDueDate", "notes", "active"]) if (req.body[k] !== undefined) updates[k] = req.body[k];
  if (req.body.amount !== undefined) updates.amount = String(req.body.amount);
  const [row] = await db.update(financeSubscriptionsTable).set(updates)
    .where(and(eq(financeSubscriptionsTable.id, id), eq(financeSubscriptionsTable.userId, uid(req))))
    .returning();
  res.json(row);
});

router.delete("/tools/finance/subscriptions/:id", async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(financeSubscriptionsTable)
    .where(and(eq(financeSubscriptionsTable.id, id), eq(financeSubscriptionsTable.userId, uid(req))));
  res.json({ ok: true });
});

export default router;
