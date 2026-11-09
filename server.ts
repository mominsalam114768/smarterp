import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import nodemailer from "nodemailer";
import CryptoJS from "crypto-js";
import dotenv from "dotenv";
import os from "os";
import axios from "axios";
import cron from "node-cron";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import * as XLSX from "xlsx";

dotenv.config();

// Initialize Firebase Admin configuration
let firebaseAppletConfig: any = {};
try {
  const cfgPath = path.join(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(cfgPath)) {
    firebaseAppletConfig = JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
  }
} catch (e) {
  console.warn("Could not read firebase-applet-config.json", e);
}

const FIREBASE_PROJECT_ID = firebaseAppletConfig.projectId || "psychic-antenna-hg02f";
const FIRESTORE_DATABASE_ID = firebaseAppletConfig.firestoreDatabaseId || "ai-studio-mainhishabpatier-32dac08c-146b-40ba-898c-34f5ac3016af";

// Initialize firestore lazily to avoid startup crashes
let firestore: any;

function getFirestoreInstance() {
  if (firestore) return firestore;
  try {
    if (admin.apps.length === 0) {
      try {
        // Initialize with explicit Project ID directly to avoid connecting to the sandbox infrastructure project
        admin.initializeApp({
          projectId: FIREBASE_PROJECT_ID
        });
        console.log("[Firebase Admin] Initialized with explicit Project ID:", FIREBASE_PROJECT_ID);
      } catch (e: any) {
        console.error("[Firebase Admin] Failed to initialize with explicit config, trying default default initialization.", e.message);
        admin.initializeApp();
      }
    }
    
    // In Admin SDK v11+, getFirestore() can take an app and a databaseId as a string
    const dbId = FIRESTORE_DATABASE_ID as string;
    if (dbId && dbId !== "(default)") {
       try {
         firestore = getFirestore(admin.app(), dbId);
         console.log("[Firebase Admin] Using specific database instance:", dbId);
       } catch (err: any) {
         console.warn("[Firebase Admin] Could not get specific database instance with app reference, trying databaseId alone.", err.message);
         try {
           firestore = getFirestore(dbId);
         } catch (err2: any) {
           console.warn("[Firebase Admin] Could not get specific database instance, falling back to default.", err2.message);
           firestore = getFirestore();
         }
       }
    } else {
       firestore = getFirestore();
       console.log("[Firebase Admin] Using default database instance.");
    }
  } catch (e: any) {
    console.error("[Firebase Admin] Fatal Error in getFirestoreInstance:", e.message);
  }
  return firestore;
}

// Handling __dirname and __filename for both ESM and CJS
const isCjs = typeof __filename !== "undefined" && typeof __dirname !== "undefined";
const _filename = isCjs ? __filename : fileURLToPath(import.meta.url);
const _dirname = isCjs ? __dirname : path.dirname(_filename);

const BACKUP_SECRET = "smart-erp-secure-backup-key-@2024";

// Use /tmp for writable state in production (Cloud Run friendly)
// Note: OS/Tmp is always writable, whereas app root might be read-only after deploy
const IS_PROD = process.env.NODE_ENV === "production";
const LAST_BACKUP_PATH = IS_PROD ? path.join(os.tmpdir(), "last_backup.txt") : path.join(process.cwd(), "last_backup.txt");
const DB_PATH = IS_PROD ? path.join(os.tmpdir(), "db.json") : path.join(process.cwd(), "db.json");

// Ensure db.json exists in /tmp for production if not there
if (IS_PROD && !fs.existsSync(DB_PATH)) {
  const repoDbPath = path.join(process.cwd(), "db.json");
  if (fs.existsSync(repoDbPath)) {
    try {
      fs.copyFileSync(repoDbPath, DB_PATH);
    } catch (e) {
      console.warn("Failed to copy db.json to /tmp", e);
    }
  }
}

async function fetchFirestoreBackupData(businessId: string = "main-business"): Promise<any> {
  const firestore = getFirestoreInstance();
  if (!firestore) {
    console.error("[Backup Engine] Firestore not initialized properly.");
    return null;
  }
  console.log(`[Backup Engine] Fetching Firestore data for Business: ${businessId}`);
  const collections = ["products", "customers", "sales", "expenses", "suppliers", "categories", "users", "sms_logs"];
  const allData: any = { 
    version: "2.5-AUTO", 
    timestamp: new Date().toISOString(),
    backupType: "Scheduled Automatic"
  };
  
  try {
    // Fetch Business Settings
    const bizDoc = await firestore.collection("businesses").doc(businessId).get();
    if (bizDoc.exists) {
      allData.business = { id: bizDoc.id, ...bizDoc.data() };
    }

    // Fetch Sub-collections
    for (const colName of collections) {
      console.log(`[Backup Engine] Reading collection: ${colName}`);
      try {
        const snapshot = await firestore.collection("businesses").doc(businessId).collection(colName).get();
        allData[colName] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      } catch (colErr: any) {
        console.error(`[Backup Engine] Error reading collection ${colName}: ${colErr.message}`);
        allData[colName] = [];
      }
    }

    // Fetch Supplier Transactions (Nested Sub-collections)
    allData.supplierTransactions = {};
    if (allData.suppliers && Array.isArray(allData.suppliers)) {
      console.log(`[Backup Engine] Fetching transactions for ${allData.suppliers.length} suppliers...`);
      for (const supplier of allData.suppliers) {
        try {
          const transSnapshot = await firestore
            .collection("businesses")
            .doc(businessId)
            .collection("suppliers")
            .doc(supplier.id)
            .collection("transactions")
            .get();
          
          if (!transSnapshot.empty) {
            allData.supplierTransactions[supplier.id] = transSnapshot.docs.map(doc => ({ 
              id: doc.id, 
              ...doc.data() 
            }));
          }
        } catch (transErr: any) {
          console.error(`[Backup Engine] Failed to fetch transactions for supplier ${supplier.id}:`, transErr.message);
        }
      }
    }

    // Fetch customer payments (Nested Sub-collections)
    allData.customerPayments = {};
    if (allData.customers && Array.isArray(allData.customers)) {
      console.log(`[Backup Engine] Fetching payments for ${allData.customers.length} customers...`);
      for (const customer of allData.customers) {
        try {
          const paySnapshot = await firestore
            .collection("businesses")
            .doc(businessId)
            .collection("customers")
            .doc(customer.id)
            .collection("payments")
            .get();
          
          if (!paySnapshot.empty) {
            allData.customerPayments[customer.id] = paySnapshot.docs.map(doc => ({ 
              id: doc.id, 
              ...doc.data() 
            }));
          }
        } catch (payErr: any) {
          console.error(`[Backup Engine] Failed to fetch payments for customer ${customer.id}:`, payErr.message);
        }
      }
    }

    return allData;
  } catch (err: any) {
    console.error(`[Backup Engine] Error fetching from Firestore: ${err.message}`);
    return null;
  }
}

