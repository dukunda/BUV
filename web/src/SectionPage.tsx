import React from 'react';
import { ArrowUpRight, Boxes, ClipboardList, CircleAlert, Store, Wallet } from 'lucide-react';

const sectionInfo: Record<string, { description: string; action: string; columns: string[]; empty: string; hint: string }> = {
  Inventory: { description: 'Review expected stock, physical counts, and recorded movements by location.', action: 'Record a stock count', columns: ['Product', 'Location', 'Expected', 'Physical', 'Variance'], empty: 'No inventory records yet', hint: 'Balances will be derived from recorded receipts, sales, counts, and adjustments.' },
  Products: { description: 'Manage the company product catalogue and location-specific prices.', action: 'Add product', columns: ['SKU', 'Product', 'Category', 'Unit', 'Purchase cost', 'Status'], empty: 'No products added yet', hint: 'Products will appear here after they are added. No sample products are being shown.' },
  Purchases: { description: 'Track supplier orders, received goods, invoices, and payment status.', action: 'Record a purchase', columns: ['Reference', 'Supplier', 'Location', 'Purchase date', 'Total', 'Status'], empty: 'No purchases recorded yet', hint: 'A purchase should affect stock only after its receipt is confirmed.' },
  'Sales & POS': { description: 'Record point-of-sale transactions and review sales history.', action: 'Start a sale', columns: ['Transaction', 'Location', 'Date', 'Payment method', 'Total', 'Status'], empty: 'No sales recorded yet', hint: 'This screen is not yet connected to payment or inventory services.' },
  Transfers: { description: 'Move stock between locations with approval and receiving confirmation.', action: 'Create transfer', columns: ['Transfer ID', 'From', 'To', 'Created', 'Items', 'Status'], empty: 'No transfers yet', hint: 'Transfers need approval, dispatch, and receipt confirmation before stock changes.' },
  'Daily Reports': { description: 'Review submitted, pending, and correction-requested daily reports.', action: 'View report calendar', columns: ['Report ID', 'Location', 'Employee', 'Business date', 'Submitted', 'Status'], empty: 'No daily reports submitted yet', hint: 'Reports will be generated from sales, stock counts, receipts, and expenses.' },
  Employees: { description: 'Manage employee profiles, roles, and assigned business locations.', action: 'Add employee', columns: ['Employee', 'Position', 'Business unit', 'Location', 'Status'], empty: 'No employee profiles added yet', hint: 'Sensitive employee information will be restricted to authorized users.' },
  Payroll: { description: 'Review payroll periods, salary components, and payment status.', action: 'Create payroll period', columns: ['Employee', 'Period', 'Base salary', 'Adjustments', 'Net pay', 'Status'], empty: 'No payroll records yet', hint: 'Payroll is not connected. Stock shortages will never be deducted automatically.' },
  Expenses: { description: 'Submit and review operating expenses and their approvals.', action: 'Record an expense', columns: ['Expense', 'Category', 'Location', 'Date', 'Amount', 'Status'], empty: 'No expenses submitted yet', hint: 'Expense approval and payment status will appear after records are connected.' },
  Settings: { description: 'Company preferences and access configuration.', action: 'Edit settings', columns: ['Setting', 'Current value', 'Description'], empty: 'Settings are not configured yet', hint: 'The owner alert threshold defaults to 2,000 RWF. Configuration controls are not connected yet.' },
};

type BusinessUnit = { id: number; parentId: number | null; code: string; name: string; kind: 'shop' | 'restaurant' | 'department'; salesMode: 'not_configured' | 'pos' | 'stock_reconciliation' | 'hybrid'; active: number };
type Product = { id: number; sku: string; name: string; unit: string; categoryName: string | null; purchaseCostRwf: number; minimumStock: number; active: number; prices: { businessUnitId: number; locationName: string; sellingPriceRwf: number }[] };
type Employee = { id: number; userId: number; name: string; email: string; position: string; contact: string | null; status: string; accountActive?: number; businessUnits: { id: number; name: string; code: string }[] };
type Props = { name: string; businessUnits?: BusinessUnit[]; onBusinessUnitsChanged?: () => Promise<void> };

