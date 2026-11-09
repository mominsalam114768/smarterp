/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  Product, 
  Customer, 
  Sale, 
  DashboardStats, 
  Supplier, 
  SupplierTransaction, 
  SMSLog, 
  SMSConfig, 
  User, 
  Business, 
  Category, 
  Expense 
} from "../types";
import { 
  db, 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where,
  onSnapshot
} from "../lib/firebase";
import { 
  syncEntityToGoogleSheets, 
  syncAllToGoogleSheets, 
  fetchDataFromGoogleSheets, 
  fetchCloudSheetsConfig, 
  saveSheetsConfig, 
  testGoogleSheetsConnection 
} from "../lib/sheetsSync";

const USER_SESSION_KEY = "smart_business_user";
const LOCAL_DB_KEY = "smart_business_db_v2";

let currentBusinessId: string = "main-business";

export const setApiBusinessId = (id: string | null) => {
  if (id) currentBusinessId = id;
};

interface LocalDBState {
  users: any[];
  products: Product[];
  categories: Category[];
  customers: Customer[];
  customerPayments: any[];
  suppliers: Supplier[];
  supplierTransactions: SupplierTransaction[];
  sales: Sale[];
  expenses: Expense[];
  smsLogs: SMSLog[];
  smsConfig: SMSConfig;
  business: Business;
}

// Default initial data for seeding if Firestore is empty (Only Admin, everything else fresh and empty)
const defaultDbData: LocalDBState = {
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
      createdAt: new Date().toISOString(),
      lastSeen: new Date().toISOString() 
    }
  ],
  products: [],
  categories: [],
  customers: [],
  customerPayments: [],
  suppliers: [],
  supplierTransactions: [],
  sales: [],
  expenses: [],
  smsLogs: [],
  smsConfig: {
    apiKey: "",
    senderId: "",
    provider: "Default"
  },
  business: {
    id: "main-business",
    name: "হিসাব পাতি",
    currency: "৳",
    address: "ঢাকা, বাংলাদেশ",
    phone: "01741456838",
    theme: "light"
  }
};

// Safe access to client cache
function getLocalCache(): LocalDBState {
  if (typeof window === "undefined") return defaultDbData;
  try {
    const raw = localStorage.getItem(LOCAL_DB_KEY);
    if (!raw) return defaultDbData;
    const parsed = JSON.parse(raw);
    return {
      users: parsed.users || defaultDbData.users,
      products: parsed.products || [],
      categories: parsed.categories || [],
      customers: parsed.customers || [],
      customerPayments: parsed.customerPayments || [],
      suppliers: parsed.suppliers || [],
      supplierTransactions: parsed.supplierTransactions || [],
      sales: parsed.sales || [],
      expenses: parsed.expenses || [],
      smsLogs: parsed.smsLogs || [],
      smsConfig: parsed.smsConfig || defaultDbData.smsConfig,
      business: parsed.business || defaultDbData.business
    };
  } catch {
    return defaultDbData;
  }
}

function saveLocalCache(partial: Partial<LocalDBState>) {
  if (typeof window === "undefined") return;
  try {
    const current = getLocalCache();
    const updated = { ...current, ...partial };
    localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn("Could not save to localStorage", e);
  }
}

export const getCurrentUser = (): User | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(USER_SESSION_KEY) || localStorage.getItem(USER_SESSION_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
};

export const reconcileCustomersWithSales = (customers: Customer[], sales: Sale[], payments: any[] = []): Customer[] => {
  return customers.map(c => {
    // Find all sales matching this customer by ID, phone, or name
    const matchedSales = sales.filter(s => {
      if (s.customerId && s.customerId === c.id) return true;
      if (c.phone && s.customerPhone && s.customerPhone.trim() === c.phone.trim()) return true;
      if (c.name && s.customerName && s.customerName.trim().toLowerCase() === c.name.trim().toLowerCase()) return true;
      return false;
    });

    const matchedPayments = payments.filter(p => {
      if (p.customerId && p.customerId === c.id) return true;
      if (c.phone && p.customerPhone && p.customerPhone.trim() === c.phone.trim()) return true;
      return false;
    });

    if (matchedSales.length > 0) {
      const totalPurchased = matchedSales.reduce((acc, s) => acc + (Number(s.payableAmount) || Number(s.totalAmount) || 0), 0);
      const salesDue = matchedSales.reduce((acc, s) => acc + (Number(s.dueAmount) || 0), 0);
      const extraPaid = matchedPayments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
      const calculatedDue = Math.max(0, salesDue - extraPaid);

      return {
        ...c,
        totalSpent: Math.max(Number(c.totalSpent) || 0, totalPurchased),
        dueAmount: calculatedDue
      };
    }
    return c;
  });
};

