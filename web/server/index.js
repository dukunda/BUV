import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { execute, persist, query, transaction } from './database.js';

const app = express();
const port = Number(process.env.API_PORT || 3001);
const sessionDays = 7;
const cookieName = 'buvimima_session';
const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5173,http://127.0.0.1:5173'))
  .split(',').map(origin => origin.trim()).filter(Boolean));
if (process.env.NODE_ENV === 'production' && allowedOrigins.size === 0) throw new Error('Set ALLOWED_ORIGINS to the trusted frontend origin in production.');
app.disable('x-powered-by');
app.use(helmet({ crossOriginEmbedderPolicy: false }));
app.use(express.json({ limit: '32kb' }));
app.use((req, res, next) => {
  const origin = req.get('origin');
  if (origin) {
    if (!allowedOrigins.has(origin)) return res.status(403).json({ error: 'This page origin is not allowed to access the business API.' });
  }
  next();
});

const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false });
const hashToken = (value) => createHash('sha256').update(value).digest('hex');
const cleanUser = ({ id, name, email, role }) => ({ id, name, email, role });
const parseCookie = (header = '', name) => header.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
const isOwner = (req) => ['owner', 'administrator'].includes(req.user?.role);

function authRequired(req, res, next) {
  const rawToken = parseCookie(req.get('cookie'), cookieName);
  if (!rawToken) return res.status(401).json({ error: 'Please sign in.' });
  const [session] = query(`SELECT users.id, users.name, users.email, users.role, users.company_id
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > datetime('now') AND users.active = 1`, [hashToken(rawToken)]);
  if (!session) return res.status(401).json({ error: 'Session expired. Please sign in again.' });
  req.user = session;
  next();
}

function ownerRequired(req, res, next) {
  if (!isOwner(req)) return res.status(403).json({ error: 'Owner or administrator access is required.' });
  next();
}

function makeSession(userId, res) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + sessionDays * 86400000).toISOString();
  execute('INSERT INTO sessions(token_hash, user_id, expires_at) VALUES (?, ?, ?)', [hashToken(token), userId, expiresAt]);
  const options = [`${cookieName}=${token}`, 'HttpOnly', 'SameSite=Strict', 'Path=/', `Max-Age=${sessionDays * 86400}`];
  if (process.env.NODE_ENV === 'production') options.push('Secure');
  res.setHeader('Set-Cookie', options.join('; '));
}

function audit(userId, action, entity, entityId, details = {}) {
  execute('INSERT INTO audit_log(user_id, action, entity, entity_id, details) VALUES(?, ?, ?, ?, ?)', [userId, action, entity, entityId ?? null, JSON.stringify(details)]);
}

function allowedUnitIds(userId, companyId) {
  return query(`WITH RECURSIVE descendants(id) AS (
      SELECT business_unit_id FROM user_unit_access WHERE user_id = ?
      UNION ALL SELECT child.id FROM business_units child JOIN descendants ON child.parent_id = descendants.id WHERE child.active = 1
    ), ancestors(id, parent_id) AS (
      SELECT unit.id, unit.parent_id FROM business_units unit JOIN user_unit_access access ON access.business_unit_id = unit.id WHERE access.user_id = ?
      UNION ALL SELECT parent.id, parent.parent_id FROM business_units parent JOIN ancestors ON parent.id = ancestors.parent_id
    ) SELECT DISTINCT candidate.id FROM (SELECT id FROM descendants UNION ALL SELECT id FROM ancestors) candidate
      JOIN business_units unit ON unit.id = candidate.id WHERE unit.company_id = ?`, [userId, userId, companyId]).map(row => row.id);
}

app.get('/api/status', (_req, res) => {
  res.json({ setupRequired: query('SELECT COUNT(*) AS count FROM users')[0].count === 0 });
});

