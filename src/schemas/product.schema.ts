import { z } from "zod";

export const productCreateSchema = z.object({
  sku: z.string().min(1),
  title: z.string().min(1),
  category: z.string().min(1).optional().nullable(),
  priceCents: z.coerce.number().int().nonnegative()
});

export const productUpdateSchema = productCreateSchema.partial();

export const idParamsSchema = z.object({
  id: z.string().min(1)
});
