import { Router } from "express";
import { prisma } from "../db.js";
import { validate } from "../middleware/validate.js";
import { rangeSchema } from "../schemas/analytics.schema.js";
import { respondWithCache } from "../lib/httpCache.js";

export const analyticsRouter = Router();

function normalizeRange(q: { dateFrom?: Date; dateTo?: Date }) {
  const end = q.dateTo ? new Date(q.dateTo) : new Date();
  const start = q.dateFrom ? new Date(q.dateFrom) : new Date(end);
  if (!q.dateFrom) start.setDate(end.getDate() - 30);
  return { start, end };
}

// GET /analytics/overview?dateFrom=&dateTo=&topN=
analyticsRouter.get("/overview", validate(rangeSchema, "query"), async (req, res) => {
  const { dateFrom, dateTo, topN } = (req as any).validated_query as { dateFrom?: Date; dateTo?: Date; topN: number };
  const { start, end } = normalizeRange({ dateFrom, dateTo });
  const key = `overview:${start.toISOString()}:${end.toISOString()}:top=${topN}`;

  return respondWithCache(req, res, key, 60, async () => {
    const paidish = ["paid","shipped","delivered"] as const;

    const [ordersAgg, customersCount, topProducts] = await Promise.all([
      prisma.order.aggregate({
        where: { status: { in: paidish }, orderDate: { gte: start, lte: end } },
        _sum: { totalCents: true },
        _count: true
      }),
      prisma.customer.count(),
      prisma.$queryRaw<Array<{ productId: string; title: string; revenuecents: number; units: number }>>`
        SELECT oi."productId" as "productId",
               p.title as title,
               SUM(oi.qty * oi."unitPriceCents")::bigint as revenuecents,
               SUM(oi.qty)::bigint as units
        FROM "OrderItem" oi
        JOIN "Order" o ON o.id = oi."orderId"
        JOIN "Product" p ON p.id = oi."productId"
        WHERE o."orderDate" BETWEEN ${start} AND ${end}
          AND o.status IN ('paid','shipped','delivered')
        GROUP BY oi."productId", p.title
        ORDER BY revenuecents DESC
        LIMIT ${topN};
      `
    ]);

    const revenueCents = Number(ordersAgg._sum.totalCents ?? 0);
    const ordersCount = Number(ordersAgg._count ?? 0);
    const aovCents = ordersCount > 0 ? Math.round(revenueCents / ordersCount) : 0;

    return {
      range: { from: start, to: end },
      kpis: { revenueCents, ordersCount, aovCents, customersCount },
      topProducts: topProducts.map((r: { productId: any; title: any; revenuecents: any; units: any; }) => ({
        productId: r.productId, title: r.title, revenueCents: Number(r.revenuecents), units: Number(r.units)
      }))
    };
  });
});

// GET /analytics/revenue-by-day
analyticsRouter.get("/revenue-by-day", validate(rangeSchema, "query"), async (req, res) => {
  const { dateFrom, dateTo } = (req as any).validated_query as { dateFrom?: Date; dateTo?: Date };
  const { start, end } = normalizeRange({ dateFrom, dateTo });
  const key = `revday:${start.toISOString()}:${end.toISOString()}`;

  return respondWithCache(req, res, key, 60, async () => {
    const rows = await prisma.$queryRaw<Array<{ day: Date; revenuecents: number }>>`
      SELECT date_trunc('day', o."orderDate") AS day,
             SUM(o."totalCents")::bigint AS revenuecents
      FROM "Order" o
      WHERE o."orderDate" BETWEEN ${start} AND ${end}
        AND o.status IN ('paid','shipped','delivered')
      GROUP BY 1
      ORDER BY 1 ASC;
    `;
    return { range: { from: start, to: end }, series: rows.map((r: { day: any; revenuecents: any; }) => ({ day: r.day, revenueCents: Number(r.revenuecents) })) };
  });
});

// GET /analytics/orders-by-status
analyticsRouter.get("/orders-by-status", validate(rangeSchema, "query"), async (req, res) => {
  const { dateFrom, dateTo } = (req as any).validated_query as { dateFrom?: Date; dateTo?: Date };
  const { start, end } = normalizeRange({ dateFrom, dateTo });
  const key = `ordstatus:${start.toISOString()}:${end.toISOString()}`;

  return respondWithCache(req, res, key, 60, async () => {
    const rows = await prisma.$queryRaw<Array<{ status: string; count: number }>>`
      SELECT o.status::text as status, COUNT(*)::bigint as count
      FROM "Order" o
      WHERE o."orderDate" BETWEEN ${start} AND ${end}
      GROUP BY 1
      ORDER BY 1;
    `;
    return { range: { from: start, to: end }, breakdown: rows.map((r: { status: any; count: any; }) => ({ status: r.status, count: Number(r.count) })) };
  });
});

// GET /analytics/top-products
analyticsRouter.get("/top-products", validate(rangeSchema, "query"), async (req, res) => {
  const { dateFrom, dateTo, topN } = (req as any).validated_query as { dateFrom?: Date; dateTo?: Date; topN: number };
  const { start, end } = normalizeRange({ dateFrom, dateTo });
  const key = `topprod:${start.toISOString()}:${end.toISOString()}:top=${topN}`;

  return respondWithCache(req, res, key, 60, async () => {
    const rows = await prisma.$queryRaw<Array<{ productId: string; title: string; revenuecents: number; units: number }>>`
      SELECT oi."productId" as "productId",
             p.title as title,
             SUM(oi.qty * oi."unitPriceCents")::bigint as revenuecents,
             SUM(oi.qty)::bigint as units
      FROM "OrderItem" oi
      JOIN "Order" o ON o.id = oi."orderId"
      JOIN "Product" p ON p.id = oi."productId"
      WHERE o."orderDate" BETWEEN ${start} AND ${end}
        AND o.status IN ('paid','shipped','delivered')
      GROUP BY oi."productId", p.title
      ORDER BY revenuecents DESC
      LIMIT ${topN};
    `;
    return { range: { from: start, to: end }, data: rows.map((r: { productId: any; title: any; revenuecents: any; units: any; }) => ({
      productId: r.productId, title: r.title, revenueCents: Number(r.revenuecents), units: Number(r.units)
    })) };
  });
});
