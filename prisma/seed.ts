import { PrismaClient, Role, CustomerType, StockMovementType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ─── Users ────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash('Admin@123', 12);

  const superAdmin = await prisma.user.upsert({
    where: { email: 'superadmin@inventory.com' },
    update: {},
    create: {
      email: 'superadmin@inventory.com',
      username: 'superadmin',
      passwordHash,
      firstName: 'Super',
      lastName: 'Admin',
      role: Role.SUPER_ADMIN,
    },
  });

  const manager = await prisma.user.upsert({
    where: { email: 'manager@inventory.com' },
    update: {},
    create: {
      email: 'manager@inventory.com',
      username: 'manager1',
      passwordHash,
      firstName: 'Jane',
      lastName: 'Manager',
      role: Role.MANAGER,
    },
  });

  const cashier = await prisma.user.upsert({
    where: { email: 'cashier@inventory.com' },
    update: {},
    create: {
      email: 'cashier@inventory.com',
      username: 'cashier1',
      passwordHash,
      firstName: 'John',
      lastName: 'Cashier',
      role: Role.CASHIER,
    },
  });

  console.log('✅ Users seeded');

  // ─── Categories ───────────────────────────────────────────────
  const electronics = await prisma.category.upsert({
    where: { slug: 'electronics' },
    update: {},
    create: { name: 'Electronics', slug: 'electronics', description: 'Electronic goods and accessories' },
  });

  const beverages = await prisma.category.upsert({
    where: { slug: 'beverages' },
    update: {},
    create: { name: 'Beverages', slug: 'beverages', description: 'Drinks and refreshments' },
  });

  const stationery = await prisma.category.upsert({
    where: { slug: 'stationery' },
    update: {},
    create: { name: 'Stationery', slug: 'stationery', description: 'Office and school supplies' },
  });

  console.log('✅ Categories seeded');

  // ─── Suppliers ────────────────────────────────────────────────
  const supplier1 = await prisma.supplier.upsert({
    where: { email: 'techsupplier@example.com' },
    update: {},
    create: {
      name: 'Tech Distributors Ltd',
      contactName: 'Alice Johnson',
      email: 'techsupplier@example.com',
      phone: '+1234567890',
      address: '123 Tech Park',
      city: 'Nairobi',
      country: 'Kenya',
    },
  });

  const supplier2 = await prisma.supplier.upsert({
    where: { email: 'drinkssupplier@example.com' },
    update: {},
    create: {
      name: 'Beverages Wholesale Co.',
      contactName: 'Bob Smith',
      email: 'drinkssupplier@example.com',
      phone: '+0987654321',
      address: '456 Beverage Ave',
      city: 'Mombasa',
      country: 'Kenya',
    },
  });

  console.log('✅ Suppliers seeded');

  // ─── Customers ────────────────────────────────────────────────
  await prisma.customer.upsert({
    where: { email: 'retail.customer@example.com' },
    update: {},
    create: {
      name: 'Mary Retail',
      email: 'retail.customer@example.com',
      phone: '+254700000001',
      customerType: CustomerType.RETAIL,
    },
  });

  await prisma.customer.upsert({
    where: { email: 'wholesale.customer@example.com' },
    update: {},
    create: {
      name: 'Wholesale Mart Ltd',
      email: 'wholesale.customer@example.com',
      phone: '+254700000002',
      customerType: CustomerType.WHOLESALE,
      creditLimit: 500000,
    },
  });

  console.log('✅ Customers seeded');

  // ─── Products ─────────────────────────────────────────────────
  const product1 = await prisma.product.upsert({
    where: { sku: 'ELEC-001' },
    update: {},
    create: {
      name: 'USB-C Hub 7-in-1',
      sku: 'ELEC-001',
      barcode: 'ELEC00139271',
      description: '7-port USB-C hub with HDMI, USB 3.0, SD card reader',
      categoryId: electronics.id,
      supplierId: supplier1.id,
      unit: 'piece',
      costPrice: 1500,
      retailPrice: 2500,
      wholesalePrice: 2000,
      wholesaleMinQty: 5,
      reorderLevel: 10,
      reorderQty: 50,
      taxRate: 16,
    },
  });

  const product2 = await prisma.product.upsert({
    where: { sku: 'BEV-001' },
    update: {},
    create: {
      name: 'Mineral Water 500ml',
      sku: 'BEV-001',
      barcode: 'BEV000139272',
      description: 'Natural mineral water, 500ml bottle',
      categoryId: beverages.id,
      supplierId: supplier2.id,
      unit: 'bottle',
      costPrice: 30,
      retailPrice: 60,
      wholesalePrice: 45,
      wholesaleMinQty: 24,
      reorderLevel: 100,
      reorderQty: 500,
      taxRate: 0,
    },
  });

  const product3 = await prisma.product.upsert({
    where: { sku: 'STAT-001' },
    update: {},
    create: {
      name: 'A4 Printing Paper (500 sheets)',
      sku: 'STAT-001',
      barcode: 'STAT00139273',
      description: '80gsm white A4 paper, ream of 500 sheets',
      categoryId: stationery.id,
      unit: 'ream',
      costPrice: 350,
      retailPrice: 550,
      wholesalePrice: 450,
      wholesaleMinQty: 10,
      reorderLevel: 20,
      reorderQty: 100,
      taxRate: 0,
    },
  });

  console.log('✅ Products seeded');

  // ─── Inventory ────────────────────────────────────────────────
  // Create inventory records for all products (if not exists)
  for (const product of [product1, product2, product3]) {
    const existing = await prisma.inventory.findUnique({ where: { productId: product.id } });
    if (!existing) {
      await prisma.inventory.create({ data: { productId: product.id } });
    }
  }

  // Add opening stock for each product
  const openingStocks = [
    { product: product1, qty: 50 },
    { product: product2, qty: 500 },
    { product: product3, qty: 200 },
  ];

  for (const { product, qty } of openingStocks) {
    const inv = await prisma.inventory.findUnique({ where: { productId: product.id } });
    if (inv && inv.quantityOnHand === 0) {
      await prisma.inventory.update({
        where: { productId: product.id },
        data: { quantityOnHand: qty },
      });

      await prisma.stockMovement.create({
        data: {
          productId: product.id,
          movementType: StockMovementType.OPENING_STOCK,
          quantity: qty,
          qtyBefore: 0,
          qtyAfter: qty,
          createdById: manager.id,
          notes: 'Opening stock entry',
        },
      });
    }
  }

  // ─── Cost Price History ───────────────────────────────────────
  for (const product of [product1, product2, product3]) {
    const exists = await prisma.costPriceHistory.findFirst({ where: { productId: product.id } });
    if (!exists) {
      await prisma.costPriceHistory.create({
        data: {
          productId: product.id,
          oldCost: 0,
          newCost: product.costPrice,
          changedById: superAdmin.id,
          reason: 'Initial cost on product creation',
        },
      });
    }
  }

  console.log('✅ Inventory and stock movements seeded');

  console.log('\n🎉 Database seeded successfully!\n');
  console.log('Default accounts (password: Admin@123):');
  console.log('  SUPER_ADMIN: superadmin@inventory.com');
  console.log('  MANAGER:     manager@inventory.com');
  console.log('  CASHIER:     cashier@inventory.com');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
