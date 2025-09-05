import { Router } from "express";
import { prisma } from "../db.js";
import { validate } from "../middleware/validate.js";
import { orderQuerySchema, orderCreateSchema, orderUpdateSchema, idParamsSchema } from "../schemas/order.schema.js";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import type { Prisma } from "@prisma/client";


export const ordersRouter = Router();

/**
 * GET /orders
 * Filters: status, channel, dateFrom, dateTo
 * Pagination + count + _count.items
 */
ordersRouter.get("/", validate(orderQuerySchema, "query"), async (req, res) => {
  const { page, pageSize, status, channel, dateFrom, dateTo, sort, dir } = (req as any).validated_query;
  const skip = (page - 1) * pageSize;

  const where: any = {};
  if (status) where.status = status;
  if (channel) where.channel = channel;
  if (dateFrom || dateTo) {
    where.orderDate = {};
    if (dateFrom) where.orderDate.gte = dateFrom;
    if (dateTo) where.orderDate.lte = dateTo;
  }

  const [items, total] = await Promise.all([
    prisma.order.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { [sort]: dir },
      select: {
        id: true,
        customerId: true,
        orderDate: true,
        channel: true,
        status: true,
        totalCents: true,
        _count: { select: { items: true } },
        customer: { select: { name: true, email: true } }
      }
    }),
    prisma.order.count({ where })
  ]);

  res.json({ data: items, page, pageSize, total });
});

/**
 * GET /orders/:id
 * Includes items with product details and customer summary
 */
ordersRouter.get("/:id", validate(idParamsSchema, "params"), async (req, res) => {
  const { id } = (req as any).validated_params as { id: string };

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true, email: true, country: true } },
      items: {
        select: {
          productId: true, qty: true, unitPriceCents: true,
          product: { select: { title: true, sku: true, category: true } }
        }
      }
    }
  });

  if (!order) return res.status(404).json({ error: "not_found" });
  res.json(order);
});

/**
 * POST /orders
 * - Transactional create with items
 * - Auto-fill unitPriceCents from product if omitted
 * - Compute totalCents
 */
ordersRouter.post("/", validate(orderCreateSchema), async (req, res) => {
  try {
    const { customerId, channel, status, orderDate, items } = (req as any).validated_body;

    // Load product prices for any items missing unitPriceCents
    const productIds: string[] = Array.from(new Set(items.map((i: any) => i.productId)));
    const products: Array<{ id: string; priceCents: number }> =
    await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, priceCents: true },
    });

    const priceMap: Map<string, number> = new Map(
    products.map((p: { id: string; priceCents: number }) => [p.id, p.priceCents])
);


    // Guard: ensure all productIds exist
    if (products.length !== productIds.length) {
      return res.status(400).json({ error: "product_not_found" });
    }

    // Build normalized items with resolved prices
    type Item = { productId: string; qty: number; unitPriceCents: number };
    const normalizedItems: Item[] = [];
    for (const it of items as Array<{ productId: string; qty: number; unitPriceCents?: number }>) {
      const price = typeof it.unitPriceCents === "number" ? it.unitPriceCents : priceMap.get(it.productId);
      if (typeof price !== "number") {
        return res.status(400).json({ error: "price_missing", productId: it.productId });
      }
      normalizedItems.push({ productId: it.productId, qty: it.qty, unitPriceCents: price });
    }

    const total = normalizedItems.reduce((s, it) => s + it.qty * it.unitPriceCents, 0);

    // Transactional create
    const created = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const order = await tx.order.create({
        data: {
        customerId,
        channel,
        status,
        orderDate: orderDate ?? new Date(),
        totalCents: total,
        items: { create: normalizedItems },
        },
        include: { _count: { select: { items: true } } },
    });
    return order;
    });


    return res.status(201).json(created);
  } catch (e: unknown) {
    if (e instanceof PrismaClientKnownRequestError) {
      if (e.code === "P2003") return res.status(400).json({ error: "fk_violation" }); // bad customerId or productId
    }
    console.error("POST /orders error:", e);
    const status = (e as any)?.status ?? 500;
    const code = (e as any)?.code ?? "server_error";
    return res.status(status).json({ error: code });
  }
});


/**
 * PATCH /orders/:id
 * Update status/channel
 */
ordersRouter.patch("/:id", validate(idParamsSchema, "params"), validate(orderUpdateSchema), async (req, res) => {
  const { id } = (req as any).validated_params as { id: string };
  const data = (req as any).validated_body;

  try {
    const updated = await prisma.order.update({ where: { id }, data });
    res.json(updated);
  } catch (e: unknown) {
    if (e instanceof PrismaClientKnownRequestError && e.code === "P2025") {
      return res.status(404).json({ error: "not_found" });
    }
    throw e;
  }
});

/**
 * DELETE /orders/:id
 * Only when status === 'pending'
 */
ordersRouter.delete("/:id", validate(idParamsSchema, "params"), async (req, res) => {
  const { id } = (req as any).validated_params as { id: string };

  const ord = await prisma.order.findUnique({ where: { id }, select: { status: true } });
  if (!ord) return res.status(404).json({ error: "not_found" });
  if (ord.status !== "pending") return res.status(409).json({ error: "not_deletable" });

  await prisma.order.delete({ where: { id } });
  res.status(204).end();
});
