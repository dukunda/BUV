# BUVIMIMA Business Management System

## Architecture

- **Web client:** React + TypeScript + Vite.
- **Local API:** Node.js + Express. The API enforces authentication and owner permissions; the client does not grant access by hiding menu items.
- **Local database:** SQLite via sql.js, persisted in `web/data/buvimima.sqlite`. This avoids requiring PHP, Composer, MySQL, or native build tools on the current Windows development machine.
- **Production direction:** move the same relational model to MySQL and deploy the API behind HTTPS. Production still needs environment-managed secrets, encrypted scheduled backups, restricted uploads, and tested restore procedures.

### Phase 1 relationship model

`companies → business_units → locations` is a self-referential hierarchy that supports future units and sites. Users receive roles; roles grant permissions; user-location assignments scope data access. Employee profiles attach to users and an assigned unit/location. Products belong to company-wide categories and have per-location prices. Foreign keys, unique keys, and indexes enforce identity and scope.

### Phased delivery

1. Foundation: schema, authentication, authorization, hierarchy, employees, products and categories.
2. Wholesale: inventory ledger, counts, receiving, POS, reconciliation and shortage approvals.
3. Restaurant: kitchen/drinks permissions, recipes, orders, preparation and payment workflow.
4. Finance/HR: expenses, cash, accounting reports, payroll, bonuses and transfers.
5. Reporting: owner dashboard, alerts, search, audit and exports; backup/recovery documentation.
6. Verification/deployment: workflow and permission checks, security review, production configuration and user guide.

Each phase is delivered as a runnable increment. Monetary discrepancies never create payroll deductions automatically. Inventory changes will be recorded as movements, never direct balance edits. POS and reconciliation sales will be separated to prevent double counting.

## Local development

From `web/`, install Node dependencies with `npm install`, then run `npm run dev`. This starts the API on `127.0.0.1:3001` and the web client on `127.0.0.1:5173`. On first launch, create the owner account; setup creates Wholesale Main Shop, Wholesale Branch, Corner Vista Restaurant, and its Kitchen and Drinks sub-units. The owner can then add units, change their sales mode, rename, deactivate, or reactivate them. The database file is local and is excluded from source control.

## Implementation status

The local increment includes owner first-run setup and login, a persisted company hierarchy, business-unit create/rename/activate controls, branch sales-mode configuration, employee account creation with unit assignment, category and product creation, and per-unit product prices. The API scopes employee unit lists to assigned units and descendants and protects owner-only changes server-side. It writes an append-only audit record for company setup and these administrative changes.

Inventory ledger/count workflows, purchases and goods receipts, POS and sales reconciliation, restaurant orders/payments/recipes, expenses/cash/payroll, alerts, exports, production MySQL deployment, backups, and acceptance/security review are still outstanding. The site is an active development increment, not yet ready for live financial operations.
