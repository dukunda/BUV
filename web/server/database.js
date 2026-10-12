import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import initSqlJs from 'sql.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDirectory = path.resolve(here, '../data');
const databaseFile = path.join(dataDirectory, 'buvimima.sqlite');
fs.mkdirSync(dataDirectory, { recursive: true });

const SQL = await initSqlJs({ locateFile: (file) => path.join(path.dirname(fileURLToPath(import.meta.resolve('sql.js'))), file) });
const db = fs.existsSync(databaseFile) ? new SQL.Database(fs.readFileSync(databaseFile)) : new SQL.Database();
db.run('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'RWF',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS business_units (
    id INTEGER PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(id),
    parent_id INTEGER REFERENCES business_units(id),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('shop','restaurant','department')),
    sales_mode TEXT NOT NULL DEFAULT 'not_configured' CHECK(sales_mode IN ('not_configured','pos','stock_reconciliation','hybrid')),
    active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(id),
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('owner','administrator','employee')),
    active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS user_unit_access (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    business_unit_id INTEGER NOT NULL REFERENCES business_units(id) ON DELETE CASCADE,
    PRIMARY KEY(user_id, business_unit_id)
  );
  CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    position TEXT NOT NULL,
    contact TEXT,
    employment_date TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id INTEGER,
    details TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(company_id, name)
  );
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    sku TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    unit TEXT NOT NULL,
    purchase_cost_rwf INTEGER NOT NULL DEFAULT 0 CHECK(purchase_cost_rwf >= 0),
    minimum_stock REAL NOT NULL DEFAULT 0 CHECK(minimum_stock >= 0),
    expiry_tracked INTEGER NOT NULL DEFAULT 0 CHECK(expiry_tracked IN (0,1)),
    active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(company_id, sku)
  );
  CREATE TABLE IF NOT EXISTS location_product_prices (
    id INTEGER PRIMARY KEY,
    business_unit_id INTEGER NOT NULL REFERENCES business_units(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    selling_price_rwf INTEGER NOT NULL CHECK(selling_price_rwf >= 0),
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(business_unit_id, product_id)
  );
  CREATE INDEX IF NOT EXISTS idx_business_units_company_parent ON business_units(company_id, parent_id, active);
  CREATE INDEX IF NOT EXISTS idx_products_company_active ON products(company_id, active);
  CREATE INDEX IF NOT EXISTS idx_prices_unit ON location_product_prices(business_unit_id);
  CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);
  CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
`);

export function query(sql, params = []) {
  const statement = db.prepare(sql);
  try {
    statement.bind(params);
    const rows = [];
    while (statement.step()) rows.push(statement.getAsObject());
    return rows;
  } finally { statement.free(); }
}

export function execute(sql, params = []) {
  db.run(sql, params);
  return db.getRowsModified();
}

export function transaction(work) {
  db.run('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.run('COMMIT');
    persist();
    return result;
  } catch (error) {
    db.run('ROLLBACK');
    throw error;
  }
}

export function persist() {
  const temporary = `${databaseFile}.tmp`;
  fs.writeFileSync(temporary, Buffer.from(db.export()));
  fs.renameSync(temporary, databaseFile);
}

export function dbPath() { return databaseFile; }
