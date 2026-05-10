# Inventory Management System

> A **production-grade** inventory management system for wholesale and retail shops, built with Node.js, TypeScript, Express, and Prisma ORM. Designed as a portfolio-quality, interview-ready project with real business logic.

---

## 🗺️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Client (POS / Web)                   │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS REST API
┌──────────────────────────▼──────────────────────────────────┐
│                    Express Application                        │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐   │
│  │  Rate Limiter│  │ Helmet/CORS  │  │ Morgan (HTTP logs) │  │
│  └─────────────┘  └──────────────┘  └───────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐    │
│  │                   Route Modules                       │    │
│  │  auth │ users │ categories │ suppliers │ customers   │    │
│  │  products │ inventory │ purchases │ sales │ reports  │    │
│  │  barcodes                                            │    │
│  └──────────────────────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────────────────┐    │
│  │              Middleware Stack                         │    │
│  │  authenticate → authorize (RBAC) → validate (Zod)   │    │
│  │  auditLog → errorHandler                             │    │
│  └──────────────────────────────────────────────────────┘    │
└──────────────────────────┬──────────────────────────────────┘
                           │ Prisma ORM
┌──────────────────────────▼──────────────────────────────────┐
│                      PostgreSQL Database                      │
│  users │ refresh_tokens │ categories │ suppliers │ customers │
│  products │ inventory │ stock_movements │ stock_adjustments  │
│  cost_price_history │ selling_price_history                  │
│  purchase_orders │ purchase_order_items │ purchase_payments  │
│  sale_orders │ sale_order_items │ sale_payments │ sale_returns│
│  audit_logs                                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 🧩 Features

| Module | Feature |
|--------|---------|
| **Auth** | JWT access + refresh tokens, bcrypt, role-based access control (6 roles), token rotation, rate limiting |
| **Users** | Admin user management, role assignment, activity tracking |
| **Categories** | Hierarchical categories (parent/child), soft delete |
| **Suppliers** | Supplier management with purchase history |
| **Customers** | Retail & wholesale customers, credit limits, outstanding debt tracking |
| **Products** | Full CRUD, auto barcode generation (Code128), cost/retail/wholesale pricing |
| **Inventory** | Real-time stock tracking, manual adjustments with approval trail |
| **Stock Movements** | Immutable audit log of every stock change (purchase, sale, adjustment, transfer, return) |
| **Price History** | Cost price history and selling price fluctuation — never overwritten |
| **Purchases** | Purchase orders, partial receiving, supplier payment tracking |
| **Sales** | Retail + wholesale pricing logic, partial returns, customer debt management |
| **Barcodes** | Barcode generation (PNG, base64) and barcode/SKU scanner search endpoint |
| **Reports** | Dashboard KPIs, sales report (by day/month/product/customer), P&L, inventory value |
| **Audit Logs** | Immutable log of all sensitive actions with before/after values |

---

## 🔑 Role-Based Access Control (RBAC)

| Role | Access Level |
|------|-------------|
| `SUPER_ADMIN` | Full access — can create admin accounts |
| `ADMIN` | Full access to all modules |
| `MANAGER` | Products, inventory, purchases, sales, reports |
| `CASHIER` | Sales, customers, barcode search |
| `WAREHOUSE_STAFF` | Inventory, purchases (receive goods) |
| `VIEWER` | Read-only access |

---

## 🗄️ Database Design

### Key Design Decisions

1. **Stock movements are immutable** — every quantity change creates a new `stock_movements` record with `qty_before` and `qty_after`. The `inventory` table is the current state; movements are the history.

2. **Price history is append-only** — `cost_price_history` and `selling_price_history` tables record every change. Product cost/price fields reflect the *current* price; history tables are for audit/analysis.

3. **Soft deletes** — Products, categories, suppliers, and customers are never physically deleted. `is_active = false` preserves historical referential integrity.

4. **Transactions everywhere** — Any operation that changes both stock and financial data uses `prisma.$transaction()` to ensure atomicity.

5. **Audit logs are fire-and-forget** — Audit log writes never block the response path and swallow write errors silently, so a logging failure never breaks a business operation.

### Entity Relationships

```
Category (self-referential hierarchy)
  └── Product
        ├── Inventory (1:1, current stock)
        ├── StockMovement (1:N, immutable history)
        ├── CostPriceHistory (1:N)
        ├── SellingPriceHistory (1:N)
        ├── PurchaseOrderItem
        └── SaleOrderItem

Supplier
  ├── Product
  └── PurchaseOrder
        ├── PurchaseOrderItem
        └── PurchasePayment

Customer
  └── SaleOrder
        ├── SaleOrderItem
        ├── SalePayment
        └── SaleReturn
              └── SaleReturnItem

User
  ├── RefreshToken
  ├── AuditLog
  ├── StockMovement (created_by)
  ├── PurchaseOrder (created_by)
  └── SaleOrder (created_by)
```