export default function SectionPage({ name, businessUnits = [], onBusinessUnitsChanged = async () => {} }: Props) {
  const [products, setProducts] = React.useState<Product[]>([]);
  const [employees, setEmployees] = React.useState<Employee[]>([]);
  const [categories, setCategories] = React.useState<{ id: number; name: string }[]>([]);
  const loadProducts = React.useCallback(async () => {
    const [productResponse, categoryResponse] = await Promise.all([fetch('/api/products'), fetch('/api/categories')]);
    if (productResponse.ok) setProducts((await productResponse.json()).products);
    if (categoryResponse.ok) setCategories((await categoryResponse.json()).categories);
  }, []);
  React.useEffect(() => { if (name === 'Products') void loadProducts(); }, [name, loadProducts]);
  const loadEmployees = React.useCallback(async () => { const response = await fetch('/api/employees'); if (response.ok) setEmployees((await response.json()).employees); }, []);
  React.useEffect(() => { if (name === 'Employees') void loadEmployees(); }, [name, loadEmployees]);
  if (name === 'Business Units') return <BusinessUnitsPage units={businessUnits} onChanged={onBusinessUnitsChanged}/>;
  if (name === 'Products') return <ProductsPage products={products} categories={categories} locations={businessUnits} onSaved={loadProducts}/>;
  if (name === 'Employees') return <EmployeesPage employees={employees} units={businessUnits} onSaved={loadEmployees}/>;

  const info = sectionInfo[name] ?? sectionInfo.Settings;
  if (name === 'Restaurant') return <>
    <PageHeading name={name} description="Kitchen operations, drinks inventory, orders, and customer payments." />
    <div className="metrics restaurant-metrics"><Metric title="OPEN ORDERS" icon={<ClipboardList size={17}/>} tone="green"/><Metric title="KITCHEN" icon={<Store size={17}/>} tone="orange"/><Metric title="DRINKS" icon={<Boxes size={17}/>} tone="blue"/><Metric title="PAYMENTS" icon={<Wallet size={17}/>} tone="purple"/></div>
    <section className="panel page-table"><div className="panel-head"><div><h3>Restaurant workflow</h3><p>Order and preparation status</p></div></div><div className="workflow-steps"><span>Order created</span><b>→</b><span>Sent to kitchen</span><b>→</b><span>Preparing</span><b>→</b><span>Ready</span><b>→</b><span>Payment received</span><b>→</b><span>Completed</span></div><EmptyState title="No restaurant orders yet" detail="Order and payment workflows are not connected yet." icon={<Store size={21}/>} /></section>
    <Footer>Kitchen preparation and customer payments will be kept as separate records.</Footer>
  </>;

  return <>
    <PageHeading name={name} description={info.description} action={info.action}/>
    <div className="metrics compact-metrics"><Metric title="TOTAL RECORDS" icon={<Boxes size={17}/>} tone="green"/><Metric title="PENDING REVIEW" icon={<ClipboardList size={17}/>} tone="orange"/><Metric title="LAST UPDATED" icon={<ArrowUpRight size={17}/>} tone="blue"/><Metric title="DATA STATUS" icon={<CircleAlert size={17}/>} tone="purple"/></div>
    <section className="panel page-table"><div className="panel-head"><div><h3>{name} records</h3><p>{info.description}</p></div><span className="setup-badge">Empty</span></div>
      <div className="table-scroll"><div className="table-head">{info.columns.map(column => <span key={column}>{column}</span>)}</div><EmptyState title={info.empty} detail={info.hint} /></div>
    </section>
    <Note title="Section preview">This page is navigable, but records, forms, and actions need the API and database features to be implemented.</Note>
    <Footer>BUVIMIMA Business Suite · <b>Data is not connected</b></Footer>
  </>;
}

