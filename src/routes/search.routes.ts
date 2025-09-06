import { Router } from "express";
import { prisma } from "../db.js";
import { validate } from "../middleware/validate.js";
import { searchQuerySchema } from "../schemas/search.schema.js";
import { requireAuth } from "../middleware/auth.js";

export const searchRouter = Router();

/** GET /search?type=customers|products|tickets&q=...&page=&pageSize=&highlight= */
searchRouter.get("/", requireAuth, validate(searchQuerySchema, "query"), async (req, res) => {
  const { type, q, page, pageSize, highlight } = (req as any).validated_query as {
    type: "customers" | "products" | "tickets";
    q: string; page: number; pageSize: number; highlight: boolean;
  };
  const offset = (page - 1) * pageSize;

  if (type === "customers") {
    const rows = await prisma.$queryRaw<
      Array<{ id: string; name: string; email: string | null; country: string | null; createdAt: Date; rank: number }>
    >`
      WITH t AS (SELECT websearch_to_tsquery('english', ${q}) AS q)
      SELECT id, name, email, country, "createdAt",
             ts_rank_cd("searchvec", (SELECT q FROM t)) AS rank
      FROM "Customer"
      WHERE "searchvec" @@ (SELECT q FROM t)
      ORDER BY rank DESC
      LIMIT ${pageSize} OFFSET ${offset};
    `;
    const [{ count }] = await prisma.$queryRaw<Array<{ count: bigint }>>`
      WITH t AS (SELECT websearch_to_tsquery('english', ${q}) AS q)
      SELECT count(*)::bigint AS count
      FROM "Customer"
      WHERE "searchvec" @@ (SELECT q FROM t);
    `;

    if (rows.length === 0) {
      const where = {
        OR: [
          { name:  { contains: q, mode: "insensitive" as const } },
          { email: { contains: q, mode: "insensitive" as const } },
        ],
      };
      const [fallbackRows, totalLike] = await Promise.all([
        prisma.customer.findMany({
          where,
          skip: offset,
          take: pageSize,
          orderBy: { createdAt: "desc" },
          select: { id: true, name: true, email: true, country: true, createdAt: true },
        }),
        prisma.customer.count({ where }),
      ]);
      return res.json({ type, source: "fallback", page, pageSize, total: totalLike, data: fallbackRows });
    }

    return res.json({ type, source: "fts", page, pageSize, total: Number(count), data: rows });
  }

  if (type === "products") {
    const rows = await prisma.$queryRaw<
      Array<{ id: string; sku: string; title: string; category: string | null; priceCents: number; createdAt: Date; rank: number }>
    >`
      WITH t AS (SELECT websearch_to_tsquery('english', ${q}) AS q)
      SELECT id, sku, title, category, "priceCents", "createdAt",
             ts_rank_cd("searchvec", (SELECT q FROM t)) AS rank
      FROM "Product"
      WHERE "searchvec" @@ (SELECT q FROM t)
      ORDER BY rank DESC
      LIMIT ${pageSize} OFFSET ${offset};
    `;
    const [{ count }] = await prisma.$queryRaw<Array<{ count: bigint }>>`
      WITH t AS (SELECT websearch_to_tsquery('english', ${q}) AS q)
      SELECT count(*)::bigint AS count
      FROM "Product"
      WHERE "searchvec" @@ (SELECT q FROM t);
    `;

    if (rows.length === 0) {
      const where = {
        OR: [
          { title:    { contains: q, mode: "insensitive" as const } },
          { category: { contains: q, mode: "insensitive" as const } },
        ],
      };
      const [fallbackRows, totalLike] = await Promise.all([
        prisma.product.findMany({
          where,
          skip: offset,
          take: pageSize,
          orderBy: { createdAt: "desc" },
          select: { id: true, sku: true, title: true, category: true, priceCents: true, createdAt: true },
        }),
        prisma.product.count({ where }),
      ]);
      return res.json({ type, source: "fallback", page, pageSize, total: totalLike, data: fallbackRows });
    }

    return res.json({ type, source: "fts", page, pageSize, total: Number(count), data: rows });
  }

  // tickets (uses columns: title + body)
// tickets (uses columns: subject + body)
if (type === "tickets") {
  const rows = await prisma.$queryRaw<
    Array<{ id: string; customerId: string; subject: string; createdAt: Date; rank: number; snippet: string | null }>
  >`
    WITH t AS (SELECT websearch_to_tsquery('english', ${q}) AS q)
    SELECT id, "customerId", subject, "createdAt",
           ts_rank_cd("searchvec", (SELECT q FROM t)) AS rank,
           CASE WHEN ${highlight}
             THEN ts_headline('english', subject || ' ' || body, (SELECT q FROM t),
               'StartSel=<mark>,StopSel=</mark>,MaxFragments=2,MinWords=5,MaxWords=20')
             ELSE NULL END AS snippet
    FROM "Ticket"
    WHERE "searchvec" @@ (SELECT q FROM t)
    ORDER BY rank DESC
    LIMIT ${pageSize} OFFSET ${offset};
  `;

  const [{ count }] = await prisma.$queryRaw<Array<{ count: bigint }>>`
    WITH t AS (SELECT websearch_to_tsquery('english', ${q}) AS q)
    SELECT count(*)::bigint AS count
    FROM "Ticket"
    WHERE "searchvec" @@ (SELECT q FROM t);
  `;

  if (rows.length === 0) {
    const where = {
      OR: [
        { subject: { contains: q, mode: "insensitive" as const } },
        { body:    { contains: q, mode: "insensitive" as const } },
      ],
    };
    const [fallbackRows, totalLike] = await Promise.all([
      prisma.ticket.findMany({
        where,
        skip: offset,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        select: { id: true, customerId: true, subject: true, createdAt: true },
      }),
      prisma.ticket.count({ where }),
    ]);
    return res.json({ type, source: "fallback", page, pageSize, total: totalLike, data: fallbackRows });
  }

  return res.json({ type, source: "fts", page, pageSize, total: Number(count), data: rows });
}


  res.status(400).json({ error: "bad_type" });
});
