export type AppRole = 'owner' | 'manager' | 'employee' | 'warehouse'

export type User = {
  id: number
  username: string
  role: AppRole
}

export type Product = {
  id: number
  reference: string
  name: string
  category: number
  category_name: string
  section: number
  section_name: string
  product_type: string
  dimensions: string
  color: string
  design: string
  unit: string
  pieces_per_carton: number
  m2_per_carton: string
  total_cartons: string
  total_m2: string
  purchase_price?: string
  selling_price_carton: string
  selling_price_m2: string
  supplier: number
  supplier_name: string
  minimum_stock: string
  image: string | null
  notes: string
  stock_by_warehouse: { warehouse_id: number; warehouse: string; cartons: string }[]
}

export type Option = { id: number; name: string }
export type Warehouse = Option & { address: string }
export type Customer = Option & { phone: string; city: string; amount_paid: string; amount_remaining: string }
export type Supplier = Option & { phone: string; contact: string }
export type Movement = {
  id: number
  product: number
  product_name: string
  product_reference: string
  warehouse_name: string
  movement_type: string
  quantity: string
  previous_stock: string
  new_stock: string
  username: string
  created_at: string
}
export type Sale = {
  id: number
  customer_name: string
  status: string
  subtotal: string
  total: string
  paid: string
  remaining: string
  created_at: string
  items: { product: number; product_name: string; quantity: string; unit: string; subtotal: string }[]
}
export type Purchase = {
  id: number
  supplier_name: string
  invoice_reference: string
  status: string
  created_at: string
  items: { product: number; product_name: string; cartons: string; purchase_price?: string }[]
}
export type DashboardData = {
  total_products: number
  total_cartons: string
  total_m2: string
  inventory_purchase_value?: string
  today_sales: string
  monthly_sales: string
  order_count: number
  today_order_count?: number
  estimated_profit?: string
  low_stock: { id: number; reference: string; name: string; cartons: string; minimum_stock: string }[]
  out_of_stock: { id: number; reference: string; name: string; cartons: string; minimum_stock: string }[]
  category_breakdown: { label: string; value: string }[]
  sales_over_time: { day: string; total: string }[]
  most_sold_products?: { name: string; quantity: string }[]
}