---

## 📡 API Endpoints

### Authentication (`/api/auth`)
```
POST   /api/auth/register          Register new user
POST   /api/auth/login             Login (returns access + refresh token)
POST   /api/auth/refresh           Refresh access token
POST   /api/auth/logout            Logout (revokes refresh token)
GET    /api/auth/profile           Get current user profile
PATCH  /api/auth/change-password   Change password
```

### Users (`/api/users`) — Admin only
```
GET    /api/users                  List all users
GET    /api/users/:id              Get user details
PATCH  /api/users/:id             Update user (role, status)
```

### Categories (`/api/categories`)
```
GET    /api/categories             List categories (tree structure)
GET    /api/categories/:id         Get category with children
POST   /api/categories             Create category [Manager+]
PATCH  /api/categories/:id         Update category [Manager+]
DELETE /api/categories/:id         Soft-delete category [Manager+]
```

### Suppliers (`/api/suppliers`)
```
GET    /api/suppliers              List suppliers (paginated, searchable)
GET    /api/suppliers/:id          Get supplier details
POST   /api/suppliers              Create supplier [Manager+]
PATCH  /api/suppliers/:id          Update supplier [Manager+]
DELETE /api/suppliers/:id          Soft-delete supplier [Manager+]
```

### Customers (`/api/customers`)
```
GET    /api/customers              List customers (paginated, filter by type)
GET    /api/customers/:id          Get customer details
GET    /api/customers/:id/statement  Customer statement with sales history
POST   /api/customers              Create customer
PATCH  /api/customers/:id          Update customer
DELETE /api/customers/:id          Soft-delete [Manager+]
```

### Products (`/api/products`)
```
GET    /api/products               List products (search, filter, paginated)
GET    /api/products/low-stock     Products at or below reorder level
GET    /api/products/barcode/:code Lookup by barcode
GET    /api/products/:id           Get product with price history
GET    /api/products/:id/barcode-image  Get barcode PNG (base64)
POST   /api/products               Create product (auto-generates barcode) [Manager+]
PATCH  /api/products/:id           Update product details/prices [Manager+]
PATCH  /api/products/:id/cost-price  Update cost price (logged) [Manager+]
```

### Inventory (`/api/inventory`)
```
GET    /api/inventory/overview     Dashboard inventory KPIs
GET    /api/inventory/movements    Stock movement log (paginated, filterable)
GET    /api/inventory/product/:id  Current stock for a product
POST   /api/inventory/adjust       Manual stock adjustment [Manager+]
```

### Purchases (`/api/purchases`)
```
GET    /api/purchases              List purchase orders (status, supplier filter)
GET    /api/purchases/:id          Get PO with items and payments
POST   /api/purchases              Create purchase order [Manager+]
POST   /api/purchases/:id/receive  Receive goods (partial/full) [Manager+]
POST   /api/purchases/:id/payments Record payment to supplier [Manager+]
POST   /api/purchases/:id/cancel   Cancel PO [Manager+]
```

### Sales (`/api/sales`)
```
GET    /api/sales                  List sale orders (date range, status filter)
GET    /api/sales/:id              Get sale with items, payments, returns
POST   /api/sales                  Create sale (auto-selects retail/wholesale price)
POST   /api/sales/:id/payments     Record payment from customer
POST   /api/sales/:id/returns      Process return [Manager+]
```

### Barcodes (`/api/barcodes`)
```
GET    /api/barcodes/search?q=     Search product by barcode or SKU (POS scanner)
GET    /api/barcodes/generate/:val Generate barcode image for any value
```

### Reports (`/api/reports`)
```
GET    /api/reports/dashboard      KPI dashboard (today/month sales, stock alerts)
GET    /api/reports/sales          Sales report (groupBy: day|month|product|customer) [Manager+]
GET    /api/reports/profit         Profit & Loss report [Manager+]
GET    /api/reports/inventory-value  Inventory value by category [Manager+]
GET    /api/reports/audit-logs     Audit log viewer [Admin+]
```

---

## 🛡️ Security

