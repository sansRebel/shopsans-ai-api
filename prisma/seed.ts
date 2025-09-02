import { PrismaClient } from "@prisma/client";
import { faker } from "@faker-js/faker";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Tune these if you want more/less data
const N_CUSTOMERS = Number(process.env.SEED_CUSTOMERS ?? 5000);
const N_PRODUCTS  = Number(process.env.SEED_PRODUCTS  ?? 1200);
const N_ORDERS    = Number(process.env.SEED_ORDERS    ?? 20000);
const MAX_ITEMS_PER_ORDER = 4;

const CHANNELS = ["web", "mobile", "store", "marketplace"];
const STATUSES = ["pending", "paid", "shipped", "delivered", "cancelled"];
const PRIORITY = ["low", "normal", "high", "urgent"];

function chunk<T>(arr: T[], size = 1000): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function pickDistinct<T>(arr: T[], count: number): T[] {
  const out = new Set<T>();
  const need = Math.min(count, arr.length);
  while (out.size < need) {
    const idx = Math.floor(Math.random() * arr.length);
    out.add(arr[idx]);
  }
  return Array.from(out);
}


async function main() {
  console.time("seed");

  // Admin user
  const adminEmail = "admin@demo.com";
  const adminPass  = "admin123";
  const passwordHash = bcrypt.hashSync(adminPass, 10);

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: { email: adminEmail, passwordHash, role: "ADMIN" }
  });

// ...top of file stays the same

// Customers — ensure unique emails when present
console.log(`Seeding ${N_CUSTOMERS} customers...`);
const customers = Array.from({ length: N_CUSTOMERS }).map((_, i) => {
  // ~85% get a unique email, rest null
  const makeEmail = Math.random() < 0.85;
  const email = makeEmail ? `customer${i}@example.com` : null; // guaranteed unique when present
  return {
    id: faker.string.uuid(),
    name: faker.person.fullName(),
    email,
    country: faker.location.countryCode(),
    createdAt: faker.date.past({ years: 2 }),
  };
});
for (const c of chunk(customers, 2000)) {
  await prisma.customer.createMany({ data: c, skipDuplicates: true });
}

// Products — ensure unique sku
console.log(`Seeding ${N_PRODUCTS} products...`);
const products = Array.from({ length: N_PRODUCTS }).map((_, i) => ({
  id: faker.string.uuid(),
  sku: `SKU-${i}-${faker.string.alphanumeric(6).toUpperCase()}`, // unique
  title: faker.commerce.productName(),
  category: faker.commerce.department(),
  priceCents: Math.round(Number(faker.commerce.price({ min: 5, max: 500 })) * 100),
  createdAt: faker.date.past({ years: 2 }),
}));
for (const p of chunk(products, 2000)) {
  await prisma.product.createMany({ data: p, skipDuplicates: true });
}

// IMPORTANT: get IDs from the DB (only persisted rows)
// Fetch IDs from DB (already persisted)
const dbCustomers = await prisma.customer.findMany({ select: { id: true } });
const dbProducts  = await prisma.product.findMany({ select: { id: true, priceCents: true } });

const customerIds: string[] = dbCustomers.map(c => c.id);
const productIds: string[]  = dbProducts.map(p => p.id);
const priceById: Map<string, number> = new Map(dbProducts.map(p => [p.id, p.priceCents]));

type ItemTuple = { productId: string; qty: number; unitPriceCents: number };

console.log(`Seeding ${N_ORDERS} orders + items...`);
const ordersBatchSize = 4000;

for (let start = 0; start < N_ORDERS; start += ordersBatchSize) {
  const end = Math.min(start + ordersBatchSize, N_ORDERS);

  const batchOrders = Array.from({ length: end - start }).map(() => {
    const orderDate = faker.date.between({
      from: faker.date.recent({ days: 540 }),
      to: new Date(),
    });
    const status = faker.helpers.arrayElement(STATUSES);
    const channel = faker.helpers.arrayElement(CHANNELS);
    const itemsCount = faker.number.int({ min: 1, max: MAX_ITEMS_PER_ORDER });

    // pick distinct product IDs (typed as string[])
    const picked: string[] = pickDistinct(productIds, itemsCount);

    // build typed items with a proper price lookup
    const itemTuples: ItemTuple[] = picked.map((pid: string) => {
      const price = priceById.get(pid);
      if (price === undefined) throw new Error(`Missing price for product ${pid}`);
      const qty = faker.number.int({ min: 1, max: 4 });
      return { productId: pid, qty, unitPriceCents: price };
    });

    const total: number = itemTuples.reduce((sum, it) => sum + it.qty * it.unitPriceCents, 0);

    // choose a customer ID from the typed array
    const customerId: string = faker.helpers.arrayElement<string>(customerIds);

    return {
      order: {
        id: faker.string.uuid(),
        customerId,
        orderDate,
        channel,
        status,
        totalCents: total,
      },
      items: itemTuples,
    };
  });

  await prisma.order.createMany({
    data: batchOrders.map((b) => b.order),
    skipDuplicates: true,
  });

  const orderItemsRows = batchOrders.flatMap((b) =>
    b.items.map((it) => ({
      orderId: b.order.id,
      productId: it.productId,
      qty: it.qty,
      unitPriceCents: it.unitPriceCents,
    })),
  );

  for (const oi of chunk(orderItemsRows, 5000)) {
    await prisma.orderItem.createMany({ data: oi, skipDuplicates: true });
  }
}



  console.timeEnd("seed");
  console.log("Admin login:", adminEmail, "(password:", adminPass + ")");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
