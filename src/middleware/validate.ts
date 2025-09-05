import type { AnyZodObject } from "zod";

export function validate<T extends AnyZodObject>(schema: T, source: "body"|"query"|"params" = "body") {
  return (req: any, res: any, next: any) => {
    const parsed = schema.safeParse(req[source]);
    if (!parsed.success) {
      return res.status(400).json({ error: "validation_error", details: parsed.error.flatten() });
    }
    req[`validated_${source}`] = parsed.data;
    next();
  };
}
