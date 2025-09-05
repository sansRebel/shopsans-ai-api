import { z } from "zod";

export const pageQuerySchema = z.object({
  q: z.string().trim().optional(),                    // full-text search query
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  sort: z.enum(["createdAt", "name"]).default("createdAt"),
  dir: z.enum(["asc", "desc"]).default("desc")
});

export type PageQuery = z.infer<typeof pageQuerySchema>;
export const offsetFor = (page: number, size: number) => (page - 1) * size;