app.post('/api/setup', loginLimit, async (req, res, next) => {
  try {
    if (query('SELECT COUNT(*) AS count FROM users')[0].count !== 0) return res.status(409).json({ error: 'Initial setup has already been completed.' });
    const name = String(req.body?.ownerName || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (name.length < 2 || name.length > 120) return res.status(422).json({ error: 'Enter the owner’s name.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 190) return res.status(422).json({ error: 'Enter a valid email address.' });
    if (password.length < 12 || password.length > 200) return res.status(422).json({ error: 'Use a password with at least 12 characters.' });
    const companyName = 'BUVIMIMA Ltd';
    const passwordHash = await bcrypt.hash(password, 12);
    const createdUserId = transaction(() => {
      execute('INSERT INTO companies(name, currency) VALUES (?, ?)', [companyName, 'RWF']);
      const companyId = query('SELECT last_insert_rowid() AS id')[0].id;
      execute('INSERT INTO users(company_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)', [companyId, name, email, passwordHash, 'owner']);
      const userId = query('SELECT last_insert_rowid() AS id')[0].id;
      const units = [
        ['WHOLESALE-MAIN', 'Wholesale Main Shop', 'shop', null],
        ['WHOLESALE-BRANCH', 'Wholesale Branch', 'shop', null],
        ['CORNER-VISTA', 'Corner Vista Restaurant', 'restaurant', null],
      ];
      for (const [code, unitName, kind] of units) execute('INSERT INTO business_units(company_id, code, name, kind) VALUES (?, ?, ?, ?)', [companyId, code, unitName, kind]);
      const restaurantId = query('SELECT id FROM business_units WHERE code = ?', ['CORNER-VISTA'])[0].id;
      execute('INSERT INTO business_units(company_id, parent_id, code, name, kind) VALUES (?, ?, ?, ?, ?)', [companyId, restaurantId, 'CORNER-VISTA-KITCHEN', 'Kitchen', 'department']);
      execute('INSERT INTO business_units(company_id, parent_id, code, name, kind) VALUES (?, ?, ?, ?, ?)', [companyId, restaurantId, 'CORNER-VISTA-DRINKS', 'Drinks', 'department']);
      audit(userId, 'initial_setup_completed', 'company', companyId, { businessUnits: 5 });
      return userId;
    });
    makeSession(createdUserId, res);
    persist();
    const [user] = query('SELECT id, name, email, role FROM users WHERE id = ?', [createdUserId]);
    res.status(201).json({ user: cleanUser(user) });
  } catch (error) { next(error); }
});

app.post('/api/login', loginLimit, async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const [user] = query('SELECT id, name, email, password_hash, role FROM users WHERE email = ? AND active = 1', [email]);
    if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: 'Email or password is incorrect.' });
    makeSession(user.id, res);
    persist();
    res.json({ user: cleanUser(user) });
  } catch (error) { next(error); }
});

app.get('/api/me', authRequired, (req, res) => res.json({ user: cleanUser(req.user) }));

