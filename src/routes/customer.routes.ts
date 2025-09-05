import { Router } from "express";
import { prisma } from "../db.js";
import { pageQuerySchema, offsetFor } from "../lib/pagination.js";
import { customerCreateSchema, customerUpdateSchema, idParamsSchema } from "../schemas/customer.schema.js";
import { validate } from "../middleware/validate.js";
import { Prisma } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
export const customersRouter = Router();

/**
 * GET /customers
 * - Pagination
 * - Optional FTS search using generated tsvector ("searchvec")
 */
customersRouter.get("/", validate(pageQuerySchema, "query"), async (req, res) => {
  const { q, page, pageSize, sort, dir } = (req as any).validated_query;
  const offset = offsetFor(page, pageSize);

  // If a search query is provided, use Postgres FTS via $queryRaw for ranked results
  if (q && q.trim().length > 0) {
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

    return res.json({
      data: rows,
      page,
      pageSize,
      total: Number(count)
    });
  }

  // No search -> use Prisma for simple ordering
  const [items, total] = await Promise.all([
    prisma.customer.findMany({
      skip: offset,
      take: pageSize,
      orderBy: { [sort]: dir },
      select: { id: true, name: true, email: true, country: true, createdAt: true }
    }),
    prisma.customer.count()
  ]);

  return res.json({ data: items, page, pageSize, total });
});

/**
 * GET /customers/:id
 * - Details + quick metrics (orders count, tickets count, lifetime value)
 */
customersRouter.get("/:id", validate(idParamsSchema, "params"), async (req, res) => {
  const { id } = (req as any).validated_params as { id: string };

  const customer = await prisma.customer.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, country: true, createdAt: true }
  });
  if (!customer) return res.status(404).json({ error: "not_found" });

  const [ordersCount, ticketsCount, ltvAgg] = await Promise.all([
    prisma.order.count({ where: { customerId: id } }),
    prisma.ticket.count({ where: { customerId: id } }),
    prisma.order.aggregate({ where: { customerId: id }, _sum: { totalCents: true } })
  ]);

  return res.json({
    ...customer,
    metrics: {
      orders: ordersCount,
      tickets: ticketsCount,
      lifetimeValueCents: ltvAgg._sum.totalCents ?? 0
    }
  });
});


// POST /customers
customersRouter.post("/", validate(customerCreateSchema), async (req, res) => {
  const { name, email = null, country = null } = (req as any).validated_body;
  try {
    const created = await prisma.customer.create({ data: { name, email, country } });
    return res.status(201).json(created);
  } catch (e: unknown) {
    if (e instanceof PrismaClientKnownRequestError && e.code === "P2002") {
      return res.status(409).json({ error: "email_in_use" });
    }
    throw e;
  }
});

// PATCH /customers/:id
customersRouter.patch(
  "/:id",
  validate(idParamsSchema, "params"),
  validate(customerUpdateSchema),
  async (req, res) => {
    const { id } = (req as any).validated_params as { id: string };
    const data = (req as any).validated_body;
    try {
      const updated = await prisma.customer.update({ where: { id }, data });
      return res.json(updated);
    } catch (e: unknown) {
      if (e instanceof PrismaClientKnownRequestError) {
        if (e.code === "P2002") return res.status(409).json({ error: "email_in_use" });
        if (e.code === "P2025") return res.status(404).json({ error: "not_found" });
      }
      throw e;
    }
  }
);


/**
 * DELETE /customers/:id
 * - Prevent deleting customers who have orders (realistic constraint)
 */
customersRouter.delete("/:id", validate(idParamsSchema, "params"), async (req, res) => {
  const { id } = (req as any).validated_params as { id: string };

  const hasOrders = await prisma.order.count({ where: { customerId: id } });
  if (hasOrders > 0) {
    return res.status(409).json({ error: "has_orders" });
  }

  try {
    await prisma.customer.delete({ where: { id } });
    return res.status(204).end();
  } catch (e) {
    if ((e as any).code === "P2025") return res.status(404).json({ error: "not_found" });
    throw e;
  }
});
