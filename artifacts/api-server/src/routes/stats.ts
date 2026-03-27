import { Router, type IRouter } from "express";
import { db, pageViewsTable, contactsTable, leadsTable } from "@workspace/db";
import { sql, gte } from "drizzle-orm";
import { requireAdmin } from "../middleware/auth.js";

const router: IRouter = Router();

router.post("/track", async (req, res) => {
  const { visitorId, page, userAgent, referrer } = req.body as {
    visitorId?: string;
    page?: string;
    userAgent?: string;
    referrer?: string;
  };

  if (!visitorId || !page) {
    res.status(400).json({ error: "visitorId and page are required" });
    return;
  }

  await db.insert(pageViewsTable).values({
    visitorId,
    page,
    userAgent: userAgent ?? null,
    referrer: referrer ?? null,
  });

  res.json({ message: "Tracked" });
});

router.get("/stats", requireAdmin, async (_req, res) => {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [activeResult] = await db
    .select({ count: sql<number>`count(distinct ${pageViewsTable.visitorId})` })
    .from(pageViewsTable)
    .where(gte(pageViewsTable.createdAt, fiveMinutesAgo));

  const [todayResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(pageViewsTable)
    .where(gte(pageViewsTable.createdAt, startOfToday));

  const [totalContactsResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(contactsTable);

  const [totalLeadsResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(leadsTable);

  const topPages = await db
    .select({
      page: pageViewsTable.page,
      count: sql<number>`count(*)`,
    })
    .from(pageViewsTable)
    .groupBy(pageViewsTable.page)
    .orderBy(sql`count(*) desc`)
    .limit(10);

  res.json({
    activeVisitors: Number(activeResult?.count ?? 0),
    todayViews: Number(todayResult?.count ?? 0),
    totalContacts: Number(totalContactsResult?.count ?? 0),
    totalLeads: Number(totalLeadsResult?.count ?? 0),
    topPages: topPages.map((p) => ({ page: p.page, count: Number(p.count) })),
  });
});

export default router;