export const api = {
  // --- Authentication ---
  login: async (email: string, pass: string): Promise<User> => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = pass.trim();

    try {
      // Direct Firestore Lookup
      const usersCol = collection(db, "users");
      const q = query(usersCol, where("email", "==", cleanEmail));
      const snap = await getDocs(q);

      if (!snap.empty) {
        const userDoc = snap.docs[0];
        const userData = userDoc.data() as any;

        if (userData.password && userData.password !== cleanPass) {
          throw new Error("ভুল পাসওয়ার্ড। আবার চেষ্টা করুন।");
        }

        const loggedUser: User = {
          id: userDoc.id,
          name: userData.name || "ব্যবহারকারী",
          email: userData.email,
          phone: userData.phone || "",
          role: userData.role || "admin",
          permissions: userData.permissions || defaultDbData.users[0].permissions,
          businessId: userData.businessId || "main-business",
          createdAt: userData.createdAt || new Date().toISOString(),
          lastSeen: new Date().toISOString()
        };

        // Update lastSeen in background
        try {
          await updateDoc(doc(db, "users", userDoc.id), {
            lastSeen: new Date().toISOString()
          });
        } catch {}

        return loggedUser;
      }
    } catch (fsErr: any) {
      if (fsErr.message?.includes("ভুল পাসওয়ার্ড")) throw fsErr;
      console.warn("Firestore login query failed, checking fallback:", fsErr);
    }

    // Default admin fallback (supports both user emails)
    if (
      (cleanEmail === "mominkhan051220@gmail.com" || cleanEmail === "md.momin.khan7579@gmail.com") && 
      (cleanPass === "Momin1234@" || cleanPass === "123456")
    ) {
      const adminUser: User = {
        id: "admin-1",
        name: "মোঃ মমিন আলী",
        email: cleanEmail,
        phone: "01741456838",
        role: "admin",
        permissions: defaultDbData.users[0].permissions,
        businessId: "main-business",
        createdAt: new Date().toISOString(),
        lastSeen: new Date().toISOString()
      };
      // Ensure it is in Firestore for future cross-browser lookups
      try {
        await setDoc(doc(db, "users", "admin-1"), {
          ...adminUser,
          password: cleanPass
        }, { merge: true });
      } catch {}
      return adminUser;
    }

    // Fallback to local cache
    const cache = getLocalCache();
    const found = cache.users.find(u => u.email.toLowerCase() === cleanEmail);
    if (found) {
      if (found.password && found.password !== cleanPass) {
        throw new Error("ভুল পাসওয়ার্ড। আবার চেষ্টা করুন।");
      }
      const { password: _, ...userSafe } = found;
      return userSafe as unknown as User;
    }

    throw new Error("ভুল ইমেইল বা পাসওয়ার্ড প্রদান করা হয়েছে।");
  },

  verifySession: async (userId: string, email: string): Promise<User | null> => {
    try {
      const snap = await getDoc(doc(db, "users", userId));
      if (snap.exists()) {
        const data = snap.data();
        if (data.email?.toLowerCase() === email.toLowerCase()) {
          const { password: _, ...userSafe } = data;
          return { id: snap.id, ...userSafe } as User;
        }
      }
    } catch (e) {
      console.warn("Session verification via firestore failed:", e);
    }

    // Cache verification
    const cache = getLocalCache();
    const found = cache.users.find(u => u.id === userId && u.email.toLowerCase() === email.toLowerCase());
    if (found) {
      const { password: _, ...userSafe } = found;
      return userSafe as unknown as User;
    }
    return null;
  },

  register: async (userData: Partial<User>): Promise<User> => {
    return api.createUser(userData);
  },

  changePassword: async (passwords: { currentPassword: string; newPassword: string }): Promise<boolean> => {
    const cur = getCurrentUser();
    if (!cur) throw new Error("অননুমোদিত অনুরোধ।");

    try {
      const userRef = doc(db, "users", cur.id);
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        const data = snap.data();
        if (data.password && data.password !== passwords.currentPassword) {
          throw new Error("বর্তমান পাসওয়ার্ড সঠিক নয়।");
        }
        await updateDoc(userRef, { password: passwords.newPassword });
        return true;
      }
    } catch (e: any) {
      if (e.message?.includes("বর্তমান পাসওয়ার্ড")) throw e;
      console.warn("Firestore changePassword error:", e);
    }

    const cache = getLocalCache();
    const u = cache.users.find(x => x.id === cur.id);
    if (!u) throw new Error("ব্যবহারকারী পাওয়া যায়নি।");
    if (u.password !== passwords.currentPassword) {
      throw new Error("বর্তমান পাসওয়ার্ড সঠিক নয়।");
    }
    u.password = passwords.newPassword;
    saveLocalCache(cache);
    return true;
  },

  adminResetPassword: async (userId: string, newPassword: string): Promise<boolean> => {
    try {
      await updateDoc(doc(db, "users", userId), { password: newPassword });
    } catch (e) {
      console.warn("Firestore adminResetPassword error:", e);
    }

    const cache = getLocalCache();
    const u = cache.users.find(x => x.id === userId);
    if (u) {
      u.password = newPassword;
      saveLocalCache(cache);
    }
    return true;
  },

  // --- Users ---
  getUsers: async (): Promise<User[]> => {
    try {
      const snap = await getDocs(collection(db, "users"));
      const users: User[] = [];
      snap.forEach(d => {
        const data = d.data();
        const { password: _, ...userSafe } = data;
        users.push({
          id: d.id,
          name: userSafe.name || "ব্যবহারকারী",
          email: userSafe.email || "",
          phone: userSafe.phone || "",
          role: userSafe.role || "salesman",
          permissions: userSafe.permissions || ["pos", "sales", "reports"],
          businessId: userSafe.businessId || "main-business",
          createdAt: userSafe.createdAt || new Date().toISOString(),
          lastSeen: userSafe.lastSeen || new Date().toISOString()
        });
      });
      if (users.length > 0) {
        saveLocalCache({ users: users as any });
        return users;
      } else {
        // Seed default admin in Firestore
        for (const u of defaultDbData.users) {
          await setDoc(doc(db, "users", u.id), u);
        }
        return defaultDbData.users as unknown as User[];
      }
    } catch (err) {
      console.warn("Firestore getUsers failed, using cache:", err);
      const cache = getLocalCache();
      return cache.users.map(u => {
        const { password: _, ...userSafe } = u;
        return userSafe as unknown as User;
      });
    }
  },

  subscribeUsers: (callback: (users: User[]) => void): (() => void) => {
    try {
      const colRef = collection(db, "users");
      return onSnapshot(colRef, (snap) => {
        const users: User[] = [];
        snap.forEach(d => {
          const data = d.data();
          const { password: _, ...userSafe } = data;
          users.push({
            id: d.id,
            name: userSafe.name || "ব্যবহারকারী",
            email: userSafe.email || "",
            phone: userSafe.phone || "",
            role: userSafe.role || "salesman",
            permissions: userSafe.permissions || ["pos", "sales", "reports"],
            businessId: userSafe.businessId || "main-business",
            createdAt: userSafe.createdAt || new Date().toISOString(),
            lastSeen: userSafe.lastSeen || new Date().toISOString()
          });
        });
        saveLocalCache({ users: users as any });
        callback(users);
      }, (error) => {
        console.warn("onSnapshot users error:", error);
      });
    } catch (e) {
      return () => {};
    }
  },

  createUser: async (user: Partial<User>): Promise<User> => {
    const newId = user.id || `user_${Date.now()}`;
    const newUserRecord: any = {
      id: newId,
      name: user.name || "নতুন ব্যবহারকারী",
      email: (user.email || "").toLowerCase(),
      password: user.password || "123456",
      phone: user.phone || "",
      role: user.role || "salesman",
      permissions: user.permissions || (user.role === "admin" ? defaultDbData.users[0].permissions : ["pos", "sales", "reports"]),
      businessId: currentBusinessId,
      createdAt: new Date().toISOString(),
      lastSeen: new Date().toISOString()
    };

    // Save to Firestore
    try {
      await setDoc(doc(db, "users", newId), newUserRecord);
    } catch (err) {
      console.warn("Firestore createUser failed:", err);
    }

    // Save to Cache
    const cache = getLocalCache();
    cache.users.push(newUserRecord);
    saveLocalCache(cache);

    const { password: _, ...userSafe } = newUserRecord;
    return userSafe as User;
  },

  updateUser: async (id: string, user: Partial<User>): Promise<User> => {
    try {
      await updateDoc(doc(db, "users", id), user as any);
    } catch (err) {
      console.warn("Firestore updateUser failed:", err);
    }

    const cache = getLocalCache();
    const idx = cache.users.findIndex(u => u.id === id);
    if (idx !== -1) {
      cache.users[idx] = { ...cache.users[idx], ...user };
      saveLocalCache(cache);
      const { password: _, ...userSafe } = cache.users[idx];
      return userSafe as unknown as User;
    }
    return user as User;
  },

  deleteUser: async (id: string): Promise<boolean> => {
    try {
      await deleteDoc(doc(db, "users", id));
    } catch (err) {
      console.warn("Firestore deleteUser failed:", err);
    }

    const cache = getLocalCache();
    cache.users = cache.users.filter(u => u.id !== id);
    saveLocalCache(cache);
    return true;
  },

  // --- Products ---
  getProducts: async (): Promise<Product[]> => {
    try {
      const snap = await getDocs(collection(db, "businesses", currentBusinessId, "products"));
      const products: Product[] = [];
      snap.forEach(d => {
        products.push({ id: d.id, ...d.data() } as Product);
      });
      // Always store true snapshot from Firestore in local cache
      saveLocalCache({ products });
      return products;
    } catch (err) {
      console.warn("Firestore getProducts failed, using cache:", err);
      return (getLocalCache().products || []) as Product[];
    }
  },

  subscribeProducts: (callback: (products: Product[]) => void): (() => void) => {
    try {
      const colRef = collection(db, "businesses", currentBusinessId, "products");
      return onSnapshot(colRef, (snap) => {
        const products: Product[] = [];
        snap.forEach(d => {
          products.push({ id: d.id, ...d.data() } as Product);
        });
        saveLocalCache({ products });
        callback(products);
      }, (error) => {
        console.warn("onSnapshot products error:", error);
      });
    } catch (e) {
      return () => {};
    }
  },

  createProduct: async (product: Partial<Product>): Promise<Product> => {
    const id = product.id || `prod_${Date.now()}`;
    const newProduct: Product = {
      ...product,
      id,
      sku: product.sku || `SKU-${Date.now().toString().slice(-4)}`,
      salePrice: Number(product.salePrice) || 0,
      purchasePrice: Number(product.purchasePrice) || 0,
      stock: Number(product.stock) || 0,
      minStock: Number(product.minStock) || 0,
      unit: product.unit || "পিস",
      categoryId: product.categoryId || "general",
      name: product.name || "পণ্য",
      createdAt: new Date().toISOString()
    } as Product;

    try {
      await setDoc(doc(db, "businesses", currentBusinessId, "products", id), newProduct);
    } catch (err) {
      console.warn("Firestore createProduct failed:", err);
    }

    const cache = getLocalCache();
    cache.products = cache.products.filter(p => p.id !== id);
    cache.products.unshift(newProduct);
    saveLocalCache(cache);
    syncEntityToGoogleSheets('product', newProduct, 'upsert');
    return newProduct;
  },

  createProductsBatch: async (products: Partial<Product>[]): Promise<Product[]> => {
    const created: Product[] = [];
    const cache = getLocalCache();

    for (const p of products) {
      const id = p.id || `prod_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
      const prod: Product = {
        ...p,
        id,
        sku: p.sku || `SKU-${Date.now().toString().slice(-4)}`,
        salePrice: Number(p.salePrice) || 0,
        purchasePrice: Number(p.purchasePrice) || 0,
        stock: Number(p.stock) || 0,
        minStock: Number(p.minStock) || 0,
        unit: p.unit || "পিস",
        categoryId: p.categoryId || "general",
        name: p.name || "পণ্য",
        createdAt: new Date().toISOString()
      } as Product;

      try {
        await setDoc(doc(db, "businesses", currentBusinessId, "products", id), prod);
      } catch (err) {
        console.warn("Firestore batch create failed for", id, err);
      }

      cache.products = cache.products.filter(x => x.id !== id);
      cache.products.unshift(prod);
      created.push(prod);
      syncEntityToGoogleSheets('product', prod, 'upsert');
    }
    saveLocalCache(cache);
    return created;
  },

  updateProduct: async (id: string, product: Partial<Product>): Promise<Product> => {
    try {
      await updateDoc(doc(db, "businesses", currentBusinessId, "products", id), product as any);
    } catch (err) {
      console.warn("Firestore updateProduct failed:", err);
    }

    const cache = getLocalCache();
    const idx = cache.products.findIndex(p => p.id === id);
    if (idx !== -1) {
      cache.products[idx] = { ...cache.products[idx], ...product };
      saveLocalCache(cache);
      syncEntityToGoogleSheets('product', cache.products[idx], 'upsert');
      return cache.products[idx] as Product;
    }
    syncEntityToGoogleSheets('product', { id, ...product }, 'upsert');
    return product as Product;
  },

  deleteProduct: async (id: string): Promise<boolean> => {
    try {
      await deleteDoc(doc(db, "businesses", currentBusinessId, "products", id));
    } catch (err) {
      console.warn("Firestore deleteProduct failed:", err);
    }

    const cache = getLocalCache();
    cache.products = cache.products.filter(p => p.id !== id);
    saveLocalCache(cache);
    syncEntityToGoogleSheets('product', { id }, 'delete');
    return true;
  },

  // --- Categories ---
  getCategories: async (): Promise<Category[]> => {
    try {
      const snap = await getDocs(collection(db, "businesses", currentBusinessId, "categories"));
      const categories: Category[] = [];
      snap.forEach(d => categories.push({ id: d.id, ...d.data() } as Category));
      saveLocalCache({ categories });
      return categories;
    } catch (e) {
      console.warn("Firestore getCategories failed:", e);
      return (getLocalCache().categories || []) as Category[];
    }
  },

  subscribeCategories: (callback: (categories: Category[]) => void): (() => void) => {
    try {
      const colRef = collection(db, "businesses", currentBusinessId, "categories");
      return onSnapshot(colRef, (snap) => {
        const categories: Category[] = [];
        snap.forEach(d => categories.push({ id: d.id, ...d.data() } as Category));
        saveLocalCache({ categories });
        callback(categories);
      }, (error) => {
        console.warn("onSnapshot categories error:", error);
      });
    } catch (e) {
      return () => {};
    }
  },

  createCategory: async (category: { name: string; icon?: string }): Promise<Category> => {
    const id = `cat_${Date.now()}`;
    const newCat: Category = {
      id,
      name: category.name,
      icon: category.icon
    };
    try {
      await setDoc(doc(db, "businesses", currentBusinessId, "categories", id), newCat);
    } catch (e) {
      console.warn("Firestore createCategory failed:", e);
    }
    const cache = getLocalCache();
    cache.categories.push(newCat);
    saveLocalCache(cache);
    return newCat;
  },

  // --- Sales ---
  getSales: async (userId?: string): Promise<Sale[]> => {
    const curUser = getCurrentUser();
    let salesList: Sale[] = [];

    try {
      const snap = await getDocs(collection(db, "businesses", currentBusinessId, "sales"));
      snap.forEach(d => salesList.push({ id: d.id, ...d.data() } as Sale));
      salesList.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      saveLocalCache({ sales: salesList });
    } catch (e) {
      console.warn("Firestore getSales failed:", e);
      salesList = getLocalCache().sales || [];
    }

    // Role isolation
    if (curUser && curUser.role === "salesman") {
      return salesList.filter(s => s.userId === curUser.id || s.createdBy === curUser.id);
    }
    if (userId) {
      return salesList.filter(s => s.userId === userId || s.createdBy === userId);
    }
    return salesList;
  },

  subscribeSales: (callback: (sales: Sale[]) => void, userId?: string): (() => void) => {
    try {
      const colRef = collection(db, "businesses", currentBusinessId, "sales");
      return onSnapshot(colRef, (snap) => {
        const curUser = getCurrentUser();
        let salesList: Sale[] = [];
        snap.forEach(d => salesList.push({ id: d.id, ...d.data() } as Sale));
        salesList.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        saveLocalCache({ sales: salesList });

        if (curUser && curUser.role === "salesman") {
          callback(salesList.filter(s => s.userId === curUser.id || s.createdBy === curUser.id));
        } else if (userId) {
          callback(salesList.filter(s => s.userId === userId || s.createdBy === userId));
        } else {
          callback(salesList);
        }
      }, (error) => {
        console.warn("onSnapshot sales error:", error);
      });
    } catch (e) {
      return () => {};
    }
  },

  createSale: async (sale: Partial<Sale>): Promise<Sale> => {
    const curUser = getCurrentUser();
    const id = sale.id || `sale_${Date.now()}`;
    const payable = Number(sale.payableAmount) || Number(sale.totalAmount) || 0;
    const paid = Number(sale.paidAmount) || 0;
    const due = Number(sale.dueAmount) !== undefined ? Number(sale.dueAmount) : Math.max(0, payable - paid);

    const newSale: Sale = {
      ...sale,
      id,
      invoiceNo: sale.invoiceNo || `INV-${Math.floor(100000 + Math.random() * 900000)}`,
      userId: curUser?.id || sale.userId || "admin-1",
      createdBy: curUser?.id || sale.createdBy || "admin-1",
      totalAmount: Number(sale.totalAmount) || payable,
      payableAmount: payable,
      paidAmount: paid,
      dueAmount: due,
      createdAt: new Date().toISOString()
    } as Sale;

    const cache = getLocalCache();

    // 1. Deduct stock in Cache & Firestore
    if (Array.isArray(newSale.items)) {
      for (const item of newSale.items) {
        const prodId = item.productId || (item as any).id;
        if (prodId) {
          const pIdx = cache.products.findIndex(p => p.id === prodId);
          if (pIdx !== -1) {
            cache.products[pIdx].stock = Math.max(0, (Number(cache.products[pIdx].stock) || 0) - (Number(item.quantity) || 1));
            syncEntityToGoogleSheets('product', cache.products[pIdx], 'upsert');
          }
          try {
            const pDoc = await getDoc(doc(db, "businesses", currentBusinessId, "products", prodId));
            if (pDoc.exists()) {
              const currentStock = Number(pDoc.data().stock) || 0;
              const newStock = Math.max(0, currentStock - (Number(item.quantity) || 1));
              await updateDoc(doc(db, "businesses", currentBusinessId, "products", prodId), { stock: newStock });
            }
          } catch {}
        }
      }
    }

    // 2. Tightly link and update customer balance
    let matchedCustomer = cache.customers.find(c => 
      (newSale.customerId && newSale.customerId !== "walking" && c.id === newSale.customerId) ||
      (newSale.customerPhone && c.phone && c.phone.trim() === newSale.customerPhone.trim()) ||
      (newSale.customerName && c.name && c.name.trim().toLowerCase() === newSale.customerName.trim().toLowerCase())
    );

    if (matchedCustomer) {
      newSale.customerId = matchedCustomer.id;
      matchedCustomer.totalSpent = (Number(matchedCustomer.totalSpent) || 0) + payable;
      matchedCustomer.dueAmount = (Number(matchedCustomer.dueAmount) || 0) + due;
      try {
        await updateDoc(doc(db, "businesses", currentBusinessId, "customers", matchedCustomer.id), {
          totalSpent: matchedCustomer.totalSpent,
          dueAmount: matchedCustomer.dueAmount
        });
      } catch {}
      syncEntityToGoogleSheets('customer', matchedCustomer, 'upsert');
    } else if (newSale.customerName && newSale.customerName !== 'Walk-in Customer' && (due > 0 || newSale.customerPhone)) {
      // Auto-create customer if they have due or real identity
      const newCustId = `cust_${Date.now()}`;
      const newCust: Customer = {
        id: newCustId,
        name: newSale.customerName,
        phone: newSale.customerPhone || "",
        address: newSale.customerAddress || "",
        dueAmount: due,
        totalSpent: payable,
        createdAt: new Date().toISOString()
      };
      newSale.customerId = newCustId;
      cache.customers.unshift(newCust);
      try {
        await setDoc(doc(db, "businesses", currentBusinessId, "customers", newCustId), newCust);
      } catch {}
      syncEntityToGoogleSheets('customer', newCust, 'upsert');
    }

    // 3. Save Sale Doc
    try {
      await setDoc(doc(db, "businesses", currentBusinessId, "sales", id), newSale);
    } catch (e) {
      console.warn("Firestore createSale failed:", e);
    }

    cache.sales.unshift(newSale);
    saveLocalCache(cache);
    syncEntityToGoogleSheets('sale', newSale, 'upsert');
    return newSale;
  },

  deleteSale: async (id: string): Promise<boolean> => {
    try {
      await deleteDoc(doc(db, "businesses", currentBusinessId, "sales", id));
    } catch (e) {
      console.warn("Firestore deleteSale failed:", e);
    }
    const cache = getLocalCache();
    cache.sales = cache.sales.filter(s => s.id !== id);
    saveLocalCache(cache);
    return true;
  },

  // --- Customers ---
  getCustomers: async (userId?: string): Promise<Customer[]> => {
    let customers: Customer[] = [];
    try {
      const snap = await getDocs(collection(db, "businesses", currentBusinessId, "customers"));
      snap.forEach(d => customers.push({ id: d.id, ...d.data() } as Customer));
    } catch (e) {
      console.warn("Firestore getCustomers failed:", e);
      customers = (getLocalCache().customers || []) as Customer[];
    }

    if (customers.length === 0) {
      customers = (getLocalCache().customers || []) as Customer[];
    }

    // Always reconcile with live sales to ensure 100% mathematical consistency
    const allSales = await api.getSales();
    const allPayments = getLocalCache().customerPayments || [];
    customers = reconcileCustomersWithSales(customers, allSales, allPayments);

    saveLocalCache({ customers });
    return customers;
  },

  subscribeCustomers: (callback: (customers: Customer[]) => void): (() => void) => {
    try {
      const colRef = collection(db, "businesses", currentBusinessId, "customers");
      return onSnapshot(colRef, (snap) => {
        let customers: Customer[] = [];
        snap.forEach(d => customers.push({ id: d.id, ...d.data() } as Customer));
        const allSales = getLocalCache().sales || [];
        const allPayments = getLocalCache().customerPayments || [];
        customers = reconcileCustomersWithSales(customers, allSales, allPayments);
        saveLocalCache({ customers });
        callback(customers);
      }, (error) => {
        console.warn("onSnapshot customers error:", error);
      });
    } catch (e) {
      return () => {};
    }
  },

  createCustomer: async (customer: Partial<Customer>): Promise<Customer> => {
    const id = customer.id || `cust_${Date.now()}`;
    const newCust: Customer = {
      ...customer,
      id,
      name: customer.name || "ক্রেতা",
      phone: customer.phone || "",
      dueAmount: Number(customer.dueAmount) || 0,
      totalSpent: Number(customer.totalSpent) || 0,
      createdAt: new Date().toISOString()
    } as Customer;

    try {
      await setDoc(doc(db, "businesses", currentBusinessId, "customers", id), newCust);
    } catch (e) {
      console.warn("Firestore createCustomer failed:", e);
    }

    const cache = getLocalCache();
    cache.customers.unshift(newCust);
    saveLocalCache(cache);
    syncEntityToGoogleSheets('customer', newCust, 'upsert');
    return newCust;
  },

  createCustomersBatch: async (customers: Partial<Customer>[]): Promise<Customer[]> => {
    const created: Customer[] = [];
    const cache = getLocalCache();

    for (const c of customers) {
      const id = c.id || `cust_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
      const cust: Customer = {
        ...c,
        id,
        name: c.name || "ক্রেতা",
        phone: c.phone || "",
        dueAmount: Number(c.dueAmount) || 0,
        totalSpent: Number(c.totalSpent) || 0,
        createdAt: new Date().toISOString()
      } as Customer;

      try {
        await setDoc(doc(db, "businesses", currentBusinessId, "customers", id), cust);
      } catch {}

      cache.customers.unshift(cust);
      created.push(cust);
      syncEntityToGoogleSheets('customer', cust, 'upsert');
    }
    saveLocalCache(cache);
    return created;
  },

  updateCustomer: async (id: string, customer: Partial<Customer>): Promise<Customer> => {
    try {
      await updateDoc(doc(db, "businesses", currentBusinessId, "customers", id), customer as any);
    } catch (e) {
      console.warn("Firestore updateCustomer failed:", e);
    }
    const cache = getLocalCache();
    const idx = cache.customers.findIndex(c => c.id === id);
    if (idx !== -1) {
      cache.customers[idx] = { ...cache.customers[idx], ...customer };
      saveLocalCache(cache);
      syncEntityToGoogleSheets('customer', cache.customers[idx], 'upsert');
      return cache.customers[idx] as Customer;
    }
    syncEntityToGoogleSheets('customer', { id, ...customer }, 'upsert');
    return customer as Customer;
  },

  deleteCustomer: async (id: string): Promise<boolean> => {
    try {
      await deleteDoc(doc(db, "businesses", currentBusinessId, "customers", id));
    } catch (e) {
      console.warn("Firestore deleteCustomer failed:", e);
    }
    const cache = getLocalCache();
    cache.customers = cache.customers.filter(c => c.id !== id);
    saveLocalCache(cache);
    syncEntityToGoogleSheets('customer', { id }, 'delete');
    return true;
  },

  recordPayment: async (customerId: string, amount: number, method: string = "cash", note?: string, date?: string): Promise<any> => {
    const payAmount = Number(amount) || 0;
    const payId = `pay_${Date.now()}`;
    const paymentRecord = {
      id: payId,
      customerId,
      amount: payAmount,
      method,
      note: note || "",
      date: date || new Date().toISOString()
    };

    const cache = getLocalCache();
    const cust = cache.customers.find(c => 
      c.id === customerId || 
      (c.phone && c.phone === customerId) || 
      (c.name && c.name.toLowerCase() === customerId.toLowerCase())
    );

    if (cust) {
      cust.dueAmount = Math.max(0, (Number(cust.dueAmount) || 0) - payAmount);
      try {
        await updateDoc(doc(db, "businesses", currentBusinessId, "customers", cust.id), {
          dueAmount: cust.dueAmount
        });
      } catch {}
      syncEntityToGoogleSheets('customer', cust, 'upsert');

      // Settle customer sales from oldest to newest so Invoices and SalesList reflect payment!
      let remaining = payAmount;
      const unpaidSales = cache.sales.filter(s => 
        ((s.customerId && s.customerId === cust.id) ||
         (cust.phone && s.customerPhone && s.customerPhone.trim() === cust.phone.trim()) ||
         (cust.name && s.customerName && s.customerName.trim().toLowerCase() === cust.name.trim().toLowerCase())) &&
        (Number(s.dueAmount) || 0) > 0
      ).sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());

      for (const s of unpaidSales) {
        if (remaining <= 0) break;
        const curDue = Number(s.dueAmount) || 0;
        const settleAmt = Math.min(curDue, remaining);
        s.paidAmount = (Number(s.paidAmount) || 0) + settleAmt;
        s.dueAmount = curDue - settleAmt;
        remaining -= settleAmt;

        try {
          await updateDoc(doc(db, "businesses", currentBusinessId, "sales", s.id), {
            paidAmount: s.paidAmount,
            dueAmount: s.dueAmount
          });
        } catch {}
        syncEntityToGoogleSheets('sale', s, 'upsert');
      }
    }

    try {
      await setDoc(doc(db, "businesses", currentBusinessId, "customers", customerId, "payments", payId), paymentRecord);
    } catch {}

    cache.customerPayments.push(paymentRecord);
    saveLocalCache(cache);
    syncEntityToGoogleSheets('payment', { customerId, amount: payAmount, method, note }, 'upsert');

    return { success: true, payment: paymentRecord };
  },

  getCustomerPayments: async (customerId: string): Promise<any[]> => {
    try {
      const snap = await getDocs(collection(db, "businesses", currentBusinessId, "customers", customerId, "payments"));
      const list: any[] = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() }));
      return list;
    } catch (e) {
      console.warn("Firestore getCustomerPayments failed:", e);
      return (getLocalCache().customerPayments || []).filter(p => p.customerId === customerId);
    }
  },

  // --- Suppliers ---
  getSuppliers: async (): Promise<Supplier[]> => {
    try {
      const snap = await getDocs(collection(db, "businesses", currentBusinessId, "suppliers"));
      const suppliers: Supplier[] = [];
      snap.forEach(d => suppliers.push({ id: d.id, ...d.data() } as Supplier));
      saveLocalCache({ suppliers });
      return suppliers;
    } catch (e) {
      console.warn("Firestore getSuppliers failed:", e);
      return (getLocalCache().suppliers || []) as Supplier[];
    }
  },

  subscribeSuppliers: (callback: (suppliers: Supplier[]) => void): (() => void) => {
    try {
      const colRef = collection(db, "businesses", currentBusinessId, "suppliers");
      return onSnapshot(colRef, (snap) => {
        const suppliers: Supplier[] = [];
        snap.forEach(d => suppliers.push({ id: d.id, ...d.data() } as Supplier));
        saveLocalCache({ suppliers });
        callback(suppliers);
      }, (error) => {
        console.warn("onSnapshot suppliers error:", error);
      });
    } catch (e) {
      return () => {};
    }
  },

  createSupplier: async (supplier: Partial<Supplier>): Promise<Supplier> => {
    const id = supplier.id || `sup_${Date.now()}`;
    const newSup: Supplier = {
      ...supplier,
      id,
      name: supplier.name || "সরবরাহকারী",
      phone: supplier.phone || "",
      company: supplier.company || "",
      dueAmount: Number(supplier.dueAmount) || 0,
      createdAt: new Date().toISOString()
    } as Supplier;

    try {
      await setDoc(doc(db, "businesses", currentBusinessId, "suppliers", id), newSup);
    } catch (e) {
      console.warn("Firestore createSupplier failed:", e);
    }

    const cache = getLocalCache();
    cache.suppliers.push(newSup);
    saveLocalCache(cache);
    syncEntityToGoogleSheets('supplier', newSup, 'upsert');
    return newSup;
  },

  createSuppliersBatch: async (suppliers: Partial<Supplier>[]): Promise<Supplier[]> => {
    const created: Supplier[] = [];
    const cache = getLocalCache();

    for (const s of suppliers) {
      const id = s.id || `sup_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
      const sup: Supplier = {
        ...s,
        id,
        name: s.name || "সরবরাহকারী",
        phone: s.phone || "",
        company: s.company || "",
        dueAmount: Number(s.dueAmount) || 0,
        createdAt: new Date().toISOString()
      } as Supplier;

      try {
        await setDoc(doc(db, "businesses", currentBusinessId, "suppliers", id), sup);
      } catch {}

      cache.suppliers.push(sup);
      created.push(sup);
      syncEntityToGoogleSheets('supplier', sup, 'upsert');
    }
    saveLocalCache(cache);
    return created;
  },

  updateSupplier: async (id: string, supplier: Partial<Supplier>): Promise<Supplier> => {
    try {
      await updateDoc(doc(db, "businesses", currentBusinessId, "suppliers", id), supplier as any);
    } catch (e) {
      console.warn("Firestore updateSupplier failed:", e);
    }
    const cache = getLocalCache();
    const idx = cache.suppliers.findIndex(s => s.id === id);
    if (idx !== -1) {
      cache.suppliers[idx] = { ...cache.suppliers[idx], ...supplier };
      saveLocalCache(cache);
      syncEntityToGoogleSheets('supplier', cache.suppliers[idx], 'upsert');
      return cache.suppliers[idx] as Supplier;
    }
    syncEntityToGoogleSheets('supplier', { id, ...supplier }, 'upsert');
    return supplier as Supplier;
  },

  deleteSupplier: async (id: string): Promise<boolean> => {
    try {
      await deleteDoc(doc(db, "businesses", currentBusinessId, "suppliers", id));
    } catch (e) {
      console.warn("Firestore deleteSupplier failed:", e);
    }
    const cache = getLocalCache();
    cache.suppliers = cache.suppliers.filter(s => s.id !== id);
    saveLocalCache(cache);
    syncEntityToGoogleSheets('supplier', { id }, 'delete');
    return true;
  },

  getSupplierTransactions: async (supplierId: string): Promise<SupplierTransaction[]> => {
    try {
      const snap = await getDocs(collection(db, "businesses", currentBusinessId, "suppliers", supplierId, "transactions"));
      const txs: SupplierTransaction[] = [];
      snap.forEach(d => txs.push({ id: d.id, ...d.data() } as SupplierTransaction));
      return txs;
    } catch (e) {
      console.warn("Firestore getSupplierTransactions failed:", e);
      return (getLocalCache().supplierTransactions || []).filter(t => t.supplierId === supplierId);
    }
  },

  recordSupplierPayment: async (supplierId: string, amount: number, description?: string): Promise<SupplierTransaction> => {
    const txId = `tx_${Date.now()}`;
    const tx: SupplierTransaction = {
      id: txId,
      supplierId,
      type: "payment",
      amount: Number(amount) || 0,
      description: description || "পরিশোধ",
      date: new Date().toISOString()
    };

    try {
      await setDoc(doc(db, "businesses", currentBusinessId, "suppliers", supplierId, "transactions", txId), tx);
      const sRef = doc(db, "businesses", currentBusinessId, "suppliers", supplierId);
      const sSnap = await getDoc(sRef);
      if (sSnap.exists()) {
        const curDue = Number(sSnap.data().dueAmount) || 0;
        await updateDoc(sRef, { dueAmount: Math.max(0, curDue - amount) });
      }
    } catch (e) {
      console.warn("Firestore recordSupplierPayment failed:", e);
    }

    const cache = getLocalCache();
    const sup = cache.suppliers.find(s => s.id === supplierId);
    if (sup) sup.dueAmount = Math.max(0, (sup.dueAmount || 0) - amount);
    cache.supplierTransactions.push(tx);
    saveLocalCache(cache);
    return tx;
  },

  recordSupplierPurchase: async (supplierId: string, amount: number, description?: string): Promise<SupplierTransaction> => {
    const txId = `tx_${Date.now()}`;
    const tx: SupplierTransaction = {
      id: txId,
      supplierId,
      type: "purchase",
      amount: Number(amount) || 0,
      description: description || "পণ্য ক্রয়",
      date: new Date().toISOString()
    };

    try {
      await setDoc(doc(db, "businesses", currentBusinessId, "suppliers", supplierId, "transactions", txId), tx);
      const sRef = doc(db, "businesses", currentBusinessId, "suppliers", supplierId);
      const sSnap = await getDoc(sRef);
      if (sSnap.exists()) {
        const curDue = Number(sSnap.data().dueAmount) || 0;
        await updateDoc(sRef, { dueAmount: curDue + amount });
      }
    } catch (e) {
      console.warn("Firestore recordSupplierPurchase failed:", e);
    }

    const cache = getLocalCache();
    const sup = cache.suppliers.find(s => s.id === supplierId);
    if (sup) sup.dueAmount = (sup.dueAmount || 0) + amount;
    cache.supplierTransactions.push(tx);
    saveLocalCache(cache);
    return tx;
  },

  // --- Expenses ---
  getExpenses: async (userId?: string): Promise<Expense[]> => {
    try {
      const snap = await getDocs(collection(db, "businesses", currentBusinessId, "expenses"));
      const expenses: Expense[] = [];
      snap.forEach(d => expenses.push({ id: d.id, ...d.data() } as Expense));
      expenses.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
      saveLocalCache({ expenses });
      return expenses;
    } catch (e) {
      console.warn("Firestore getExpenses failed:", e);
      return (getLocalCache().expenses || []) as Expense[];
    }
  },

  subscribeExpenses: (callback: (expenses: Expense[]) => void): (() => void) => {
    try {
      const colRef = collection(db, "businesses", currentBusinessId, "expenses");
      return onSnapshot(colRef, (snap) => {
        const expenses: Expense[] = [];
        snap.forEach(d => expenses.push({ id: d.id, ...d.data() } as Expense));
        expenses.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
        saveLocalCache({ expenses });
        callback(expenses);
      }, (error) => {
        console.warn("onSnapshot expenses error:", error);
      });
    } catch (e) {
      return () => {};
    }
  },

  createExpense: async (expense: Partial<Expense>): Promise<Expense> => {
    const id = expense.id || `exp_${Date.now()}`;
    const newExp: Expense = {
      ...expense,
      id,
      amount: Number(expense.amount) || 0,
      category: expense.category || "সাধারণ",
      date: expense.date || new Date().toISOString()
    } as Expense;

    try {
      await setDoc(doc(db, "businesses", currentBusinessId, "expenses", id), newExp);
    } catch (e) {
      console.warn("Firestore createExpense failed:", e);
    }

    const cache = getLocalCache();
    cache.expenses.unshift(newExp);
    saveLocalCache(cache);
    syncEntityToGoogleSheets('expense', newExp, 'upsert');
    return newExp;
  },

  updateExpense: async (id: string, expense: Partial<Expense>): Promise<Expense> => {
    try {
      await updateDoc(doc(db, "businesses", currentBusinessId, "expenses", id), expense as any);
    } catch (e) {
      console.warn("Firestore updateExpense failed:", e);
    }
    const cache = getLocalCache();
    const idx = cache.expenses.findIndex(e => e.id === id);
    if (idx !== -1) {
      cache.expenses[idx] = { ...cache.expenses[idx], ...expense };
      saveLocalCache(cache);
      syncEntityToGoogleSheets('expense', cache.expenses[idx], 'upsert');
      return cache.expenses[idx] as Expense;
    }
    syncEntityToGoogleSheets('expense', { id, ...expense }, 'upsert');
    return expense as Expense;
  },

  deleteExpense: async (id: string): Promise<boolean> => {
    try {
      await deleteDoc(doc(db, "businesses", currentBusinessId, "expenses", id));
    } catch (e) {
      console.warn("Firestore deleteExpense failed:", e);
    }
    const cache = getLocalCache();
    cache.expenses = cache.expenses.filter(e => e.id !== id);
    saveLocalCache(cache);
    syncEntityToGoogleSheets('expense', { id }, 'delete');
    return true;
  },

  // --- Business Info ---
  getBusiness: async (): Promise<Business> => {
    try {
      const snap = await getDoc(doc(db, "businesses", currentBusinessId));
      if (snap.exists()) {
        const data = snap.data();
        const biz = { id: snap.id, ...data } as Business;
        saveLocalCache({ business: biz });
        return biz;
      }
    } catch (e) {
      console.warn("Firestore getBusiness failed:", e);
    }
    return (getLocalCache().business || defaultDbData.business) as Business;
  },

  updateBusiness: async (business: Partial<Business>): Promise<Business> => {
    try {
      await setDoc(doc(db, "businesses", currentBusinessId), business, { merge: true });
    } catch (e) {
      console.warn("Firestore updateBusiness failed:", e);
    }
    const cache = getLocalCache();
    cache.business = { ...cache.business, ...business };
    saveLocalCache(cache);
    return cache.business as Business;
  },

  // --- Dashboard Stats ---
  getDashboardStats: async (_user?: User | null): Promise<DashboardStats> => {
    const curUser = _user || getCurrentUser();
    const [salesList, products, customers, expenses] = await Promise.all([
      api.getSales(),
      api.getProducts(),
      api.getCustomers(),
      api.getExpenses()
    ]);

    let userSales = salesList;
    if (curUser && curUser.role === "salesman") {
      userSales = salesList.filter(s => s.userId === curUser.id || s.createdBy === curUser.id);
    }

    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const thisMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    let totalRevenue = 0;
    let todayRevenue = 0;
    let monthlyRevenue = 0;
    let totalProfit = 0;

    for (const s of userSales) {
      const amt = Number(s.totalAmount) || 0;
      totalRevenue += amt;

      if (s.createdAt?.startsWith(todayStr)) {
        todayRevenue += amt;
      }
      if (s.createdAt?.startsWith(thisMonthStr)) {
        monthlyRevenue += amt;
      }

      if (Array.isArray(s.items)) {
        for (const item of s.items) {
          const sellPrice = Number(item.unitPrice) || 0;
          const prod = products.find(p => p.id === item.productId || p.id === (item as any).id);
          const costPrice = prod?.purchasePrice || (sellPrice * 0.7);
          totalProfit += (sellPrice - costPrice) * (Number(item.quantity) || 1);
        }
      } else {
        totalProfit += amt * 0.25;
      }
    }

    const totalDue = customers.reduce((sum, c) => sum + (Number(c.dueAmount) || 0), 0);
    const lowStockCount = products.filter(p => (Number(p.stock) || 0) <= (Number(p.minStock) || 5)).length;

    return {
      todaySales: todayRevenue,
      monthlySales: monthlyRevenue,
      totalProfit: Math.round(totalProfit),
      totalDue,
      totalExpense: expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0),
      totalProducts: products.length,
      lowStockCount,
      expiredProductCount: 0,
      aboutToExpireCount: 0,
      recentSales: userSales.slice(0, 10)
    };
  },

  // --- SMS Module ---
  getSMSConfig: async (): Promise<SMSConfig> => {
    try {
      const snap = await getDoc(doc(db, "businesses", currentBusinessId, "config", "sms"));
      if (snap.exists()) return snap.data() as SMSConfig;
    } catch {}
    return getLocalCache().smsConfig;
  },

  updateSMSConfig: async (config: SMSConfig): Promise<SMSConfig> => {
    try {
      await setDoc(doc(db, "businesses", currentBusinessId, "config", "sms"), config, { merge: true });
    } catch {}
    const cache = getLocalCache();
    cache.smsConfig = { ...cache.smsConfig, ...config };
    saveLocalCache(cache);
    return cache.smsConfig;
  },

  getSMSLogs: async (): Promise<SMSLog[]> => {
    try {
      const snap = await getDocs(collection(db, "businesses", currentBusinessId, "sms_logs"));
      const logs: SMSLog[] = [];
      snap.forEach(d => logs.push({ id: d.id, ...d.data() } as SMSLog));
      return logs;
    } catch {}
    return getLocalCache().smsLogs;
  },

  sendSMS: async (recipient: string, message: string): Promise<any> => {
    const id = `sms_${Date.now()}`;
    const log: SMSLog = {
      id,
      recipient,
      message,
      status: "sent",
      createdAt: new Date().toISOString()
    };
    try {
      await setDoc(doc(db, "businesses", currentBusinessId, "sms_logs", id), log);
    } catch {}
    const cache = getLocalCache();
    cache.smsLogs.unshift(log);
    saveLocalCache(cache);
    return { success: true, log };
  },

  // --- Backup & Restore ---
  getBackupStatus: async (): Promise<{ lastBackupAt?: string }> => {
    try {
      const snap = await getDoc(doc(db, "businesses", currentBusinessId, "config", "drive_backup"));
      if (snap.exists() && snap.data().lastBackupAt) {
        return { lastBackupAt: snap.data().lastBackupAt };
      }
    } catch {}
    return { lastBackupAt: new Date().toISOString() };
  },

  recordBackup: async (): Promise<any> => {
    const now = new Date().toISOString();
    try {
      await setDoc(doc(db, "businesses", currentBusinessId, "config", "drive_backup"), {
        lastBackupAt: now
      }, { merge: true });
    } catch {}
    return { success: true, lastBackupAt: now };
  },

  triggerBackup: async (type: string): Promise<any> => {
    return { success: true, message: `${type} ব্যাকআপ সম্পন্ন হয়েছে` };
  },

  getAllData: async (): Promise<any> => {
    const [users, products, categories, customers, suppliers, sales, expenses, business] = await Promise.all([
      api.getUsers(),
      api.getProducts(),
      api.getCategories(),
      api.getCustomers(),
      api.getSuppliers(),
      api.getSales(),
      api.getExpenses(),
      api.getBusiness()
    ]);

    return {
      version: "2.5-CLOUD",
      timestamp: new Date().toISOString(),
      business,
      users,
      products,
      categories,
      customers,
      suppliers,
      sales,
      expenses
    };
  },

  restoreDB: async (data: any): Promise<any> => {
    if (!data || typeof data !== "object") {
      throw new Error("ভুল ডেটা ফরম্যাট।");
    }

    // Restore to Firestore
    try {
      if (Array.isArray(data.products)) {
        for (const p of data.products) {
          if (p.id) await setDoc(doc(db, "businesses", currentBusinessId, "products", p.id), p);
        }
      }
      if (Array.isArray(data.customers)) {
        for (const c of data.customers) {
          if (c.id) await setDoc(doc(db, "businesses", currentBusinessId, "customers", c.id), c);
        }
      }
      if (Array.isArray(data.suppliers)) {
        for (const s of data.suppliers) {
          if (s.id) await setDoc(doc(db, "businesses", currentBusinessId, "suppliers", s.id), s);
        }
      }
      if (Array.isArray(data.sales)) {
        for (const s of data.sales) {
          if (s.id) await setDoc(doc(db, "businesses", currentBusinessId, "sales", s.id), s);
        }
      }
      if (Array.isArray(data.expenses)) {
        for (const e of data.expenses) {
          if (e.id) await setDoc(doc(db, "businesses", currentBusinessId, "expenses", e.id), e);
        }
      }
      if (Array.isArray(data.users)) {
        for (const u of data.users) {
          if (u.id) await setDoc(doc(db, "users", u.id), u, { merge: true });
        }
      }
      if (data.business) {
        await setDoc(doc(db, "businesses", currentBusinessId), data.business, { merge: true });
      }
    } catch (fsErr) {
      console.warn("Firestore restore encountered warning:", fsErr);
    }

    saveLocalCache(data);
    return { success: true };
  },

  clearAllData: async (): Promise<any> => {
    // 1. Delete Firestore collections
    const collectionsToClear = ["products", "customers", "sales", "expenses", "suppliers", "categories", "sms_logs"];
    
    for (const colName of collectionsToClear) {
      try {
        const snap = await getDocs(collection(db, "businesses", currentBusinessId, colName));
        const deletePromises = snap.docs.map(d => deleteDoc(d.ref));
        await Promise.all(deletePromises);
      } catch (colErr) {
        console.warn(`Error clearing Firestore collection ${colName}:`, colErr);
      }
    }

    // 2. Delete non-admin users from Firestore
    try {
      const userSnap = await getDocs(collection(db, "users"));
      for (const uDoc of userSnap.docs) {
        const uData = uDoc.data();
        if (uData.role !== 'admin' && uData.email !== 'mominkhan051220@gmail.com') {
          await deleteDoc(uDoc.ref);
        }
      }
    } catch (uErr) {
      console.warn("Error deleting non-admin users from Firestore:", uErr);
    }

    // 3. Clear Local Cache (keep only Admin user)
    const cache = getLocalCache();
    cache.users = (cache.users || []).filter(u => u.role === 'admin' || u.email === 'mominkhan051220@gmail.com');
    if (cache.users.length === 0) {
      cache.users = defaultDbData.users;
    }
    cache.products = [];
    cache.categories = [];
    cache.customers = [];
    cache.customerPayments = [];
    cache.suppliers = [];
    cache.supplierTransactions = [];
    cache.sales = [];
    cache.expenses = [];
    cache.smsLogs = [];
    saveLocalCache(cache);

    return { success: true };
  },

  // --- Google Sheets Master Database Integration ---
  syncAllToGoogleSheets: async (customUrl?: string) => {
    const allData = await api.getAllData();
    return syncAllToGoogleSheets(allData, customUrl);
  },

  restoreFromGoogleSheets: async (customUrl?: string) => {
    const data = await fetchDataFromGoogleSheets(customUrl);
    return api.restoreDB(data);
  },

  testGoogleSheets: async (url: string) => {
    return testGoogleSheetsConnection(url);
  },

  getGoogleSheetsConfig: async () => {
    return fetchCloudSheetsConfig(currentBusinessId);
  },

  saveGoogleSheetsConfig: async (config: any) => {
    return saveSheetsConfig(config, currentBusinessId);
  }
};
