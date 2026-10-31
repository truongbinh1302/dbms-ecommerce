# BinhTinhStore — E-commerce Database Management System

BinhTinhStore is a full-stack academic project that explores how an e-commerce
application can use both a relational database and a document database. The
application combines a React storefront and admin interface with an Express API,
SQL Server for transactional business data, and MongoDB for document-oriented
features and DBMS demonstrations.

> **Project context:** This was developed as a team project for a Database
> Management Systems course. My primary contribution focused on **transaction
> processing and the Order API**, including order creation, inventory updates,
> cancellation flows, and rollback behavior.

## Highlights

- Full customer flow: authentication, product browsing, cart, checkout, order
  history, cancellation, reviews, vouchers, and VNPay sandbox integration.
- Admin workflows for product, image, order, user, and analytics management.
- SQL Server transactions for order creation and cancellation.
- Row-level locking with `UPDLOCK` and `ROWLOCK` to protect inventory during
  concurrent orders.
- `COMMIT`/`ROLLBACK` handling to preserve consistency when a multi-step order
  operation fails.
- MongoDB models and scripts demonstrating indexing, query processing,
  transactions, concurrency control, backup, and recovery concepts.
- Reproducible local database environment using Docker Compose.

## Architecture

```text
React + Vite client
        │
        │ REST API / JWT
        ▼
Node.js + Express server
        ├── SQL Server: users, products, inventory, orders, vouchers
        └── MongoDB: reviews, product logs, and DBMS demonstrations
```

### Repository structure

```text
.
├── backend-app/       # Express API, authentication, services, routes
├── frontend-app/      # React + Vite customer and admin interfaces
├── database/          # SQL Server migrations and seed data
├── database-demo/     # SQL Server and MongoDB DBMS demonstrations
├── dbms-env/          # Docker Compose services
└── docs/              # ERD and schema documentation
```

## Database design

### SQL Server ERD

![SQL Server entity-relationship diagram](docs/sql_server_erd.png)

The relational model covers users, categories, products, orders, order items,
vouchers, and voucher usage. Migration scripts live in
[`database/migrations`](database/migrations).

### MongoDB schema

![MongoDB schema](docs/mongoDb_schema.png)

MongoDB is used for product logs and reviews, with additional scripts under
[`database-demo/mongo_db_demo`](database-demo/mongo_db_demo) to demonstrate
indexing, query processing, transactions, and concurrency behavior.

## Money handling

- Shipping fee, automatic discounts and voucher discounts are computed only on the
  server (`backend-app/src/services/pricing.service.js`). Any `discount`,
  `shippingFee` or `total` sent by the client is ignored.
- Vouchers are locked with `UPDLOCK` and recorded in `VoucherUsages` inside the
  same transaction as the order, so a voucher's last use cannot be taken twice.
- VNPay IPN checks the signature, compares `vnp_Amount` with the order total and
  ignores repeated callbacks. A failed payment or an unpaid order older than
  `PAYMENT_EXPIRE_MINUTES` is cancelled and its stock and voucher use are released.
- The VNPay return page only displays the stored status in production. In
  development it records the result with the same logic as the IPN, because the
  sandbox cannot call an IPN URL on `localhost` (`VNPAY_UPDATE_ON_RETURN`).

## Transaction processing

The order service treats checkout as one atomic unit of work:

1. Validate the customer and normalize the requested items.
2. Lock and read each product row before checking stock.
3. Create the order and order-item records.
4. Decrease inventory for every purchased item.
5. Commit only after every step succeeds; otherwise roll back the transaction.

Order cancellation follows the same principle: it locks the order, restores
inventory, updates the status, and commits as one transaction. See
[`backend-app/src/services/order.service.js`](backend-app/src/services/order.service.js)
for the implementation.

## Tech stack

| Layer | Technologies |
| --- | --- |
| Frontend | React 19, Vite, JavaScript, Tailwind CSS |
| Backend | Node.js, Express.js, REST APIs |
| Relational database | SQL Server, `mssql` |
| Document database | MongoDB, Mongoose |
| Authentication and security | JWT, bcrypt, Helmet, rate limiting |
| Tooling | Docker Compose, npm, ESLint |

## Getting started

### Prerequisites

- Node.js 18 or later
- npm 9 or later
- Docker Desktop with Docker Compose

### 1. Configure the environment

Copy the example configuration files:

```bash
cp backend-app/.env.example backend-app/.env
cp frontend-app/.env.example frontend-app/.env
```

On Windows PowerShell:

```powershell
Copy-Item backend-app\.env.example backend-app\.env
Copy-Item frontend-app\.env.example frontend-app\.env
```

The checked-in values are local development examples only. Change the database
passwords and JWT secrets before using the application outside an isolated local
environment. Real VNPay credentials must stay in `backend-app/.env`, which is
ignored by Git.

### 2. Start the databases

```bash
cd dbms-env
docker compose up -d
cd ..
```

Wait for both `sqlserver_dbms` and `mongodb_dbms` to report as healthy.

### 3. Install dependencies

```bash
cd backend-app
npm install
cd ../frontend-app
npm install
cd ..
```

### 4. Create and seed the SQL Server database

```bash
cd backend-app
node run-migration.js
node run-seed.js
node fix-password.js
cd ..
```

### 5. Run the application

In one terminal:

```bash
cd backend-app
npm run dev
```

In another terminal:

```bash
cd frontend-app
npm run dev
```

Open `http://localhost:5173`. The API health check is available at
`http://localhost:3000/health`.

## Demo accounts

After seeding the local database:

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@btstore.local` | `password` |
| Customer | `customer@btstore.local` | `password` |

These accounts are synthetic test data and must not be used in production.

## API overview

The API is mounted under `/api/v1` and includes:

- `/auth` — registration, login, token refresh
- `/users` — profile and user management
- `/categories` — category operations
- `/products` — catalog and product management
- `/cart` — cart validation and server-side price quote (`POST /cart/quote`)
- `/orders` — checkout, order history, status, cancellation
- `/payments` — VNPay sandbox flow
- `/reviews` — product reviews
- `/vouchers` — voucher validation and management
- `/analytics` — admin analytics

Detailed request and response examples are documented in
[`backend-app/API_SPEC.md`](backend-app/API_SPEC.md).

## DBMS demonstrations

The [`database-demo`](database-demo) directory contains focused examples for
both SQL Server and MongoDB:

- schema creation and seed data;
- query processing and execution plans;
- indexing;
- transactions and rollback;
- concurrency control;
- backup and recovery.

## Validation

Useful local checks:

```bash
# Backend unit tests (Node's built-in test runner, no database needed)
cd backend-app
npm test

# Backend integration tests against the Docker SQL Server
# (start dbms-env and run the migration + seed steps first)
npm run test:db

# Backend JavaScript syntax
node --check src/app.js

# Frontend lint and production build
cd ../frontend-app
npm run lint
npm run build
```

## Security notes

- Real `.env` files, logs, uploaded files, database files, and build output are
  excluded from version control.
- Credentials in `.env.example`, Docker Compose, seed files, and this README are
  intentionally local demo values—not live secrets.
- Replace all example passwords and JWT secrets before deployment.
- VNPay credentials are not included in this repository.

## License

This repository is shared as an academic portfolio project. No open-source
license is granted unless one is added explicitly.
