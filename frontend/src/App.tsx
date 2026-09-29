import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import {
  Activity, ArrowDownToLine, Boxes, Calculator, Check, CircleDollarSign,
  FileBarChart, LayoutDashboard, LogOut, Menu, PackagePlus, Plus,
  ScanLine, Search, Settings, ShoppingBag, ShoppingCart, Truck, Users, Warehouse as WarehouseIcon,
  X,
} from 'lucide-react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts'
import BarcodeScanner from './BarcodeScanner'
import { api } from './services/api'
import type {
  AppRole, Customer, DashboardData, Movement, Option, Product, Purchase,
  Sale, Supplier, User, Warehouse,
} from './types'

type PageName = 'Dashboard' | 'Inventory' | 'Products' | 'Sales' | 'Purchases' | 'Customers' | 'Suppliers' | 'Stock movements' | 'Project Calculator' | 'Reports' | 'Settings'
type NavItem = { name: PageName; icon: typeof LayoutDashboard; roles?: AppRole[] }
type TransactionLine = { product: string; warehouse: string; quantity: string; unit: 'carton' | 'm2'; purchase_price: string }

const navItems: NavItem[] = [
  { name: 'Dashboard', icon: LayoutDashboard },
  { name: 'Inventory', icon: Boxes },
  { name: 'Products', icon: PackagePlus },
  { name: 'Sales', icon: ShoppingCart },
  { name: 'Purchases', icon: ShoppingBag, roles: ['owner', 'manager', 'warehouse'] },
  { name: 'Customers', icon: Users },
  { name: 'Suppliers', icon: Truck, roles: ['owner', 'manager'] },
  { name: 'Stock movements', icon: Activity, roles: ['owner', 'manager', 'warehouse'] },
  { name: 'Project Calculator', icon: Calculator },
  { name: 'Reports', icon: FileBarChart, roles: ['owner', 'manager'] },
  { name: 'Settings', icon: Settings, roles: ['owner', 'manager'] },
]

const currency = (value: string | number | undefined) => `${Number(value ?? 0).toLocaleString('fr-MA', { maximumFractionDigits: 2 })} DH`
const number = (value: string | number | undefined, digits = 2) => Number(value ?? 0).toLocaleString('fr-MA', { minimumFractionDigits: digits, maximumFractionDigits: digits })
const todayLabel = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())
const chartColors = ['#1e5a49', '#bf6848', '#e6b95f', '#6c9d88', '#8b9d6b', '#d6926e']

function getCookie(name: string) {
  return document.cookie.split('; ').find((cookie) => cookie.startsWith(`${name}=`))?.split('=')[1]
}

function Modal({ title, subtitle, close, children }: { title: string; subtitle?: string; close: () => void; children: ReactNode }) {
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}>
    <section className="modal" role="dialog" aria-modal="true" aria-label={title}>
      <header className="modal-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" title="Close" onClick={close}><X /></button></header>
      <div className="modal-body">{children}</div>
    </section>
  </div>
}

function FormField({ label, children, full = false }: { label: string; children: ReactNode; full?: boolean }) {
  return <div className={`form-field${full ? ' full' : ''}`}><label>{label}</label>{children}</div>
}

function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await fetch('/api/auth/csrf/', { credentials: 'include' })
      const csrf = getCookie('csrftoken')
      const user = await api<User>('/auth/login/', { method: 'POST', headers: csrf ? { 'X-CSRFToken': decodeURIComponent(csrf) } : {}, body: { username, password } })
      onLogin(user)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not sign in.')
    } finally {
      setBusy(false)
    }
  }
  return <div className="login-screen">
    <section className="login-brand-panel">
      <div className="brand"><div className="brand-mark">A</div><div><span className="brand-name">Achkif Ceramica</span><span className="brand-subtitle">Ceramic • Tiles • Zellij</span></div></div>
      <div><h1>Beautiful surfaces.<br />Better stock control.</h1><p>Inventory and sales workspace for the craft of Moroccan tile.</p></div>
      <small>ACHKIF CERAMICA · AFRICA/CASABLANCA</small>
    </section>
    <main className="login-card-wrap"><form className="login-card" onSubmit={submit}>
      <span className="eyebrow">Your workspace</span><h2>Welcome back</h2><p>Sign in to manage your inventory and daily operations.</p>
      {error && <div className="alert">{error}</div>}
      <FormField label="Username"><input className="field" autoComplete="username" required value={username} onChange={(event) => setUsername(event.target.value)} /></FormField>
      <FormField label="Password"><input className="field" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></FormField>
      <button className="button" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
    </form></main>
  </div>
}

function StatCard({ title, value, note, icon: Icon, clay = false }: { title: string; value: string; note: string; icon: typeof Boxes; clay?: boolean }) {
  return <div className="stat-card"><div className="stat-top"><span>{title}</span><span className={`stat-icon${clay ? ' clay' : ''}`}><Icon /></span></div><div className="stat-value">{value}</div><div className="stat-note">{note}</div></div>
}

