import { z } from "zod";

export const rangeSchema = z.object({
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  topN: z.coerce.number().int().positive().max(50).default(10),
});

export type RangeQuery = z.infer<typeof rangeSchema>;
