import { Router } from "express";
import { prisma } from "../db.js";
import { pageQuerySchema, offsetFor } from "../lib/pagination.js";
import { productCreateSchema, productUpdateSchema, idParamsSchema } from "../schemas/product.schema.js";
import { validate } from "../middleware/validate.js";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

export const productsRouter = Router();

/**
 * GET /products
 * - Pagination
 * - Optional FTS search using generated tsvector ("searchvec")
 */
productsRouter.get("/", validate(pageQuerySchema, "query"), async (req, res) => {
  const { q, page, pageSize, sort, dir } = (req as any).validated_query;
  const offset = offsetFor(page, pageSize);

    if (q && q.trim().length > 0) {
    const rows = await prisma.$queryRaw<
        Array<{ id: string; sku: string; title: string; category: string | null; pricecents: number; createdAt: Date; rank: number }>
    >`
        WITH t AS (SELECT websearch_to_tsquery('english', ${q}) AS q)
        SELECT id, sku, title, category, "priceCents" as pricecents, "createdAt",
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
        const whereLike = {
        OR: [
            { title:    { contains: q, mode: "insensitive" as const } },
            { category: { contains: q, mode: "insensitive" as const } }
        ]
        };
        const [itemsLike, totalLike] = await Promise.all([
        prisma.product.findMany({
            where: whereLike,
            skip: (page - 1) * pageSize,
            take: pageSize,
            orderBy: { [sort]: dir },
            select: { id: true, sku: true, title: true, category: true, priceCents: true, createdAt: true }
        }),
        prisma.product.count({ where: whereLike })
        ]);
        return res.json({ data: itemsLike, page, pageSize, total: totalLike, note: "fallback:substring" });
    }

    return res.json({ data: rows, page, pageSize, total: Number(count) });
    }


  const [items, total] = await Promise.all([
    prisma.product.findMany({
      skip: offset,
      take: pageSize,
      orderBy: { [sort]: dir }, // sort supports "createdAt" per pageQuerySchema
      select: { id: true, sku: true, title: true, category: true, priceCents: true, createdAt: true }
    }),
    prisma.product.count()
  ]);

  return res.json({ data: items, page, pageSize, total });
});

/**
 * GET /products/:id
 */
productsRouter.get("/:id", validate(idParamsSchema, "params"), async (req, res) => {
  const { id } = (req as any).validated_params as { id: string };
  const product = await prisma.product.findUnique({
    where: { id },
    select: { id: true, sku: true, title: true, category: true, priceCents: true, createdAt: true }
  });
  if (!product) return res.status(404).json({ error: "not_found" });
  res.json(product);
});

/**
 * POST /products
 */
productsRouter.post("/", validate(productCreateSchema), async (req, res) => {
  const data = (req as any).validated_body;
  try {
    const created = await prisma.product.create({ data });
    res.status(201).json(created);
  } catch (e: unknown) {
    if (e instanceof PrismaClientKnownRequestError && e.code === "P2002") {
      // unique constraint (sku)
      return res.status(409).json({ error: "sku_in_use" });
    }
    throw e;
  }
});

/**
 * PATCH /products/:id
 */
productsRouter.patch(
  "/:id",
  validate(idParamsSchema, "params"),
  validate(productUpdateSchema),
  async (req, res) => {
    const { id } = (req as any).validated_params as { id: string };
    const data = (req as any).validated_body;

    try {
      const updated = await prisma.product.update({ where: { id }, data });
      res.json(updated);
    } catch (e: unknown) {
      if (e instanceof PrismaClientKnownRequestError) {
        if (e.code === "P2002") return res.status(409).json({ error: "sku_in_use" });
        if (e.code === "P2025") return res.status(404).json({ error: "not_found" });
      }
      throw e;
    }
  }
);

/**
 * DELETE /products/:id
 * - Prevent deletion if referenced by any order items
 */
productsRouter.delete("/:id", validate(idParamsSchema, "params"), async (req, res) => {
  const { id } = (req as any).validated_params as { id: string };
  const refs = await prisma.orderItem.count({ where: { productId: id } });
  if (refs > 0) return res.status(409).json({ error: "in_use" });

  try {
    await prisma.product.delete({ where: { id } });
    res.status(204).end();
  } catch (e: unknown) {
    if (e instanceof PrismaClientKnownRequestError && e.code === "P2025") {
      return res.status(404).json({ error: "not_found" });
    }
    throw e;
  }
});