- **Helmet.js** — Sets security HTTP headers (XSS protection, HSTS, etc.)
- **CORS** — Configurable origin whitelist
- **Rate limiting** — Global API limit + stricter limits on auth endpoints
- **JWT** — Short-lived access tokens (15m) + rotating refresh tokens (7d)
- **bcrypt** — Password hashing with configurable rounds (default: 12)
- **RBAC** — Every endpoint enforces role-based access
- **Audit logging** — Sensitive actions recorded with IP, user agent, before/after values
- **Prisma parameterized queries** — SQL injection prevention built-in
- **Input validation** — All inputs validated with Zod schemas before touching business logic
- **Soft deletes** — No cascading deletes that could corrupt historical data

---

## 🏗️ Project Structure

```
src/
├── app.ts                    # Entry point — bootstrap server
├── server.ts                 # Express app factory
├── config/
│   ├── index.ts              # Environment configuration
│   └── database.ts           # Prisma client singleton
├── middleware/
│   ├── auth.ts               # JWT authentication + RBAC
│   ├── auditLog.ts           # Audit logging middleware + service
│   ├── errorHandler.ts       # Centralized error handling (AppError)
│   └── validate.ts           # Zod validation middleware factory
├── modules/
│   ├── auth/                 # Authentication (register, login, refresh, logout)
│   ├── users/                # User management (admin)
│   ├── categories/           # Category CRUD with hierarchy
│   ├── suppliers/            # Supplier management
│   ├── customers/            # Customer management + statement
│   ├── products/             # Product CRUD + barcode + price history
│   ├── inventory/            # Stock tracking + manual adjustments
│   ├── purchases/            # Purchase orders + receiving + payments
│   ├── sales/                # Sales orders + payments + returns
│   ├── barcodes/             # Barcode generation + scanner search
│   └── reports/              # Dashboard + sales + P&L + inventory reports
├── utils/
│   ├── logger.ts             # Winston logger
│   └── response.ts           # Standardized API response helpers
└── __tests__/                # Jest unit tests
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js ≥ 18
- PostgreSQL ≥ 14

### Installation

```bash
# 1. Clone the repository
git clone <repo-url>
cd inventory-management-system

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env with your database URL and JWT secrets

# 4. Generate Prisma client
npm run prisma:generate

# 5. Run database migrations
npm run prisma:migrate

# 6. Seed the database
npm run prisma:seed

# 7. Start development server
npm run dev
```

### Default Seed Accounts

| Role | Email | Password |
|------|-------|----------|
| SUPER_ADMIN | superadmin@inventory.com | Admin@123 |
| MANAGER | manager@inventory.com | Admin@123 |
| CASHIER | cashier@inventory.com | Admin@123 |

---

## 🧪 Testing

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
```

Tests cover:
- API health check
- Response utility helpers
- Zod validation schemas (auth, products, sales, inventory)
- Barcode generation utilities
- AppError class

---

## 💡 Business Logic Highlights

### Retail vs Wholesale Pricing
When creating a sale, the system automatically selects the correct price:
```
if customer is WHOLESALE AND quantity >= product.wholesaleMinQty:
    price = product.wholesalePrice
else:
    price = product.retailPrice
```

### Stock Movement Integrity
- Every stock change calls `recordStockMovement()` inside a transaction
- Records `qty_before` and `qty_after` for full traceability
- Prevents negative stock — throws `AppError` if insufficient

### Purchase Receiving & Cost Updates
When goods are received:
1. Stock is incremented for each item
2. If the purchase unit cost differs from the product's current cost, cost price is automatically updated and a `CostPriceHistory` record is created

### Refresh Token Rotation
On every token refresh:
1. Old refresh token is revoked
2. New access + refresh token pair is issued
This prevents token reuse attacks.

---

## 📊 Performance Considerations

- **Indexed columns**: `product_id`, `created_at`, `reference_type/id`, `customer_id`, `sale_date`
- **Raw SQL for aggregate reports** — bypasses Prisma's ORM overhead for reporting queries
- **Pagination** on all list endpoints — never loads unbounded datasets
- **Prisma singleton** — prevents connection pool exhaustion in development hot-reload
- **Compression middleware** — gzip compression for all responses

---

## 🗂️ Key Design Patterns

| Pattern | Usage |
|---------|-------|
| Repository + Service | Business logic in `*.service.ts`, HTTP in `*.router.ts` |
| Factory function | `createApp()` for testable Express instance |
| Middleware composition | `authenticate → authorize → validate → handler` |
| Transaction script | Complex multi-table writes wrapped in `prisma.$transaction()` |
| Append-only log | `stock_movements`, `audit_logs`, `*_price_history` — never updated |
| Soft delete | `isActive` flag — preserve referential integrity for history |
| Fire-and-forget audit | Audit writes never block response; failures swallowed silently |

---

## 📜 License

MIT