app.post('/api/logout', authRequired, (req, res) => {
  const rawToken = parseCookie(req.get('cookie'), cookieName);
  execute('DELETE FROM sessions WHERE token_hash = ?', [hashToken(rawToken)]);
  persist();
  res.setHeader('Set-Cookie', `${cookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
  res.status(204).end();
});

app.get('/api/business-units', authRequired, (req, res) => {
  let units;
  if (isOwner(req)) {
    units = query('SELECT id, parent_id AS parentId, code, name, kind, sales_mode AS salesMode, active, created_at AS createdAt FROM business_units WHERE company_id = ? ORDER BY id', [req.user.company_id]);
  } else {
    units = query(`WITH RECURSIVE allowed(id) AS (
      SELECT business_unit_id FROM user_unit_access WHERE user_id = ?
      UNION ALL SELECT child.id FROM business_units child JOIN allowed ON child.parent_id = allowed.id WHERE child.active = 1
    ) SELECT DISTINCT unit.id, unit.parent_id AS parentId, unit.code, unit.name, unit.kind, unit.sales_mode AS salesMode, unit.active, unit.created_at AS createdAt
      FROM business_units unit JOIN allowed ON allowed.id = unit.id WHERE unit.company_id = ? ORDER BY unit.id`, [req.user.id, req.user.company_id]);
  }
  res.json({ businessUnits: units });
});

app.post('/api/business-units', authRequired, ownerRequired, (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    const code = String(req.body?.code || '').trim().toUpperCase();
    const kind = String(req.body?.kind || 'shop');
    const salesMode = String(req.body?.salesMode || 'not_configured');
    const parentId = req.body?.parentId ? Number(req.body.parentId) : null;
    if (name.length < 2 || name.length > 120) return res.status(422).json({ error: 'Unit name must contain 2 to 120 characters.' });
    if (!/^[A-Z0-9][A-Z0-9-]{1,47}$/.test(code)) return res.status(422).json({ error: 'Use a unique code with 2–48 letters, numbers, or hyphens.' });
    if (!['shop', 'restaurant', 'department'].includes(kind)) return res.status(422).json({ error: 'Choose shop, restaurant, or department.' });
    if (!['not_configured', 'pos', 'stock_reconciliation', 'hybrid'].includes(salesMode)) return res.status(422).json({ error: 'Choose a valid sales mode.' });
    if (parentId && !query('SELECT id FROM business_units WHERE id = ? AND company_id = ?', [parentId, req.user.company_id]).length) return res.status(422).json({ error: 'Parent unit was not found in this company.' });
    transaction(() => {
      execute('INSERT INTO business_units(company_id, parent_id, code, name, kind, sales_mode) VALUES (?, ?, ?, ?, ?, ?)', [req.user.company_id, parentId, code, name, kind, salesMode]);
      const id = query('SELECT last_insert_rowid() AS id')[0].id;
      audit(req.user.id, 'business_unit_created', 'business_unit', id, { name, code, kind, parentId, salesMode });
    });
    const [businessUnit] = query('SELECT id, parent_id AS parentId, code, name, kind, sales_mode AS salesMode, active, created_at AS createdAt FROM business_units WHERE code = ?', [code]);
    res.status(201).json({ businessUnit });
  } catch (error) { if (String(error.message).includes('UNIQUE')) return res.status(409).json({ error: 'That business unit code is already in use.' }); next(error); }
});

app.patch('/api/business-units/:id', authRequired, ownerRequired, (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [unit] = query('SELECT * FROM business_units WHERE id = ? AND company_id = ?', [id, req.user.company_id]);
    if (!unit) return res.status(404).json({ error: 'Business unit not found.' });
    const name = req.body?.name === undefined ? unit.name : String(req.body.name).trim();
    const salesMode = req.body?.salesMode === undefined ? unit.sales_mode : String(req.body.salesMode);
    const active = req.body?.active === undefined ? unit.active : (req.body.active ? 1 : 0);
    const parentId = req.body?.parentId === undefined ? unit.parent_id : (req.body.parentId ? Number(req.body.parentId) : null);
    if (name.length < 2 || name.length > 120) return res.status(422).json({ error: 'Unit name must contain 2 to 120 characters.' });
    if (!['not_configured', 'pos', 'stock_reconciliation', 'hybrid'].includes(salesMode)) return res.status(422).json({ error: 'Choose a valid sales mode.' });
    if (parentId && (parentId === id || !query('SELECT id FROM business_units WHERE id = ? AND company_id = ?', [parentId, req.user.company_id]).length)) return res.status(422).json({ error: 'Choose a valid parent unit.' });
    if (parentId && query(`WITH RECURSIVE descendants(id) AS (SELECT id FROM business_units WHERE parent_id = ? UNION ALL SELECT child.id FROM business_units child JOIN descendants ON child.parent_id = descendants.id) SELECT id FROM descendants WHERE id = ?`, [id, parentId]).length) return res.status(422).json({ error: 'A unit cannot be moved beneath one of its own descendants.' });
    transaction(() => {
      execute('UPDATE business_units SET name = ?, sales_mode = ?, active = ?, parent_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [name, salesMode, active, parentId, id]);
      audit(req.user.id, 'business_unit_updated', 'business_unit', id, { previous: { name: unit.name, salesMode: unit.sales_mode, active: unit.active, parentId: unit.parent_id }, next: { name, salesMode, active, parentId } });
    });
    const [businessUnit] = query('SELECT id, parent_id AS parentId, code, name, kind, sales_mode AS salesMode, active, created_at AS createdAt FROM business_units WHERE id = ?', [id]);
    res.json({ businessUnit });
  } catch (error) { next(error); }
});

app.get('/api/employees', authRequired, ownerRequired, (req, res) => {
  const employees = query(`SELECT employees.id, users.id AS userId, users.name, users.email, users.active AS accountActive,
    employees.position, employees.contact, employees.employment_date AS employmentDate, employees.status
    FROM employees JOIN users ON users.id = employees.user_id WHERE users.company_id = ? ORDER BY users.name`, [req.user.company_id]);
  for (const employee of employees) employee.businessUnits = query(`SELECT unit.id, unit.name, unit.code, unit.parent_id AS parentId
    FROM user_unit_access access JOIN business_units unit ON unit.id = access.business_unit_id WHERE access.user_id = ? ORDER BY unit.name`, [employee.userId]);
  res.json({ employees });
});

app.post('/api/employees', authRequired, ownerRequired, async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const position = String(req.body?.position || '').trim();
    const contact = String(req.body?.contact || '').trim() || null;
    const employmentDate = req.body?.employmentDate ? String(req.body.employmentDate) : null;
    const unitIds = Array.isArray(req.body?.businessUnitIds) ? [...new Set(req.body.businessUnitIds.map(Number))] : [];
    if (name.length < 2 || name.length > 120 || position.length < 2 || position.length > 100) return res.status(422).json({ error: 'Enter the employee name and position.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 190) return res.status(422).json({ error: 'Enter a valid email address.' });
    if (password.length < 12 || password.length > 200) return res.status(422).json({ error: 'Set an initial password with at least 12 characters.' });
    if (!unitIds.length) return res.status(422).json({ error: 'Assign the employee to at least one business unit.' });
    if (unitIds.some(id => !query('SELECT id FROM business_units WHERE id = ? AND company_id = ? AND active = 1', [id, req.user.company_id]).length)) return res.status(422).json({ error: 'Choose active business units from this company.' });
    if (employmentDate && !/^\d{4}-\d{2}-\d{2}$/.test(employmentDate)) return res.status(422).json({ error: 'Enter the employment date as YYYY-MM-DD.' });
    const passwordHash = await bcrypt.hash(password, 12);
    const employeeId = transaction(() => {
      execute('INSERT INTO users(company_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)', [req.user.company_id, name, email, passwordHash, 'employee']);
      const userId = query('SELECT last_insert_rowid() AS id')[0].id;
      execute('INSERT INTO employees(user_id, position, contact, employment_date) VALUES (?, ?, ?, ?)', [userId, position, contact, employmentDate]);
      const id = query('SELECT last_insert_rowid() AS id')[0].id;
      for (const unitId of unitIds) execute('INSERT INTO user_unit_access(user_id, business_unit_id) VALUES (?, ?)', [userId, unitId]);
      audit(req.user.id, 'employee_created', 'employee', id, { name, email, position, businessUnitIds: unitIds });
      return id;
    });
    persist();
    const [employee] = query('SELECT employees.id, users.id AS userId, users.name, users.email, employees.position, employees.contact, employees.employment_date AS employmentDate, employees.status FROM employees JOIN users ON users.id = employees.user_id WHERE employees.id = ?', [employeeId]);
    employee.businessUnits = query('SELECT id, name, code FROM business_units WHERE id IN (' + unitIds.map(() => '?').join(',') + ') ORDER BY name', unitIds);
    res.status(201).json({ employee });
  } catch (error) { if (String(error.message).includes('UNIQUE')) return res.status(409).json({ error: 'That email address already has an account.' }); next(error); }
});

app.patch('/api/employees/:id', authRequired, ownerRequired, (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [employee] = query('SELECT employees.*, users.id AS user_id, users.name, users.email, users.active AS account_active FROM employees JOIN users ON users.id = employees.user_id WHERE employees.id = ? AND users.company_id = ?', [id, req.user.company_id]);
    if (!employee) return res.status(404).json({ error: 'Employee not found.' });
    const name = req.body?.name === undefined ? employee.name : String(req.body.name).trim();
    const position = req.body?.position === undefined ? employee.position : String(req.body.position).trim();
    const contact = req.body?.contact === undefined ? employee.contact : (String(req.body.contact).trim() || null);
    const active = req.body?.active === undefined ? employee.account_active : (req.body.active ? 1 : 0);
    const unitIds = req.body?.businessUnitIds === undefined ? null : [...new Set((Array.isArray(req.body.businessUnitIds) ? req.body.businessUnitIds : []).map(Number))];
    if (name.length < 2 || name.length > 120 || position.length < 2 || position.length > 100) return res.status(422).json({ error: 'Enter a valid employee name and position.' });
    if (unitIds && (!unitIds.length || unitIds.some(unitId => !query('SELECT id FROM business_units WHERE id = ? AND company_id = ? AND active = 1', [unitId, req.user.company_id]).length))) return res.status(422).json({ error: 'Assign at least one active unit from this company.' });
    transaction(() => {
      execute('UPDATE users SET name = ?, active = ? WHERE id = ?', [name, active, employee.user_id]);
      execute('UPDATE employees SET position = ?, contact = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [position, contact, active ? 'active' : 'inactive', id]);
      if (unitIds) {
        execute('DELETE FROM user_unit_access WHERE user_id = ?', [employee.user_id]);
        for (const unitId of unitIds) execute('INSERT INTO user_unit_access(user_id, business_unit_id) VALUES (?, ?)', [employee.user_id, unitId]);
      }
      audit(req.user.id, 'employee_updated', 'employee', id, { name, position, active, businessUnitIds: unitIds });
    });
    const [updated] = query('SELECT employees.id, users.id AS userId, users.name, users.email, employees.position, employees.contact, employees.employment_date AS employmentDate, employees.status FROM employees JOIN users ON users.id = employees.user_id WHERE employees.id = ?', [id]);
    updated.businessUnits = query('SELECT id, name, code FROM business_units WHERE id IN (SELECT business_unit_id FROM user_unit_access WHERE user_id = ?) ORDER BY name', [employee.user_id]);
    res.json({ employee: updated });
  } catch (error) { next(error); }
});

app.get('/api/categories', authRequired, (req, res) => {
  const categories = query('SELECT id, name, created_at AS createdAt FROM categories WHERE company_id = ? ORDER BY name', [req.user.company_id]);
  res.json({ categories });
});

app.post('/api/categories', authRequired, ownerRequired, (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (name.length < 2 || name.length > 80) return res.status(422).json({ error: 'Category name must contain 2 to 80 characters.' });
    transaction(() => {
      execute('INSERT INTO categories(company_id, name) VALUES (?, ?)', [req.user.company_id, name]);
      const id = query('SELECT last_insert_rowid() AS id')[0].id;
      audit(req.user.id, 'category_created', 'category', id, { name });
    });
    const [category] = query('SELECT id, name, created_at AS createdAt FROM categories WHERE company_id = ? AND name = ?', [req.user.company_id, name]);
    res.status(201).json({ category });
  } catch (error) { if (String(error.message).includes('UNIQUE')) return res.status(409).json({ error: 'That category already exists.' }); next(error); }
});

app.get('/api/products', authRequired, (req, res) => {
  const locationId = req.query.locationId ? Number(req.query.locationId) : null;
  const permittedUnitIds = isOwner(req) ? null : allowedUnitIds(req.user.id, req.user.company_id);
  if (locationId && permittedUnitIds && !permittedUnitIds.includes(locationId)) return res.status(403).json({ error: 'You do not have access to that location.' });
  if (permittedUnitIds && permittedUnitIds.length === 0) return res.json({ products: [] });
  const visibleLocationIds = locationId ? [locationId] : permittedUnitIds;
  const productScope = visibleLocationIds ? `AND EXISTS (SELECT 1 FROM location_product_prices scope_price WHERE scope_price.product_id = products.id AND scope_price.business_unit_id IN (${visibleLocationIds.map(() => '?').join(',')}))` : '';
  const products = query(`SELECT products.id, products.sku, products.name, products.description,
      products.unit, products.purchase_cost_rwf AS purchaseCostRwf, products.minimum_stock AS minimumStock,
      products.expiry_tracked AS expiryTracked, products.active, products.category_id AS categoryId,
      categories.name AS categoryName
    FROM products LEFT JOIN categories ON categories.id = products.category_id
    WHERE products.company_id = ? ${productScope} ORDER BY products.name`, [req.user.company_id, ...(visibleLocationIds || [])]);
  for (const product of products) {
    const prices = query(`SELECT location_product_prices.business_unit_id AS businessUnitId, business_units.name AS locationName,
      location_product_prices.selling_price_rwf AS sellingPriceRwf
      FROM location_product_prices JOIN business_units ON business_units.id = location_product_prices.business_unit_id
      WHERE location_product_prices.product_id = ? ${visibleLocationIds ? `AND location_product_prices.business_unit_id IN (${visibleLocationIds.map(() => '?').join(',')})` : ''}
      ORDER BY business_units.name`, [product.id, ...(visibleLocationIds || [])]);
    product.prices = prices;
  }
  res.json({ products });
});

app.post('/api/products', authRequired, ownerRequired, (req, res, next) => {
  try {
    const sku = String(req.body?.sku || '').trim().toUpperCase();
    const name = String(req.body?.name || '').trim();
    const unit = String(req.body?.unit || '').trim();
    const description = String(req.body?.description || '').trim() || null;
    const categoryId = req.body?.categoryId ? Number(req.body.categoryId) : null;
    const purchaseCostRwf = Number(req.body?.purchaseCostRwf ?? 0);
    const minimumStock = Number(req.body?.minimumStock ?? 0);
    const expiryTracked = req.body?.expiryTracked ? 1 : 0;
    const prices = Array.isArray(req.body?.prices) ? req.body.prices : [];
    if (!/^[A-Z0-9][A-Z0-9._-]{1,63}$/.test(sku)) return res.status(422).json({ error: 'Use a unique SKU with 2–64 letters, numbers, dots, underscores, or hyphens.' });
    if (name.length < 2 || name.length > 160 || unit.length < 1 || unit.length > 32) return res.status(422).json({ error: 'Enter a product name and unit of measure.' });
    if (!Number.isSafeInteger(purchaseCostRwf) || purchaseCostRwf < 0 || !Number.isFinite(minimumStock) || minimumStock < 0) return res.status(422).json({ error: 'Cost and minimum stock must be non-negative numbers in RWF and product units.' });
    if (categoryId && !query('SELECT id FROM categories WHERE id = ? AND company_id = ?', [categoryId, req.user.company_id]).length) return res.status(422).json({ error: 'Choose a category from this company.' });
    const checkedPrices = [];
    for (const price of prices) {
      const businessUnitId = Number(price.businessUnitId);
      const sellingPriceRwf = Number(price.sellingPriceRwf);
      if (!Number.isSafeInteger(sellingPriceRwf) || sellingPriceRwf < 0 || !query("SELECT id FROM business_units WHERE id = ? AND company_id = ? AND kind IN ('shop','restaurant')", [businessUnitId, req.user.company_id]).length) return res.status(422).json({ error: 'Each price must use a valid shop or restaurant and a non-negative RWF amount.' });
      if (checkedPrices.some(item => item.businessUnitId === businessUnitId)) return res.status(422).json({ error: 'A product can have only one current price per business unit.' });
      checkedPrices.push({ businessUnitId, sellingPriceRwf });
    }
    transaction(() => {
      execute(`INSERT INTO products(company_id, category_id, sku, name, description, unit, purchase_cost_rwf, minimum_stock, expiry_tracked)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [req.user.company_id, categoryId, sku, name, description, unit, purchaseCostRwf, minimumStock, expiryTracked]);
      const productId = query('SELECT last_insert_rowid() AS id')[0].id;
      for (const price of checkedPrices) execute('INSERT INTO location_product_prices(business_unit_id, product_id, selling_price_rwf) VALUES (?, ?, ?)', [price.businessUnitId, productId, price.sellingPriceRwf]);
      audit(req.user.id, 'product_created', 'product', productId, { sku, name, prices: checkedPrices });
    });
    res.status(201).json({ productId: query('SELECT id FROM products WHERE company_id = ? AND sku = ?', [req.user.company_id, sku])[0].id });
  } catch (error) { if (String(error.message).includes('UNIQUE')) return res.status(409).json({ error: 'That product SKU already exists.' }); next(error); }
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'API endpoint not found.' }));
app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: 'The request could not be completed.' });
});

app.listen(port, '127.0.0.1', () => console.log(`BUVIMIMA API listening on http://127.0.0.1:${port}`));
