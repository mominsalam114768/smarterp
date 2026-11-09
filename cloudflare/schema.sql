-- =========================================================================
-- HishabPati ERP - Cloudflare D1 Database Schema
-- High-Performance Edge SQLite Database (100% Free Tier Supported)
-- 5M reads/day & 100K writes/day completely free on Cloudflare
-- =========================================================================

-- 1. Business & Settings
CREATE TABLE IF NOT EXISTS business_config (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  currency TEXT DEFAULT '৳',
  phone TEXT,
  address TEXT,
  google_sheets_url TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Products Inventory
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  bn_name TEXT,
  sku TEXT,
  barcode TEXT,
  category_id TEXT DEFAULT 'সাধারণ',
  purchase_price REAL DEFAULT 0,
  sale_price REAL DEFAULT 0,
  stock INTEGER DEFAULT 0,
  min_stock INTEGER DEFAULT 5,
  unit TEXT DEFAULT 'পিস',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Customers
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  due_amount REAL DEFAULT 0,
  total_spent REAL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Sales & Invoices
CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  invoice_no TEXT UNIQUE,
  customer_id TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  total_amount REAL DEFAULT 0,
  discount REAL DEFAULT 0,
  tax REAL DEFAULT 0,
  final_amount REAL DEFAULT 0,
  paid_amount REAL DEFAULT 0,
  due_amount REAL DEFAULT 0,
  payment_method TEXT DEFAULT 'cash',
  items_json TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  company_name TEXT,
  phone TEXT,
  address TEXT,
  due_to_supplier REAL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Expenses
CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  amount REAL DEFAULT 0,
  note TEXT,
  spent_by TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. App Users
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  role TEXT DEFAULT 'admin',
  permissions_json TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. Cloudflare <-> Google Sheets Sync Log
CREATE TABLE IF NOT EXISTS sync_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  action TEXT NOT NULL,
  status TEXT DEFAULT 'synced',
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