function Dashboard({ data, openProduct }: { data: DashboardData | null; openProduct: (id: number) => void }) {
  if (!data) return <div className="loading">Loading dashboard…</div>
  const sales = data.sales_over_time.map((item) => ({ ...item, total: Number(item.total) }))
  return <>
    <div className="page-heading"><div><span className="eyebrow">Overview</span><h1>Good day, here’s your store.</h1><p>A clear view of today’s stock and sales activity.</p></div></div>
    <div className="stat-grid">
      <StatCard title="Products" value={String(data.total_products)} note="Active catalog items" icon={PackagePlus} />
      <StatCard title="Cartons in stock" value={number(data.total_cartons, 0)} note={`${number(data.total_m2)} m² across locations`} icon={Boxes} />
      <StatCard title="Today’s sales" value={currency(data.today_sales)} note={`${data.today_order_count ?? data.order_count} orders today`} icon={CircleDollarSign} clay />
      {data.inventory_purchase_value !== undefined
        ? <StatCard title="Inventory value" value={currency(data.inventory_purchase_value)} note="At latest purchase cost" icon={WarehouseIcon} />
        : <StatCard title="This month" value={currency(data.monthly_sales)} note="Completed sales total" icon={ShoppingCart} />}
    </div>
    <div className="chart-grid">
      <section className="panel"><div className="panel-head"><div><div className="panel-title">Sales activity</div><div className="panel-subtitle">Paid revenue by day</div></div><span className="pill green">Last 30 days</span></div>
        <div className="chart-area"><ResponsiveContainer width="100%" height="100%"><AreaChart data={sales} margin={{ top: 6, right: 8, left: -17, bottom: 0 }}><defs><linearGradient id="saleFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#38755e" stopOpacity={0.23} /><stop offset="95%" stopColor="#38755e" stopOpacity={0.01} /></linearGradient></defs><CartesianGrid stroke="#edf0e9" vertical={false} /><XAxis dataKey="day" tick={{ fill: '#8a958d', fontSize: 9 }} tickLine={false} axisLine={false} /><YAxis tick={{ fill: '#8a958d', fontSize: 9 }} tickLine={false} axisLine={false} /><Tooltip formatter={(value) => currency(Number(value))} /><Area type="monotone" dataKey="total" stroke="#39735c" strokeWidth={2.5} fill="url(#saleFill)" /></AreaChart></ResponsiveContainer></div>
      </section>
      <section className="panel"><div className="panel-head"><div><div className="panel-title">Stock by category</div><div className="panel-subtitle">Cartons currently on hand</div></div></div>
        <div className="chart-area" style={{ height: 190 }}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data.category_breakdown.map((item) => ({ ...item, value: Number(item.value) }))} dataKey="value" nameKey="label" innerRadius={48} outerRadius={76} paddingAngle={3} stroke="none">{data.category_breakdown.map((entry, index) => <Cell key={entry.label} fill={chartColors[index % chartColors.length]} />)}</Pie><Tooltip formatter={(value) => `${value} cartons`} /></PieChart></ResponsiveContainer></div>
        <div className="low-list" style={{ display: 'flex', flexWrap: 'wrap', gap: 7, paddingTop: 0 }}>{data.category_breakdown.map((entry, index) => <span className="pill" key={entry.label} style={{ background: `${chartColors[index % chartColors.length]}18`, color: chartColors[index % chartColors.length] }}>{entry.label} · {number(entry.value, 0)}</span>)}</div>
      </section>
    </div>
    {data.most_sold_products && <section className="panel" style={{ marginBottom: 14 }}><div className="panel-head"><div><div className="panel-title">Most sold products</div><div className="panel-subtitle">Carton equivalents from completed sales</div></div></div>{data.most_sold_products.length ? <div className="chart-area" style={{ height: 225 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={data.most_sold_products.map((item) => ({ ...item, quantity: Number(item.quantity) }))} layout="vertical" margin={{ top: 4, right: 15, left: 10, bottom: 0 }}><CartesianGrid stroke="#edf0e9" horizontal={false} /><XAxis type="number" tick={{ fill: '#8a958d', fontSize: 9 }} tickLine={false} axisLine={false} /><YAxis type="category" dataKey="name" width={110} tick={{ fill: '#69776e', fontSize: 9 }} tickLine={false} axisLine={false} /><Tooltip formatter={(value) => `${value} cartons`} /><Bar dataKey="quantity" fill="#b76345" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer></div> : <div className="empty">Completed sales will appear here.</div>}</section>}
    <section className="panel"><div className="panel-head"><div><div className="panel-title">Stock needing attention</div><div className="panel-subtitle">Below minimum level or unavailable</div></div><span className={data.out_of_stock.length ? 'pill red' : 'pill amber'}>{data.low_stock.length} products</span></div>
      {data.low_stock.length === 0 ? <div className="empty">All products are above their minimum stock level.</div> : <div className="low-list">{data.low_stock.slice(0, 6).map((product) => <div className="low-row" key={product.id}><div><button className="table-action" onClick={() => openProduct(product.id)}>{product.name}</button><div className="low-ref">{product.reference}</div></div><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span className="muted">{number(product.cartons, 0)} / {number(product.minimum_stock, 0)}</span><span className={Number(product.cartons) === 0 ? 'pill red' : 'pill amber'}>{Number(product.cartons) === 0 ? 'OUT OF STOCK' : 'LOW STOCK'}</span></div></div>)}</div>}
    </section>
  </>
}

function InventoryPage({ products, categories, refresh, openProduct, canManage }: { products: Product[]; categories: Option[]; refresh: () => void; openProduct: (id: number) => void; canManage: boolean }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [stockFilter, setStockFilter] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [showAreaEditor, setShowAreaEditor] = useState(false)
  const [areaProductId, setAreaProductId] = useState('')
  const [areaPerCarton, setAreaPerCarton] = useState('')
  const [areaError, setAreaError] = useState('')
  const [savingArea, setSavingArea] = useState(false)
  const [sections, setSections] = useState<Option[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [error, setError] = useState('')
  const visible = products.filter((product) => {
    const text = `${product.reference} ${product.name} ${product.category_name} ${product.section_name} ${product.color} ${product.dimensions} ${product.supplier_name}`.toLowerCase()
    return (!query || text.includes(query.toLowerCase())) && (!category || String(product.category) === category) && (!stockFilter || (stockFilter === 'low' ? Number(product.total_cartons) > 0 && Number(product.total_cartons) <= Number(product.minimum_stock) : Number(product.total_cartons) === 0))
  })
  async function startAdd() {
    setError('')
    try {
      const [sectionOptions, supplierOptions, warehouseOptions] = await Promise.all([api<Option[]>('/sections/'), api<Supplier[]>('/suppliers/'), api<Warehouse[]>('/warehouses/')])
      setSections(sectionOptions); setSuppliers(supplierOptions); setWarehouses(warehouseOptions); setShowAdd(true)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load product options.') }
  }
  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('')
    const form = new FormData(event.currentTarget)
    const image = form.get('image')
    if (image instanceof File && image.size === 0) form.delete('image')
    try {
      await api<Product>('/products/', { method: 'POST', body: form })
      setShowAdd(false); refresh()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not create product.') }
  }
  function openAreaEditor(productId = String(products[0]?.id ?? '')) {
    const product = products.find((item) => String(item.id) === productId)
    setAreaProductId(productId)
    setAreaPerCarton(product?.m2_per_carton ?? '')
    setAreaError('')
    setShowAreaEditor(true)
  }
  async function updateAreaPerCarton(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAreaError('')
    setSavingArea(true)
    try {
      await api<Product>(`/products/${areaProductId}/`, { method: 'PATCH', body: { m2_per_carton: areaPerCarton } })
      setShowAreaEditor(false)
      refresh()
    } catch (reason) {
      setAreaError(reason instanceof Error ? reason.message : 'Could not update carton coverage.')
    } finally {
      setSavingArea(false)
    }
  }
  return <>
    <div className="page-heading"><div><span className="eyebrow">Catalog & stock</span><h1>Inventory</h1><p>Products, locations, and live carton-to-area quantities.</p></div>{canManage && <div className="inventory-actions"><button className="button secondary" onClick={() => openAreaEditor()} disabled={!products.length}>Update m²/carton</button><button className="button" onClick={startAdd}><Plus /> Add product</button></div>}</div>
    {error && <div className="alert">{error}</div>}
    <section className="panel"><div className="toolbar"><div className="searchbox"><Search /><input className="field" placeholder="Search reference, product, color, supplier…" value={query} onChange={(event) => setQuery(event.target.value)} /></div><select className="select" value={category} onChange={(event) => setCategory(event.target.value)}><option value="">All categories</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select className="select" value={stockFilter} onChange={(event) => setStockFilter(event.target.value)}><option value="">All stock</option><option value="low">Low stock</option><option value="out">Out of stock</option></select></div>
      <div className="table-wrap"><table><thead><tr><th>Product</th><th>Category / section</th><th>Dimensions</th><th>Stock</th><th>Price / carton</th><th>Status</th><th /></tr></thead><tbody>{visible.map((product) => {
        const low = Number(product.total_cartons) <= Number(product.minimum_stock)
        return <tr key={product.id}><td><div className="product-name">{product.name}</div><div className="product-ref">{product.reference} · {product.color || 'No color'}</div></td><td>{product.category_name}<div className="product-ref">{product.section_name}</div></td><td>{product.dimensions || '—'}<div className="product-ref">{number(product.m2_per_carton)} m² / carton</div></td><td><span className="stock-cell">{number(product.total_cartons, 0)} cartons</span><div className="product-ref">{number(product.total_m2)} m²</div></td><td>{currency(product.selling_price_carton)}</td><td><span className={Number(product.total_cartons) === 0 ? 'pill red' : low ? 'pill amber' : 'pill green'}>{Number(product.total_cartons) === 0 ? 'OUT OF STOCK' : low ? 'LOW STOCK' : 'IN STOCK'}</span></td><td><button className="table-action" onClick={() => openProduct(product.id)}>Details</button></td></tr>
      })}</tbody></table>{visible.length === 0 && <div className="empty">No products match this search.</div>}</div>
    </section>
    {showAreaEditor && <Modal title="Update carton coverage" subtitle="The product’s total m² in stock will recalculate from cartons × m² per carton." close={() => setShowAreaEditor(false)}><form onSubmit={updateAreaPerCarton}><div className="form-grid"><FormField label="Product" full><select className="select" style={{ width: '100%' }} value={areaProductId} onChange={(event) => openAreaEditor(event.target.value)} required>{products.map((product) => <option key={product.id} value={product.id}>{product.reference} · {product.name}</option>)}</select></FormField><FormField label="Square meters per carton (m²)" full><input className="field" type="number" min="0.001" step="0.001" value={areaPerCarton} onChange={(event) => setAreaPerCarton(event.target.value)} required /></FormField></div>{areaError && <div className="alert">{areaError}</div>}<div className="notice">Current stock: {number(products.find((product) => String(product.id) === areaProductId)?.total_cartons, 0)} cartons · New total: {number(Number(products.find((product) => String(product.id) === areaProductId)?.total_cartons ?? 0) * Number(areaPerCarton || 0))} m²</div><div className="form-footer"><button className="button secondary" type="button" onClick={() => setShowAreaEditor(false)}>Cancel</button><button className="button" disabled={savingArea}>{savingArea ? 'Saving…' : 'Save coverage'}</button></div></form></Modal>}
    {showAdd && <Modal title="Add product" subtitle="Add a product to the catalog and optionally record its opening stock." close={() => setShowAdd(false)}><form onSubmit={createProduct} encType="multipart/form-data"><div className="form-grid">
      <FormField label="Reference / SKU"><input name="reference" className="field" required maxLength={60} /></FormField><FormField label="Product name"><input name="name" className="field" required /></FormField>
      <FormField label="Category"><select name="category" className="select" required>{categories.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></FormField><FormField label="Section"><select name="section" className="select" required>{sections.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></FormField>
      <FormField label="Product type"><select name="product_type" className="select"><option value="tile">Tile</option><option value="zellij">Zellij</option><option value="special">Special piece</option></select></FormField><FormField label="Dimensions"><input name="dimensions" className="field" placeholder="10 × 10 cm" /></FormField>
      <FormField label="Color"><input name="color" className="field" /></FormField><FormField label="Design"><input name="design" className="field" /></FormField>
      <FormField label="Pieces per carton"><input name="pieces_per_carton" className="field" type="number" min="1" defaultValue="1" required /></FormField><FormField label="m² per carton"><input name="m2_per_carton" className="field" type="number" min="0.001" step="0.001" required /></FormField>
      <FormField label="Purchase price / carton"><input name="purchase_price" className="field" type="number" min="0" step="0.01" required /></FormField><FormField label="Selling price / carton"><input name="selling_price_carton" className="field" type="number" min="0" step="0.01" required /></FormField>
      <FormField label="Selling price / m²"><input name="selling_price_m2" className="field" type="number" min="0" step="0.01" required /></FormField><FormField label="Supplier"><select name="supplier" className="select" required>{suppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></FormField>
      <FormField label="Minimum stock (cartons)"><input name="minimum_stock" className="field" type="number" min="0" step="0.001" defaultValue="0" /></FormField><FormField label="Opening stock (cartons)"><input name="initial_cartons" className="field" type="number" min="0" step="0.001" defaultValue="0" /></FormField>
      <FormField label="Opening stock location"><select name="warehouse" className="select"><option value="">Choose warehouse</option>{warehouses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></FormField><FormField label="Product image"><input name="image" className="field" type="file" accept="image/*" /></FormField><FormField label="Notes"><input name="notes" className="field" /></FormField>
    </div>{error && <div className="alert">{error}</div>}<div className="form-footer"><button type="button" className="button secondary" onClick={() => setShowAdd(false)}>Cancel</button><button className="button">Save product</button></div></form></Modal>}
  </>
}

function TransactionPage({ kind, products, customers, suppliers, warehouses, records, refresh, canManageCosts }: { kind: 'sales' | 'purchases'; products: Product[]; customers: Customer[]; suppliers: Supplier[]; warehouses: Warehouse[]; records: (Sale | Purchase)[]; refresh: () => void; canManageCosts: boolean }) {
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')
  const isSale = kind === 'sales'
  const createLine = (): TransactionLine => ({ product: String(products[0]?.id ?? ''), warehouse: String(warehouses[0]?.id ?? ''), quantity: '1', unit: 'carton', purchase_price: String(products[0]?.purchase_price ?? '') })
  const [lineItems, setLineItems] = useState<TransactionLine[]>(() => [createLine()])
  const [discount, setDiscount] = useState('0')
  const [deliveryFee, setDeliveryFee] = useState('0')
  const [paidAmount, setPaidAmount] = useState('0')
  const [wholeCartonRequired, setWholeCartonRequired] = useState(true)
  useEffect(() => {
    if (isSale) api<{ whole_carton_required: boolean }>('/settings/inventory/').then((settings) => setWholeCartonRequired(settings.whole_carton_required)).catch(() => undefined)
  }, [isSale])
  function updateLine(index: number, patch: Partial<TransactionLine>) {
    setLineItems((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line))
  }
  function productForLine(line: TransactionLine) {
    return products.find((product) => String(product.id) === line.product)
  }
  function cartonsForLine(line: TransactionLine) {
    const product = productForLine(line)
    const quantity = Number(line.quantity || 0)
    if (!product) return 0
    if (line.unit === 'carton') return quantity
    const cartons = quantity / Number(product.m2_per_carton)
    return wholeCartonRequired ? Math.ceil(cartons) : cartons
  }
  function billableQuantityForLine(line: TransactionLine) {
    const product = productForLine(line)
    return line.unit === 'm2' && product && wholeCartonRequired ? cartonsForLine(line) * Number(product.m2_per_carton) : Number(line.quantity || 0)
  }
  const saleSubtotal = lineItems.reduce((total, line) => {
    const product = productForLine(line)
    const unitPrice = Number(line.unit === 'm2' ? product?.selling_price_m2 : product?.selling_price_carton)
    return total + billableQuantityForLine(line) * (unitPrice || 0)
  }, 0)
  const saleTotal = Math.max(0, saleSubtotal - Number(discount || 0) + Number(deliveryFee || 0))
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('')
    const form = new FormData(event.currentTarget)
    const body = isSale ? {
      customer: form.get('customer') || null,
      discount: form.get('discount'), delivery_fee: form.get('delivery_fee'), paid: form.get('paid'),
      items: lineItems.map((line) => ({ product: line.product, warehouse: line.warehouse, unit: line.unit, quantity: line.quantity })),
    } : {
      supplier: form.get('supplier'), invoice_reference: form.get('invoice_reference'), notes: form.get('notes'),
      items: lineItems.map((line) => ({ product: line.product, warehouse: line.warehouse, cartons: line.quantity, ...(canManageCosts ? { purchase_price: line.purchase_price } : {}) })),
    }
    try { await api(`/${kind}/`, { method: 'POST', body }); setShowForm(false); refresh() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save transaction.') }
  }
  return <>
    <div className="page-heading"><div><span className="eyebrow">{isSale ? 'Customer orders' : 'Receiving stock'}</span><h1>{isSale ? 'Sales' : 'Purchases'}</h1><p>{isSale ? 'Complete a sale to reduce stock and record payment.' : 'Confirm a delivery to increase stock and log the receipt.'}</p></div><button className="button" onClick={() => setShowForm(true)}><Plus /> {isSale ? 'New sale' : 'Receive purchase'}</button></div>
    <section className="panel"><div className="table-wrap"><table><thead><tr><th>{isSale ? 'Sale' : 'Purchase'}</th><th>{isSale ? 'Customer' : 'Supplier'}</th><th>Items</th><th>{isSale ? 'Total' : 'Invoice'}</th><th>{isSale ? 'Payment status' : 'Status'}</th><th>Date</th></tr></thead><tbody>{records.map((record) => isSale ? <tr key={record.id}><td className="product-name">#{record.id}</td><td>{(record as Sale).customer_name}</td><td>{(record as Sale).items.map((item) => `${item.product_name} · ${item.quantity} ${item.unit}`).join(', ')}</td><td>{currency((record as Sale).total)}</td><td><span className={(record as Sale).remaining === '0.00' ? 'pill green' : Number((record as Sale).paid) > 0 ? 'pill amber' : 'pill red'}>{(record as Sale).remaining === '0.00' ? 'PAID' : Number((record as Sale).paid) > 0 ? 'PARTIALLY PAID' : 'UNPAID'} · {currency((record as Sale).remaining)}</span></td><td>{new Date(record.created_at).toLocaleDateString()}</td></tr> : <tr key={record.id}><td className="product-name">#{record.id}</td><td>{(record as Purchase).supplier_name}</td><td>{(record as Purchase).items.map((item) => `${item.product_name} · ${item.cartons} cartons`).join(', ')}</td><td>{(record as Purchase).invoice_reference || '—'}</td><td><span className="pill green">{(record as Purchase).status.toUpperCase()}</span></td><td>{new Date(record.created_at).toLocaleDateString()}</td></tr>)}</tbody></table>{records.length === 0 && <div className="empty">No {isSale ? 'sales' : 'purchases'} recorded yet.</div>}</div></section>
    {showForm && <Modal title={isSale ? 'New sale' : 'Receive purchase'} subtitle={isSale ? 'Stock is reduced only when this sale is completed.' : 'Stock is increased and a movement is recorded when received.'} close={() => setShowForm(false)}><form onSubmit={submit}><div className="form-grid">
      {isSale ? <FormField label="Customer"><select name="customer" className="select"><option value="">Walk-in customer</option>{customers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></FormField> : <FormField label="Supplier"><select name="supplier" className="select" required>{suppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></FormField>}
      <div className="form-field full"><label>Products</label><div className="line-items">{lineItems.map((line, index) => <div className="line-item" key={index}><div className="line-item-grid"><FormField label="Product"><select className="select" required value={line.product} onChange={(event) => { const product = products.find((item) => String(item.id) === event.target.value); updateLine(index, { product: event.target.value, ...(product?.purchase_price !== undefined ? { purchase_price: product.purchase_price } : {}) }) }}>{products.map((item) => <option key={item.id} value={item.id}>{item.reference} · {item.name}</option>)}</select></FormField><FormField label="Warehouse"><select className="select" required value={line.warehouse} onChange={(event) => updateLine(index, { warehouse: event.target.value })}>{warehouses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></FormField><FormField label={isSale ? 'Quantity' : 'Cartons'}><input className="field" type="number" min="0.001" step="0.001" value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} required /></FormField>{isSale ? <FormField label="Sell by"><select className="select" value={line.unit} onChange={(event) => updateLine(index, { unit: event.target.value as TransactionLine['unit'] })}><option value="carton">Carton</option><option value="m2">m²</option></select></FormField> : canManageCosts && <FormField label="Cost / carton"><input className="field" type="number" min="0" step="0.01" value={line.purchase_price} onChange={(event) => updateLine(index, { purchase_price: event.target.value })} required /></FormField>}</div>{lineItems.length > 1 && <button className="table-action line-remove" type="button" onClick={() => setLineItems((current) => current.filter((_, lineIndex) => lineIndex !== index))}>Remove product</button>}</div>)}</div><button type="button" className="button secondary" style={{ marginTop: 8 }} onClick={() => setLineItems((current) => [...current, createLine()])}><Plus /> Add another product</button></div>
      {isSale ? <><FormField label="Discount (DH)"><input className="field" name="discount" type="number" min="0" step="0.01" value={discount} onChange={(event) => setDiscount(event.target.value)} /></FormField><FormField label="Delivery fee (DH)"><input className="field" name="delivery_fee" type="number" min="0" step="0.01" value={deliveryFee} onChange={(event) => setDeliveryFee(event.target.value)} /></FormField><FormField label="Paid now (DH)"><input className="field" name="paid" type="number" min="0" step="0.01" value={paidAmount} onChange={(event) => setPaidAmount(event.target.value)} /></FormField></> : <FormField label="Invoice / reference"><input className="field" name="invoice_reference" /></FormField>}
    </div>{isSale && <div className="panel" style={{ marginTop: 14, padding: '10px 13px' }}><div className="result-line" style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}><span>Subtotal · {lineItems.length} product lines</span><strong style={{ color: 'var(--ink)' }}>{currency(saleSubtotal)}</strong></div><div className="result-line" style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}><span>Total after discount and delivery</span><strong style={{ color: 'var(--forest)' }}>{currency(saleTotal)}</strong></div><div className="result-line" style={{ border: 0, color: 'var(--muted)' }}><span>Remaining after payment</span><strong style={{ color: 'var(--clay)' }}>{currency(Math.max(0, saleTotal - Number(paidAmount || 0)))}</strong></div></div>}{error && <div className="alert">{error}</div>}<div className="form-footer"><button type="button" className="button secondary" onClick={() => setShowForm(false)}>Cancel</button><button className="button">{isSale ? 'Complete sale' : 'Confirm receipt'}</button></div></form></Modal>}
  </>
}

function ProjectCalculator({ products }: { products: Product[] }) {
  const [product, setProduct] = useState('')
  const [wall, setWall] = useState('')
  const [floor, setFloor] = useState('')
  const [waste, setWaste] = useState('10')
  const [result, setResult] = useState<Record<string, string | number | boolean> | null>(null)
  const [error, setError] = useState('')
  async function calculate(event: FormEvent) {
    event.preventDefault(); setError(''); setResult(null)
    try { setResult(await api('/calculator/', { method: 'POST', body: { product, wall_area: wall || 0, floor_area: floor || 0, waste_percent: waste } })) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not calculate this project.') }
  }
  return <><div className="page-heading"><div><span className="eyebrow">Planning tool</span><h1>Project Calculator</h1><p>Estimate tile quantities, waste allowance, and stock availability.</p></div></div>
    <div className="calc-grid"><form className="panel calc-inputs" onSubmit={calculate}><div className="panel-title">Project requirements</div><div className="panel-subtitle" style={{ marginBottom: 18 }}>Choose a product and enter the measured surface areas.</div><div className="form-grid">
      <FormField label="Selected product" full><select className="select" style={{ width: '100%' }} value={product} onChange={(event) => setProduct(event.target.value)} required><option value="">Select a product</option>{products.map((item) => <option key={item.id} value={item.id}>{item.reference} · {item.name} · {number(item.m2_per_carton)} m²/carton</option>)}</select></FormField>
      <FormField label="Wall area (m²)"><input className="field" type="number" min="0" step="0.01" value={wall} onChange={(event) => setWall(event.target.value)} /></FormField><FormField label="Floor area (m²)"><input className="field" type="number" min="0" step="0.01" value={floor} onChange={(event) => setFloor(event.target.value)} /></FormField><FormField label="Waste (%)" full><input className="field" type="number" min="0" step="0.1" value={waste} onChange={(event) => setWaste(event.target.value)} /></FormField>
    </div><div style={{ marginTop: 18 }}><button className="button" disabled={!products.length}><Calculator /> Calculate materials</button></div>{error && <div className="alert">{error}</div>}</form>
    <div className="calc-result"><span className="eyebrow" style={{ color: '#e9bf74' }}>Estimate</span><h2>Materials summary</h2><div className="muted">Rounded to full cartons based on selected product.</div>{result ? <><div style={{ marginTop: 19 }}><div className="result-line"><span>Required area</span><strong>{number(result.required_area as number)} m²</strong></div><div className="result-line"><span>Waste</span><strong>{number(result.waste_percent as number, 1)}%</strong></div><div className="result-line"><span>Area including waste</span><strong>{number(result.area_with_waste as number)} m²</strong></div><div className="result-line"><span>Actual supplied</span><strong>{number(result.actual_area as number)} m²</strong></div><div className="result-line"><span>Remaining area</span><strong>{number(result.remaining_area as number)} m²</strong></div></div><div className="result-big">{number(result.cartons_required as number, 0)} <span style={{ fontSize: 15 }}>cartons</span></div><div className="result-banner">{result.sufficient ? <><strong>Stock is sufficient.</strong><br />{number(result.remaining_cartons as number, 0)} cartons remain after this project. Available: {number(result.available_cartons as number, 0)}.</> : <><strong>Not enough stock.</strong><br />Required: {number(result.cartons_required as number, 0)} · Available: {number(result.available_cartons as number, 0)} · Shortage: {number(result.shortage as number, 0)} cartons.</>}</div></> : <div className="result-banner" style={{ marginTop: 20 }}>Your carton estimate and stock sufficiency will appear here.</div>}</div></div>
  </>
}

function ContactPage({ kind, records, refresh }: { kind: 'customers' | 'suppliers'; records: (Customer | Supplier)[]; refresh: () => void }) {
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [paymentCustomer, setPaymentCustomer] = useState<Customer | null>(null)
  const customerPage = kind === 'customers'
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('')
    const data = Object.fromEntries(new FormData(event.currentTarget).entries())
    try { await api(`/${kind}/`, { method: 'POST', body: data }); setShow(false); refresh() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save record.') }
  }
  async function receivePayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('')
    if (!paymentCustomer) return
    const data = new FormData(event.currentTarget)
    try { await api('/payments/receive/', { method: 'POST', body: { customer: paymentCustomer.id, amount: data.get('amount'), notes: data.get('notes') } }); setPaymentCustomer(null); refresh() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not record payment.') }
  }
  return <><div className="page-heading"><div><span className="eyebrow">Relationships</span><h1>{customerPage ? 'Customers' : 'Suppliers'}</h1><p>{customerPage ? 'Contacts, purchase totals, and balances due.' : 'Supplier contacts and sourcing relationships.'}</p></div><button className="button" onClick={() => setShow(true)}><Plus /> Add {customerPage ? 'customer' : 'supplier'}</button></div>
    <section className="panel"><div className="table-wrap"><table><thead><tr><th>Name</th><th>Phone</th><th>{customerPage ? 'City' : 'Contact'}</th>{customerPage && <><th>Paid</th><th>Outstanding</th><th /></>}</tr></thead><tbody>{records.map((record) => customerPage ? <tr key={record.id}><td className="product-name">{record.name}</td><td>{(record as Customer).phone || '—'}</td><td>{(record as Customer).city || '—'}</td><td>{currency((record as Customer).amount_paid)}</td><td><strong style={{ color: Number((record as Customer).amount_remaining) > 0 ? '#a94e38' : '#367049' }}>{currency((record as Customer).amount_remaining)}</strong></td><td>{Number((record as Customer).amount_remaining) > 0 && <button className="table-action" onClick={() => { setError(''); setPaymentCustomer(record as Customer) }}>Receive payment</button>}</td></tr> : <tr key={record.id}><td className="product-name">{record.name}</td><td>{(record as Supplier).phone || '—'}</td><td>{(record as Supplier).contact || '—'}</td></tr>)}</tbody></table>{records.length === 0 && <div className="empty">No {kind} have been added yet.</div>}</div></section>
    {show && <Modal title={`Add ${customerPage ? 'customer' : 'supplier'}`} close={() => setShow(false)}><form onSubmit={submit}><div className="form-grid"><FormField label={customerPage ? 'Customer name' : 'Supplier name'}><input className="field" name="name" required /></FormField><FormField label="Phone"><input className="field" name="phone" type="tel" /></FormField>{customerPage ? <><FormField label="WhatsApp"><input className="field" name="whatsapp" type="tel" /></FormField><FormField label="City"><input className="field" name="city" /></FormField></> : <><FormField label="Contact person"><input className="field" name="contact" /></FormField><FormField label="WhatsApp"><input className="field" name="whatsapp" type="tel" /></FormField></>}<FormField label="Address"><input className="field" name="address" /></FormField><FormField label="Notes"><input className="field" name="notes" /></FormField></div>{error && <div className="alert">{error}</div>}<div className="form-footer"><button className="button secondary" type="button" onClick={() => setShow(false)}>Cancel</button><button className="button">Save</button></div></form></Modal>}
    {paymentCustomer && <Modal title="Receive customer payment" subtitle={`${paymentCustomer.name} · balance ${currency(paymentCustomer.amount_remaining)}`} close={() => setPaymentCustomer(null)}><form onSubmit={receivePayment}><div className="form-grid"><FormField label="Payment amount (DH)"><input className="field" name="amount" type="number" min="0.01" max={paymentCustomer.amount_remaining} step="0.01" defaultValue={paymentCustomer.amount_remaining} required /></FormField><FormField label="Note"><input className="field" name="notes" /></FormField></div>{error && <div className="alert">{error}</div>}<div className="form-footer"><button className="button secondary" type="button" onClick={() => setPaymentCustomer(null)}>Cancel</button><button className="button">Record payment</button></div></form></Modal>}
  </>
}

function MovementsPage({ products, warehouses, movements, refresh }: { products: Product[]; warehouses: Warehouse[]; movements: Movement[]; refresh: () => void }) {
  const [kind, setKind] = useState<'adjustment' | 'transfer'>('adjustment')
  const [error, setError] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('')
    const formElement = event.currentTarget
    const data = new FormData(event.currentTarget)
    const body = kind === 'adjustment' ? { product: data.get('product'), warehouse: data.get('warehouse'), quantity: data.get('quantity'), movement_type: data.get('movement_type'), reference: data.get('reference') } : { product: data.get('product'), from_warehouse: data.get('from_warehouse'), to_warehouse: data.get('to_warehouse'), quantity: data.get('quantity') }
    try { await api(kind === 'adjustment' ? '/stock/adjust/' : '/stock/transfer/', { method: 'POST', body }); formElement.reset(); refresh() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not record movement.') }
  }
  return <><div className="page-heading"><div><span className="eyebrow">Audit trail</span><h1>Stock movements</h1><p>Every adjustment, sale, receipt, and transfer has a traceable record.</p></div></div>
    <div className="chart-grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, .75fr)' }}><form className="panel" onSubmit={submit}><div className="panel-head"><div><div className="panel-title">Record stock movement</div><div className="panel-subtitle">Changes are logged with user and before/after stock.</div></div></div><div className="modal-body"><div className="toolbar" style={{ padding: 0, border: 0, marginBottom: 15 }}><button type="button" className={`button ${kind === 'adjustment' ? '' : 'secondary'}`} onClick={() => setKind('adjustment')}>Adjustment</button><button type="button" className={`button ${kind === 'transfer' ? '' : 'secondary'}`} onClick={() => setKind('transfer')}>Transfer</button></div><div className="form-grid"><FormField label="Product" full><select className="select" name="product" required style={{ width: '100%' }}>{products.map((item) => <option value={item.id} key={item.id}>{item.reference} · {item.name}</option>)}</select></FormField>{kind === 'adjustment' ? <><FormField label="Location"><select className="select" name="warehouse" required>{warehouses.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></FormField><FormField label="Movement reason"><select className="select" name="movement_type"><option value="adjustment">Manual adjustment</option><option value="damage">Damaged goods</option><option value="return">Returned goods</option></select></FormField><FormField label="Quantity (negative removes stock)"><input className="field" name="quantity" type="number" step="0.001" required /></FormField><FormField label="Reference"><input className="field" name="reference" /></FormField></> : <><FormField label="From location"><select className="select" name="from_warehouse" required>{warehouses.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></FormField><FormField label="To location"><select className="select" name="to_warehouse" required>{warehouses.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></FormField><FormField label="Cartons to transfer"><input className="field" name="quantity" type="number" min="0.001" step="0.001" required /></FormField></>}</div>{error && <div className="alert">{error}</div>}<div className="form-footer"><button className="button">Save movement</button></div></div></form>
      <section className="panel"><div className="panel-head"><div><div className="panel-title">Movement history</div><div className="panel-subtitle">Recent activity across all locations</div></div></div><div className="low-list">{movements.slice(0, 7).map((item) => <div className="low-row" key={item.id}><div><div className="low-name">{item.product_name}</div><div className="low-ref">{item.product_reference} · {item.warehouse_name}</div></div><div style={{ textAlign: 'right' }}><span className={['sale', 'damage'].includes(item.movement_type) ? 'pill red' : 'pill green'}>{item.movement_type}</span><div className="low-ref">{number(item.previous_stock, 0)} → {number(item.new_stock, 0)}</div></div></div>)}</div></section>
    </div><section className="panel"><div className="table-wrap"><table><thead><tr><th>Date</th><th>Product</th><th>Location</th><th>Movement</th><th>Quantity</th><th>Previous</th><th>New stock</th><th>User</th></tr></thead><tbody>{movements.map((item) => <tr key={item.id}><td>{new Date(item.created_at).toLocaleString()}</td><td>{item.product_name}<div className="product-ref">{item.product_reference}</div></td><td>{item.warehouse_name}</td><td>{item.movement_type}</td><td>{number(item.quantity, 0)}</td><td>{number(item.previous_stock, 0)}</td><td>{number(item.new_stock, 0)}</td><td>{item.username || '—'}</td></tr>)}</tbody></table>{movements.length === 0 && <div className="empty">No stock movements recorded.</div>}</div></section>
  </>
}

function SettingsPage({ categories, sections, refresh }: { categories: Option[]; sections: Option[]; refresh: () => void }) {
  const [wholeCarton, setWholeCarton] = useState(true)
  const [stockControl, setStockControl] = useState(true)
  const [saved, setSaved] = useState(false)
  const [customError, setCustomError] = useState('')
  useEffect(() => { api<{ whole_carton_required: boolean; stock_control_enabled: boolean }>('/settings/inventory/').then((value) => { setWholeCarton(value.whole_carton_required); setStockControl(value.stock_control_enabled) }).catch(() => undefined) }, [])
  async function updateSetting(key: 'whole_carton_required' | 'stock_control_enabled', value: boolean) { setSaved(false); setCustomError(''); try { await api('/settings/inventory/', { method: 'PATCH', body: { [key]: value } }); if (key === 'whole_carton_required') setWholeCarton(value); else setStockControl(value); setSaved(true) } catch (reason) { setCustomError(reason instanceof Error ? reason.message : 'Could not save inventory settings.') } }
  async function createOption(event: FormEvent<HTMLFormElement>, path: string) { event.preventDefault(); setCustomError(''); const form = new FormData(event.currentTarget); try { await api(path, { method: 'POST', body: { name: form.get('name') } }); event.currentTarget.reset(); refresh() } catch (reason) { setCustomError(reason instanceof Error ? reason.message : 'Could not save option.') } }
  return <><div className="page-heading"><div><span className="eyebrow">Workspace</span><h1>Settings</h1><p>Configure carton handling and maintain your product taxonomy.</p></div></div>
    <section className="panel" style={{ marginBottom: 14 }}><div className="panel-head"><div><div className="panel-title">Inventory controls</div><div className="panel-subtitle">Choose how quantities are reserved and validated.</div></div></div><div className="settings-row"><div><div className="settings-label">Whole carton required</div><div className="settings-help">When enabled, an m² sale reserves the next whole carton and charges the supplied area.</div></div><input className="toggle" type="checkbox" checked={wholeCarton} onChange={(event) => void updateSetting('whole_carton_required', event.target.checked)} aria-label="Whole carton required" /></div><div className="settings-row"><div><div className="settings-label">Prevent selling more than available</div><div className="settings-help">When enabled, transactions that exceed warehouse stock are rejected.</div></div><input className="toggle" type="checkbox" checked={stockControl} onChange={(event) => void updateSetting('stock_control_enabled', event.target.checked)} aria-label="Stock control enabled" /></div>{saved && <div style={{ padding: '0 18px 13px', color: '#367049', fontSize: 10 }}><Check size={13} style={{ verticalAlign: 'middle' }} /> Saved</div>}</section>
    <div className="chart-grid"><section className="panel"><div className="panel-head"><div><div className="panel-title">Categories</div><div className="panel-subtitle">Add business-specific categories</div></div></div><div className="low-list">{categories.map((item) => <div className="low-row" key={item.id}><span className="low-name">{item.name}</span></div>)}<form className="toolbar" onSubmit={(event) => void createOption(event, '/categories/')}><input className="field" name="name" placeholder="New category" required /><button className="button"><Plus /> Add</button></form></div></section><section className="panel"><div className="panel-head"><div><div className="panel-title">Sections</div><div className="panel-subtitle">Organize wall, floor, and decoration ranges</div></div></div><div className="low-list">{sections.map((item) => <div className="low-row" key={item.id}><span className="low-name">{item.name}</span></div>)}<form className="toolbar" onSubmit={(event) => void createOption(event, '/sections/')}><input className="field" name="name" placeholder="New section" required /><button className="button"><Plus /> Add</button></form></div></section></div>{customError && <div className="alert">{customError}</div>}
  </>
}

function ProductDetail({ id, close, products }: { id: number; close: () => void; products: Product[] }) {
  const [movements, setMovements] = useState<Movement[]>([])
  const [salesHistory, setSalesHistory] = useState<Sale[]>([])
  const [purchaseHistory, setPurchaseHistory] = useState<Purchase[]>([])
  const product = products.find((item) => item.id === id)
  useEffect(() => {
    let active = true
    api<Movement[]>(`/movements/?product=${id}`).then((items) => { if (active) setMovements(items) }).catch(() => { if (active) setMovements([]) })
    api<Sale[]>('/sales/').then((items) => { if (active) setSalesHistory(items.filter((sale) => sale.items.some((item) => item.product === id))) }).catch(() => { if (active) setSalesHistory([]) })
    api<Purchase[]>('/purchases/').then((items) => { if (active) setPurchaseHistory(items.filter((purchase) => purchase.items.some((item) => item.product === id))) }).catch(() => { if (active) setPurchaseHistory([]) })
    return () => { active = false }
  }, [id])
  if (!product) return null
  return <Modal title={product.name} subtitle={`Reference ${product.reference} · ${product.category_name} · ${product.section_name}`} close={close}>
    {product.image && <img className="product-detail-image" src={product.image} alt={product.name} />}
    <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}><StatCard title="Cartons in stock" value={number(product.total_cartons, 0)} note={`${number(product.total_m2)} m² total`} icon={Boxes} /><StatCard title="Selling / carton" value={currency(product.selling_price_carton)} note={`${currency(product.selling_price_m2)} / m²`} icon={CircleDollarSign} clay /></div>
    <div className="panel" style={{ padding: 14, marginBottom: 14 }}><div className="panel-title">Product details</div><div className="low-list" style={{ padding: '8px 0 0' }}><div className="low-row"><span className="muted">Dimensions · Color</span><strong>{product.dimensions || '—'} · {product.color || '—'}</strong></div><div className="low-row"><span className="muted">Supplier</span><strong>{product.supplier_name}</strong></div>{product.purchase_price !== undefined && <div className="low-row"><span className="muted">Purchase / carton</span><strong>{currency(product.purchase_price)}</strong></div>}{product.stock_by_warehouse.map((row) => <div className="low-row" key={row.warehouse_id}><span className="muted">{row.warehouse}</span><strong>{number(row.cartons, 0)} cartons</strong></div>)}</div></div>
    <ProductHistory title="Stock history">{movements.length ? <div className="table-wrap"><table><thead><tr><th>Date</th><th>Movement</th><th>Quantity</th><th>Stock</th><th>User</th></tr></thead><tbody>{movements.map((item) => <tr key={item.id}><td>{new Date(item.created_at).toLocaleDateString()}</td><td>{item.movement_type}</td><td>{number(item.quantity, 0)}</td><td>{number(item.previous_stock, 0)} → {number(item.new_stock, 0)}</td><td>{item.username || '—'}</td></tr>)}</tbody></table></div> : <div className="empty">No stock history available.</div>}</ProductHistory>
    <ProductHistory title="Sales history">{salesHistory.length ? <div className="table-wrap"><table><thead><tr><th>Date</th><th>Sale</th><th>Customer</th><th>Quantity</th><th>Total</th></tr></thead><tbody>{salesHistory.map((sale) => sale.items.filter((item) => item.product === id).map((item, index) => <tr key={`${sale.id}-${index}`}><td>{new Date(sale.created_at).toLocaleDateString()}</td><td>#{sale.id}</td><td>{sale.customer_name}</td><td>{item.quantity} {item.unit}</td><td>{currency(item.subtotal)}</td></tr>))}</tbody></table></div> : <div className="empty">No sales history available.</div>}</ProductHistory>
    <ProductHistory title="Purchase history">{purchaseHistory.length ? <div className="table-wrap"><table><thead><tr><th>Date</th><th>Purchase</th><th>Supplier</th><th>Cartons</th></tr></thead><tbody>{purchaseHistory.map((purchase) => purchase.items.filter((item) => item.product === id).map((item, index) => <tr key={`${purchase.id}-${index}`}><td>{new Date(purchase.created_at).toLocaleDateString()}</td><td>{purchase.invoice_reference || `#${purchase.id}`}</td><td>{purchase.supplier_name}</td><td>{number(item.cartons, 0)}</td></tr>))}</tbody></table></div> : <div className="empty">No purchase history available.</div>}</ProductHistory>
  </Modal>
}

function ProductHistory({ title, children }: { title: string; children: ReactNode }) {
  return <section className="panel product-history"><div className="panel-head"><div className="panel-title">{title}</div></div>{children}</section>
}

function ReportsPage() {
  const [error, setError] = useState('')
  const reports = [
    { label: 'Current inventory', endpoint: '/products/' },
    { label: 'Sales', endpoint: '/sales/' },
    { label: 'Purchases', endpoint: '/purchases/' },
    { label: 'Customer balances', endpoint: '/customers/' },
    { label: 'Stock movements', endpoint: '/movements/' },
  ]
  async function exportData(format: 'csv' | 'xlsx' | 'pdf', label: string, endpoint: string) {
    setError('')
    try {
      const records = await api<Record<string, unknown>[]>(endpoint)
      const rows = records.map((record) => Object.values(record).map((value) => {
        if (Array.isArray(value)) return value.map((item) => typeof item === 'object' && item !== null ? Object.values(item).join(' ') : String(item)).join('; ')
        if (typeof value === 'object' && value !== null) return JSON.stringify(value)
        return String(value ?? '')
      }))
      const columns = records.length ? Object.keys(records[0]) : ['No records']
      const filename = label.toLowerCase().split(' ').join('-')
      if (format === 'csv') {
        const escape = (value: unknown) => {
          let text = String(value ?? '')
          if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
          return `"${text.replace(/"/g, '""')}"`
        }
        const csv = [columns.map(escape).join(','), ...rows.map((row) => row.map(escape).join(','))].join('\n')
        downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${filename}.csv`)
      } else if (format === 'xlsx') {
        const ExcelJS = await import('exceljs')
        const workbook = new ExcelJS.Workbook()
        const worksheet = workbook.addWorksheet('Report')
        worksheet.addRows([columns, ...rows])
        const buffer = await workbook.xlsx.writeBuffer()
        downloadBlob(new Blob([buffer as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${filename}.xlsx`)
      } else {
        const [{ jsPDF }, tableModule] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
        const document = new jsPDF({ orientation: columns.length > 6 ? 'landscape' : 'portrait' })
        document.text(label, 14, 14)
        tableModule.default(document, { head: [columns], body: rows, startY: 20, styles: { fontSize: 7, cellPadding: 2 }, horizontalPageBreak: true })
        document.save(`${filename}.pdf`)
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Report export failed.') }
  }
  return <><div className="page-heading"><div><span className="eyebrow">Exports</span><h1>Reports</h1><p>Download live operational records in your preferred format.</p></div></div>{error && <div className="alert">{error}</div>}<section className="panel"><div className="panel-head"><div><div className="panel-title">Available reports</div><div className="panel-subtitle">Exports use the latest records available to your role.</div></div></div>{reports.map(({ label, endpoint }) => <div className="settings-row" key={label}><div><div className="settings-label">{label}</div><div className="settings-help">CSV · Excel · PDF</div></div><div className="report-actions"><button className="button secondary" title={`Export ${label} as CSV`} onClick={() => void exportData('csv', label, endpoint)}>CSV</button><button className="button secondary" title={`Export ${label} as Excel`} onClick={() => void exportData('xlsx', label, endpoint)}>Excel</button><button className="button secondary" title={`Export ${label} as PDF`} onClick={() => void exportData('pdf', label, endpoint)}>PDF</button></div></div>)}</section></>
}

function downloadBlob(blob: Blob, name: string) { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url) }

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [page, setPage] = useState<PageName>('Dashboard')
  const [menuOpen, setMenuOpen] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scanError, setScanError] = useState('')
  const [detailId, setDetailId] = useState<number | null>(null)
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Option[]>([])
  const [sections, setSections] = useState<Option[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [movements, setMovements] = useState<Movement[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => { api<User>('/auth/me/').then(setUser).catch(() => setUser(null)).finally(() => setAuthChecked(true)) }, [])
  const canSee = (item: NavItem) => !item.roles || (user && item.roles.includes(user.role))
  const canManageCatalog = user?.role === 'owner' || user?.role === 'manager'

  async function loadPage(target = page) {
    setLoading(true); setLoadError('')
    try {
      const options = async () => {
        const [productRows, categoriesData, sectionsData, warehouseRows] = await Promise.all([api<Product[]>('/products/'), api<Option[]>('/categories/'), api<Option[]>('/sections/'), api<Warehouse[]>('/warehouses/')])
        setProducts(productRows); setCategories(categoriesData); setSections(sectionsData); setWarehouses(warehouseRows)
      }
      if (target === 'Dashboard') { const value = await api<DashboardData>('/dashboard/'); setDashboard(value) }
      if (['Inventory', 'Products', 'Project Calculator', 'Sales', 'Purchases', 'Stock movements'].includes(target)) await options()
      if (target === 'Sales') { const [customerRows, salesRows] = await Promise.all([api<Customer[]>('/customers/'), api<Sale[]>('/sales/')]); setCustomers(customerRows); setSales(salesRows) }
      if (target === 'Purchases') { const [supplierRows, purchaseRows] = await Promise.all([api<Supplier[]>('/suppliers/'), api<Purchase[]>('/purchases/')]); setSuppliers(supplierRows); setPurchases(purchaseRows) }
      if (target === 'Customers') setCustomers(await api<Customer[]>('/customers/'))
      if (target === 'Suppliers') setSuppliers(await api<Supplier[]>('/suppliers/'))
      if (target === 'Stock movements') setMovements(await api<Movement[]>('/movements/'))
      if (target === 'Settings') { const [categoryRows, sectionRows] = await Promise.all([api<Option[]>('/categories/'), api<Option[]>('/sections/')]); setCategories(categoryRows); setSections(sectionRows) }
    } catch (reason) { setLoadError(reason instanceof Error ? reason.message : 'Unable to load this section.') }
    finally { setLoading(false) }
  }
  useEffect(() => { if (user) void loadPage(page) }, [user, page])
  function refresh() { void loadPage(page) }
  function navigate(target: PageName) { setPage(target); setMenuOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  async function openScannedProduct(reference: string) {
    setScanError('')
    try {
      const matches = await api<Product[]>(`/products/?search=${encodeURIComponent(reference.trim())}`)
      const product = matches.find((item) => item.reference.toLowerCase() === reference.trim().toLowerCase())
      if (!product) { setScanError(`No product matches “${reference}”.`); return }
      setProducts((current) => [...current.filter((item) => item.id !== product.id), product])
      setDetailId(product.id)
      setScannerOpen(false)
    } catch (reason) { setScanError(reason instanceof Error ? reason.message : 'Could not look up this reference.') }
  }
  async function signOut() { try { await api('/auth/logout/', { method: 'POST' }) } finally { setUser(null) } }

  if (!authChecked) return <div className="loading">Opening Achkif workspace…</div>
  if (!user) return <Login onLogin={(nextUser) => setUser(nextUser)} />
  const visibleNav = navItems.filter(canSee)
  const title = page === 'Products' ? 'Products' : page

  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><div className="brand-mark">A</div><div><span className="brand-name">Achkif Ceramica</span><span className="brand-subtitle">Ceramic • Tiles • Zellij</span></div></div><div className="nav-caption">Workspace</div><nav className="nav-list">{visibleNav.map(({ name, icon: Icon }) => <button key={name} className={`nav-item${page === name || (page === 'Products' && name === 'Inventory') ? ' active' : ''}`} onClick={() => navigate(name)}><Icon />{name}</button>)}</nav><div className="sidebar-foot">Inventory workspace · {user.role}</div></aside>
    <main className="main-area"><header className="topbar"><div><div className="top-title">{title}</div><div className="top-date">{todayLabel} · Casablanca</div></div><div className="top-actions"><button className="icon-button" title="Scan product" onClick={() => { setScanError(''); setScannerOpen(true) }}><ScanLine /></button><span className="avatar" title={user.username}>{user.username.slice(0, 1).toUpperCase()}</span><button className="icon-button" title="Sign out" onClick={() => void signOut()}><LogOut /></button></div></header>
      <div className="content">{loadError && <div className="alert">{loadError} <button className="table-action" onClick={refresh}>Try again</button></div>}{loading && <div className="loading">Loading live records…</div>}
        {!loading && !loadError && page === 'Dashboard' && <Dashboard data={dashboard} openProduct={setDetailId} />}
        {!loading && !loadError && ['Inventory', 'Products'].includes(page) && <InventoryPage products={products} categories={categories} refresh={refresh} openProduct={setDetailId} canManage={Boolean(canManageCatalog)} />}
        {!loading && !loadError && page === 'Sales' && <TransactionPage kind="sales" products={products} customers={customers} suppliers={suppliers} warehouses={warehouses} records={sales} refresh={refresh} canManageCosts={user.role === 'owner' || user.role === 'manager'} />}
        {!loading && !loadError && page === 'Purchases' && <TransactionPage kind="purchases" products={products} customers={customers} suppliers={suppliers} warehouses={warehouses} records={purchases} refresh={refresh} canManageCosts={user.role === 'owner' || user.role === 'manager'} />}
        {!loading && !loadError && page === 'Customers' && <ContactPage kind="customers" records={customers} refresh={refresh} />}
        {!loading && !loadError && page === 'Suppliers' && <ContactPage kind="suppliers" records={suppliers} refresh={refresh} />}
        {!loading && !loadError && page === 'Stock movements' && <MovementsPage products={products} warehouses={warehouses} movements={movements} refresh={refresh} />}
        {!loading && !loadError && page === 'Project Calculator' && <ProjectCalculator products={products} />}
        {!loading && !loadError && page === 'Reports' && <ReportsPage />}
        {!loading && !loadError && page === 'Settings' && <SettingsPage categories={categories} sections={sections} refresh={refresh} />}
      </div>
    </main>
    <nav className="mobile-nav">{[
      ['Dashboard', LayoutDashboard], ['Inventory', Boxes], ['Sales', ShoppingCart], ['Project Calculator', Calculator], ['More', Menu],
    ].map(([label, Icon]) => <button key={String(label)} className={page === label || (label === 'More' && menuOpen) ? 'active' : ''} onClick={() => label === 'More' ? setMenuOpen(!menuOpen) : navigate(label as PageName)}><Icon /><span>{String(label) === 'Project Calculator' ? 'Estimate' : String(label)}</span></button>)}</nav>
    {menuOpen && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setMenuOpen(false)}><section className="modal" style={{ alignSelf: 'end', marginBottom: 65 }}><header className="modal-head"><div><h2>Workspace</h2><p>Choose a section</p></div><button className="icon-button" onClick={() => setMenuOpen(false)}><X /></button></header><div style={{ padding: 10 }}>{visibleNav.filter((item) => !['Dashboard', 'Inventory', 'Sales', 'Project Calculator'].includes(item.name)).map(({ name, icon: Icon }) => <button className="nav-item" style={{ color: 'var(--ink)' }} key={name} onClick={() => navigate(name)}><Icon />{name}</button>)}</div></section></div>}
    {scannerOpen && <BarcodeScanner onScan={(reference) => void openScannedProduct(reference)} error={scanError} onClose={() => setScannerOpen(false)} />}
    {detailId !== null && <ProductDetail id={detailId} products={products} close={() => setDetailId(null)} />}
  </div>
}

export default App