import { z } from "zod";

export const customerCreateSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().nullable().optional(),
  country: z.string().min(2).max(64).nullable().optional()
});

export const customerUpdateSchema = customerCreateSchema.partial();

export const idParamsSchema = z.object({
  id: z.string().min(1)
});
