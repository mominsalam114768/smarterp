/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: 'admin' | 'manager' | 'salesman' | 'accountant';
  businessId: string;
  image?: string;
  password?: string;
  permissions?: string[];
  lastSeen?: string;
  lastActive?: string;
  createdAt?: string;
}

export interface Business {
  id: string;
  name: string;
  address: string;
  phone: string;
  logo?: string;
  currency: string;
  backupEmail?: string;
  defaultPrinter?: 'thermal' | 'a4';
  theme?: string;
  users?: User[];
  smtpConfig?: {
    user: string;
    pass: string;
    senderName?: string;
  };
  googleSheetsConfig?: {
    webAppUrl: string;
    sheetUrl?: string;
    sheetName?: string;
    autoSync: boolean;
    lastSyncAt?: string;
    lastSyncStatus?: 'success' | 'error';
    lastSyncCount?: {
      products?: number;
      sales?: number;
      customers?: number;
      suppliers?: number;
      expenses?: number;
      dues?: number;
    };
  };
  cloudflareConfig?: {
    workerUrl?: string;
    d1Enabled?: boolean;
    pagesDomain?: string;
  };
}

export interface Category {
  id: string;
  name: string;
  icon?: string;
}

export interface Brand {
  id: string;
  name: string;
}

export interface Product {
  id: string;
  name: string;
  bnName?: string;
  sku: string;
  barcode?: string;
  barcodes?: string[];
  categoryId: string;
  brandId?: string;
  unit: string;
  purchasePrice: number;
  salePrice: number;
  stock: number;
  minStock: number;
  expiryDate?: string;
  image?: string;
  createdAt?: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  image?: string;
  email?: string;
  address?: string;
  dueAmount: number;
  totalSpent: number;
  createdBy?: string;
  createdAt?: string;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  company?: string;
  address?: string;
  dueAmount: number;
  createdAt?: string;
}

export interface SupplierTransaction {
  id: string;
  supplierId: string;
  type: 'purchase' | 'payment';
  amount: number;
  description?: string;
  date: string;
}

export interface Sale {
  id: string;
  invoiceNo: string;
  customerId: string;
  userId: string;
  totalAmount: number;
  discount: number;
  vat: number;
  payableAmount: number;
  paidAmount: number;
  dueAmount: number;
  paymentMethod: 'cash' | 'card' | 'mobile_pay';
  items: SaleItem[];
  createdAt: string;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  createdBy?: string;
}

export interface SaleItem {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  discountPercent?: number;
  scannedBarcodes?: string[];
  warrantyType?: 'none' | 'guarantee' | 'warranty';
  warrantyDuration?: string;
  subtotal: number;
}

export interface Expense {
  id: string;
  category: string;
  amount: number;
  note?: string;
  date: string;
  userId: string;
}

export interface SMSLog {
  id: string;
  recipient: string;
  message: string;
  status: 'sent' | 'failed' | 'pending';
  createdAt: string;
}

export interface SMSConfig {
  apiKey: string;
  apiUser?: string;
  senderId: string;
  provider: string;
  autoSMS?: boolean;
}

export interface DashboardStats {
  todaySales: number;
  monthlySales: number;
  totalProfit: number;
  totalDue: number;
  totalExpense: number;
  totalProducts: number;
  lowStockCount: number;
  expiredProductCount: number;
  aboutToExpireCount: number;
  recentSales: Sale[];
}
