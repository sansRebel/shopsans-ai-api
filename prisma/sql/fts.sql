-- TICKETS: subject + body
ALTER TABLE "Ticket"
  ADD COLUMN IF NOT EXISTS "searchvec" tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(subject,'') || ' ' || coalesce(body,''))
  ) STORED;

CREATE INDEX IF NOT EXISTS "Ticket_search_idx"
  ON "Ticket" USING GIN ("searchvec");

-- PRODUCTS: title + category
ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "searchvec" tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(title,'') || ' ' || coalesce(category,''))
  ) STORED;

CREATE INDEX IF NOT EXISTS "Product_search_idx"
  ON "Product" USING GIN ("searchvec");

-- CUSTOMERS: name + email
ALTER TABLE "Customer"
  ADD COLUMN IF NOT EXISTS "searchvec" tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(name,'') || ' ' || coalesce(email,''))
  ) STORED;

CREATE INDEX IF NOT EXISTS "Customer_search_idx"
  ON "Customer" USING GIN ("searchvec");