function generateBackupExcelBuffer(data: any): Buffer {
  const wb = XLSX.utils.book_new();

  // 1. Products Sheet
  if (data.products && Array.isArray(data.products)) {
    const productsData = data.products.map((p: any) => ({
      "Product ID": p.id || "",
      "Name (English)": p.name || "",
      "Name (Bengali)": p.bnName || "",
      "SKU": p.sku || "",
      "Barcode": p.barcode || (Array.isArray(p.barcodes) ? p.barcodes.join(", ") : ""),
      "Category": p.categoryId || "",
      "Purchase Price": p.purchasePrice ?? 0,
      "Sale Price": p.salePrice ?? 0,
      "Stock": p.stock ?? 0,
      "Min Stock": p.minStock ?? 0,
      "Unit": p.unit || "pcs",
      "Expiry Date": p.expiryDate || ""
    }));
    const wsProducts = XLSX.utils.json_to_sheet(productsData.length ? productsData : [{ Message: "কোনো পণ্য নেই" }]);
    XLSX.utils.book_append_sheet(wb, wsProducts, "পণ্য (Products)");
  }

  // 2. Sales Sheet
  if (data.sales && Array.isArray(data.sales)) {
    const salesData = data.sales.map((s: any) => ({
      "Invoice No": s.invoiceNo || s.id || "",
      "Customer Name": s.customerName || "",
      "Customer Phone": s.customerPhone || "",
      "Total Amount": s.totalAmount ?? 0,
      "Discount": s.discount ?? 0,
      "VAT": s.vat ?? 0,
      "Payable Amount": s.payableAmount ?? s.totalAmount ?? 0,
      "Paid Amount": s.paidAmount ?? 0,
      "Due Amount": s.dueAmount ?? 0,
      "Payment Method": s.paymentMethod || "cash",
      "Date (ঢাকা সময়)": s.createdAt ? new Date(s.createdAt).toLocaleString("bn-BD", { timeZone: "Asia/Dhaka" }) : "",
      "Total Items": Array.isArray(s.items) ? s.items.length : 0
    }));
    const wsSales = XLSX.utils.json_to_sheet(salesData.length ? salesData : [{ Message: "কোনো বিক্রি নেই" }]);
    XLSX.utils.book_append_sheet(wb, wsSales, "বিক্রি (Sales)");
  }

  // 3. Customers Sheet
  if (data.customers && Array.isArray(data.customers)) {
    const customersData = data.customers.map((c: any) => ({
      "Customer ID": c.id || "",
      "Name": c.name || "",
      "Phone": c.phone || "",
      "Address": c.address || "",
      "Due Amount (বকেয়া)": c.dueAmount ?? 0,
      "Total Spent (মোট ক্রয়)": c.totalSpent ?? 0
    }));
    const wsCustomers = XLSX.utils.json_to_sheet(customersData.length ? customersData : [{ Message: "কোনো গ্রাহক নেই" }]);
    XLSX.utils.book_append_sheet(wb, wsCustomers, "গ্রাহক (Customers)");
  }

  // 4. Dedicated Due Management Sheet: বকেয়া গ্রাহক তালিকা (Customer Dues)
  const dueCustomers = (data.customers && Array.isArray(data.customers))
    ? data.customers
        .filter((c: any) => (Number(c.dueAmount) || 0) > 0)
        .sort((a: any, b: any) => (Number(b.dueAmount) || 0) - (Number(a.dueAmount) || 0))
    : [];

  const dueCustomersData = dueCustomers.map((c: any, index: number) => ({
    "ক্রমিক নং": index + 1,
    "গ্রাহকের নাম": c.name || "",
    "মোবাইল নম্বর": c.phone || "",
    "ঠিকানা": c.address || "",
    "বর্তমান বকেয়া (৳)": Number(c.dueAmount) || 0,
    "মোট ক্রয় (৳)": Number(c.totalSpent) || 0,
    "বকেয়ার অবস্থা": "বকেয়া রয়েছে"
  }));

  const wsDueCustomers = XLSX.utils.json_to_sheet(
    dueCustomersData.length ? dueCustomersData : [{ "বার্তা": "আলহামদুলিল্লাহ, কোনো গ্রাহকের বকেয়া নেই।" }]
  );
  XLSX.utils.book_append_sheet(wb, wsDueCustomers, "বকেয়া হিসাব (Due List)");

  // 5. Dedicated Due Invoices Sheet: বাকি বিক্রি চালান (Credit Sales)
  const dueSales = (data.sales && Array.isArray(data.sales))
    ? data.sales
        .filter((s: any) => (Number(s.dueAmount) || 0) > 0)
        .sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    : [];

  const dueSalesData = dueSales.map((s: any, index: number) => ({
    "ক্রমিক নং": index + 1,
    "ইনভয়েস নং": s.invoiceNo || s.id || "",
    "তারিখ ও সময় (ঢাকা সময়)": s.createdAt ? new Date(s.createdAt).toLocaleString("bn-BD", { timeZone: "Asia/Dhaka" }) : "",
    "গ্রাহকের নাম": s.customerName || "",
    "মোবাইল নম্বর": s.customerPhone || "",
    "মোট বিল (৳)": s.payableAmount ?? s.totalAmount ?? 0,
    "পরিশোধিত জমা (৳)": s.paidAmount ?? 0,
    "বাকি টাকা (৳)": s.dueAmount ?? 0,
    "পেমেন্ট অবস্থা": (Number(s.paidAmount) || 0) > 0 ? "আংশিক বাকি" : "সম্পূর্ণ বাকি"
  }));

  const wsDueSales = XLSX.utils.json_to_sheet(
    dueSalesData.length ? dueSalesData : [{ "বার্তা": "কোনো বাকি বিক্রির চালান নেই।" }]
  );
  XLSX.utils.book_append_sheet(wb, wsDueSales, "বাকি বিক্রি (Due Sales)");

  // 6. Expenses Sheet
  if (data.expenses && Array.isArray(data.expenses)) {
    const expensesData = data.expenses.map((e: any) => ({
      "Expense ID": e.id || "",
      "Category (খাত)": e.category || "",
      "Amount (টাকা)": e.amount ?? 0,
      "Note / বিবরণ": e.note || e.description || "",
      "Date (তারিখ)": e.date ? new Date(e.date).toLocaleDateString("bn-BD", { timeZone: "Asia/Dhaka" }) : ""
    }));
    const wsExpenses = XLSX.utils.json_to_sheet(expensesData.length ? expensesData : [{ Message: "কোনো খরচ নেই" }]);
    XLSX.utils.book_append_sheet(wb, wsExpenses, "খরচ (Expenses)");
  }

  // 7. Suppliers Sheet
  if (data.suppliers && Array.isArray(data.suppliers)) {
    const suppliersData = data.suppliers.map((sup: any) => ({
      "Supplier ID": sup.id || "",
      "Name": sup.name || "",
      "Phone": sup.phone || "",
      "Company / কোম্পানি": sup.company || "",
      "Address": sup.address || "",
      "Due Amount (বকেয়া)": sup.dueAmount ?? 0
    }));
    const wsSuppliers = XLSX.utils.json_to_sheet(suppliersData.length ? suppliersData : [{ Message: "কোনো সরবরাহকারী নেই" }]);
    XLSX.utils.book_append_sheet(wb, wsSuppliers, "সরবরাহকারী (Suppliers)");
  }

  // 8. Summary Sheet (with Due statistics)
  const totalCustomerDue = dueCustomers.reduce((sum: number, c: any) => sum + (Number(c.dueAmount) || 0), 0);
  const totalSalesDue = dueSales.reduce((sum: number, s: any) => sum + (Number(s.dueAmount) || 0), 0);
  const totalSupplierDue = (data.suppliers && Array.isArray(data.suppliers))
    ? data.suppliers.reduce((sum: number, sup: any) => sum + (Number(sup.dueAmount) || 0), 0)
    : 0;

  const summaryData = [
    { "বিষয়": "ব্যবসার নাম", "তথ্য": data.business?.name || "Smart Business" },
    { "বিষয়": "ঠিকানা", "তথ্য": data.business?.address || "" },
    { "বিষয়": "মোবাইল", "তথ্য": data.business?.phone || "" },
    { "বিষয়": "কারেন্সি", "তথ্য": data.business?.currency || "BDT" },
    { "বিষয়": "ব্যাকআপের তারিখ ও সময়", "তথ্য": new Date().toLocaleString("bn-BD", { timeZone: "Asia/Dhaka" }) },
    { "বিষয়": "--------------------", "তথ্য": "--------------------" },
    { "বিষয়": "মোট গ্রাহক বকেয়া (পাওনা টাকা)", "তথ্য": `৳ ${totalCustomerDue.toLocaleString('bn-BD')}` },
    { "বিষয়": "বকেয়া ওয়ালা গ্রাহকের সংখ্যা", "তথ্য": `${dueCustomers.length} জন` },
    { "বিষয়": "মোট বাকি বিক্রির চালান (মেমো)", "তথ্য": `${dueSales.length} টি (৳ ${totalSalesDue.toLocaleString('bn-BD')})` },
    { "বিষয়": "সরবরাহকারীর কাছে দেনা (সাপ্লায়ার বকেয়া)", "তথ্য": `৳ ${totalSupplierDue.toLocaleString('bn-BD')}` },
    { "বিষয়": "নীট পাওনা / উদ্বৃত্ত", "তথ্য": `৳ ${(totalCustomerDue - totalSupplierDue).toLocaleString('bn-BD')}` },
    { "বিষয়": "--------------------", "তথ্য": "--------------------" },
    { "বিষয়": "মোট পণ্য", "তথ্য": data.products?.length || 0 },
    { "বিষয়": "মোট বিক্রি সংখ্যা", "তথ্য": data.sales?.length || 0 },
    { "বিষয়": "মোট গ্রাহক", "তথ্য": data.customers?.length || 0 },
    { "বিষয়": "মোট সরবরাহকারী", "তথ্য": data.suppliers?.length || 0 }
  ];
  const wsSummary = XLSX.utils.json_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, wsSummary, "সারসংক্ষেপ (Summary)");

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

