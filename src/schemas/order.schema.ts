import { z } from "zod";

export const OrderStatus = z.enum(["pending","paid","shipped","delivered","cancelled"]);
export const Channels = z.enum(["web","mobile","store","marketplace"]);

export const orderItemInputSchema = z.object({
  productId: z.string().min(1),
  qty: z.coerce.number().int().positive(),
  unitPriceCents: z.coerce.number().int().nonnegative().optional()
});

export const orderCreateSchema = z.object({
  customerId: z.string().min(1),
  channel: Channels,
  status: OrderStatus.default("pending"),
  orderDate: z.coerce.date().optional(),
  items: z.array(orderItemInputSchema).min(1)
});

export const orderUpdateSchema = z.object({
  status: OrderStatus.optional(),
  channel: Channels.optional()
});

export const orderQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  status: OrderStatus.optional(),
  channel: Channels.optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  sort: z.enum(["orderDate","totalCents"]).default("orderDate"),
  dir: z.enum(["asc","desc"]).default("desc")
});

export const idParamsSchema = z.object({
  id: z.string().min(1)
});
