import React from 'react';
import { createRoot } from 'react-dom/client';
import AuthScreen, { type SignedInUser } from './AuthScreen';
import SectionPage from './SectionPage';
import { LayoutDashboard, Boxes, PackagePlus, ShoppingCart, Store, ClipboardList, Users, Wallet, Settings, Bell, Search, ChevronDown, ArrowUpRight, ArrowDownRight, CircleAlert, CheckCircle2, Menu } from 'lucide-react';
import './style.css';

const nav = [
  { title: 'OVERVIEW', items: [['Dashboard', LayoutDashboard], ['Business Units', Store]] },
  { title: 'OPERATIONS', items: [['Inventory', Boxes], ['Products', PackagePlus], ['Purchases', ShoppingCart], ['Sales & POS', ShoppingCart], ['Restaurant', Store], ['Transfers', ArrowUpRight], ['Daily Reports', ClipboardList]] },
  { title: 'PEOPLE & FINANCE', items: [['Employees', Users], ['Payroll', Wallet], ['Expenses', Wallet]] },
] as const;
const money = new Intl.NumberFormat('en-RW', { maximumFractionDigits: 0 });

function App() {
  const [active, setActive] = React.useState('Dashboard');
  const [navOpen, setNavOpen] = React.useState(false);
  const [range, setRange] = React.useState('Today');
  const [user, setUser] = React.useState<SignedInUser | null>(null);
  const [authMode, setAuthMode] = React.useState<'loading' | 'setup' | 'login'>('loading');
  const [businessUnits, setBusinessUnits] = React.useState<any[]>([]);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [notificationsOpen, setNotificationsOpen] = React.useState(false);
  const [dismissedNotices, setDismissedNotices] = React.useState<string[]>([]);
  const loadUnits = React.useCallback(async () => { const r = await fetch('/api/business-units'); if (r.ok) setBusinessUnits((await r.json()).businessUnits); }, []);
  React.useEffect(() => {
    let live = true;
    (async () => { try { const statusResponse = await fetch('/api/status'); const status = await statusResponse.json(); if (!live) return; if (status.setupRequired) { setAuthMode('setup'); return; } const response = await fetch('/api/me'); if (!live) return; if (response.ok) { const session = await response.json(); setUser(session.user); } setAuthMode('login'); } catch { if (live) setAuthMode('login'); } })();
    return () => { live = false; };
  }, []);
  React.useEffect(() => { if (user) void loadUnits(); }, [user, loadUnits]);
  if (!user) return authMode === 'loading' ? <main className="boot-screen">Starting BUVIMIMA…</main> : <AuthScreen mode={authMode} onModeChange={setAuthMode} onComplete={(nextUser) => { setUser(nextUser); void loadUnits(); }} />;
  async function signOut() { await fetch('/api/logout', { method: 'POST' }); setUser(null); setAuthMode('login'); }
  const pages: string[] = [...nav.flatMap(group => group.items.map(([name]) => name)), 'Settings'];
  const query = searchQuery.trim().toLowerCase();
  const searchResults = query ? [
    ...pages.filter(name => name.toLowerCase().includes(query)).map(name => ({ label: name, detail: 'Open section', key: `page-${name}`, action: () => setActive(name) })),
    ...businessUnits.filter(unit => `${unit.name} ${unit.code} ${unit.kind}`.toLowerCase().includes(query)).map(unit => ({ label: unit.name, detail: `Business unit · ${unit.code}`, key: `unit-${unit.id}`, action: () => setActive('Business Units') })),
  ].slice(0, 7) : [];
  const notices = [
    ...(businessUnits.length === 0 ? [{ key: 'units', title: 'Set up your business units', detail: 'Add your locations to start organizing operations.', page: 'Business Units' }] : []),
    ...(businessUnits.some(unit => unit.active && unit.salesMode === 'not_configured') ? [{ key: 'sales-mode', title: 'Sales mode needs setup', detail: 'Choose how active locations record sales.', page: 'Business Units' }] : []),
    { key: 'sales-data', title: 'Sales data is not connected', detail: 'Sales summaries will appear when transactions are recorded.', page: 'Sales & POS' },
  ].filter(notice => !dismissedNotices.includes(notice.key));
  return <div className="shell">
    <aside className={navOpen ? "sidebar nav-open" : "sidebar"}><div className="brand"><div className="brand-mark">B</div><div><b>BUVIMIMA</b><small>BUSINESS SUITE</small></div><button className="mobile-menu" aria-label="Open navigation" onClick={() => setNavOpen(!navOpen)}><Menu size={19}/></button></div>
      <div className="company-switch"><div className="company-icon">B</div><div><b>BUVIMIMA Ltd</b><small>All business units</small></div><ChevronDown size={16}/></div>
      <nav>{nav.map(group => <section key={group.title}><label>{group.title}</label>{group.items.map(([name, Icon]) => <button key={name} className={active === name ? 'nav-item selected' : 'nav-item'} onClick={() => setActive(name)}><Icon size={18}/><span>{name}</span></button>)}</section>)}</nav>
      <div className="side-bottom"><button className={active === "Settings" ? "nav-item selected" : "nav-item"} onClick={() => setActive("Settings")}><Settings size={18}/>Settings</button><div className="user-chip"><div className="avatar">{user.name.split(/\s+/).map(part => part[0]).join("").slice(0,2).toUpperCase()}</div><div><b>{user.name}</b><small>{user.role}</small></div><ChevronDown size={15}/></div></div>
    </aside>
    <main className="main"><header className="topbar"><button className="crumb">Overview <span>/</span> <b>{active}</b></button><div className="top-actions"><div className="search-wrap"><div className="search"><Search size={17}/><input aria-label="Search pages and business units" placeholder="Search anything..." value={searchQuery} onChange={event => { setSearchQuery(event.target.value); setSearchOpen(true); setNotificationsOpen(false); }} onFocus={() => setSearchOpen(true)} onKeyDown={event => { if (event.key === 'Escape') setSearchOpen(false); if (event.key === 'Enter' && searchResults[0]) { searchResults[0].action(); setSearchOpen(false); setSearchQuery(''); } }}/><kbd>⌘ K</kbd></div>{searchOpen && query && <div className="header-popover search-results">{searchResults.length ? searchResults.map(result => <button key={result.key} onClick={() => { result.action(); setSearchOpen(false); setSearchQuery(''); }}><Search size={15}/><span><b>{result.label}</b><small>{result.detail}</small></span><ArrowUpRight size={14}/></button>) : <div className="popover-empty">No matching pages or business units.</div>}</div>}</div><div className="notification-wrap"><button className="bell" aria-label="Notifications" aria-expanded={notificationsOpen} onClick={() => { setNotificationsOpen(!notificationsOpen); setSearchOpen(false); }}><Bell size={19}/>{notices.length > 0 && <i/>}</button>{notificationsOpen && <div className="header-popover notification-popover"><div className="popover-heading"><b>Notifications</b><span>{notices.length} new</span></div>{notices.length ? notices.map(notice => <div className="notification-item" key={notice.key}><span className="notification-dot"/><button className="notification-copy" onClick={() => { setActive(notice.page); setNotificationsOpen(false); }}><b>{notice.title}</b><small>{notice.detail}</small></button><button className="dismiss-notice" aria-label={`Dismiss ${notice.title}`} onClick={() => setDismissedNotices([...dismissedNotices, notice.key])}>×</button></div>) : <div className="popover-empty">You’re all caught up.</div>}</div>}</div><button className="top-avatar" title="Sign out" onClick={signOut}>{user.name.split(/\s+/).map(part => part[0]).join("").slice(0,2).toUpperCase()}</button></div></header>
      <div className="content">{active === 'Dashboard' ? <><div className="welcome-row"><div><div className="eyebrow">{new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Africa/Johannesburg' }).format(new Date()).toUpperCase()} <span className="live-dot"/> LIVE OVERVIEW</div><h1>Good morning, {user.name} <span>âœ³</span></h1><p>Hereâ€™s whatâ€™s happening across your business today.</p></div><div className="filters"><button className="filter select"><Store size={16}/>All locations<ChevronDown size={15}/></button><select aria-label="Date range" value={range} onChange={e=>setRange(e.target.value)}><option>Today</option><option>This week</option><option>This month</option></select></div></div>
      <div className="notice"><div className="notice-icon"><CircleAlert size={18}/></div><div><b>Connect your business data to get started</b><p>Your dashboard will show live sales, stock, and financial summaries when your records are set up.</p></div><button onClick={()=>setActive('Business Units')}>Set up business <ArrowUpRight size={15}/></button></div>
      <div className="section-heading"><div><h2>Business snapshot</h2><p>Key performance for <b>{range.toLowerCase()}</b></p></div><div className="fresh"><span/> Updated just now</div></div>
      <div className="metrics"><Metric title="SALES REVENUE" value="â€”" desc="No sales recorded" icon={<ArrowUpRight size={17}/>} tone="green"/><Metric title="COST OF GOODS SOLD" value="â€”" desc="Awaiting inventory data" icon={<Boxes size={17}/>} tone="blue"/><Metric title="GROSS PROFIT" value="â€”" desc="Calculated from sales" icon={<ArrowUpRight size={17}/>} tone="purple"/><Metric title="OPERATING EXPENSES" value="â€”" desc="No expenses recorded" icon={<ArrowDownRight size={17}/>} tone="orange"/></div>
      <div className="two-col"><section className="panel sales-panel"><div className="panel-head"><div><h3>Sales overview</h3><p>Revenue across business units</p></div><button className="small-select">This week <ChevronDown size={14}/></button></div><div className="chart-empty"><div className="chart-lines"><span/><span/><span/><span/></div><div className="chart-message"><div className="chart-icon"><ShoppingCart size={20}/></div><b>No sales data yet</b><small>Sales will appear here once transactions are recorded.</small></div><div className="chart-days"><span>MON</span><span>TUE</span><span>WED</span><span>THU</span><span>FRI</span><span>SAT</span><span>SUN</span></div></div></section>
        <section className="panel alerts-panel"><div className="panel-head"><div><h3>Needs attention <span className="pill">0</span></h3><p>Items requiring your review</p></div><button className="text-button">View all <ArrowUpRight size={14}/></button></div><div className="alert-empty"><CheckCircle2 size={27}/><b>Youâ€™re all caught up</b><small>Pending approvals and alerts will show here.</small></div></section></div>
      <section className="panel units-panel"><div className="panel-head"><div><h3>Business units</h3><p>Performance by location</p></div><button className="text-button" onClick={()=>setActive('Business Units')}>Manage units <ArrowUpRight size={14}/></button></div><div className="unit-list">{businessUnits.filter(unit => unit.parentId === null).map(unit => <Unit key={unit.id} initials={unit.name.slice(0,2).toUpperCase()} name={unit.name} sub={`${unit.kind} · ${unit.code}`} tone={unit.kind === 'restaurant' ? 'pink' : unit.code.includes('BRANCH') ? 'blue' : 'sand'} status={unit.active ? (unit.salesMode === 'not_configured' ? 'Configure sales mode' : 'Active') : 'Inactive'}/> )}</div></section>
      <footer>BUVIMIMA Business Suite <span>Â·</span> All amounts shown in RWF <span>Â·</span> <b>Data is not connected</b></footer>
      </> : <SectionPage name={active} businessUnits={businessUnits} onBusinessUnitsChanged={loadUnits}/>}</div></main></div>
}
function Metric({title,value,desc,icon,tone}:{title:string;value:string;desc:string;icon:React.ReactNode;tone:string}){return <section className="metric"><div className="metric-top"><span>{title}</span><i className={tone}>{icon}</i></div><strong>{value}</strong><small>{desc}</small><div className="metric-bottom"><span className="metric-bar"/><span>RWF</span></div></section>}
function Unit({initials,name,sub,tone,status}:{initials:string;name:string;sub:string;tone:string;status:string}){return <div className={'unit-row'}><div className={'unit-icon '+tone}>{initials}</div><div className={'unit-copy'}><b>{name}</b><small>{sub}</small></div><div className={'unit-revenue'}><small>SALES TODAY</small><b>— <span>RWF</span></b></div><span className={'unit-status'}>{status}</span><ArrowUpRight size={16} className={'unit-arrow'}/></div>}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