// Email backup has been replaced in favor of Google Drive backup
async function sendBackupEmail(_email: string, _data: any, _smtpConfig?: any) {
  console.log("[Backup System] Email backup skipped - Google Drive backup is active.");
  return true;
}


async function startServer() {
  const app = express();
  app.set("trust proxy", true);
  const PORT = process.env.PORT || 3000;

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // CORS Middleware for Cloudflare Pages and cross-origin requests
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, x-user-id");
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

  // Mock Database File - Defined globally above for Cloud Run compatibility
  
  const initialData = {
    users: [
      { 
        id: "admin-1", 
        name: "মোঃ মমিন আলী", 
        email: "mominkhan051220@gmail.com", 
        phone: "01741456838", 
        password: "Momin1234@", 
        role: "admin", 
        permissions: [
          "dashboard", "pos", "sales", "add_sale", "delete_sale", 
          "products", "add_product", "delete_product", "customers", 
          "add_customer", "delete_customer", "suppliers", "accounting", 
          "due", "sms", "reports", "users", "settings"
        ],
        businessId: "main-business",
        lastSeen: new Date().toISOString() 
      }
    ],
    products: [
      { id: "p1", name: "Classic Polo Shirt", bnName: "ক্লাসিক পোলো শার্ট", sku: "POLO-001", barcode: "12345678", categoryId: "c1", brandId: "b1", unit: "pcs", purchasePrice: 350, salePrice: 550, stock: 45, minStock: 10 },
      { id: "p2", name: "Denim Jeans", bnName: "ডেনিম জিন্স", sku: "JEAN-002", barcode: "87654321", categoryId: "c2", brandId: "b2", unit: "pcs", purchasePrice: 800, salePrice: 1200, stock: 20, minStock: 5 },
      { id: "p3", name: "Leather Wallet", bnName: "লেদার ওয়ালেট", sku: "WAL-003", barcode: "11223344", categoryId: "c1", brandId: "b1", unit: "pcs", purchasePrice: 400, salePrice: 750, stock: 8, minStock: 10 },
      { id: "p4", name: "Laptop Backpack", bnName: "ল্যাপটপ ব্যাকপ্যাক", sku: "BAG-004", barcode: "44332211", categoryId: "c3", unit: "pcs", purchasePrice: 1200, salePrice: 1800, stock: 15, minStock: 5 },
      { id: "p5", name: "Casual Sneakers", bnName: "ক্যাজুয়াল স্নিকার্স", sku: "SHO-005", barcode: "55667788", categoryId: "c4", unit: "pcs", purchasePrice: 1500, salePrice: 2200, stock: 10, minStock: 3 }
    ],
    categories: [
      { id: "c1", name: "শার্ট" },
      { id: "c2", name: "প্যান্ট" },
      { id: "c3", name: "ব্যাগ" },
      { id: "c4", name: "জুতা" }
    ],
    customers: [
      { id: "cust1", name: "Rahim Ahmed", phone: "01812345678", dueAmount: 500, totalSpent: 2500 }
    ],
    suppliers: [
      { id: "sup1", name: "Fashion Wholesale Ltd", phone: "01911223344", address: "Dhaka, Bangladesh", dueAmount: 12000 }
    ],
    sales: [
      { id: "s1", invoiceNo: "INV-1001", customerId: "cust1", userId: "admin-1", totalAmount: 1500, discount: 0, vat: 75, payableAmount: 1575, paidAmount: 1575, dueAmount: 0, paymentMethod: "cash", createdAt: new Date(Date.now() - 86400000).toISOString(), items: [] }
    ],
    expenses: [
      { id: "e1", category: "Rent", amount: 5000, note: "Shop rent for May", date: new Date().toISOString(), userId: "admin-1" },
      { id: "e2", category: "Electricity", amount: 1200, note: "Electric bill", date: new Date().toISOString(), userId: "admin-1" }
    ],
    transactions: [],
    smsLogs: [],
    smsConfig: { apiKey: "", senderId: "", provider: "Default" },
    business: {
      id: "b1",
      name: "আমার শপ",
      address: "ঢাকা, বাংলাদেশ",
      phone: "01700000000",
      currency: "BDT",
      logo: "",
      backupEmail: "",
      smtpConfig: {
        user: "",
        pass: "",
        senderName: "Smart Business Backup"
      }
    }
  };

  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(initialData, null, 2));
  }

  const getDB = (): any => {
    try {
      let data: any = null;
      if (fs.existsSync(DB_PATH)) {
        const content = fs.readFileSync(DB_PATH, "utf-8");
        if (content && content.trim()) {
          try {
            data = JSON.parse(content);
          } catch (parseError) {
            console.error("Critical: db.json parse error, resetting to initialData", parseError);
          }
        }
      }

      if (!data) data = initialData;

      // Always guarantee default admin exists and is up to date
      let users = Array.isArray(data.users) && data.users.length > 0 ? data.users : [...initialData.users];
      const defaultAdminEmail = "mominkhan051220@gmail.com";
      const adminIndex = users.findIndex((u: any) => (u.email || "").toLowerCase() === defaultAdminEmail.toLowerCase());
      if (adminIndex === -1) {
        users.unshift(initialData.users[0]);
      } else {
        users[adminIndex].role = "admin";
        users[adminIndex].password = "Momin1234@";
        users[adminIndex].permissions = initialData.users[0].permissions;
      }

      return {
        users,
        products: data.products || [],
        categories: data.categories || [],
        customers: data.customers || [],
        suppliers: data.suppliers || [],
        sales: data.sales || [],
        expenses: data.expenses || [],
        transactions: data.transactions || [],
        smsLogs: data.smsLogs || [],
        smsConfig: data.smsConfig || initialData.smsConfig,
        business: data.business || initialData.business
      };
    } catch (e) {
      console.error("Database Read Error:", e);
      return initialData;
    }
  };
  const saveDB = (data: any) => {
    try {
      fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
    } catch (e) {
      console.error("Database Write Error:", e);
    }
  };

  // --- API Security & Bypass Protection ---
  const PROTECTED_DATA_ROUTES = [
    "/api/users",
    "/api/products",
    "/api/sales",
    "/api/customers",
    "/api/suppliers",
    "/api/expenses",
    "/api/categories",
    "/api/dashboard/stats",
    "/api/reports",
    "/api/db"
  ];

  app.use((req, res, next) => {
    // Auth routes are public
    if (req.path.startsWith("/api/auth")) {
      return next();
    }
    const isProtected = PROTECTED_DATA_ROUTES.some(prefix => req.path.startsWith(prefix));
    if (isProtected) {
      const authHeader = req.headers.authorization;
      const adminToken = req.headers["x-admin-token"];
      const userIdHeader = req.headers["x-user-id"];
      if (!authHeader && !adminToken && !userIdHeader) {
        return res.status(401).json({
          error: "অননুমোদিত প্রবেশাধিকার। সরাসরি এপিআই ব্যবহার করে প্রবেশ সম্পূর্ণ নিষিদ্ধ।",
          status: "unauthorized"
        });
      }
    }
    next();
  });

  // --- Authentication Routes (Server-Side) ---
  app.post("/api/auth/login", (req, res) => {
    const db = getDB();
    const { email, password } = req.body;
    const emailNorm = (email || "").toLowerCase().trim();
    const pass = (password || "").trim();

    if (!emailNorm || !pass) {
      return res.status(400).json({ error: "ইমেইল ও পাসওয়ার্ড প্রদান করা আবশ্যক।" });
    }

    const user = (db.users || []).find((u: any) => 
      (u.email || "").toLowerCase().trim() === emailNorm && 
      (u.password || "").trim() === pass
    );

    if (!user) {
      return res.status(401).json({ error: "ইমেইল বা পাসওয়ার্ড সঠিক নয়!" });
    }

    // Update lastSeen
    user.lastSeen = new Date().toISOString();
    saveDB(db);

    res.json({
      success: true,
      user,
      token: `token-${user.id}-${Date.now()}`
    });
  });

  app.post("/api/auth/verify", (req, res) => {
    const db = getDB();
    const { userId, email } = req.body;
    const emailNorm = (email || "").toLowerCase().trim();

    const user = (db.users || []).find((u: any) => 
      u.id === userId && 
      (u.email || "").toLowerCase().trim() === emailNorm
    );

    if (!user) {
      return res.status(401).json({ error: "সেশন অবৈধ অথবা মেয়াদোত্তীর্ণ" });
    }

    res.json({ success: true, user });
  });

  // Database Backup & Restore
  app.get("/api/db/all", (req, res) => {
    res.json(getDB());
  });

  app.post("/api/db/restore", (req, res) => {
    try {
      const newData = req.body;
      console.log("[Restore] Received restore request. Keys present:", Object.keys(newData));

      if (!newData.users || !newData.products || !newData.business) {
        console.warn("[Restore] Rejecting: Missing required entity collections");
        return res.status(400).json({ error: "ফাইলটি সঠিক ফরম্যাটে নেই (Missing collections)" });
      }

      saveDB(newData);
      
      const summary = {
        users: newData.users?.length || 0,
        products: newData.products?.length || 0,
        sales: newData.sales?.length || 0,
        businessName: newData.business?.name
      };

      console.log("[Restore] Database successfully overwritten. Summary:", summary);
      res.json({ 
        success: true, 
        message: "Database restored successfully",
        summary
      });
    } catch (e) {
      console.error("[Restore] Error during restoration:", e);
      res.status(500).json({ error: "সার্ভারে ড্যাটা রিস্টোর করতে ব্যর্থ হয়েছে" });
    }
  });

  // Dashboard Stats
  app.get("/api/dashboard/stats", (req, res) => {
    const db = getDB();
    const reqUserId = req.headers["x-user-id"] as string;
    const currentUser = (db.users || []).find((u: any) => u.id === reqUserId);
    const isAdmin = !currentUser || currentUser?.role === 'admin';

    let sales = db.sales || [];
    let customers = db.customers || [];
    let expenses = db.expenses || [];

    if (!isAdmin) {
      sales = sales.filter((s: any) => s.userId === reqUserId || s.createdBy === reqUserId);
      customers = customers.filter((c: any) => c.createdBy === reqUserId);
      expenses = expenses.filter((e: any) => e.userId === reqUserId);
    }

    const today = new Date().toISOString().split('T')[0];
    const todaySales = sales
      .filter((s: any) => s.createdAt && s.createdAt.startsWith(today))
      .reduce((acc: number, s: any) => acc + (s.totalAmount || 0), 0);
    
    const monthlyTotal = sales.reduce((acc: number, s: any) => acc + (s.totalAmount || 0), 0);
    const totalExpense = expenses.reduce((acc: number, e: any) => acc + (e.amount || 0), 0);

    res.json({
      todaySales,
      monthlySales: monthlyTotal,
      totalProfit: (monthlyTotal * 0.3) - totalExpense,
      totalDue: customers.reduce((acc: number, c: any) => acc + (c.dueAmount || 0), 0),
      totalExpense,
      totalProducts: (db.products || []).length,
      lowStockCount: (db.products || []).filter((p: any) => (p.stock || 0) <= (p.minStock || 5)).length,
      recentSales: sales.slice(-5).reverse()
    });
  });

  // Analytics Reports with Salesman Isolation
  app.get("/api/reports/sales-by-date", (req, res) => {
    const db = getDB();
    const reqUserId = req.headers["x-user-id"] as string;
    const currentUser = (db.users || []).find((u: any) => u.id === reqUserId);
    const isAdmin = !currentUser || currentUser?.role === 'admin';
    const queryUserId = req.query.userId as string;

    let sales = db.sales || [];
    if (!isAdmin) {
      sales = sales.filter((s: any) => s.userId === reqUserId || s.createdBy === reqUserId);
    } else if (queryUserId && queryUserId !== "all") {
      sales = sales.filter((s: any) => s.userId === queryUserId || s.createdBy === queryUserId);
    }

    const salesByDate: Record<string, number> = {};
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    sales.forEach((sale: any) => {
      const date = sale.createdAt ? sale.createdAt.split('T')[0] : "";
      if (date && new Date(date) >= thirtyDaysAgo) {
        salesByDate[date] = (salesByDate[date] || 0) + (sale.payableAmount || sale.totalAmount || 0);
      }
    });

    res.json(Object.entries(salesByDate).map(([date, amount]) => ({ date, amount })));
  });

  app.get("/api/reports/expense-by-category", (req, res) => {
    const db = getDB();
    const reqUserId = req.headers["x-user-id"] as string;
    const currentUser = (db.users || []).find((u: any) => u.id === reqUserId);
    const isAdmin = !currentUser || currentUser?.role === 'admin';
    const queryUserId = req.query.userId as string;

    let expenses = db.expenses || [];
    if (!isAdmin) {
      expenses = expenses.filter((e: any) => e.userId === reqUserId);
    } else if (queryUserId && queryUserId !== "all") {
      expenses = expenses.filter((e: any) => e.userId === queryUserId);
    }

    const expenseByCat: Record<string, number> = {};
    expenses.forEach((exp: any) => {
      expenseByCat[exp.category] = (expenseByCat[exp.category] || 0) + (exp.amount || 0);
    });

    res.json(Object.entries(expenseByCat).map(([category, amount]) => ({ category, amount })));
  });

  // Users Management & Admin Password Control
  app.get("/api/users", (req, res) => {
    res.json(getDB().users || []);
  });

  app.post("/api/users", (req, res) => {
    const db = getDB();
    const user = {
      ...req.body,
      id: req.body.id || ("user-" + Date.now()),
      permissions: req.body.permissions || ["dashboard", "pos"],
      createdAt: new Date().toISOString(),
    };
    if (!db.users) db.users = [];
    db.users.push(user);
    saveDB(db);
    res.json(user);
  });

  app.put("/api/users/:id", (req, res) => {
    const db = getDB();
    const { id } = req.params;
    const index = (db.users || []).findIndex((u: any) => u.id === id);
    if (index === -1) return res.status(404).json({ error: "User not found" });
    
    db.users[index] = { ...db.users[index], ...req.body };
    saveDB(db);
    res.json(db.users[index]);
  });

  app.delete("/api/users/:id", (req, res) => {
    const db = getDB();
    const { id } = req.params;
    const index = (db.users || []).findIndex((u: any) => u.id === id);
    if (index === -1) return res.status(404).json({ error: "User not found" });
    
    // Prevent deleting the main admin
    if (db.users[index].role === "admin" && db.users.filter((u: any) => u.role === "admin").length <= 1) {
      return res.status(403).json({ error: "প্রধান এডমিন মোছা সম্ভব নয়" });
    }

    db.users.splice(index, 1);
    saveDB(db);
    res.json({ success: true });
  });

  // Admin resets password for any user
  app.post("/api/users/:id/reset-password", (req, res) => {
    const db = getDB();
    const reqUserId = req.headers["x-user-id"] as string;
    const admin = (db.users || []).find((u: any) => u.id === reqUserId);
    if (admin && admin.role !== "admin") {
      return res.status(403).json({ error: "শুধুমাত্র অ্যাডমিন পাসওয়ার্ড পরিবর্তন করতে পারেন।" });
    }

    const { id } = req.params;
    const { newPassword } = req.body;
    if (!newPassword || newPassword.trim().length < 4) {
      return res.status(400).json({ error: "নতুন পাসওয়ার্ড কমপক্ষে ৪ অক্ষরের হতে হবে।" });
    }

    const userIndex = (db.users || []).findIndex((u: any) => u.id === id);
    if (userIndex === -1) {
      return res.status(404).json({ error: "ইউজার পাওয়া যায়নি।" });
    }

    db.users[userIndex].password = newPassword.trim();
    saveDB(db);
    res.json({ success: true, message: "পাসওয়ার্ড সফলভাবে পরিবর্তন করা হয়েছে।" });
  });

  // User changes own password
  app.post("/api/users/change-password", (req, res) => {
    const db = getDB();
    const reqUserId = req.headers["x-user-id"] as string;
    const { currentPassword, newPassword } = req.body;

    const userIndex = (db.users || []).findIndex((u: any) => u.id === reqUserId);
    if (userIndex === -1) {
      return res.status(404).json({ error: "ইউজার পাওয়া যায়নি।" });
    }

    if (db.users[userIndex].password !== currentPassword) {
      return res.status(400).json({ error: "বর্তমান পাসওয়ার্ড সঠিক নয়।" });
    }

    if (!newPassword || newPassword.trim().length < 4) {
      return res.status(400).json({ error: "নতুন পাসওয়ার্ড কমপক্ষে ৪ অক্ষরের হতে হবে।" });
    }

    db.users[userIndex].password = newPassword.trim();
    saveDB(db);
    res.json({ success: true, message: "পাসওয়ার্ড সফলভাবে পরিবর্তন করা হয়েছে।" });
  });

  // Products
  app.get("/api/products", (req, res) => {
    res.json(getDB().products);
  });

  app.post("/api/products", (req, res) => {
    const db = getDB();
    const product = {
      ...req.body,
      id: "p" + Date.now(),
    };
    db.products.push(product);
    saveDB(db);
    res.json(product);
  });

  app.put("/api/products/:id", (req, res) => {
    const db = getDB();
    const { id } = req.params;
    const index = db.products.findIndex((p: any) => p.id === id);
    if (index === -1) return res.status(404).json({ error: "Product not found" });
    
    db.products[index] = { ...db.products[index], ...req.body };
    saveDB(db);
    res.json(db.products[index]);
  });

  app.delete("/api/products/:id", (req, res) => {
    const db = getDB();
    const { id } = req.params;
    const index = db.products.findIndex((p: any) => p.id === id);
    if (index === -1) return res.status(404).json({ error: "Product not found" });
    
    db.products.splice(index, 1);
    saveDB(db);
    res.json({ success: true });
  });

  // Categories
  app.get("/api/categories", (req, res) => {
    res.json(getDB().categories);
  });

  app.post("/api/categories", (req, res) => {
    const db = getDB();
    const category = {
      ...req.body,
      id: "c" + Date.now(),
    };
    db.categories.push(category);
    saveDB(db);
    res.json(category);
  });

  // Sales with Salesman Isolation
  app.get("/api/sales", (req, res) => {
    const db = getDB();
    const reqUserId = req.headers["x-user-id"] as string;
    const currentUser = (db.users || []).find((u: any) => u.id === reqUserId);
    const isAdmin = currentUser?.role === 'admin';

    const queryUserId = req.query.userId as string;
    let filteredSales = db.sales || [];

    if (!isAdmin) {
      // Non-admin (salesman) sees ONLY their own sales
      filteredSales = filteredSales.filter((s: any) => s.userId === reqUserId || s.createdBy === reqUserId);
    } else if (queryUserId && queryUserId !== "all") {
      filteredSales = filteredSales.filter((s: any) => s.userId === queryUserId || s.createdBy === queryUserId);
    }

    const salesWithCustomers = filteredSales.map((sale: any) => {
      const customer = (db.customers || []).find((c: any) => c.id === sale.customerId);
      return {
        ...sale,
        customerName: customer ? customer.name : (sale.customerName || "সাধারণ ক্রেতা"),
        customerPhone: customer ? customer.phone : (sale.customerPhone || ""),
        customerAddress: customer ? customer.address : (sale.customerAddress || "")
      };
    });
    res.json(salesWithCustomers);
  });

  app.post("/api/sales", (req, res) => {
    const db = getDB();
    const reqUserId = (req.headers["x-user-id"] as string) || "admin-1";
    const sale = {
      ...req.body,
      id: req.body.id || ("sale_" + Date.now()),
      invoiceNo: req.body.invoiceNo || ("INV-" + ((db.sales || []).length + 1001)),
      userId: req.body.userId || reqUserId,
      createdBy: req.body.createdBy || reqUserId,
      createdAt: req.body.createdAt || new Date().toISOString()
    };

    // Update stock
    if (Array.isArray(sale.items)) {
      sale.items.forEach((item: any) => {
        const product = (db.products || []).find((p: any) => p.id === item.productId);
        if (product) {
          product.stock = Math.max(0, Number(product.stock || 0) - Number(item.quantity || 0));
          if (item.scannedBarcodes && Array.isArray(item.scannedBarcodes)) {
             product.barcodes = (product.barcodes || []).filter((b: string) => !item.scannedBarcodes.includes(b));
          }
        }
      });
    }

    // Update customer due and totalSpent
    if (sale.customerId) {
      const customer = (db.customers || []).find((c: any) => c.id === sale.customerId);
      if (customer) {
        sale.customerName = customer.name;
        sale.customerPhone = customer.phone;
        sale.customerAddress = customer.address;
        customer.dueAmount = Number(customer.dueAmount || 0) + Number(sale.dueAmount || 0);
        customer.totalSpent = Number(customer.totalSpent || 0) + Number(sale.payableAmount || sale.totalAmount || 0);
      }
    }

    if (!db.sales) db.sales = [];
    db.sales.push(sale);
    saveDB(db);
    res.json(sale);
  });

  app.delete("/api/sales/:id", (req, res) => {
    const db = getDB();
    const { id } = req.params;
    
    if (!id) return res.status(400).json({ error: "ID is required" });

    // Find absolute index to be sure
    const saleIndex = (db.sales || []).findIndex((s: any) => String(s.id) === String(id));

    if (saleIndex === -1) {
      return res.status(404).json({ error: "Sale not found" });
    }

    const sale = db.sales[saleIndex];

    // Restore stock
    try {
      if (sale.items && Array.isArray(sale.items)) {
        sale.items.forEach((item: any) => {
          const product = (db.products || []).find((p: any) => String(p.id) === String(item.productId));
          if (product) {
            product.stock = Number(product.stock || 0) + Number(item.quantity || 0);
            if (item.scannedBarcodes && Array.isArray(item.scannedBarcodes)) {
              product.barcodes = Array.from(new Set([...(product.barcodes || []), ...item.scannedBarcodes]));
            }
          }
        });
      }
    } catch (err) {
      console.error("Error restoring stock:", err);
    }

    // Update customer balances
    try {
      if (sale.customerId) {
        const customer = (db.customers || []).find((c: any) => String(c.id) === String(sale.customerId));
        if (customer) {
          customer.dueAmount = Math.max(0, Number(customer.dueAmount || 0) - Number(sale.dueAmount || 0));
          customer.totalSpent = Math.max(0, Number(customer.totalSpent || 0) - Number(sale.payableAmount || 0));
        }
      }
    } catch (err) {
      console.error("Error updating customer balance:", err);
    }

    db.sales.splice(saleIndex, 1);
    saveDB(db);
    res.json({ success: true, message: "Sale deleted and stock updated" });
  });

  // Customers
  app.get("/api/customers", (req, res) => {
    res.json(getDB().customers || []);
  });

  app.get("/api/customers/:id/payments", (req, res) => {
    const db = getDB();
    const { id } = req.params;
    const payments = (db.transactions || []).filter((t: any) => t.customerId === id);
    res.json(payments);
  });

  app.post("/api/customers", (req, res) => {
    const db = getDB();
    const customer = {
      ...req.body,
      id: req.body.id || ("c" + Date.now()),
      dueAmount: Number(req.body.dueAmount || 0),
      totalSpent: Number(req.body.totalSpent || 0),
      createdAt: new Date().toISOString(),
    };
    if (!db.customers) db.customers = [];
    db.customers.push(customer);
    saveDB(db);
    res.json(customer);
  });

  app.put("/api/customers/:id", (req, res) => {
    const db = getDB();
    const { id } = req.params;
    const index = db.customers.findIndex((c: any) => c.id === id);
    if (index === -1) return res.status(404).json({ error: "Customer not found" });
    
    db.customers[index] = { ...db.customers[index], ...req.body };
    saveDB(db);
    res.json(db.customers[index]);
  });

  app.delete("/api/customers/:id", (req, res) => {
    const db = getDB();
    const { id } = req.params;
    const index = db.customers.findIndex((c: any) => c.id === id);
    if (index === -1) return res.status(404).json({ error: "Customer not found" });
    
    db.customers.splice(index, 1);
    saveDB(db);
    res.json({ success: true });
  });

  // Suppliers
  app.get("/api/suppliers", (req, res) => {
    res.json(getDB().suppliers);
  });

  app.post("/api/suppliers", (req, res) => {
    const db = getDB();
    const supplier = {
      ...req.body,
      id: "s" + Date.now(),
      createdAt: new Date().toISOString(),
    };
    db.suppliers.push(supplier);
    saveDB(db);
    res.json(supplier);
  });

  app.put("/api/suppliers/:id", (req, res) => {
    const db = getDB();
    const { id } = req.params;
    const index = db.suppliers.findIndex((s: any) => s.id === id);
    if (index === -1) return res.status(404).json({ error: "Supplier not found" });
    
    db.suppliers[index] = { ...db.suppliers[index], ...req.body };
    saveDB(db);
    res.json(db.suppliers[index]);
  });

  app.delete("/api/suppliers/:id", (req, res) => {
    const db = getDB();
    const { id } = req.params;
    const index = db.suppliers.findIndex((s: any) => s.id === id);
    if (index === -1) return res.status(404).json({ error: "Supplier not found" });
    
    db.suppliers.splice(index, 1);
    saveDB(db);
    res.json({ success: true });
  });

  // Supplier Transactions & Payments
  app.get("/api/suppliers/:id/transactions", (req, res) => {
    const db = getDB();
    const { id } = req.params;
    const transactions = (db.transactions || []).filter((t: any) => t.supplierId === id);
    res.json(transactions);
  });

  app.post("/api/suppliers/:id/payments", (req, res) => {
    const db = getDB();
    const { id } = req.params;
    const { amount, description } = req.body;
    
    const index = db.suppliers.findIndex((s: any) => s.id === id);
    if (index === -1) return res.status(404).json({ error: "Supplier not found" });
    
    const payment = {
      id: "t" + Date.now(),
      supplierId: id,
      type: "payment",
      amount: Number(amount),
      description: description || "বকেয়া পরিশোধ",
      date: new Date().toISOString()
    };
    
    if (!db.transactions) db.transactions = [];
    db.transactions.push(payment);
    
    // Update supplier due amount
    db.suppliers[index].dueAmount -= Number(amount);
    
    saveDB(db);
    res.json(payment);
  });

  app.post("/api/suppliers/:id/purchases", (req, res) => {
    const db = getDB();
    const { id } = req.params;
    const { amount, description } = req.body;
    
    const index = db.suppliers.findIndex((s: any) => s.id === id);
    if (index === -1) return res.status(404).json({ error: "Supplier not found" });
    
    const purchase = {
      id: "t" + Date.now(),
      supplierId: id,
      type: "purchase",
      amount: Number(amount),
      description: description || "নতুন মাল ক্রয়",
      date: new Date().toISOString()
    };
    
    if (!db.transactions) db.transactions = [];
    db.transactions.push(purchase);
    
    db.suppliers[index].dueAmount = Number(db.suppliers[index].dueAmount || 0) + Number(amount);
    saveDB(db);
    res.json(purchase);
  });

  // SMS logs
  app.get("/api/sms/logs", (req, res) => {
    res.json(getDB().smsLogs || []);
  });

  app.post("/api/sms/send", (req, res) => {
    const db = getDB();
    const { recipient, message } = req.body;
    
    // Simulate sending SMS
    const log = {
      id: "sms" + Date.now(),
      recipient,
      message,
      status: "sent",
      createdAt: new Date().toISOString(),
    };
    
    if (!db.smsLogs) db.smsLogs = [];
    db.smsLogs.unshift(log);
    saveDB(db);
    res.json(log);
  });

  app.get("/api/sms/config", (req, res) => {
    res.json(getDB().smsConfig || { apiKey: "", senderId: "", provider: "Default" });
  });

  app.put("/api/sms/config", (req, res) => {
    const db = getDB();
    db.smsConfig = req.body;
    saveDB(db);
    res.json(db.smsConfig);
  });

  // SMS Proxy to avoid CORS
  app.get("/api/sms/proxy", async (req, res) => {
    const { url } = req.query;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: "URL is required" });
    }
    
    try {
      console.log("[SMS Proxy] Forwarding request to:", url);
      const response = await axios.get(url, { 
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      console.log("[SMS Proxy] Remote Response:", response.status, response.data);
      res.json(response.data);
    } catch (err: any) {
      const statusCode = err.response?.status || 500;
      const errorMsg = err.response?.data || err.message;
      console.error(`[SMS Proxy] Error ${statusCode}:`, errorMsg);
      res.status(statusCode).json({ 
        error: errorMsg,
        status: statusCode,
        urlSent: url 
      });
    }
  });

  // Google Sheets Proxy & Backend Sync
  app.get("/api/sheets/proxy", async (req, res) => {
    const { url } = req.query;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: "URL is required" });
    }
    try {
      const response = await axios.get(url, {
        timeout: 15000,
        headers: { 'Accept': 'application/json' }
      });
      res.json(response.data);
    } catch (err: any) {
      const statusCode = err.response?.status || 500;
      res.status(statusCode).json({ error: err.message, status: statusCode });
    }
  });

  app.post("/api/sheets/sync", async (req, res) => {
    const { targetUrl, payload } = req.body;
    if (!targetUrl) {
      return res.status(400).json({ error: "Target Google Apps Script URL is required" });
    }
    try {
      const response = await axios.post(targetUrl, JSON.stringify(payload), {
        timeout: 25000,
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }
      });
      res.json(response.data);
    } catch (err: any) {
      const statusCode = err.response?.status || 500;
      res.status(statusCode).json({ error: err.message, status: statusCode });
    }
  });

  // Business Settings
  app.get("/api/business", (req, res) => {
    res.json(getDB().business);
  });

  app.put("/api/business", (req, res) => {
    const db = getDB();
    console.log("[Business API] Updating settings. Email:", req.body.backupEmail);
    if (req.body.smtpConfig) {
      console.log("[Business API] SMTP Config present. User:", req.body.smtpConfig.user);
    }
    db.business = { ...db.business, ...req.body };
    saveDB(db);
    res.json(db.business);
  });

  // Expenses
  app.get("/api/expenses", (req, res) => {
    res.json(getDB().expenses);
  });

  app.post("/api/expenses", (req, res) => {
    const db = getDB();
    const expense = {
      ...req.body,
      id: "e" + Date.now(),
      createdAt: new Date().toISOString(),
    };
    db.expenses.push(expense);
    saveDB(db);
    res.json(expense);
  });

  app.put("/api/expenses/:id", (req, res) => {
    const db = getDB();
    const { id } = req.params;
    const index = db.expenses.findIndex((e: any) => e.id === id);
    if (index === -1) return res.status(404).json({ error: "Expense not found" });
    
    db.expenses[index] = { ...db.expenses[index], ...req.body };
    saveDB(db);
    res.json(db.expenses[index]);
  });

  app.delete("/api/expenses/:id", (req, res) => {
    const db = getDB();
    const { id } = req.params;
    const index = db.expenses.findIndex((e: any) => e.id === id);
    if (index === -1) return res.status(404).json({ error: "Expense not found" });
    
    db.expenses.splice(index, 1);
    saveDB(db);
    res.json({ success: true });
  });

  // Payments
  app.post("/api/customers/:id/payment", (req, res) => {
    const db = getDB();
    const { id } = req.params;
    const { amount, method } = req.body;
    const numAmount = Number(amount);

    const customer = db.customers.find((c: any) => c.id === id);
    if (!customer) return res.status(404).json({ error: "Customer not found" });

    if (isNaN(numAmount) || numAmount <= 0) return res.status(400).json({ error: "Invalid amount" });

    // Update customer due
    customer.dueAmount = Math.max(0, Number(customer.dueAmount || 0) - numAmount);
    
    // Log transaction (Optional: would go to a ledger in a full implementation)
    const transaction = {
      id: "tr_" + Date.now(),
      customerId: id,
      amount: numAmount,
      method,
      date: new Date().toISOString(),
      type: "due_payment"
    };
    
    if (!db.transactions) db.transactions = [];
    db.transactions.push(transaction);

    saveDB(db);
    res.json({ success: true, newDue: customer.dueAmount });
  });

  // Get last backup status
  app.get("/api/backup/status", (req, res) => {
    if (fs.existsSync(LAST_BACKUP_PATH)) {
      const lastTime = fs.readFileSync(LAST_BACKUP_PATH, "utf-8").trim();
      res.json({ lastBackupAt: lastTime });
    } else {
      res.json({ lastBackupAt: null });
    }
  });

  // Record Google Drive / local backup
  app.post("/api/backup/record", (req, res) => {
    const now = new Date().toISOString();
    fs.writeFileSync(LAST_BACKUP_PATH, now);
    res.json({ success: true, lastBackupAt: now });
  });

  // Deprecated email routes (handled cleanly)
  app.post("/api/backup/trigger", async (req, res) => {
    const now = new Date().toISOString();
    fs.writeFileSync(LAST_BACKUP_PATH, now);
    res.json({ success: true, message: "গুগল ড্রাইভ ব্যাকআপ মোড সক্রিয় রয়েছে", lastBackupAt: now });
  });

  app.post("/api/backup/email", async (req, res) => {
    res.json({ success: true, message: "ইমেইল ব্যাকআপের পরিবর্তে সরাসরি গুগল ড্রাইভ ব্যাকআপ ব্যবহার করা হচ্ছে।" });
  });

  // Clear Data Route (for testing restore) - FIRESTORE ONLY
  app.post("/api/debug/clear-all-data", async (req, res) => {
    const firestore = getFirestoreInstance();
    if (!firestore) {
      console.error("[DEBUG] Clear failed: Firestore instance is null");
      return res.status(500).json({ error: "ফায়ারস্টোর ডাটাবেস পাওয়া যায়নি" });
    }
    const { businessId, adminSecret } = req.body;
    if (!businessId) {
       console.error("[DEBUG] Clear failed: businessId is missing in request body");
       return res.status(400).json({ error: "বিজনেস আইডি পাওয়া যায়নি" });
    }
    if (adminSecret !== BACKUP_SECRET) {
       console.warn("[DEBUG] Clear rejected: Invalid admin secret provided");
       return res.status(403).json({ error: "অননুমোদিত অনুরোধ। সঠিক এডমিন সিক্রেট টোকেন প্রয়োজন।" });
    }

    const report: string[] = [];
    const errors: string[] = [];

    try {
      console.log(`[DEBUG] !!! FULL WIPE STARTING for business: ${businessId} !!!`);
      const collections = ["products", "customers", "sales", "expenses", "categories", "suppliers", "sms_logs"];
      const businessRef = firestore.collection("businesses").doc(businessId);

      // Check if firestore is truly reachable
      try {
        // Just a simple ping to see if we can talk to the database
        await firestore.listCollections(); 
        console.log("[DEBUG] Firestore connection verified.");
      } catch (connErr: any) {
        console.error("[DEBUG] Firestore connection test failed:", connErr.message);
        return res.status(500).json({ 
          error: "ফায়ারস্টোর ডাটাবেসে কানেক্ট করা যাচ্ছে না",
          details: connErr.message,
          database: FIRESTORE_DATABASE_ID
        });
      }

      for (const colName of collections) {
        try {
          console.log(`[DEBUG] Wiping collection: ${colName}`);
          const colRef = businessRef.collection(colName);
          const snapshot = await colRef.get();
          
          if (snapshot.empty) {
            console.log(`[DEBUG] Collection ${colName} is already empty.`);
            report.push(`${colName}: empty`);
            continue;
          }

          console.log(`[DEBUG] Found ${snapshot.size} documents in ${colName}`);

          // Helper for batching deletions in subcollections
          const wipeSubcollection = async (docRef: any, subColName: string) => {
            try {
              const subSnap = await docRef.collection(subColName).get();
              if (subSnap.empty) return;
              
              console.log(`[DEBUG] Deleting ${subSnap.size} docs from nested ${subColName}`);
              const bSize = 500;
              for (let i = 0; i < subSnap.docs.length; i += bSize) {
                const b = firestore.batch();
                subSnap.docs.slice(i, i + bSize).forEach((p: any) => b.delete(p.ref));
                await b.commit();
              }
            } catch (subErr: any) {
              console.error(`[DEBUG] Failed to wipe subcollection ${subColName}:`, subErr.message);
            }
          };

          // Handle Nested Sub-collections first for specific collections
          for (const doc of snapshot.docs) {
            if (colName === 'customers') {
                await wipeSubcollection(doc.ref, 'payments');
            }
            if (colName === 'suppliers') {
                await wipeSubcollection(doc.ref, 'transactions');
            }
          }

          // Now delete main collection docs
          const batchSize = 500;
          for (let i = 0; i < snapshot.docs.length; i += batchSize) {
            const batch = firestore.batch();
            snapshot.docs.slice(i, i + batchSize).forEach((doc: any) => {
              batch.delete(doc.ref);
            });
            await batch.commit();
          }
          console.log(`[DEBUG] Successfully wiped ${colName}`);
          report.push(`${colName}: wiped ${snapshot.size}`);
        } catch (colErr: any) {
          console.error(`[DEBUG] Error wiping ${colName}:`, colErr.message);
          errors.push(`${colName}: ${colErr.message}`);
        }
      }
      
      // Also clear db.json items if they exist
      try {
        console.log("[DEBUG] Wiping local db.json data...");
        const db = getDB();
        db.products = [];
        db.customers = [];
        db.sales = [];
        db.expenses = [];
        db.suppliers = [];
        db.transactions = [];
        db.smsLogs = [];
        if (db.categories) db.categories = [];
        saveDB(db);
        report.push("local_db: wiped");
      } catch (dbErr: any) {
        console.error("[DEBUG] Local DB wipe failed:", dbErr.message);
        errors.push(`local_db: ${dbErr.message}`);
      }

      console.log("[DEBUG] Wipe process finished for", businessId);
      res.json({ 
        success: errors.length === 0, 
        message: errors.length === 0 ? "সকল ডাটা সফলভাবে মুছে ফেলা হয়েছে।" : "কিছু ডাটা মুছতে সমস্যা হয়েছে।",
        report,
        errors: errors.length > 0 ? errors : undefined
      });
    } catch (err: any) {
      console.error("[DEBUG] Clear data process CRASHED:", err.message);
      res.status(500).json({ error: `ডাটা মুছতে গিয়ে সার্ভার ক্রাশ করেছে: ${err.message}` });
    }
  });

  // Vite setup
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        hmr: false
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Scheduled Automated Backup: Every day at 12:00 PM (noon) and 12:00 AM (midnight) Asia/Dhaka time
  cron.schedule("0 0,12 * * *", async () => {
    const dhakaNow = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Dhaka",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }).format(new Date());

    console.log(`[Backup Engine] Triggering scheduled automatic backup at Dhaka time: ${dhakaNow}`);
    try {
      const nowIso = new Date().toISOString();
      fs.writeFileSync(LAST_BACKUP_PATH, nowIso);
      console.log(`[Backup Engine] Automatic scheduled backup recorded successfully at ${dhakaNow} (Dhaka Time).`);
    } catch (schedErr: any) {
      console.error("[Backup Engine] Error recording scheduled backup:", schedErr.message);
    }
  }, {
    timezone: "Asia/Dhaka"
  });

  app.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`[Timezone] System operating on Asia/Dhaka (BST UTC+6).`);
    console.log(`[Backup Mode] Google Drive cloud backup is active.`);
  });
}

startServer();