function EmployeesPage({ employees, units, onSaved }: { employees: Employee[]; units: BusinessUnit[]; onSaved: () => Promise<void> }) {
  const [editing, setEditing] = React.useState<Employee | null>(null); const [showForm, setShowForm] = React.useState(false);
  const [name, setName] = React.useState(''); const [email, setEmail] = React.useState(''); const [password, setPassword] = React.useState('');
  const [position, setPosition] = React.useState(''); const [contact, setContact] = React.useState(''); const [unitIds, setUnitIds] = React.useState<number[]>([]);
  const [error, setError] = React.useState(''); const [busy, setBusy] = React.useState(false);
  const selectableUnits = units.filter(unit => unit.active);
  function reset() { setEditing(null); setShowForm(false); setName(''); setEmail(''); setPassword(''); setPosition(''); setContact(''); setUnitIds([]); setError(''); }
  function edit(employee: Employee) { setEditing(employee); setShowForm(true); setName(employee.name); setEmail(employee.email); setPosition(employee.position); setContact(employee.contact || ''); setUnitIds(employee.businessUnits.map(unit=>unit.id)); setError(''); }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const body = { name, email, password, position, contact, businessUnitIds: unitIds };
      const response = await fetch(editing ? `/api/employees/${editing.id}` : '/api/employees', { method: editing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Could not save employee.');
      reset(); await onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save employee.'); }
    finally { setBusy(false); }
  }
  async function changeActive(employee: Employee) {
    const response = await fetch(`/api/employees/${employee.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: !employee.accountActive }) });
    const result = await response.json(); if (!response.ok) { setError(result.error || 'Could not update account.'); return; } await onSaved();
  }
  return <>
    <div className="page-heading"><div><div className="eyebrow">TEAM AND ACCESS</div><h1>Employees</h1><p>Create employee accounts and restrict each account to assigned business units.</p></div><button className="primary-action" onClick={() => { if (showForm) reset(); else { reset(); setShowForm(true); } }}>{showForm ? 'Close' : '+ Add employee'}</button></div>
    {error && <div className="form-error" role="alert">{error}</div>}
    {showForm && <form className="panel unit-form" onSubmit={submit}><div className="form-title"><h3>{editing ? 'Update employee' : 'Create employee account'}</h3><p>{editing ? 'Changing unit access takes effect on the next request.' : 'Set an initial password and assign at least one unit.'}</p></div><div className="form-grid">
      <label>Full name<input required minLength={2} value={name} onChange={e=>setName(e.target.value)}/></label>
      {!editing && <label>Login email<input required type="email" value={email} onChange={e=>setEmail(e.target.value)}/></label>}
      {!editing && <label>Initial password<input required type="password" minLength={12} value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 12 characters"/></label>}
      <label>Position<input required minLength={2} value={position} onChange={e=>setPosition(e.target.value)} placeholder="Shop employee, Chef, Bartender"/></label>
      <label>Contact (optional)<input value={contact} onChange={e=>setContact(e.target.value)}/></label>
      <fieldset className="unit-access"><legend>Assigned business units</legend>{selectableUnits.map(unit=><label key={unit.id}><input type="checkbox" checked={unitIds.includes(unit.id)} onChange={e=>setUnitIds(current=>e.target.checked?[...current,unit.id]:current.filter(id=>id!==unit.id))}/><span>{unit.name}</span></label>)}</fieldset>
      </div><div className="form-actions"><button type="button" className="filter" onClick={reset}>Cancel</button><button className="primary-action" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save employee' : 'Create account'}</button></div></form>}
    <section className="panel page-table"><div className="panel-head"><div><h3>Employee accounts</h3><p>{employees.length} saved employee profile{employees.length === 1 ? '' : 's'} · access is enforced by the API</p></div><span className="setup-badge">Private</span></div>
      {employees.length === 0 ? <EmptyState title="No employees yet" detail="Create an employee account and assign it to the shop or restaurant unit where they work." icon={<Store size={21}/>} /> : <div className="employee-list">{employees.map(employee=><div className="employee-row" key={employee.id}><div className="employee-avatar">{employee.name.split(/\s+/).map(part=>part[0]).join('').slice(0,2).toUpperCase()}</div><div className="employee-main"><b>{employee.name}</b><small>{employee.email} · {employee.position}</small><div className="employee-units">{employee.businessUnits.map(unit=><span key={unit.id}>{unit.name}</span>)}</div></div><span className={employee.accountActive ? 'status-live' : 'status-inactive'}>{employee.accountActive ? 'Active' : 'Inactive'}</span><button className="small-action" onClick={()=>edit(employee)}>Edit access</button><button className="small-action" onClick={()=>void changeActive(employee)}>{employee.accountActive ? 'Deactivate' : 'Reactivate'}</button></div>)}</div>}
    </section><Note title="Branch privacy">Employees receive only their assigned unit and its sub-units. An employee must be assigned to a unit before they can access its records.</Note>
  </>;
}

function ProductsPage({ products, categories, locations, onSaved }: { products: Product[]; categories: { id: number; name: string }[]; locations: BusinessUnit[]; onSaved: () => Promise<void> }) {
  const [showForm, setShowForm] = React.useState(false);
  const [name, setName] = React.useState(''); const [sku, setSku] = React.useState(''); const [unit, setUnit] = React.useState('piece');
  const [categoryId, setCategoryId] = React.useState(''); const [cost, setCost] = React.useState('0'); const [minimum, setMinimum] = React.useState('0');
  const [prices, setPrices] = React.useState<Record<number,string>>({}); const [error, setError] = React.useState(''); const [busy, setBusy] = React.useState(false);
  const sellLocations = locations.filter(location => ['shop', 'restaurant'].includes(location.kind) && location.active);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const locationPrices = Object.entries(prices).filter(([,amount]) => amount !== '').map(([businessUnitId,amount]) => ({ businessUnitId: Number(businessUnitId), sellingPriceRwf: Number(amount) }));
    try {
      const response = await fetch('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, sku, unit, categoryId: categoryId || null, purchaseCostRwf: Number(cost), minimumStock: Number(minimum), prices: locationPrices }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Could not save the product.');
      setName(''); setSku(''); setUnit('piece'); setCategoryId(''); setCost('0'); setMinimum('0'); setPrices({}); setShowForm(false); await onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save the product.'); }
    finally { setBusy(false); }
  }
  async function addCategory() {
    const categoryName = window.prompt('New product category name'); if (!categoryName?.trim()) return;
    const response = await fetch('/api/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: categoryName.trim() }) });
    const body = await response.json(); if (!response.ok) { setError(body.error || 'Could not create category.'); return; }
    setError(''); await onSaved(); setCategoryId(String(body.category.id));
  }
  return <>
    <div className="page-heading"><div><div className="eyebrow">PRODUCT CATALOGUE</div><h1>Products</h1><p>Maintain product details, cost, minimum stock, and selling prices by branch.</p></div><button className="primary-action" onClick={() => setShowForm(!showForm)}>{showForm ? 'Close' : '+ Add product'}</button></div>
    {error && <div className="form-error" role="alert">{error}</div>}
    {showForm && <form className="panel unit-form" onSubmit={submit}><div className="form-title"><h3>New product</h3><p>Selling prices are stored separately for each business unit.</p></div><div className="form-grid">
      <label>Product name<input required minLength={2} maxLength={160} value={name} onChange={e=>setName(e.target.value)} placeholder="Product name"/></label>
      <label>SKU / code<input required value={sku} onChange={e=>setSku(e.target.value.toUpperCase())} placeholder="e.g. BEANS-1KG"/></label>
      <label>Category<div className="input-action"><select value={categoryId} onChange={e=>setCategoryId(e.target.value)}><option value="">Uncategorized</option>{categories.map(category=><option key={category.id} value={category.id}>{category.name}</option>)}</select><button type="button" className="small-action" onClick={addCategory}>+ Add category</button></div></label>
      <label>Unit of measure<input required value={unit} onChange={e=>setUnit(e.target.value)} placeholder="piece, kg, litre"/></label>
      <label>Purchase cost (RWF)<input required type="number" min="0" step="1" value={cost} onChange={e=>setCost(e.target.value)}/></label>
      <label>Minimum stock<input required type="number" min="0" step="0.001" value={minimum} onChange={e=>setMinimum(e.target.value)}/></label>
      {sellLocations.map(location=><label key={location.id}>Selling price · {location.name} (RWF)<input type="number" min="0" step="1" value={prices[location.id] ?? ''} onChange={e=>setPrices(previous=>({...previous,[location.id]:e.target.value}))} placeholder="Leave blank to set later"/></label>)}
      </div><div className="form-actions"><button type="button" className="filter" onClick={()=>setShowForm(false)}>Cancel</button><button className="primary-action" disabled={busy}>{busy ? 'Saving…' : 'Save product'}</button></div></form>}
    <section className="panel page-table"><div className="panel-head"><div><h3>Product catalogue</h3><p>{products.length} saved product{products.length === 1 ? '' : 's'} · costs and prices in RWF</p></div><span className="setup-badge">Database records</span></div>
      {products.length === 0 ? <EmptyState title="No products added yet" detail="Add a product above. Its selling price can differ by shop or restaurant."/> : <div className="product-list"><div className="product-header"><span>PRODUCT</span><span>SKU / CATEGORY</span><span>UNIT</span><span>BUY COST</span><span>SELLING PRICES</span></div>{products.map(product=><div className="product-row" key={product.id}><div><b>{product.name}</b><small>{product.active ? 'Active' : 'Inactive'}</small></div><div><b>{product.sku}</b><small>{product.categoryName || 'Uncategorized'}</small></div><span>{product.unit}</span><span>{product.purchaseCostRwf.toLocaleString('en-RW')} RWF</span><div>{product.prices.length ? product.prices.map(price=><small className="price-chip" key={price.businessUnitId}>{price.locationName}: {price.sellingPriceRwf.toLocaleString('en-RW')} RWF</small>) : <small className="muted-text">Price not set</small>}</div></div>)}</div>}
    </section>
    <Footer>Product records and branch prices are saved in the local database.</Footer>
  </>;
}

function BusinessUnitsPage({ units, onChanged }: { units: BusinessUnit[]; onChanged: () => Promise<void> }) {
  const [showForm, setShowForm] = React.useState(false);
  const [name, setName] = React.useState('');
  const [code, setCode] = React.useState('');
  const [kind, setKind] = React.useState<BusinessUnit['kind']>('shop');
  const [parentId, setParentId] = React.useState('');
  const [salesMode, setSalesMode] = React.useState<BusinessUnit['salesMode']>('not_configured');
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const roots = units.filter(unit => unit.parentId === null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch('/api/business-units', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, code, kind, parentId: parentId ? Number(parentId) : null, salesMode }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Could not save this unit.');
      setName(''); setCode(''); setParentId(''); setKind('shop'); setSalesMode('not_configured'); setShowForm(false); await onChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save this unit.'); }
    finally { setBusy(false); }
  }
  async function update(unit: BusinessUnit, changes: Partial<BusinessUnit>) {
    const response = await fetch(`/api/business-units/${unit.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes) });
    const body = await response.json(); if (!response.ok) { setError(body.error || 'Could not update this unit.'); return; }
    setError(''); await onChanged();
  }
  const displayChildren = (parent: BusinessUnit) => units.filter(unit => unit.parentId === parent.id);
  return <>
    <div className="page-heading"><div><div className="eyebrow">COMPANY STRUCTURE</div><h1>Business Units</h1><p>Manage shops, branches, restaurants, and operating areas under BUVIMIMA Ltd.</p></div><button className="primary-action" onClick={() => setShowForm(!showForm)}>{showForm ? 'Close' : '+ Add business unit'}</button></div>
    {error && <div className="form-error" role="alert">{error}</div>}
    {showForm && <form className="panel unit-form" onSubmit={submit}><div className="form-title"><div><h3>Add a business unit</h3><p>New units are saved to this company database.</p></div></div><div className="form-grid">
      <label>Unit name<input required minLength={2} maxLength={120} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. City Centre Branch"/></label>
      <label>Unique code<input required pattern="[A-Za-z0-9][A-Za-z0-9-]{1,47}" value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="e.g. CITY-CENTRE"/></label>
      <label>Type<select value={kind} onChange={e => setKind(e.target.value as BusinessUnit['kind'])}><option value="shop">Shop / branch</option><option value="restaurant">Restaurant</option><option value="department">Department</option></select></label>
      <label>Parent unit<select value={parentId} onChange={e => setParentId(e.target.value)}><option value="">Company level</option>{units.filter(unit => unit.kind !== 'department' && unit.active).map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>
      {kind !== 'department' && <label>Sales method<select value={salesMode} onChange={e => setSalesMode(e.target.value as BusinessUnit['salesMode'])}><option value="not_configured">Configure later</option><option value="pos">POS</option><option value="stock_reconciliation">Stock reconciliation</option><option value="hybrid">Controlled hybrid</option></select></label>}
      </div><div className="form-actions"><button type="button" className="filter" onClick={() => setShowForm(false)}>Cancel</button><button className="primary-action" disabled={busy}>{busy ? 'Saving…' : 'Save business unit'}</button></div></form>}
    <div className="unit-tree">{roots.map(root => <section className="panel tree-card" key={root.id}><div className="tree-root"><div className="unit-icon sand">{root.kind === 'restaurant' ? 'R' : 'S'}</div><div className="tree-copy"><b>{root.name}</b><small>{root.kind === 'restaurant' ? 'Restaurant' : root.kind === 'shop' ? 'Wholesale shop / branch' : 'Department'} · {root.code}</small></div><select aria-label={`Sales mode for ${root.name}`} value={root.salesMode} onChange={e => void update(root, { salesMode: e.target.value as BusinessUnit['salesMode'] })}><option value="not_configured">Sales mode: configure</option><option value="pos">POS</option><option value="stock_reconciliation">Stock reconciliation</option><option value="hybrid">Controlled hybrid</option></select><button className="small-action" onClick={() => { const nextName = window.prompt('Business unit name', root.name); if (nextName?.trim()) void update(root, { name: nextName.trim() }); }}>Rename</button><button className="small-action" onClick={() => void update(root, { active: root.active ? 0 : 1 })}>{root.active ? 'Deactivate' : 'Reactivate'}</button><span className={root.active ? 'status-live' : 'status-inactive'}>{root.active ? 'Active' : 'Inactive'}</span></div>
      {displayChildren(root).map(child => <div className="tree-child" key={child.id}><span className="tree-branch">└</span><div className="unit-icon pink">{child.name.slice(0,1).toUpperCase()}</div><div className="tree-copy"><b>{child.name}</b><small>Department · {child.code}</small></div><button className="small-action" onClick={() => { const nextName = window.prompt('Department name', child.name); if (nextName?.trim()) void update(child, { name: nextName.trim() }); }}>Rename</button><button className="small-action" onClick={() => void update(child, { active: child.active ? 0 : 1 })}>{child.active ? 'Deactivate' : 'Reactivate'}</button><span className={child.active ? 'status-live' : 'status-inactive'}>{child.active ? 'Active' : 'Inactive'}</span></div>)}
    </section>)}</div>
    <Note title="Branch access and record separation">Each location is a separate unit. When employee accounts are added, access will be assigned to specific units; branch staff will only receive records for their assigned unit.</Note>
  </>;
}

function PageHeading({ name, description, action }: { name: string; description: string; action?: string }) {
  return <div className="page-heading"><div><div className="eyebrow">BUVIMIMA BUSINESS SUITE</div><h1>{name}</h1><p>{description}</p></div>{action && <button className="filter" disabled title="Available after the API is implemented">＋ {action}</button>}</div>;
}
function Metric({ title, icon, tone }: { title: string; icon: React.ReactNode; tone: string }) {
  return <section className="metric"><div className="metric-top"><span>{title}</span><i className={tone}>{icon}</i></div><strong>—</strong><small>No connected records</small><div className="metric-bottom"><span className="metric-bar"/><span>RWF</span></div></section>;
}
function EmptyState({ title, detail, icon = <Boxes size={21}/> }: { title: string; detail: string; icon?: React.ReactNode }) {
  return <div className="empty-state"><div className="empty-icon">{icon}</div><b>{title}</b><small>{detail}</small></div>;
}
function Note({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="panel page-note"><CircleAlert size={19}/><div><b>{title}</b><p>{children}</p></div></section>;
}
function Footer({ children }: { children: React.ReactNode }) { return <footer>BUVIMIMA Business Suite <span>·</span> {children}</footer>; }
