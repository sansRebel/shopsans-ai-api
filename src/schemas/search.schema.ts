import { z } from "zod";

export const searchQuerySchema = z.object({
  type: z.enum(["customers", "products", "tickets"]),
  q: z.string().min(1),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(10),
  highlight: z.coerce.boolean().optional().default(false),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;
