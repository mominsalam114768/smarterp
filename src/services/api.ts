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
  Expense,
  ApprovalRequest
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
  limit,
  onSnapshot,
  deleteField
} from "../lib/firebase";
import { hashPassword, verifyPassword } from "../lib/crypto";
import { 
  syncEntityToGoogleSheets, 
  syncAllToGoogleSheets, 
  fetchDataFromGoogleSheets, 
  fetchCloudSheetsConfig, 
  saveSheetsConfig, 
  testGoogleSheetsConnection,
  setSheetsBusinessId,
  autoCreateShopGoogleSheet,
  ensureShopGoogleSheet,
  renameShopGoogleSheet,
  deleteShopGoogleSheet
} from "../lib/sheetsSync";

const USER_SESSION_KEY = "smart_business_user";
const LOCAL_DB_KEY = "smart_business_db_v2";
const ACTIVE_SHOP_KEY = "smart_active_shop_id";

export const ADMIN_DEFAULT_PERMISSIONS: string[] = [
  "dashboard", "pos", "sales", "add_sale", "delete_sale",
  "products", "add_product", "delete_product", "customers",
  "add_customer", "delete_customer", "suppliers", "accounting",
  "due", "sms", "reports", "users", "settings"
];

let currentBusinessId: string = "main-business";

export const getApiBusinessId = (): string => currentBusinessId;

export const setApiBusinessId = (id: string | null) => {
  const nextId = id || "main-business";
  currentBusinessId = nextId;
  setSheetsBusinessId(nextId);
  if (typeof window !== "undefined" && id) {
    // Sync cloud Google Sheets config for this shop in background
    fetchCloudSheetsConfig(nextId).catch(() => {});
  }
};

export const isGlobalSuperAdmin = (u?: Partial<User> | null): boolean => {
  if (!u) return false;
  return (
    u.id === "admin-1" ||
    u.isSuperAdmin === true ||
    (u.role as string) === "super_admin"
  );
};

export const isSuperAdminUser = isGlobalSuperAdmin;

export const isShopAdmin = (u?: Partial<User> | null): boolean => {
  if (!u) return false;
  return isGlobalSuperAdmin(u) || u.role === "admin";
};

export const stripSensitiveUserFields = (u: any): User => {
  if (!u || typeof u !== "object") return u;
  const { password: _p, passwordHash: _h, passwordSalt: _s, ...safe } = u;
  return safe as User;
};

async function verifyUserCredential(uData: any, candidatePassword: string): Promise<boolean> {
  if (!uData || !candidatePassword) return false;
  if (uData.passwordHash && uData.passwordSalt) {
    return verifyPassword(candidatePassword, String(uData.passwordHash), String(uData.passwordSalt));
  }
  if (typeof uData.password === "string" && uData.password.length > 0) {
    return uData.password === candidatePassword;
  }
  return false;
}

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
  approvalRequests: ApprovalRequest[];
}

// Default initial empty state (No hardcoded admin passwords or personal emails)
const defaultDbData: LocalDBState = {
  users: [],
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
    phone: "",
    theme: "light"
  },
  approvalRequests: []
};

const getLocalCacheKey = (bizId: string = currentBusinessId): string => {
  return `${LOCAL_DB_KEY}_${bizId || "main-business"}`;
};

// Safe access to shop-isolated client cache
function getLocalCache(bizId: string = currentBusinessId): LocalDBState {
  const targetBizId = bizId || currentBusinessId || "main-business";
  const defaultBizForShop: Business = targetBizId === "main-business"
    ? defaultDbData.business
    : {
        id: targetBizId,
        name: "নতুন শপ",
        currency: "BDT",
        address: "ঢাকা, বাংলাদেশ",
        phone: "",
        theme: "light"
      };

  if (typeof window === "undefined") {
    return { ...defaultDbData, business: defaultBizForShop };
  }
  try {
    const key = getLocalCacheKey(targetBizId);
    let raw = localStorage.getItem(key);
    // Migrate legacy single-shop cache ONLY for main-business
    if (!raw && targetBizId === "main-business") {
      raw = localStorage.getItem(LOCAL_DB_KEY);
      if (raw) {
        localStorage.setItem(key, raw);
      }
    }
    if (!raw) {
      return {
        ...defaultDbData,
        products: [],
        categories: [],
        customers: [],
        customerPayments: [],
        suppliers: [],
        supplierTransactions: [],
        sales: [],
        expenses: [],
        smsLogs: [],
        approvalRequests: [],
        business: defaultBizForShop
      };
    }
    const parsed = JSON.parse(raw);
    return {
      users: parsed.users || [],
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
      business: parsed.business ? { ...defaultBizForShop, ...parsed.business, id: targetBizId } : defaultBizForShop,
      approvalRequests: parsed.approvalRequests || []
    };
  } catch {
    return { ...defaultDbData, business: defaultBizForShop };
  }
}

function saveLocalCache(partial: Partial<LocalDBState>, bizId: string = currentBusinessId) {
  if (typeof window === "undefined") return;
  const targetBizId = bizId || currentBusinessId || "main-business";
  try {
    const current = getLocalCache(targetBizId);
    const updated = { ...current, ...partial };
    localStorage.setItem(getLocalCacheKey(targetBizId), JSON.stringify(updated));
    if (targetBizId === "main-business") {
      localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(updated));
    }
  } catch (e) {
    console.warn("Could not save to localStorage", e);
  }
}

export function cleanForFirestore<T>(data: T): T {
  if (data === null || data === undefined) return null as unknown as T;
  if (typeof data !== 'object') return data;
  // Preserve Firestore FieldValue sentinels (e.g., deleteField(), serverTimestamp(), increment())
  if (
    '_methodName' in (data as any) ||
    (data as any).constructor?.name === 'FieldValue' ||
    (data as any).constructor?.name?.includes('FieldValue') ||
    typeof (data as any).isEqual === 'function'
  ) {
    return data;
  }
  if (Array.isArray(data)) {
    return data.map(item => cleanForFirestore(item)) as unknown as T;
  }
  const result: any = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      result[key] = cleanForFirestore(value);
    }
  }
  return result;
}

function syncUserInAllLocalCaches(
  userId: string,
  email: string | undefined,
  patch: Record<string, any>
) {
  if (typeof window === "undefined") return;
  const cleanMail = (email || "").trim().toLowerCase();
  const keysToUpdate = new Set<string>([
    LOCAL_DB_KEY,
    getLocalCacheKey(currentBusinessId),
    getLocalCacheKey("main-business")
  ]);
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(LOCAL_DB_KEY)) {
      keysToUpdate.add(k);
    }
  }
  keysToUpdate.forEach((key) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed.users)) return;
      let changed = false;
      parsed.users = parsed.users.map((u: any) => {
        if (!u) return u;
        const uMail = String(u.email || "").trim().toLowerCase();
        if (u.id === userId || (cleanMail && uMail === cleanMail)) {
          changed = true;
          const updated = { ...u, ...patch };
          delete updated.password;
          return updated;
        }
        return u;
      });
      if (changed) {
        localStorage.setItem(key, JSON.stringify(parsed));
      }
    } catch {}
  });
}

function findUserInAllLocalCaches(userId?: string, emailOrPhone?: string): any | null {
  if (typeof window === "undefined") return null;
  const cleanInput = (emailOrPhone || "").trim().toLowerCase();
  const rawInput = (emailOrPhone || "").trim();
  const keysToCheck = new Set<string>([
    getLocalCacheKey(currentBusinessId),
    getLocalCacheKey("main-business"),
    LOCAL_DB_KEY
  ]);
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(LOCAL_DB_KEY)) {
      keysToCheck.add(k);
    }
  }
  for (const key of keysToCheck) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const usersArr: any[] = Array.isArray(parsed.users) ? parsed.users : [];
      const found = usersArr.find((u: any) => {
        if (!u) return false;
        if (userId && u.id === userId) return true;
        if (cleanInput && String(u.email || "").trim().toLowerCase() === cleanInput) return true;
        if (rawInput && u.phone && String(u.phone).trim() === rawInput) return true;
        return false;
      });
      if (found) return found;
    } catch {}
  }
  return null;
}

export const getCurrentUser = (): User | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(USER_SESSION_KEY) || localStorage.getItem(USER_SESSION_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
};

export const isOtherProduct = (p?: Partial<Product> | { name?: string; bnName?: string; isCustomProduct?: boolean } | null): boolean => {
  if (!p) return false;
  if (p.isCustomProduct) return true;
  const name = (p.name || '').trim();
  const bnName = ((p as any).bnName || '').trim();
  return (
    name === 'অন্যান্য' ||
    name === 'অন্যন্য' ||
    bnName === 'অন্যান্য' ||
    bnName === 'অন্যন্য' ||
    name.toLowerCase() === 'other' ||
    name.toLowerCase() === 'others'
  );
};

export const reconcileCustomersWithSales = (customers: Customer[], sales: Sale[], _payments: any[] = []): Customer[] => {
  return customers.map(c => {
    // Find all sales matching this customer by ID, phone, or name
    const matchedSales = sales.filter(s => {
      if (s.customerId && s.customerId === c.id) return true;
      if (c.phone && s.customerPhone && s.customerPhone.trim() === c.phone.trim()) return true;
      if (c.name && s.customerName && s.customerName.trim().toLowerCase() === c.name.trim().toLowerCase()) return true;
      return false;
    });

    if (matchedSales.length > 0) {
      const totalPurchased = matchedSales.reduce((acc, s) => acc + (Number(s.payableAmount) || Number(s.totalAmount) || 0), 0);
      return {
        ...c,
        totalSpent: Math.max(Number(c.totalSpent) || 0, totalPurchased),
        dueAmount: Number(c.dueAmount) || 0
      };
    }
    return {
      ...c,
      dueAmount: Number(c.dueAmount) || 0
    };
  });
};

const withFirestoreTimeout = <T>(promise: Promise<T>, ms = 7000): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("FIRESTORE_TIMEOUT"));
    }, ms);
    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
};

export const api = {
  // --- Initial Super Admin Onboarding Check & Bootstrap ---
  hasAnyUser: async (): Promise<boolean> => {
    try {
      const snap = await withFirestoreTimeout(getDocs(query(collection(db, "users"), limit(1))), 6000);
      if (!snap.empty) return true;
    } catch (e) {
      console.warn("Firestore hasAnyUser check failed, checking local cache:", e);
    }
    if (typeof window !== "undefined") {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(LOCAL_DB_KEY)) {
          try {
            const parsed = JSON.parse(localStorage.getItem(k) || "{}");
            if (Array.isArray(parsed.users) && parsed.users.length > 0) {
              return true;
            }
          } catch {}
        }
      }
    }
    return false;
  },

  bootstrapInitialAdmin: async (params: {
    name: string;
    email: string;
    phone?: string;
    password: string;
  }): Promise<User> => {
    const cleanName = (params.name || "").trim();
    const cleanEmail = (params.email || "").trim().toLowerCase();
    const cleanPhone = (params.phone || "").trim();
    const cleanPassword = (params.password || "").trim();

    if (!cleanName || !cleanEmail) {
      throw new Error("নাম এবং ইমেইল প্রদান করা আবশ্যক।");
    }
    if (cleanPassword.length < 6) {
      throw new Error("পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।");
    }

    const alreadyExists = await api.hasAnyUser();
    if (alreadyExists) {
      throw new Error("সিস্টেমে ইতিমধ্যেই একজন সুপার অ্যাডমিন নিবন্ধিত আছেন। অনুগ্রহ করে লগইন করুন।");
    }

    const { hash, salt } = await hashPassword(cleanPassword);
    const now = new Date().toISOString();

    const adminRecord: any = {
      id: "admin-1",
      name: cleanName,
      email: cleanEmail,
      phone: cleanPhone,
      role: "admin",
      isSuperAdmin: true,
      permissions: ADMIN_DEFAULT_PERMISSIONS,
      businessId: "main-business",
      passwordHash: hash,
      passwordSalt: salt,
      createdAt: now,
      lastSeen: now
    };

    try {
      await withFirestoreTimeout(
        Promise.all([
          setDoc(doc(db, "businesses", "main-business"), cleanForFirestore({
            ...defaultDbData.business,
            phone: cleanPhone || defaultDbData.business.phone
          }), { merge: true }),
          setDoc(doc(db, "users", "admin-1"), cleanForFirestore(adminRecord))
        ]),
        8000
      );
    } catch (e: any) {
      console.warn("Bootstrap initial admin Firestore write warning (continuing with local cache):", e);
      // Still kick off background writes if it timed out on slow connection
      setDoc(doc(db, "businesses", "main-business"), cleanForFirestore({
        ...defaultDbData.business,
        phone: cleanPhone || defaultDbData.business.phone
      }), { merge: true }).catch(() => {});
      setDoc(doc(db, "users", "admin-1"), cleanForFirestore(adminRecord)).catch(() => {});
    }

    setApiBusinessId("main-business");
    const cache = getLocalCache("main-business");
    cache.users = [adminRecord];
    saveLocalCache(cache, "main-business");

    return stripSensitiveUserFields(adminRecord);
  },

  // --- Authentication ---
  login: async (email: string, pass: string): Promise<User> => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = pass.trim();

    if (!cleanEmail || !cleanPass) {
      throw new Error("ইমেইল এবং পাসওয়ার্ড প্রদান করুন।");
    }

    const checkCred = async (uData: any): Promise<boolean> => {
      if (await verifyUserCredential(uData, cleanPass)) return true;
      if (pass !== cleanPass && (await verifyUserCredential(uData, pass))) return true;
      return false;
    };

    try {
      const usersCol = collection(db, "users");
      const q = query(usersCol, where("email", "==", cleanEmail));
      const snap = await withFirestoreTimeout(getDocs(q), 6000);
      const candidateDocs: any[] = [...snap.docs];
      let matchedDoc: any = null;

      for (const d of candidateDocs) {
        if (await checkCred(d.data())) {
          matchedDoc = d;
          break;
        }
      }

      // Fallback: case-insensitive email or phone lookup across all users in Firestore
      // (Handles legacy users created with uppercase letters in email, phone login, or duplicate user records)
      if (!matchedDoc) {
        const allUsersSnap = await withFirestoreTimeout(getDocs(usersCol), 6000);
        if (allUsersSnap.empty && candidateDocs.length === 0) {
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("needs-initial-setup"));
          }
          throw new Error("সিস্টেমে এখনো কোনো অ্যাডমিন অ্যাকাউন্ট তৈরি করা হয়নি। অনুগ্রহ করে প্রথম সুপার অ্যাডমিন অ্যাকাউন্ট তৈরি করুন।");
        }
        const seenIds = new Set(candidateDocs.map(d => d.id));
        for (const d of allUsersSnap.docs) {
          if (seenIds.has(d.id)) continue;
          const dData = d.data() as any;
          const docEmail = String(dData.email || "").trim().toLowerCase();
          const docPhone = String(dData.phone || "").trim();
          if (docEmail === cleanEmail || (docPhone && docPhone === email.trim())) {
            candidateDocs.push(d);
            if (!matchedDoc && (await checkCred(dData))) {
              matchedDoc = d;
            }
          }
        }
      }

      if (!matchedDoc && candidateDocs.length > 0) {
        matchedDoc = candidateDocs[0];
      }

      if (matchedDoc) {
        const userDoc = matchedDoc;
        let userData = { ...(userDoc.data() as any) };

        let valid = await checkCred(userData);
        // Self-healing fallback: if password was recently changed and saved in local cache while Firestore had an older hash
        if (!valid) {
          const localCachedUser = findUserInAllLocalCaches(userDoc.id, cleanEmail);
          if (localCachedUser && (await checkCred(localCachedUser))) {
            valid = true;
            userData = {
              ...userData,
              passwordHash: localCachedUser.passwordHash,
              passwordSalt: localCachedUser.passwordSalt
            };
            delete userData.password;
            if (localCachedUser.passwordHash && localCachedUser.passwordSalt) {
              updateDoc(doc(db, "users", userDoc.id), {
                passwordHash: localCachedUser.passwordHash,
                passwordSalt: localCachedUser.passwordSalt,
                password: deleteField()
              }).catch(() => {});
            }
          }
        }

        if (!valid) {
          throw new Error("ভুল পাসওয়ার্ড। আবার চেষ্টা করুন।");
        }

        const globalSuper = isGlobalSuperAdmin({ id: userDoc.id, ...userData });
        const shopAdmin = isShopAdmin({ id: userDoc.id, ...userData });

        // Transparently migrate legacy plaintext password to PBKDF2 hash & normalize email
        let nextHash = userData.passwordHash;
        let nextSalt = userData.passwordSalt;
        const normalizedEmail = String(userData.email || cleanEmail).trim().toLowerCase();
        if (!nextHash || !nextSalt) {
          const migrated = await hashPassword(cleanPass);
          nextHash = migrated.hash;
          nextSalt = migrated.salt;
          updateDoc(doc(db, "users", userDoc.id), {
            email: normalizedEmail,
            passwordHash: nextHash,
            passwordSalt: nextSalt,
            password: deleteField(),
            lastSeen: new Date().toISOString()
          }).catch(() => {});
        } else {
          updateDoc(doc(db, "users", userDoc.id), {
            email: normalizedEmail,
            password: deleteField(),
            lastSeen: new Date().toISOString()
          }).catch(() => {});
        }

        const assignedBusinessId = userData.businessId || "main-business";
        let resolvedBusinessId = assignedBusinessId;
        if (globalSuper) {
          const savedAdminShop = typeof window !== "undefined" ? localStorage.getItem(ACTIVE_SHOP_KEY) : null;
          resolvedBusinessId = savedAdminShop || assignedBusinessId;
        } else {
          // Strict Shop Isolation: Non-super-admin users MUST only enter their assigned shop
          if (typeof window !== "undefined") {
            localStorage.removeItem(ACTIVE_SHOP_KEY);
          }
        }

        const rawPerms: string[] = Array.isArray(userData.permissions) && userData.permissions.length > 0
          ? userData.permissions
          : (shopAdmin ? ADMIN_DEFAULT_PERMISSIONS : ["pos", "sales", "reports"]);
        const resolvedPerms = shopAdmin
          ? ADMIN_DEFAULT_PERMISSIONS
          : rawPerms.filter(p => p !== "settings" && p !== "approvals");

        const loggedUser: User = {
          id: userDoc.id,
          name: userData.name || "ব্যবহারকারী",
          email: normalizedEmail,
          phone: userData.phone || "",
          image: userData.image || "",
          role: shopAdmin ? "admin" : (userData.role || "salesman"),
          isSuperAdmin: globalSuper,
          permissions: resolvedPerms,
          businessId: resolvedBusinessId,
          createdAt: userData.createdAt || new Date().toISOString(),
          lastSeen: new Date().toISOString()
        };

        setApiBusinessId(resolvedBusinessId);

        // Cache hashed verifier locally inside this shop's isolated cache and sync across all local caches
        const shopCache = getLocalCache(resolvedBusinessId);
        const existingIdx = shopCache.users.findIndex((u: any) => u.id === loggedUser.id);
        const offlineRecord = { ...loggedUser, passwordHash: nextHash, passwordSalt: nextSalt };
        if (existingIdx !== -1) {
          shopCache.users[existingIdx] = offlineRecord;
        } else {
          shopCache.users.push(offlineRecord);
        }
        saveLocalCache({ users: shopCache.users }, resolvedBusinessId);
        syncUserInAllLocalCaches(loggedUser.id, normalizedEmail, offlineRecord);

        return stripSensitiveUserFields(loggedUser);
      }
    } catch (fsErr: any) {
      if (fsErr.message?.includes("ভুল পাসওয়ার্ড") || fsErr.message?.includes("অ্যাডমিন অ্যাকাউন্ট তৈরি")) {
        throw fsErr;
      }
      console.warn("Firestore login query failed, checking offline shop caches:", fsErr);
    }

    // Offline fallback across all isolated shop localStorage caches
    if (typeof window !== "undefined") {
      const found = findUserInAllLocalCaches(undefined, email);
      if (found) {
        const valid = await checkCred(found);
        if (!valid) {
          throw new Error("ভুল পাসওয়ার্ড। আবার চেষ্টা করুন।");
        }
        const globalSuper = isGlobalSuperAdmin(found);
        const shopAdmin = isShopAdmin(found);
        const assignedBizId = found.businessId || "main-business";
        const savedAdminShop = localStorage.getItem(ACTIVE_SHOP_KEY);
        const resolvedBizId = globalSuper ? (savedAdminShop || assignedBizId) : assignedBizId;
        if (!globalSuper) {
          localStorage.removeItem(ACTIVE_SHOP_KEY);
        }
        setApiBusinessId(resolvedBizId);
        const safeFound = stripSensitiveUserFields(found);
        return {
          ...safeFound,
          role: shopAdmin ? "admin" : safeFound.role,
          isSuperAdmin: globalSuper,
          businessId: resolvedBizId,
          permissions: shopAdmin
            ? ADMIN_DEFAULT_PERMISSIONS
            : (safeFound.permissions || []).filter((p: string) => p !== "settings" && p !== "approvals")
        } as User;
      }
    }

    throw new Error("ভুল ইমেইল বা পাসওয়ার্ড প্রদান করা হয়েছে।");
  },

  verifySession: async (userId: string, email: string): Promise<User | null> => {
    try {
      const snap = await withFirestoreTimeout(getDoc(doc(db, "users", userId)), 5000);
      if (snap.exists()) {
        const data = snap.data();
        if (data.email?.toLowerCase() === email.toLowerCase()) {
          const globalSuper = isGlobalSuperAdmin({ id: snap.id, ...data } as any);
          const shopAdmin = isShopAdmin({ id: snap.id, ...data } as any);
          const assignedBizId = data.businessId || "main-business";

          let resolvedBusinessId = assignedBizId;
          if (globalSuper) {
            const savedAdminShop = typeof window !== "undefined" ? localStorage.getItem(ACTIVE_SHOP_KEY) : null;
            resolvedBusinessId = savedAdminShop || assignedBizId;
          } else if (typeof window !== "undefined") {
            localStorage.removeItem(ACTIVE_SHOP_KEY);
          }

          const rawPerms: string[] = Array.isArray(data.permissions) && data.permissions.length > 0
            ? data.permissions
            : (shopAdmin ? ADMIN_DEFAULT_PERMISSIONS : ["pos", "sales", "reports"]);
          const resolvedPerms = shopAdmin
            ? ADMIN_DEFAULT_PERMISSIONS
            : rawPerms.filter(p => p !== "settings" && p !== "approvals");

          return stripSensitiveUserFields({
            id: snap.id,
            ...data,
            role: shopAdmin ? "admin" : (data.role || "salesman"),
            isSuperAdmin: globalSuper,
            businessId: resolvedBusinessId,
            permissions: resolvedPerms
          });
        }
      }
    } catch (e) {
      console.warn("Session verification via firestore failed:", e);
    }

    // Cache verification across isolated shop caches
    if (typeof window !== "undefined") {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(LOCAL_DB_KEY)) continue;
        try {
          const parsed = JSON.parse(localStorage.getItem(key) || "{}");
          const usersArr: any[] = Array.isArray(parsed.users) ? parsed.users : [];
          const found = usersArr.find(u => u.id === userId && u.email?.toLowerCase() === email.toLowerCase());
          if (found) {
            const globalSuper = isGlobalSuperAdmin(found);
            const shopAdmin = isShopAdmin(found);
            const assignedBizId = found.businessId || "main-business";
            const savedAdminShop = localStorage.getItem(ACTIVE_SHOP_KEY);
            const resolvedBusinessId = globalSuper ? (savedAdminShop || assignedBizId) : assignedBizId;
            if (!globalSuper) {
              localStorage.removeItem(ACTIVE_SHOP_KEY);
            }
            const safeFound = stripSensitiveUserFields(found);
            return {
              ...safeFound,
              role: shopAdmin ? "admin" : safeFound.role,
              isSuperAdmin: globalSuper,
              businessId: resolvedBusinessId
            } as User;
          }
        } catch {}
      }
    }
    return null;
  },

  register: async (userData: Partial<User>): Promise<User> => {
    return api.createUser(userData);
  },

  changePassword: async (passwords: { currentPassword: string; newPassword: string }): Promise<boolean> => {
    const cur = getCurrentUser();
    if (!cur) throw new Error("অননুমোদিত অনুরোধ।");

    const rawCurrent = passwords.currentPassword || "";
    const trimmedCurrent = rawCurrent.trim();
    const nextPass = (passwords.newPassword || "").trim();
    if (nextPass.length < 6) {
      throw new Error("নতুন পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।");
    }

    const verifyCurrent = async (uData: any): Promise<boolean> => {
      if (await verifyUserCredential(uData, trimmedCurrent)) return true;
      if (rawCurrent !== trimmedCurrent && (await verifyUserCredential(uData, rawCurrent))) return true;
      return false;
    };

    const { hash, salt } = await hashPassword(nextPass);
    const cleanEmail = String(cur.email || "").trim().toLowerCase();

    try {
      const userRef = doc(db, "users", cur.id);
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        const data = snap.data();
        let valid = await verifyCurrent(data);
        if (!valid) {
          const localUser = findUserInAllLocalCaches(cur.id, cleanEmail);
          if (localUser && (await verifyCurrent(localUser))) {
            valid = true;
          }
        }
        if (!valid) {
          throw new Error("বর্তমান পাসওয়ার্ড সঠিক নয়।");
        }
        await updateDoc(userRef, {
          passwordHash: hash,
          passwordSalt: salt,
          password: deleteField(),
          ...(cleanEmail ? { email: cleanEmail } : {})
        });

        // Also update any duplicate user documents sharing the same email
        if (cleanEmail) {
          const sameEmailSnap = await getDocs(query(collection(db, "users"), where("email", "==", cleanEmail)));
          await Promise.all(
            sameEmailSnap.docs
              .filter(d => d.id !== cur.id)
              .map(d =>
                updateDoc(doc(db, "users", d.id), {
                  passwordHash: hash,
                  passwordSalt: salt,
                  password: deleteField()
                }).catch(() => {})
              )
          );
        }

        syncUserInAllLocalCaches(cur.id, cleanEmail, {
          passwordHash: hash,
          passwordSalt: salt
        });
        return true;
      }
    } catch (e: any) {
      if (e.message?.includes("বর্তমান পাসওয়ার্ড")) throw e;
      console.warn("Firestore changePassword error:", e);
    }

    const localUser = findUserInAllLocalCaches(cur.id, cleanEmail);
    if (!localUser) throw new Error("ব্যবহারকারী পাওয়া যায়নি।");
    const valid = await verifyCurrent(localUser);
    if (!valid) {
      throw new Error("বর্তমান পাসওয়ার্ড সঠিক নয়।");
    }
    syncUserInAllLocalCaches(cur.id, cleanEmail, {
      passwordHash: hash,
      passwordSalt: salt
    });
    return true;
  },

  adminResetPassword: async (userId: string, newPassword: string): Promise<boolean> => {
    const cur = getCurrentUser();
    if (!isShopAdmin(cur)) {
      throw new Error("শুধুমাত্র অ্যাডমিন পাসওয়ার্ড রিসেট করতে পারবেন।");
    }
    const cleanNewPass = (newPassword || "").trim();
    if (cleanNewPass.length < 6) {
      throw new Error("নতুন পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।");
    }

    const localTarget = findUserInAllLocalCaches(userId);
    let targetEmail = String(localTarget?.email || "").trim().toLowerCase();

    // Enforce shop boundaries & super-admin protection
    try {
      const targetSnap = await getDoc(doc(db, "users", userId));
      if (targetSnap.exists()) {
        const targetData = targetSnap.data() as any;
        if (targetData.email) {
          targetEmail = String(targetData.email).trim().toLowerCase();
        }
        const targetIsSuper = isGlobalSuperAdmin({ id: targetSnap.id, ...targetData });
        if (targetIsSuper && !isGlobalSuperAdmin(cur)) {
          throw new Error("সুপার অ্যাডমিনের পাসওয়ার্ড পরিবর্তন করার অনুমতি আপনার নেই।");
        }
        if (!isGlobalSuperAdmin(cur) && (targetData.businessId || "main-business") !== currentBusinessId) {
          throw new Error("অন্য শপের ইউজারের পাসওয়ার্ড পরিবর্তন করা যাবে না।");
        }
      }
    } catch (chkErr: any) {
      if (chkErr?.message?.includes("অনুমতি") || chkErr?.message?.includes("অন্য শপ")) throw chkErr;
    }

    const { hash, salt } = await hashPassword(cleanNewPass);

    // Update local caches first so even if offline, the new password is immediately saved everywhere
    syncUserInAllLocalCaches(userId, targetEmail, {
      passwordHash: hash,
      passwordSalt: salt
    });

    try {
      const targetRef = doc(db, "users", userId);
      const targetSnap = await getDoc(targetRef);
      if (targetSnap.exists()) {
        await updateDoc(targetRef, {
          passwordHash: hash,
          passwordSalt: salt,
          password: deleteField(),
          ...(targetEmail ? { email: targetEmail } : {})
        });
      } else if (localTarget) {
        const { password: _drop, ...safeLocal } = localTarget;
        await setDoc(
          targetRef,
          cleanForFirestore({
            ...safeLocal,
            id: userId,
            email: targetEmail || safeLocal.email || "",
            businessId: safeLocal.businessId || currentBusinessId || "main-business",
            passwordHash: hash,
            passwordSalt: salt
          }),
          { merge: true }
        );
      }

      // Also sync any duplicate user documents sharing the same email in Firestore
      if (targetEmail) {
        const sameEmailSnap = await getDocs(query(collection(db, "users"), where("email", "==", targetEmail)));
        await Promise.all(
          sameEmailSnap.docs
            .filter(d => d.id !== userId)
            .map(d =>
              updateDoc(doc(db, "users", d.id), {
                passwordHash: hash,
                passwordSalt: salt,
                password: deleteField()
              }).catch(() => {})
            )
        );
      }
    } catch (e) {
      console.warn("Firestore adminResetPassword error:", e);
    }

    return true;
  },

  // --- Users (Strictly Isolated per Shop — zero cross-shop leakage or plaintext passwords) ---
  getUsers: async (): Promise<User[]> => {
    const belongsToCurrentShop = (u: any): boolean =>
      (u.businessId || "main-business") === currentBusinessId || isGlobalSuperAdmin(u);

    const filterShopUsers = (list: any[]): User[] =>
      list
        .filter(belongsToCurrentShop)
        .map(stripSensitiveUserFields);

    const mergeWithLocalAndCurrent = (baseList: any[]): any[] => {
      const map = new Map<string, any>();
      baseList.forEach(u => {
        if (u && u.id && belongsToCurrentShop(u)) {
          map.set(u.id, u);
        }
      });
      const cache = getLocalCache();
      (cache.users || []).forEach(u => {
        if (u && u.id && !map.has(u.id) && belongsToCurrentShop(u)) {
          map.set(u.id, u);
        }
      });
      const cur = getCurrentUser();
      if (cur && cur.id && !map.has(cur.id) && belongsToCurrentShop(cur)) {
        map.set(cur.id, cur);
      }
      return Array.from(map.values());
    };

    try {
      const snap = await getDocs(collection(db, "users"));
      const rawShopUsers: any[] = [];
      snap.forEach(d => {
        const data = d.data();
        const candidate = {
          id: d.id,
          name: data.name || "ব্যবহারকারী",
          email: data.email || "",
          phone: data.phone || "",
          role: data.role || "salesman",
          isSuperAdmin: data.isSuperAdmin === true || d.id === "admin-1",
          permissions: data.permissions || ["pos", "sales", "reports"],
          businessId: data.businessId || "main-business",
          passwordHash: data.passwordHash,
          passwordSalt: data.passwordSalt,
          createdAt: data.createdAt || new Date().toISOString(),
          lastSeen: data.lastSeen || new Date().toISOString()
        };
        if (belongsToCurrentShop(candidate)) {
          rawShopUsers.push(candidate);
        }
      });

      const combined = mergeWithLocalAndCurrent(rawShopUsers);
      if (combined.length > 0) {
        saveLocalCache({ users: combined });
        return filterShopUsers(combined);
      }
      return [];
    } catch (err) {
      console.warn("Firestore getUsers failed, using cache:", err);
      const cache = getLocalCache();
      return filterShopUsers(mergeWithLocalAndCurrent(cache.users || []));
    }
  },

  subscribeUsers: (callback: (users: User[]) => void): (() => void) => {
    const belongsToCurrentShop = (u: any): boolean =>
      (u.businessId || "main-business") === currentBusinessId || isGlobalSuperAdmin(u);

    try {
      const colRef = collection(db, "users");
      return onSnapshot(colRef, (snap) => {
        const rawShopUsers: any[] = [];
        snap.forEach(d => {
          const data = d.data();
          const candidate = {
            id: d.id,
            name: data.name || "ব্যবহারকারী",
            email: data.email || "",
            phone: data.phone || "",
            role: data.role || "salesman",
            isSuperAdmin: data.isSuperAdmin === true || d.id === "admin-1",
            permissions: data.permissions || ["pos", "sales", "reports"],
            businessId: data.businessId || "main-business",
            passwordHash: data.passwordHash,
            passwordSalt: data.passwordSalt,
            createdAt: data.createdAt || new Date().toISOString(),
            lastSeen: data.lastSeen || new Date().toISOString()
          };
          if (belongsToCurrentShop(candidate)) {
            rawShopUsers.push(candidate);
          }
        });
        saveLocalCache({ users: rawShopUsers });
        callback(rawShopUsers.map(stripSensitiveUserFields));
      }, (error) => {
        console.warn("onSnapshot users error:", error);
      });
    } catch (e) {
      return () => {};
    }
  },

  createUser: async (user: Partial<User>): Promise<User> => {
    const cleanEmail = (user.email || "").toLowerCase().trim();
    if (!cleanEmail) {
      throw new Error("ইমেইল প্রদান করা আবশ্যক।");
    }
    const rawPass = (user.password || "").trim();
    if (rawPass.length < 6) {
      throw new Error("ইউজারের পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।");
    }

    // Check across all shops in Firestore so no two users share an email across shops
    try {
      const q = query(collection(db, "users"), where("email", "==", cleanEmail));
      const snap = await getDocs(q);
      if (!snap.empty) {
        throw new Error("এই ইমেইল দিয়ে ইতিমধ্যে একটি একাউন্ট রয়েছে। প্রতিটি ইউজারের জন্য আলাদা ইমেইল ব্যবহার করুন।");
      }
    } catch (dupErr: any) {
      if (dupErr.message?.includes("ইতিমধ্যে")) throw dupErr;
    }

    const { hash, salt } = await hashPassword(rawPass);
    const newId = user.id || `user_${Date.now()}`;
    const rawPerms = user.permissions || (user.role === "admin" ? ADMIN_DEFAULT_PERMISSIONS : ["pos", "sales", "reports"]);
    const cleanPerms = user.role === "admin" ? rawPerms : rawPerms.filter(p => p !== "settings" && p !== "approvals");

    const newUserRecord: any = {
      id: newId,
      name: user.name || "নতুন ব্যবহারকারী",
      email: cleanEmail,
      phone: user.phone || "",
      image: user.image || "",
      role: user.role === "admin" ? "admin" : (user.role || "salesman"),
      isSuperAdmin: false,
      permissions: cleanPerms,
      businessId: currentBusinessId,
      passwordHash: hash,
      passwordSalt: salt,
      createdAt: new Date().toISOString(),
      lastSeen: new Date().toISOString()
    };

    try {
      await setDoc(doc(db, "users", newId), cleanForFirestore(newUserRecord));
    } catch (err) {
      console.warn("Firestore createUser failed:", err);
    }

    const cache = getLocalCache();
    cache.users.push(newUserRecord);
    saveLocalCache(cache);

    const safeUser = stripSensitiveUserFields(newUserRecord);
    syncEntityToGoogleSheets('user', safeUser, 'upsert', currentBusinessId);

    return safeUser;
  },

  updateUser: async (id: string, user: Partial<User>): Promise<User> => {
    const cur = getCurrentUser();
    if (!isShopAdmin(cur) && cur?.id !== id) {
      throw new Error("এই ইউজার প্রোফাইল পরিবর্তনের অনুমতি আপনার নেই।");
    }

    const updatePayload: any = { ...user };
    if (typeof updatePayload.email === "string") {
      updatePayload.email = updatePayload.email.trim().toLowerCase();
    }

    // Never allow client updates to escalate isSuperAdmin or businessId arbitrarily unless Global Super Admin
    if (!isGlobalSuperAdmin(cur)) {
      delete updatePayload.isSuperAdmin;
      delete updatePayload.businessId;
    }

    const isPasswordChanged = typeof user.password === "string" && user.password.trim().length > 0;
    if (isPasswordChanged) {
      if (user.password!.trim().length < 6) {
        throw new Error("পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।");
      }
      const { hash, salt } = await hashPassword(user.password!.trim());
      updatePayload.passwordHash = hash;
      updatePayload.passwordSalt = salt;
      updatePayload.password = deleteField();
    } else {
      delete updatePayload.password;
    }

    const { password: _dropPass, ...cachePatch } = updatePayload;
    const localTarget = findUserInAllLocalCaches(id);
    let resolvedEmail = String(updatePayload.email || localTarget?.email || "").trim().toLowerCase();

    try {
      const targetRef = doc(db, "users", id);
      const targetSnap = await getDoc(targetRef);
      if (targetSnap.exists()) {
        const targetData = targetSnap.data() as any;
        if (!resolvedEmail && targetData.email) {
          resolvedEmail = String(targetData.email).trim().toLowerCase();
        }
        if (isGlobalSuperAdmin({ id, ...targetData }) && !isGlobalSuperAdmin(cur)) {
          throw new Error("সুপার অ্যাডমিনের তথ্য পরিবর্তন করার অনুমতি নেই।");
        }
        if (!isGlobalSuperAdmin(cur) && (targetData.businessId || "main-business") !== currentBusinessId) {
          throw new Error("অন্য শপের ইউজার সম্পাদনা করা যাবে না।");
        }
        await updateDoc(targetRef, cleanForFirestore(updatePayload));
      } else {
        await setDoc(
          targetRef,
          cleanForFirestore({
            ...(localTarget || {}),
            ...cachePatch,
            id,
            email: resolvedEmail,
            businessId: localTarget?.businessId || currentBusinessId || "main-business"
          }),
          { merge: true }
        );
      }

      if (isPasswordChanged && resolvedEmail) {
        const sameEmailSnap = await getDocs(query(collection(db, "users"), where("email", "==", resolvedEmail)));
        await Promise.all(
          sameEmailSnap.docs
            .filter(d => d.id !== id)
            .map(d =>
              updateDoc(doc(db, "users", d.id), {
                passwordHash: updatePayload.passwordHash,
                passwordSalt: updatePayload.passwordSalt,
                password: deleteField()
              }).catch(() => {})
            )
        );
      }
    } catch (err: any) {
      if (err?.message?.includes("অনুমতি") || err?.message?.includes("অন্য শপ")) throw err;
      console.warn("Firestore updateUser failed:", err);
    }

    syncUserInAllLocalCaches(id, resolvedEmail, cachePatch);

    const cache = getLocalCache();
    const idx = cache.users.findIndex(u => u.id === id);
    if (idx !== -1) {
      cache.users[idx] = { ...cache.users[idx], ...cachePatch };
      delete cache.users[idx].password;
      saveLocalCache(cache);
      const safeUser = stripSensitiveUserFields(cache.users[idx]);
      syncEntityToGoogleSheets('user', safeUser, 'upsert', currentBusinessId);
      return safeUser;
    }
    const safeReturned = stripSensitiveUserFields({ ...(localTarget || {}), id, ...cachePatch });
    syncEntityToGoogleSheets('user', safeReturned, 'upsert', currentBusinessId);
    return safeReturned;
  },

  deleteUser: async (id: string): Promise<boolean> => {
    const cur = getCurrentUser();
    if (!isShopAdmin(cur)) {
      throw new Error("শুধুমাত্র অ্যাডমিন ইউজার ডিলিট করতে পারবেন।");
    }
    if (id === "admin-1") {
      throw new Error("প্রধান সুপার অ্যাডমিন অ্যাকাউন্ট মুছে ফেলা যাবে না।");
    }

    try {
      const targetSnap = await getDoc(doc(db, "users", id));
      if (targetSnap.exists()) {
        const targetData = targetSnap.data() as any;
        if (isGlobalSuperAdmin({ id, ...targetData })) {
          throw new Error("প্রধান সুপার অ্যাডমিন অ্যাকাউন্ট মুছে ফেলা যাবে না।");
        }
        if (!isGlobalSuperAdmin(cur) && (targetData.businessId || "main-business") !== currentBusinessId) {
          throw new Error("অন্য শপের ইউজার মুছে ফেলা যাবে না।");
        }
      }
      await deleteDoc(doc(db, "users", id));
    } catch (err: any) {
      if (err?.message?.includes("মুছে ফেলা যাবে না")) throw err;
      console.warn("Firestore deleteUser failed:", err);
    }

    const cache = getLocalCache();
    cache.users = cache.users.filter(u => u.id !== id);
    saveLocalCache(cache);
    syncEntityToGoogleSheets('user', { id }, 'delete', currentBusinessId);
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
    syncEntityToGoogleSheets('category', newCat, 'upsert', currentBusinessId);
    return newCat;
  },

  // --- Sales ---
  getSales: async (userId?: string, includeTemporary: boolean = false): Promise<Sale[]> => {
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

    if (!includeTemporary) {
      salesList = salesList.filter(
        s =>
          !s.isTemporary &&
          s.approvalStatus !== 'pending' &&
          s.approvalStatus !== 'rejected' &&
          !String(s.invoiceNo || '').startsWith('TMP-')
      );
    }

    const matchesSaleUser = (s: Sale, targetUserId: string, targetUserName?: string): boolean => {
      if (!targetUserId || targetUserId === "all") return true;
      if (s.userId === targetUserId || s.createdBy === targetUserId) return true;
      const sUserName = String((s as any).userName || "").trim().toLowerCase();
      if (sUserName && sUserName === targetUserId.trim().toLowerCase()) return true;
      if (targetUserName && sUserName && sUserName === targetUserName.trim().toLowerCase()) return true;
      // Also check linked approval request if this sale was approved from a Sales Order
      if (s.approvalRequestId) {
        const linkedReq = (getLocalCache().approvalRequests || []).find(r => r.id === s.approvalRequestId);
        if (linkedReq) {
          if (linkedReq.userId === targetUserId) return true;
          if (targetUserName && linkedReq.userName && linkedReq.userName.trim().toLowerCase() === targetUserName.trim().toLowerCase()) return true;
        }
      }
      return false;
    };

    // Role isolation
    if (curUser && !isShopAdmin(curUser)) {
      return salesList.filter(s => matchesSaleUser(s, curUser.id, curUser.name));
    }
    if (userId && userId !== "all") {
      const targetUser = (getLocalCache().users || []).find(u => u.id === userId);
      return salesList.filter(s => matchesSaleUser(s, userId, targetUser?.name));
    }
    return salesList;
  },

  subscribeSales: (callback: (sales: Sale[]) => void, userId?: string, includeTemporary: boolean = false): (() => void) => {
    const matchesSaleUser = (s: Sale, targetUserId: string, targetUserName?: string): boolean => {
      if (!targetUserId || targetUserId === "all") return true;
      if (s.userId === targetUserId || s.createdBy === targetUserId) return true;
      const sUserName = String((s as any).userName || "").trim().toLowerCase();
      if (sUserName && sUserName === targetUserId.trim().toLowerCase()) return true;
      if (targetUserName && sUserName && sUserName === targetUserName.trim().toLowerCase()) return true;
      if (s.approvalRequestId) {
        const linkedReq = (getLocalCache().approvalRequests || []).find(r => r.id === s.approvalRequestId);
        if (linkedReq) {
          if (linkedReq.userId === targetUserId) return true;
          if (targetUserName && linkedReq.userName && linkedReq.userName.trim().toLowerCase() === targetUserName.trim().toLowerCase()) return true;
        }
      }
      return false;
    };

    const filterAndEmit = (rawList: Sale[]) => {
      const curUser = getCurrentUser();
      let salesList = [...(rawList || [])];
      salesList.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

      if (!includeTemporary) {
        salesList = salesList.filter(
          s =>
            !s.isTemporary &&
            s.approvalStatus !== 'pending' &&
            s.approvalStatus !== 'rejected' &&
            !String(s.invoiceNo || '').startsWith('TMP-')
        );
      }

      if (curUser && !isShopAdmin(curUser)) {
        callback(salesList.filter(s => matchesSaleUser(s, curUser.id, curUser.name)));
      } else if (userId && userId !== "all") {
        const targetUser = (getLocalCache().users || []).find(u => u.id === userId);
        callback(salesList.filter(s => matchesSaleUser(s, userId, targetUser?.name)));
      } else {
        callback(salesList);
      }
    };

    filterAndEmit(getLocalCache().sales || []);

    let unsubFs = () => {};
    try {
      const colRef = collection(db, "businesses", currentBusinessId, "sales");
      unsubFs = onSnapshot(colRef, (snap) => {
        let salesList: Sale[] = [];
        snap.forEach(d => salesList.push({ id: d.id, ...d.data() } as Sale));
        const cache = getLocalCache();
        const existingMap = new Map<string, Sale>();
        salesList.forEach(item => existingMap.set(item.id, item));
        (cache.sales || []).forEach(localItem => {
          if (!existingMap.has(localItem.id)) {
            existingMap.set(localItem.id, localItem);
          }
        });
        const combined = Array.from(existingMap.values());
        combined.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        saveLocalCache({ sales: combined });
        filterAndEmit(combined);
      }, (error) => {
        console.warn("onSnapshot sales error:", error);
      });
    } catch {}

    const handleLocalSalesUpdate = () => {
      filterAndEmit(getLocalCache().sales || []);
    };
    if (typeof window !== "undefined") {
      window.addEventListener("sales-updated", handleLocalSalesUpdate);
    }

    return () => {
      unsubFs();
      if (typeof window !== "undefined") {
        window.removeEventListener("sales-updated", handleLocalSalesUpdate);
      }
    };
  },

  createSale: async (sale: Partial<Sale>): Promise<Sale> => {
    const curUser = getCurrentUser();
    const id = sale.id || `sale_${Date.now()}`;
    const payable = Number(sale.payableAmount) || Number(sale.totalAmount) || 0;
    const paid = Number(sale.paidAmount) || 0;
    const due = sale.dueAmount !== undefined && !Number.isNaN(Number(sale.dueAmount)) ? Number(sale.dueAmount) : (payable - paid);

    // Preserve explicit sale.userId / sale.createdBy (e.g. when Admin approves a Salesman's Sales Order)
    const effectiveUserId = sale.userId || sale.createdBy || curUser?.id || "admin-1";
    const effectiveCreatedBy = sale.createdBy || sale.userId || curUser?.id || "admin-1";
    const effectiveUserName = (sale as any).userName || curUser?.name || "অ্যাডমিন";

    const newSale: Sale = {
      ...sale,
      id,
      invoiceNo: sale.invoiceNo || `INV-${Math.floor(100000 + Math.random() * 900000)}`,
      userId: effectiveUserId,
      createdBy: effectiveCreatedBy,
      userName: effectiveUserName,
      totalAmount: Number(sale.totalAmount) || payable,
      payableAmount: payable,
      paidAmount: paid,
      dueAmount: due,
      createdAt: sale.createdAt || new Date().toISOString()
    } as Sale;

    const cache = getLocalCache();

    // 1. Deduct stock in Cache & Firestore (skip for 'অন্যান্য' / custom products)
    if (Array.isArray(newSale.items)) {
      for (const item of newSale.items) {
        if (isOtherProduct(item)) continue;
        const prodId = item.productId || (item as any).id;
        if (prodId) {
          const pIdx = cache.products.findIndex(p => p.id === prodId);
          if (pIdx !== -1) {
            if (isOtherProduct(cache.products[pIdx])) continue;
            cache.products[pIdx].stock = Math.max(0, (Number(cache.products[pIdx].stock) || 0) - (Number(item.quantity) || 1));
            syncEntityToGoogleSheets('product', cache.products[pIdx], 'upsert', currentBusinessId);
          }
          try {
            const pDoc = await getDoc(doc(db, "businesses", currentBusinessId, "products", prodId));
            if (pDoc.exists()) {
              const pData = pDoc.data();
              if (!isOtherProduct(pData as any)) {
                const currentStock = Number(pData.stock) || 0;
                const newStock = Math.max(0, currentStock - (Number(item.quantity) || 1));
                await updateDoc(doc(db, "businesses", currentBusinessId, "products", prodId), { stock: newStock });
                if (pIdx === -1) {
                  const fullProd = { id: pDoc.id, ...pData, stock: newStock } as Product;
                  cache.products.push(fullProd);
                  syncEntityToGoogleSheets('product', fullProd, 'upsert', currentBusinessId);
                }
              }
            }
          } catch {}
        }
      }
    }

    // 2. Tightly link and update customer balance (supports negative dueAmount = ক্রেতা পাবে / advance)
    let matchedCustomer = cache.customers.find(c => 
      (newSale.customerId && newSale.customerId !== "walking" && c.id === newSale.customerId) ||
      (newSale.customerPhone && c.phone && c.phone.trim() === newSale.customerPhone.trim()) ||
      (newSale.customerName && c.name && c.name.trim().toLowerCase() === newSale.customerName.trim().toLowerCase())
    );

    // Fallback to Firestore if customer is not yet in local cache (e.g. after switching to 2nd shop)
    if (!matchedCustomer && newSale.customerId && newSale.customerId !== "walking") {
      try {
        const custSnap = await getDoc(doc(db, "businesses", currentBusinessId, "customers", newSale.customerId));
        if (custSnap.exists()) {
          matchedCustomer = { id: custSnap.id, ...custSnap.data() } as Customer;
          cache.customers.push(matchedCustomer);
        }
      } catch {}
    }

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
      syncEntityToGoogleSheets('customer', matchedCustomer, 'upsert', currentBusinessId);
    } else if (newSale.customerName && newSale.customerName !== 'Walk-in Customer' && (due !== 0 || newSale.customerPhone)) {
      // Auto-create customer if they have due/advance or real identity
      const newCustId = `cust_${Date.now()}`;
      const newCust: Customer = {
        id: newCustId,
        name: newSale.customerName,
        phone: newSale.customerPhone || "",
        address: newSale.customerAddress || "",
        dueAmount: due,
        totalSpent: payable,
        createdBy: newSale.createdBy || curUser?.id,
        createdAt: new Date().toISOString()
      };
      newSale.customerId = newCustId;
      cache.customers.unshift(newCust);
      try {
        await setDoc(doc(db, "businesses", currentBusinessId, "customers", newCustId), newCust);
      } catch {}
      syncEntityToGoogleSheets('customer', newCust, 'upsert', currentBusinessId);
    }

    // 3. Save Sale Doc
    try {
      await setDoc(doc(db, "businesses", currentBusinessId, "sales", id), cleanForFirestore(newSale));
    } catch (e) {
      console.warn("Firestore createSale failed:", e);
    }

    cache.sales = [newSale, ...(cache.sales || []).filter(s => s.id !== id)];
    saveLocalCache(cache);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("sales-updated", { detail: newSale }));
    }
    syncEntityToGoogleSheets('sale', newSale, 'upsert', currentBusinessId);
    return newSale;
  },

  deleteSale: async (id: string): Promise<boolean> => {
    const cache = getLocalCache();
    let saleToDelete = cache.sales.find(s => s.id === id || s.invoiceNo === id);
    if (!saleToDelete) {
      try {
        const snap = await getDoc(doc(db, "businesses", currentBusinessId, "sales", id));
        if (snap.exists()) {
          saleToDelete = { id: snap.id, ...snap.data() } as Sale;
        }
      } catch {}
    }

    const targetId = saleToDelete?.id || id;
    const isConfirmedSale =
      saleToDelete &&
      !saleToDelete.isTemporary &&
      saleToDelete.approvalStatus !== "pending" &&
      saleToDelete.approvalStatus !== "rejected" &&
      !String(saleToDelete.invoiceNo || "").startsWith("TMP-");

    // 1. If this was a confirmed sale, restore product stock and reverse customer due/spent
    if (saleToDelete && isConfirmedSale) {
      if (Array.isArray(saleToDelete.items)) {
        for (const item of saleToDelete.items) {
          if (isOtherProduct(item)) continue;
          const prodId = item.productId || (item as any).id;
          const prodIdx = cache.products.findIndex(p => p.id === prodId);
          if (prodIdx !== -1 && !isOtherProduct(cache.products[prodIdx])) {
            const restoredStock = (Number(cache.products[prodIdx].stock) || 0) + (Number(item.quantity) || 0);
            cache.products[prodIdx].stock = restoredStock;
            try {
              await updateDoc(doc(db, "businesses", currentBusinessId, "products", prodId), {
                stock: restoredStock
              });
            } catch {}
            syncEntityToGoogleSheets("product", cache.products[prodIdx], "upsert", currentBusinessId);
          }
        }
      }

      const cust = cache.customers.find(
        c =>
          (saleToDelete?.customerId && c.id === saleToDelete.customerId) ||
          (saleToDelete?.customerPhone && c.phone && c.phone.trim() === saleToDelete.customerPhone.trim()) ||
          (saleToDelete?.customerName && c.name && c.name.trim().toLowerCase() === saleToDelete.customerName.trim().toLowerCase())
      );
      if (cust) {
        const payable = Number(saleToDelete.payableAmount ?? saleToDelete.totalAmount) || 0;
        const saleDue = Number(saleToDelete.dueAmount) || 0;
        cust.dueAmount = (Number(cust.dueAmount) || 0) - saleDue;
        cust.totalSpent = Math.max(0, (Number(cust.totalSpent) || 0) - payable);
        try {
          await updateDoc(doc(db, "businesses", currentBusinessId, "customers", cust.id), {
            dueAmount: cust.dueAmount,
            totalSpent: cust.totalSpent
          });
        } catch {}
        syncEntityToGoogleSheets("customer", cust, "upsert", currentBusinessId);
      }
    }

    // 2. Delete the sale document from Firestore, local cache, and Google Sheets
    try {
      await deleteDoc(doc(db, "businesses", currentBusinessId, "sales", targetId));
    } catch (e) {
      console.warn("Firestore deleteSale failed:", e);
    }
    cache.sales = cache.sales.filter(s => s.id !== targetId && s.invoiceNo !== id);
    saveLocalCache(cache);
    syncEntityToGoogleSheets("sale", { id: targetId, invoiceNo: saleToDelete?.invoiceNo }, "delete", currentBusinessId);
    return true;
  },

  deleteApprovalRequest: async (requestId: string): Promise<boolean> => {
    const cache = getLocalCache();
    const req = (cache.approvalRequests || []).find(r => r.id === requestId);
    try {
      await deleteDoc(doc(db, "businesses", currentBusinessId, "approval_requests", requestId));
    } catch (e) {
      console.warn("Firestore deleteApprovalRequest failed:", e);
    }
    // Also clean up any temporary pending draft sale with the same requestId
    try {
      await deleteDoc(doc(db, "businesses", currentBusinessId, "sales", requestId));
    } catch {}
    cache.approvalRequests = (cache.approvalRequests || []).filter(r => r.id !== requestId);
    cache.sales = (cache.sales || []).filter(s => s.id !== requestId);
    saveLocalCache(cache);
    syncEntityToGoogleSheets("approval", { id: requestId, temporaryInvoiceNo: req?.temporaryInvoiceNo }, "delete", currentBusinessId);
    syncEntityToGoogleSheets("sale", { id: requestId, invoiceNo: req?.temporaryInvoiceNo }, "delete", currentBusinessId);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("approval-requests-updated"));
    }
    return true;
  },

  // --- Approval Requests (Temporary Invoices / Due Payment Requests) ---
  getApprovalRequests: async (userId?: string): Promise<ApprovalRequest[]> => {
    const curUser = getCurrentUser();
    let list: ApprovalRequest[] = [];
    try {
      const snap = await getDocs(collection(db, "businesses", currentBusinessId, "approval_requests"));
      snap.forEach(d => list.push({ id: d.id, ...d.data() } as ApprovalRequest));
      list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      
      // Merge with cache so local items aren't overwritten if pending write
      const cache = getLocalCache();
      const existingMap = new Map<string, ApprovalRequest>();
      list.forEach(item => existingMap.set(item.id, item));
      (cache.approvalRequests || []).forEach(localItem => {
        if (!existingMap.has(localItem.id)) {
          existingMap.set(localItem.id, localItem);
        }
      });
      list = Array.from(existingMap.values());
      list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      saveLocalCache({ approvalRequests: list });
    } catch (e) {
      console.warn("Firestore getApprovalRequests failed, using cache:", e);
      list = getLocalCache().approvalRequests || [];
    }

    const matchesRequestUser = (r: ApprovalRequest, targetUserId: string, targetUserName?: string): boolean => {
      if (!targetUserId || targetUserId === 'all') return true;
      if (r.userId === targetUserId) return true;
      if (r.saleData?.userId === targetUserId || r.saleData?.createdBy === targetUserId) return true;
      const rName = (r.userName || "").trim().toLowerCase();
      if (rName && rName === targetUserId.trim().toLowerCase()) return true;
      if (targetUserName && rName && rName === targetUserName.trim().toLowerCase()) return true;
      return false;
    };

    if (curUser && !isShopAdmin(curUser)) {
      return list.filter(r => matchesRequestUser(r, curUser.id, curUser.name));
    }
    if (userId && userId !== 'all') {
      const targetUser = (getLocalCache().users || []).find(u => u.id === userId);
      return list.filter(r => matchesRequestUser(r, userId, targetUser?.name));
    }
    return list;
  },

  subscribeApprovalRequests: (callback: (requests: ApprovalRequest[]) => void, userId?: string): (() => void) => {
    const matchesRequestUser = (r: ApprovalRequest, targetUserId: string, targetUserName?: string): boolean => {
      if (!targetUserId || targetUserId === 'all') return true;
      if (r.userId === targetUserId) return true;
      if (r.saleData?.userId === targetUserId || r.saleData?.createdBy === targetUserId) return true;
      const rName = (r.userName || "").trim().toLowerCase();
      if (rName && rName === targetUserId.trim().toLowerCase()) return true;
      if (targetUserName && rName && rName === targetUserName.trim().toLowerCase()) return true;
      return false;
    };

    const notify = (allList: ApprovalRequest[]) => {
      const curUser = getCurrentUser();
      let res = allList;
      if (curUser && !isShopAdmin(curUser)) {
        res = allList.filter(r => matchesRequestUser(r, curUser.id, curUser.name));
      } else if (userId && userId !== 'all') {
        const targetUser = (getLocalCache().users || []).find(u => u.id === userId);
        res = allList.filter(r => matchesRequestUser(r, userId, targetUser?.name));
      }
      callback(res);
    };

    // Emit initial from local cache immediately
    const initialCache = getLocalCache();
    notify(initialCache.approvalRequests || []);

    let unsubFs = () => {};
    try {
      const colRef = collection(db, "businesses", currentBusinessId, "approval_requests");
      unsubFs = onSnapshot(colRef, (snap) => {
        let list: ApprovalRequest[] = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() } as ApprovalRequest));
        list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        
        const cache = getLocalCache();
        const existingMap = new Map<string, ApprovalRequest>();
        list.forEach(item => existingMap.set(item.id, item));
        (cache.approvalRequests || []).forEach(localItem => {
          if (!existingMap.has(localItem.id)) {
            existingMap.set(localItem.id, localItem);
          }
        });
        const combinedList = Array.from(existingMap.values());
        combinedList.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        saveLocalCache({ approvalRequests: combinedList });

        notify(combinedList);
      }, (err) => {
        console.warn("onSnapshot approval_requests error, keeping local cache:", err);
      });
    } catch {}

    const handleLocalUpdate = () => {
      const cache = getLocalCache();
      notify(cache.approvalRequests || []);
    };

    if (typeof window !== "undefined") {
      window.addEventListener('approval-requests-updated', handleLocalUpdate);
    }

    return () => {
      unsubFs();
      if (typeof window !== "undefined") {
        window.removeEventListener('approval-requests-updated', handleLocalUpdate);
      }
    };
  },

  createSaleRequest: async (sale: Partial<Sale>): Promise<{ request: ApprovalRequest, sale: Sale }> => {
    const curUser = getCurrentUser();
    const requestId = `req_sale_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const tempInvNo = `TMP-${Date.now().toString().slice(-6)}`;
    const payable = Number(sale.payableAmount) || Number(sale.totalAmount) || 0;
    const paid = Number(sale.paidAmount) || 0;
    const due = sale.dueAmount !== undefined && !Number.isNaN(Number(sale.dueAmount)) ? Number(sale.dueAmount) : (payable - paid);

    const effectiveUserId = curUser?.id || sale.userId || sale.createdBy || "salesman";
    const effectiveUserName = curUser?.name || (sale as any).userName || "সেলসম্যান";
    const effectiveUserRole = curUser?.role || "salesman";

    const tempSale: Sale = {
      ...sale,
      id: requestId,
      invoiceNo: tempInvNo,
      userId: effectiveUserId,
      createdBy: effectiveUserId,
      userName: effectiveUserName,
      totalAmount: Number(sale.totalAmount) || payable,
      payableAmount: payable,
      paidAmount: paid,
      dueAmount: due,
      createdAt: new Date().toISOString(),
      isTemporary: true,
      approvalStatus: 'pending',
      approvalRequestId: requestId
    } as Sale;

    const newRequest: ApprovalRequest = {
      id: requestId,
      type: 'sale',
      status: 'pending',
      userId: effectiveUserId,
      userName: effectiveUserName,
      userRole: effectiveUserRole,
      temporaryInvoiceNo: tempInvNo,
      createdAt: new Date().toISOString(),
      saleData: tempSale
    };

    // Sanitize objects to guarantee no undefined values throw Firestore error
    const sanitizedRequest = cleanForFirestore(newRequest);

    // Save strictly to Firestore approval_requests (Sales Orders). It will only move to 'sales' (বিক্রয় লিস্ট) when confirmed!
    try {
      await setDoc(doc(db, "businesses", currentBusinessId, "approval_requests", requestId), sanitizedRequest);
    } catch (e) {
      console.error("Firestore createSaleRequest write failed:", e);
    }

    const cache = getLocalCache();
    cache.approvalRequests = [newRequest, ...(cache.approvalRequests || []).filter(r => r.id !== requestId)];
    // Ensure pending sales order is not sitting inside cache.sales
    cache.sales = (cache.sales || []).filter(s => s.id !== requestId && s.invoiceNo !== tempInvNo);
    saveLocalCache(cache);

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent('approval-requests-updated', { detail: newRequest }));
      window.dispatchEvent(new CustomEvent('sales-updated'));
    }

    // Sync sales order request to this shop's Google Sheet 'বিক্রয় অর্ডার' tab (without deducting stock or polluting বিক্রয় ও মেমো)
    syncEntityToGoogleSheets('approval', newRequest, 'upsert', currentBusinessId);

    // Stock & Customer Due are UNTOUCHED until confirmed!
    return { request: newRequest, sale: tempSale };
  },

  createDuePaymentRequest: async (data: { customerId: string, amount: number, method?: string, note?: string }): Promise<{ request: ApprovalRequest, receiptData: any }> => {
    const curUser = getCurrentUser();
    const requestId = `req_due_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const tempVoucherNo = `TMP-DUE-${Date.now().toString().slice(-5)}`;
    const amount = Number(data.amount) || 0;

    const cache = getLocalCache();
    let cust = cache.customers.find(c => 
      c.id === data.customerId || 
      (c.phone && c.phone === data.customerId) || 
      (c.name && c.name.toLowerCase() === data.customerId.toLowerCase())
    );

    if (!cust && data.customerId) {
      try {
        const custSnap = await getDoc(doc(db, "businesses", currentBusinessId, "customers", data.customerId));
        if (custSnap.exists()) {
          cust = { id: custSnap.id, ...custSnap.data() } as Customer;
        }
      } catch {}
    }

    const newRequest: ApprovalRequest = {
      id: requestId,
      type: 'due_payment',
      status: 'pending',
      userId: curUser?.id || "salesman",
      userName: curUser?.name || "সেলসম্যান",
      userRole: curUser?.role || "salesman",
      temporaryInvoiceNo: tempVoucherNo,
      createdAt: new Date().toISOString(),
      paymentData: {
        customerId: cust?.id || data.customerId,
        customerName: cust?.name || "ক্রেতা",
        customerPhone: cust?.phone || "",
        amount,
        paymentMethod: data.method || "cash",
        note: data.note || "",
        currentDueBefore: Number(cust?.dueAmount) || 0
      }
    };

    const sanitizedRequest = cleanForFirestore(newRequest);

    try {
      await setDoc(doc(db, "businesses", currentBusinessId, "approval_requests", requestId), sanitizedRequest);
    } catch (e) {
      console.error("Firestore createDuePaymentRequest write failed:", e);
    }

    cache.approvalRequests = [newRequest, ...(cache.approvalRequests || []).filter(r => r.id !== requestId)];
    saveLocalCache(cache);

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent('approval-requests-updated', { detail: newRequest }));
    }

    syncEntityToGoogleSheets('approval', newRequest, 'upsert', currentBusinessId);

    // Customer Due is UNTOUCHED until Admin approves!
    const receiptData = {
      name: cust?.name || "ক্রেতা",
      phone: cust?.phone || "",
      amount,
      type: 'customer' as const,
      dueRemaining: Number(cust?.dueAmount) || 0,
      description: `খসড়া বকেয়া আদায় রিকুয়েস্ট (ভাউচার: ${tempVoucherNo} • অ্যাডমিন অনুমোদনের অপেক্ষায়)`,
      isTemporary: true
    };

    return { request: newRequest, receiptData };
  },

  approveRequest: async (requestId: string): Promise<any> => {
    const curUser = getCurrentUser();
    if (!isShopAdmin(curUser)) {
      throw new Error("শুধুমাত্র অ্যাডমিন এই অনুরোধটি কনফার্ম করতে পারবেন।");
    }
    const cache = getLocalCache();
    
    let req = cache.approvalRequests.find(r => r.id === requestId);
    if (!req) {
      try {
        const snap = await getDoc(doc(db, "businesses", currentBusinessId, "approval_requests", requestId));
        if (snap.exists()) req = snap.data() as ApprovalRequest;
      } catch {}
    }

    if (!req) {
      throw new Error("অনুরোধটি খুঁজে পাওয়া যায়নি।");
    }

    if (req.status !== 'pending') {
      throw new Error("এই অনুরোধটি ইতিমধ্যে পর্যালোচনা করা হয়েছে।");
    }

    const reviewedAt = new Date().toISOString();
    const reviewedBy = curUser?.name || "এডমিন";

    if (req.type === 'sale') {
      const saleData = req.saleData;
      if (!saleData || !Array.isArray(saleData.items)) {
        throw new Error("বিক্রয়ের তথ্য অসম্পূর্ণ।");
      }

      // Check stock availability across local cache & Firestore (skip for 'অন্যান্য' / custom products)
      for (const item of saleData.items) {
        if (isOtherProduct(item)) continue;
        const prodId = item.productId || (item as any).id;
        let currentProd = cache.products.find(p => p.id === prodId);
        if (!currentProd && prodId) {
          try {
            const pSnap = await getDoc(doc(db, "businesses", currentBusinessId, "products", prodId));
            if (pSnap.exists()) {
              currentProd = { id: pSnap.id, ...pSnap.data() } as Product;
            }
          } catch {}
        }
        if (currentProd && !isOtherProduct(currentProd) && (Number(currentProd.stock) || 0) < Number(item.quantity)) {
          throw new Error(`পণ্য "${item.name}" পর্যাপ্ত স্টকে নেই! বর্তমান স্টক: ${currentProd.stock}, প্রয়োজন: ${item.quantity}`);
        }
      }

      // Official Final Invoice Number
      const finalInvoiceNo = `INV-${Date.now().toString().slice(-6)}`;
      const finalSaleId = `sale_${Date.now()}`;

      // Call createSale which deducts stock, updates customer balance, and adds to বিক্রয় লিস্ট!
      // Preserve the original Salesman's userId, createdBy, and userName so user filters work accurately!
      const originalUserId = req.userId || saleData.userId || saleData.createdBy || curUser?.id || "admin-1";
      const originalUserName = req.userName || (saleData as any).userName || curUser?.name || "সেলসম্যান";
      const confirmedSale = await api.createSale({
        ...saleData,
        id: finalSaleId,
        invoiceNo: finalInvoiceNo,
        userId: originalUserId,
        createdBy: originalUserId,
        userName: originalUserName,
        isTemporary: false,
        approvalStatus: 'approved',
        approvalRequestId: requestId
      } as any);

      // Remove any legacy temporary sale document if present
      try {
        await deleteDoc(doc(db, "businesses", currentBusinessId, "sales", requestId));
      } catch {}
      const latestCache = getLocalCache();
      latestCache.sales = (latestCache.sales || []).filter(s => s.id !== requestId && s.invoiceNo !== req.temporaryInvoiceNo);

      // Update approval request
      req.status = 'approved';
      req.reviewedAt = reviewedAt;
      req.reviewedBy = reviewedBy;
      req.finalInvoiceNo = finalInvoiceNo;

      latestCache.approvalRequests = (latestCache.approvalRequests || []).map(r =>
        r.id === requestId ? { ...r, status: 'approved', reviewedAt, reviewedBy, finalInvoiceNo } : r
      );

      try {
        await updateDoc(doc(db, "businesses", currentBusinessId, "approval_requests", requestId), {
          status: 'approved',
          reviewedAt,
          reviewedBy,
          finalInvoiceNo
        });
      } catch {}

      saveLocalCache(latestCache);
      syncEntityToGoogleSheets('approval', req, 'upsert', currentBusinessId);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent('approval-requests-updated'));
        window.dispatchEvent(new CustomEvent('sales-updated', { detail: confirmedSale }));
      }

      // Trigger Auto-SMS on Sales Order confirmation if enabled
      try {
        const smsConfig = await api.getSMSConfig();
        if (smsConfig.autoSMS && confirmedSale.customerPhone) {
          const cust = latestCache.customers.find(c => c.id === confirmedSale.customerId);
          const finalBal = cust ? (Number(cust.dueAmount) || 0) : (Number(confirmedSale.dueAmount) || 0);
          const balText = finalBal < 0 ? `ক্রেতা পাবে: ৳${Math.round(Math.abs(finalBal))}` : `বকেয়া: ৳${Math.round(finalBal)}`;
          const message = `প্রিয় ${confirmedSale.customerName || 'ক্রেতা'}, আপনার শপিং এর জন্য ধন্যবাদ। ইনভয়েস: ${confirmedSale.invoiceNo}, মোট: ৳${Math.round(confirmedSale.payableAmount)}, পেইড: ৳${confirmedSale.paidAmount}, ${balText}।`;
          await api.sendSMS(confirmedSale.customerPhone, message);
        }
      } catch (smsErr) {
        console.warn("[Auto SMS on Order Confirm] Error:", smsErr);
      }

      return { success: true, type: 'sale', sale: confirmedSale };

    } else if (req.type === 'due_payment') {
      const pData = req.paymentData;
      if (!pData) {
        throw new Error("পেমেন্টের তথ্য অসম্পূর্ণ।");
      }

      // Deduct customer due and record official payment receipt (preserving the salesman who collected the payment)
      const payResult = await api.recordPayment(
        pData.customerId,
        pData.amount,
        pData.paymentMethod || "cash",
        pData.note ? `${pData.note} (অনুমোদিত রিকুয়েস্ট: ${req.temporaryInvoiceNo})` : `অনুমোদিত বকেয়া আদায় (${req.temporaryInvoiceNo})`,
        undefined,
        { userId: req.userId, userName: req.userName }
      );

      const finalReceiptNo = payResult?.payment?.receiptNo || `PAY-${Date.now().toString().slice(-6)}`;
      req.status = 'approved';
      req.reviewedAt = reviewedAt;
      req.reviewedBy = reviewedBy;
      req.finalInvoiceNo = finalReceiptNo;

      // Read latestCache AFTER recordPayment so we never overwrite updated customer dueAmount or customerPayments!
      const latestCache = getLocalCache();
      latestCache.approvalRequests = (latestCache.approvalRequests || []).map(r =>
        r.id === requestId ? { ...r, status: 'approved', reviewedAt, reviewedBy, finalInvoiceNo: finalReceiptNo } : r
      );

      try {
        await updateDoc(doc(db, "businesses", currentBusinessId, "approval_requests", requestId), {
          status: 'approved',
          reviewedAt,
          reviewedBy,
          finalInvoiceNo: finalReceiptNo
        });
      } catch {}

      saveLocalCache(latestCache);
      syncEntityToGoogleSheets('approval', req, 'upsert', currentBusinessId);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent('approval-requests-updated'));
        window.dispatchEvent(new CustomEvent('customer-payments-updated'));
      }
      return { success: true, type: 'due_payment', payment: payResult };
    }
  },

  rejectRequest: async (requestId: string, reason?: string): Promise<any> => {
    const curUser = getCurrentUser();
    const cache = getLocalCache();
    
    let req = cache.approvalRequests.find(r => r.id === requestId);
    if (!req) {
      try {
        const snap = await getDoc(doc(db, "businesses", currentBusinessId, "approval_requests", requestId));
        if (snap.exists()) req = snap.data() as ApprovalRequest;
      } catch {}
    }

    if (!req) {
      throw new Error("অনুরোধটি খুঁজে পাওয়া যায়নি।");
    }

    const reviewedAt = new Date().toISOString();
    const reviewedBy = curUser?.name || "এডমিন";
    const rejectReason = reason || "এডমিন কর্তৃক বাতিল করা হয়েছে";

    req.status = 'rejected';
    req.reviewedAt = reviewedAt;
    req.reviewedBy = reviewedBy;
    req.rejectReason = rejectReason;

    // If temporary sale doc exists, mark it rejected
    if (req.type === 'sale') {
      const saleIdx = cache.sales.findIndex(s => s.id === requestId);
      if (saleIdx !== -1) {
        cache.sales[saleIdx].approvalStatus = 'rejected';
      }
      try {
        await updateDoc(doc(db, "businesses", currentBusinessId, "sales", requestId), {
          approvalStatus: 'rejected'
        });
      } catch {}
      syncEntityToGoogleSheets('sale', { id: requestId, invoiceNo: req.temporaryInvoiceNo }, 'delete', currentBusinessId);
    }

    try {
      await updateDoc(doc(db, "businesses", currentBusinessId, "approval_requests", requestId), {
        status: 'rejected',
        reviewedAt,
        reviewedBy,
        rejectReason
      });
    } catch {}

    saveLocalCache(cache);
    syncEntityToGoogleSheets('approval', req, 'upsert', currentBusinessId);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent('approval-requests-updated'));
    }
    // Crucial: Products stock and customer balance remain completely unchanged!
    return { success: true };
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

    if (userId && userId !== "all") {
      const targetUser = (getLocalCache().users || []).find(u => u.id === userId);
      const targetName = targetUser?.name?.trim().toLowerCase();
      return customers.filter(c => {
        if (c.createdBy === userId) return true;
        if (targetName && c.createdBy && c.createdBy.trim().toLowerCase() === targetName) return true;
        // Also match customers who have sales by this user
        const hasSaleByUser = allSales.some(s =>
          ((s.customerId && s.customerId === c.id) ||
           (c.phone && s.customerPhone && s.customerPhone.trim() === c.phone.trim()) ||
           (c.name && s.customerName && s.customerName.trim().toLowerCase() === c.name.trim().toLowerCase())) &&
          (s.userId === userId || s.createdBy === userId || (targetName && String((s as any).userName || "").trim().toLowerCase() === targetName))
        );
        return hasSaleByUser;
      });
    }

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

  recordPayment: async (customerId: string, amount: number, method: string = "cash", note?: string, date?: string, collectorInfo?: { userId?: string; userName?: string }): Promise<any> => {
    const payAmount = Number(amount) || 0;
    const curUser = getCurrentUser();

    // API-level Guard: Non-admin users (salesman/manager/accountant) in ANY shop can never directly deduct due; redirect to approval request!
    if (curUser && !isShopAdmin(curUser)) {
      return api.createDuePaymentRequest({
        customerId,
        amount: payAmount,
        method,
        note
      });
    }

    const payId = `pay_${Date.now()}`;
    const receiptNo = `PAY-${Date.now().toString().slice(-6)}`;

    const cache = getLocalCache();
    let cust = cache.customers.find(c => 
      c.id === customerId || 
      (c.phone && c.phone === customerId) || 
      (c.name && c.name.toLowerCase() === customerId.toLowerCase())
    );

    // Fallback to Firestore if customer is not yet in local cache (e.g. after switching to 2nd shop)
    if (!cust && customerId) {
      try {
        const custSnap = await getDoc(doc(db, "businesses", currentBusinessId, "customers", customerId));
        if (custSnap.exists()) {
          cust = { id: custSnap.id, ...custSnap.data() } as Customer;
          cache.customers.push(cust);
        }
      } catch {}
    }

    const resolvedCustomerId = cust?.id || customerId;

    const paymentRecord = {
      id: payId,
      receiptNo,
      customerId: resolvedCustomerId,
      customerName: cust?.name || "ক্রেতা",
      customerPhone: cust?.phone || "",
      amount: payAmount,
      method,
      note: note || "",
      userId: collectorInfo?.userId || curUser?.id || "admin-1",
      userName: collectorInfo?.userName || curUser?.name || "অ্যাডমিন",
      date: date || new Date().toISOString()
    };

    if (cust) {
      cust.dueAmount = (Number(cust.dueAmount) || 0) - payAmount;
      try {
        await updateDoc(doc(db, "businesses", currentBusinessId, "customers", cust.id), {
          dueAmount: cust.dueAmount
        });
      } catch {}
      syncEntityToGoogleSheets('customer', cust, 'upsert', currentBusinessId);

      // Ensure sales list is populated in cache so oldest unpaid sales are settled properly across all shops
      if (!cache.sales || cache.sales.length === 0) {
        try {
          const salesSnap = await getDocs(collection(db, "businesses", currentBusinessId, "sales"));
          const loadedSales: Sale[] = [];
          salesSnap.forEach(d => loadedSales.push({ id: d.id, ...d.data() } as Sale));
          cache.sales = loadedSales;
        } catch {}
      }

      // Settle customer sales from oldest to newest so Invoices and SalesList reflect payment!
      let remaining = payAmount;
      const unpaidSales = (cache.sales || []).filter(s => 
        ((s.customerId && s.customerId === cust!.id) ||
         (cust!.phone && s.customerPhone && s.customerPhone.trim() === cust!.phone.trim()) ||
         (cust!.name && s.customerName && s.customerName.trim().toLowerCase() === cust!.name.trim().toLowerCase())) &&
        (Number(s.dueAmount) || 0) > 0 &&
        !s.isTemporary &&
        s.approvalStatus !== 'pending' &&
        s.approvalStatus !== 'rejected'
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
        syncEntityToGoogleSheets('sale', s, 'upsert', currentBusinessId);
      }
    }

    try {
      await setDoc(doc(db, "businesses", currentBusinessId, "customers", resolvedCustomerId, "payments", payId), paymentRecord);
    } catch {}

    cache.customerPayments.push(paymentRecord);
    saveLocalCache(cache);
    syncEntityToGoogleSheets('payment', { customerId: resolvedCustomerId, amount: payAmount, method, note, newDue: cust?.dueAmount }, 'upsert', currentBusinessId);

    try {
      window.dispatchEvent(new CustomEvent('customer-payments-updated'));
      window.dispatchEvent(new CustomEvent('sales-updated'));
    } catch {}

    return { success: true, payment: paymentRecord };
  },

  getCustomerPayments: async (customerId: string): Promise<any[]> => {
    const cache = getLocalCache();
    const cust = (cache.customers || []).find(c =>
      c.id === customerId ||
      (c.phone && c.phone === customerId) ||
      (c.name && c.name.toLowerCase() === String(customerId).toLowerCase())
    );
    const resolvedId = cust?.id || customerId;

    const payMap = new Map<string, any>();
    (cache.customerPayments || []).forEach(p => {
      if (!p) return;
      const matchesId = p.customerId === resolvedId || p.customerId === customerId;
      const matchesPhone = cust?.phone && p.customerPhone && p.customerPhone.trim() === cust.phone.trim();
      const matchesName = cust?.name && p.customerName && p.customerName.trim().toLowerCase() === cust.name.trim().toLowerCase();
      if (matchesId || matchesPhone || matchesName) {
        payMap.set(p.id, p);
      }
    });

    try {
      const snap = await getDocs(collection(db, "businesses", currentBusinessId, "customers", resolvedId, "payments"));
      snap.forEach(d => {
        const data = d.data();
        payMap.set(d.id, {
          id: d.id,
          customerId: resolvedId,
          customerName: cust?.name || data.customerName || "ক্রেতা",
          customerPhone: cust?.phone || data.customerPhone || "",
          ...data
        });
      });
    } catch (e) {
      console.warn("Firestore getCustomerPayments failed:", e);
    }

    const list = Array.from(payMap.values()).map(p => ({
      ...p,
      receiptNo: p.receiptNo || `PAY-${String(p.id || "").slice(-6).toUpperCase()}`,
      customerName: p.customerName || cust?.name || "ক্রেতা",
      customerPhone: p.customerPhone || cust?.phone || "",
      date: p.date || p.createdAt || new Date().toISOString()
    }));

    list.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
    return list;
  },

  getAllCustomerPayments: async (): Promise<any[]> => {
    const cache = getLocalCache();
    const customers = await api.getCustomers();
    const custMap = new Map<string, Customer>();
    customers.forEach(c => custMap.set(c.id, c));

    const payMap = new Map<string, any>();
    (cache.customerPayments || []).forEach(p => {
      if (p && p.id) payMap.set(p.id, p);
    });

    try {
      await Promise.all(
        customers.map(async (c) => {
          try {
            const snap = await getDocs(collection(db, "businesses", currentBusinessId, "customers", c.id, "payments"));
            snap.forEach(d => {
              const data = d.data();
              payMap.set(d.id, {
                id: d.id,
                customerId: c.id,
                customerName: c.name,
                customerPhone: c.phone,
                ...data
              });
            });
          } catch {}
        })
      );
    } catch {}

    const all = Array.from(payMap.values()).map(p => {
      const c = custMap.get(p.customerId);
      return {
        ...p,
        receiptNo: p.receiptNo || `PAY-${String(p.id || "").slice(-6).toUpperCase()}`,
        customerName: p.customerName || c?.name || "ক্রেতা",
        customerPhone: p.customerPhone || c?.phone || ""
      };
    });

    all.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
    saveLocalCache({ customerPayments: all });
    return all;
  },

  deleteCustomerPayment: async (paymentId: string, customerId: string): Promise<boolean> => {
    const cache = getLocalCache();
    let payment = (cache.customerPayments || []).find(p => p.id === paymentId);
    if (!payment && customerId) {
      try {
        const snap = await getDoc(doc(db, "businesses", currentBusinessId, "customers", customerId, "payments", paymentId));
        if (snap.exists()) {
          payment = { id: snap.id, ...snap.data() };
        }
      } catch {}
    }

    const payAmount = Number(payment?.amount) || 0;
    const targetCustId = payment?.customerId || customerId;

    // 1. Delete payment doc from Firestore
    if (targetCustId) {
      try {
        await deleteDoc(doc(db, "businesses", currentBusinessId, "customers", targetCustId, "payments", paymentId));
      } catch (e) {
        console.warn("Firestore deleteCustomerPayment failed:", e);
      }
    }

    // 2. Remove from local cache
    cache.customerPayments = (cache.customerPayments || []).filter(p => p.id !== paymentId);

    // 3. Reverse payment on customer dueAmount (add back the paid amount)
    const cust = cache.customers.find(c => c.id === targetCustId);
    if (cust && payAmount > 0) {
      cust.dueAmount = (Number(cust.dueAmount) || 0) + payAmount;
      try {
        await updateDoc(doc(db, "businesses", currentBusinessId, "customers", cust.id), {
          dueAmount: cust.dueAmount
        });
      } catch {}
      syncEntityToGoogleSheets("customer", cust, "upsert", currentBusinessId);
    }

    saveLocalCache(cache);
    return true;
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
    const voucherNo = `SUP-PAY-${Date.now().toString().slice(-6)}`;
    const cache = getLocalCache();
    const sup = cache.suppliers.find(s => s.id === supplierId);
    const tx: SupplierTransaction & { voucherNo?: string; supplierName?: string; supplierPhone?: string } = {
      id: txId,
      voucherNo,
      supplierId,
      supplierName: sup?.name || "সরবরাহকারী",
      supplierPhone: sup?.phone || "",
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

    if (sup) {
      sup.dueAmount = Math.max(0, (sup.dueAmount || 0) - amount);
      syncEntityToGoogleSheets('supplier', sup, 'upsert', currentBusinessId);
    }
    cache.supplierTransactions.push(tx);
    saveLocalCache(cache);
    return tx;
  },

  recordSupplierPurchase: async (supplierId: string, amount: number, description?: string): Promise<SupplierTransaction> => {
    const txId = `tx_${Date.now()}`;
    const voucherNo = `SUP-PUR-${Date.now().toString().slice(-6)}`;
    const cache = getLocalCache();
    const sup = cache.suppliers.find(s => s.id === supplierId);
    const tx: SupplierTransaction & { voucherNo?: string; supplierName?: string; supplierPhone?: string } = {
      id: txId,
      voucherNo,
      supplierId,
      supplierName: sup?.name || "সরবরাহকারী",
      supplierPhone: sup?.phone || "",
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

    if (sup) {
      sup.dueAmount = (sup.dueAmount || 0) + amount;
      syncEntityToGoogleSheets('supplier', sup, 'upsert', currentBusinessId);
    }
    cache.supplierTransactions.push(tx);
    saveLocalCache(cache);
    return tx;
  },

  getAllSupplierTransactions: async (): Promise<any[]> => {
    const cache = getLocalCache();
    const suppliers = await api.getSuppliers();
    const supMap = new Map<string, Supplier>();
    suppliers.forEach(s => supMap.set(s.id, s));

    const txMap = new Map<string, any>();
    (cache.supplierTransactions || []).forEach(t => {
      if (t && t.id) txMap.set(t.id, t);
    });

    try {
      await Promise.all(
        suppliers.map(async (s) => {
          try {
            const snap = await getDocs(collection(db, "businesses", currentBusinessId, "suppliers", s.id, "transactions"));
            snap.forEach(d => {
              const data = d.data();
              txMap.set(d.id, {
                id: d.id,
                supplierId: s.id,
                supplierName: s.name,
                supplierPhone: s.phone,
                ...data
              });
            });
          } catch {}
        })
      );
    } catch {}

    const all = Array.from(txMap.values()).map(t => {
      const s = supMap.get(t.supplierId);
      const prefix = t.type === "payment" ? "SUP-PAY-" : "SUP-PUR-";
      return {
        ...t,
        voucherNo: t.voucherNo || `${prefix}${String(t.id || "").slice(-6).toUpperCase()}`,
        supplierName: t.supplierName || s?.name || "সরবরাহকারী",
        supplierPhone: t.supplierPhone || s?.phone || ""
      };
    });

    all.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
    saveLocalCache({ supplierTransactions: all });
    return all;
  },

  deleteSupplierTransaction: async (txId: string, supplierId: string): Promise<boolean> => {
    const cache = getLocalCache();
    let tx = (cache.supplierTransactions || []).find(t => t.id === txId);
    if (!tx && supplierId) {
      try {
        const snap = await getDoc(doc(db, "businesses", currentBusinessId, "suppliers", supplierId, "transactions", txId));
        if (snap.exists()) {
          tx = { id: snap.id, ...snap.data() } as SupplierTransaction;
        }
      } catch {}
    }

    const txAmount = Number(tx?.amount) || 0;
    const targetSupId = tx?.supplierId || supplierId;

    if (targetSupId) {
      try {
        await deleteDoc(doc(db, "businesses", currentBusinessId, "suppliers", targetSupId, "transactions", txId));
      } catch (e) {
        console.warn("Firestore deleteSupplierTransaction failed:", e);
      }
    }

    cache.supplierTransactions = (cache.supplierTransactions || []).filter(t => t.id !== txId);

    const sup = cache.suppliers.find(s => s.id === targetSupId);
    if (sup && txAmount > 0) {
      if (tx?.type === "payment") {
        // Reversing a supplier payment adds the amount back to what we owe the supplier
        sup.dueAmount = (Number(sup.dueAmount) || 0) + txAmount;
      } else {
        // Reversing a supplier purchase subtracts the amount from what we owe the supplier
        sup.dueAmount = Math.max(0, (Number(sup.dueAmount) || 0) - txAmount);
      }
      try {
        await updateDoc(doc(db, "businesses", currentBusinessId, "suppliers", sup.id), {
          dueAmount: sup.dueAmount
        });
      } catch {}
      syncEntityToGoogleSheets("supplier", sup, "upsert", currentBusinessId);
    }

    saveLocalCache(cache);
    return true;
  },

  // --- Expenses ---
  getExpenses: async (userId?: string): Promise<Expense[]> => {
    const curUser = getCurrentUser();
    let expenses: Expense[] = [];
    try {
      const snap = await getDocs(collection(db, "businesses", currentBusinessId, "expenses"));
      snap.forEach(d => expenses.push({ id: d.id, ...d.data() } as Expense));
      expenses.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
      saveLocalCache({ expenses });
    } catch (e) {
      console.warn("Firestore getExpenses failed:", e);
      expenses = (getLocalCache().expenses || []) as Expense[];
    }

    const matchesExpenseUser = (e: Expense, targetUserId: string, targetUserName?: string): boolean => {
      if (!targetUserId || targetUserId === "all") return true;
      if (e.userId === targetUserId) return true;
      const eUserName = String((e as any).userName || "").trim().toLowerCase();
      if (eUserName && eUserName === targetUserId.trim().toLowerCase()) return true;
      if (targetUserName && eUserName && eUserName === targetUserName.trim().toLowerCase()) return true;
      return false;
    };

    if (curUser && !isShopAdmin(curUser)) {
      return expenses.filter(e => matchesExpenseUser(e, curUser.id, curUser.name));
    }
    if (userId && userId !== "all") {
      const targetUser = (getLocalCache().users || []).find(u => u.id === userId);
      return expenses.filter(e => matchesExpenseUser(e, userId, targetUser?.name));
    }
    return expenses;
  },

  subscribeExpenses: (callback: (expenses: Expense[]) => void): (() => void) => {
    try {
      const colRef = collection(db, "businesses", currentBusinessId, "expenses");
      return onSnapshot(colRef, (snap) => {
        const curUser = getCurrentUser();
        const expenses: Expense[] = [];
        snap.forEach(d => expenses.push({ id: d.id, ...d.data() } as Expense));
        expenses.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
        saveLocalCache({ expenses });
        if (curUser && !isShopAdmin(curUser)) {
          callback(expenses.filter(e => e.userId === curUser.id));
        } else {
          callback(expenses);
        }
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

  // --- Business Info & Multi-Shop Management ---
  getBusiness: async (shopId?: string): Promise<Business> => {
    const targetBizId = shopId || currentBusinessId || "main-business";
    const cachedBiz = getLocalCache(targetBizId).business;
    const savedLocalPrinter =
      typeof window !== "undefined"
        ? (localStorage.getItem(`smart_printer_${targetBizId}`) as 'thermal' | 'a4' | null)
        : null;

    try {
      const snap = await getDoc(doc(db, "businesses", targetBizId));
      if (snap.exists()) {
        const data = snap.data();
        const resolvedPrinter: 'thermal' | 'a4' =
          savedLocalPrinter ||
          (data.defaultPrinter === 'a4' || data.defaultPrinter === 'thermal' ? data.defaultPrinter : undefined) ||
          cachedBiz?.defaultPrinter ||
          'thermal';
        const biz = {
          ...(cachedBiz || {}),
          ...data,
          id: snap.id,
          name: data.name || cachedBiz?.name || (targetBizId === "main-business" ? "হিসাব পাতি" : "নতুন শপ"),
          defaultPrinter: resolvedPrinter
        } as Business;
        saveLocalCache({ business: biz }, targetBizId);
        if (typeof window !== "undefined") {
          localStorage.setItem(`smart_printer_${targetBizId}`, resolvedPrinter);
        }
        return biz;
      } else if (targetBizId === "main-business") {
        // Seed main-business if not yet in Firestore
        const defaultBiz: Business = {
          ...(cachedBiz || defaultDbData.business),
          defaultPrinter: savedLocalPrinter || cachedBiz?.defaultPrinter || 'thermal'
        };
        await setDoc(doc(db, "businesses", "main-business"), cleanForFirestore(defaultBiz), { merge: true });
        return defaultBiz;
      }
    } catch (e) {
      console.warn("Firestore getBusiness failed:", e);
    }
    const fallbackBiz: Business = {
      ...defaultDbData.business,
      ...(cachedBiz || {}),
      id: targetBizId,
      defaultPrinter: savedLocalPrinter || cachedBiz?.defaultPrinter || 'thermal'
    };
    return fallbackBiz;
  },

  updateBusiness: async (business: Partial<Business>, shopId?: string): Promise<Business> => {
    const targetBizId = shopId || business.id || currentBusinessId || "main-business";
    const cache = getLocalCache(targetBizId);
    const previousName = (cache.business?.name || "").trim();
    const nextName = (business.name || previousName).trim();

    if (business.defaultPrinter && typeof window !== "undefined") {
      localStorage.setItem(`smart_printer_${targetBizId}`, business.defaultPrinter);
    }

    const resolvedPrinter: 'thermal' | 'a4' =
      business.defaultPrinter ||
      (typeof window !== "undefined" ? (localStorage.getItem(`smart_printer_${targetBizId}`) as 'thermal' | 'a4' | null) : null) ||
      cache.business?.defaultPrinter ||
      'thermal';

    const mergedBiz: Business = {
      ...cache.business,
      ...business,
      id: targetBizId,
      defaultPrinter: resolvedPrinter
    };

    const payload = cleanForFirestore(mergedBiz);
    try {
      await setDoc(doc(db, "businesses", targetBizId), payload, { merge: true });
    } catch (e) {
      console.warn("Firestore updateBusiness failed:", e);
    }

    cache.business = mergedBiz;
    saveLocalCache(cache, targetBizId);

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("business-updated", { detail: mergedBiz }));
    }

    // Automatically rename the shop's linked Google Sheet when the shop name is updated, keeping the connection intact
    if (nextName) {
      try {
        await renameShopGoogleSheet(targetBizId, nextName, cache.business);
      } catch (renErr) {
        console.warn("Google Sheet rename warning:", renErr);
      }
    }

    return cache.business as Business;
  },

  getBusinesses: async (): Promise<Business[]> => {
    const curUser = getCurrentUser();
    if (!isGlobalSuperAdmin(curUser)) {
      const ownShop = await api.getBusiness(currentBusinessId);
      return [ownShop];
    }

    const shopsMap = new Map<string, Business>();
    try {
      const snap = await getDocs(collection(db, "businesses"));
      snap.forEach(d => {
        const data = d.data();
        if (data && data.name) {
          shopsMap.set(d.id, { id: d.id, ...data } as Business);
        }
      });
    } catch (e) {
      console.warn("Firestore getBusinesses failed:", e);
    }

    // Always ensure main-business exists
    if (!shopsMap.has("main-business")) {
      const mainBiz = await api.getBusiness("main-business");
      shopsMap.set("main-business", mainBiz);
    }

    // Ensure currentBusinessId is in the map if switched
    if (currentBusinessId && !shopsMap.has(currentBusinessId)) {
      const curBiz = await api.getBusiness(currentBusinessId);
      shopsMap.set(currentBusinessId, curBiz);
    }

    const list = Array.from(shopsMap.values());
    list.sort((a, b) => {
      if (a.id === "main-business") return -1;
      if (b.id === "main-business") return 1;
      return (a.name || "").localeCompare(b.name || "");
    });
    return list;
  },

  createBusiness: async (shopData: Partial<Business> & { webAppUrl?: string; sheetUrl?: string }): Promise<Business> => {
    const curUser = getCurrentUser();
    if (!isGlobalSuperAdmin(curUser)) {
      throw new Error("শুধুমাত্র সুপার অ্যাডমিন নতুন শপ তৈরি করতে পারবেন।");
    }

    const cleanName = (shopData.name || "").trim();
    if (!cleanName) {
      throw new Error("শপের নাম প্রদান করা আবশ্যক।");
    }

    const newShopId = `shop_${Date.now()}`;
    const newShop: Business = {
      id: newShopId,
      name: cleanName,
      phone: (shopData.phone || "").trim(),
      address: (shopData.address || "ঢাকা, বাংলাদেশ").trim(),
      currency: shopData.currency || "BDT",
      logo: shopData.logo || "",
      defaultPrinter: shopData.defaultPrinter || "thermal",
      theme: "light"
    };

    await setDoc(doc(db, "businesses", newShopId), cleanForFirestore(newShop));

    // Initialize clean isolated local cache for the new shop
    saveLocalCache({
      products: [],
      categories: [],
      customers: [],
      customerPayments: [],
      suppliers: [],
      supplierTransactions: [],
      sales: [],
      expenses: [],
      smsLogs: [],
      approvalRequests: [],
      users: [],
      business: newShop
    }, newShopId);

    // Automatically create and attach a dedicated Google Sheet for this new shop as its live database
    try {
      const initialShopPayload = {
        business: newShop,
        products: [],
        categories: [],
        customers: [],
        suppliers: [],
        expenses: [],
        sales: [],
        approvalRequests: [],
        smsLogs: [],
        users: []
      };
      const autoSheetConfig = await autoCreateShopGoogleSheet(newShop, shopData.webAppUrl, initialShopPayload);
      if (shopData.sheetUrl && shopData.sheetUrl.trim() && !autoSheetConfig.sheetUrl) {
        const updatedCfg = await saveSheetsConfig({
          sheetUrl: shopData.sheetUrl.trim()
        }, newShopId);
        newShop.googleSheetsConfig = updatedCfg;
      } else {
        newShop.googleSheetsConfig = autoSheetConfig;
      }
      saveLocalCache({ business: newShop }, newShopId);
    } catch (sheetErr) {
      console.warn("Auto Google Sheet provisioning warning:", sheetErr);
      const fallbackCfg = await saveSheetsConfig({
        webAppUrl: (shopData.webAppUrl || "").trim(),
        sheetUrl: (shopData.sheetUrl || "").trim(),
        autoSync: true
      }, newShopId);
      newShop.googleSheetsConfig = fallbackCfg;
      saveLocalCache({ business: newShop }, newShopId);
    }

    return newShop;
  },

  switchBusiness: async (shopId: string): Promise<Business> => {
    const curUser = getCurrentUser();
    if (!isGlobalSuperAdmin(curUser)) {
      throw new Error("শুধুমাত্র সুপার অ্যাডমিন অন্য শপে প্রবেশ করতে পারবেন।");
    }

    const targetShopId = (shopId || "main-business").trim();
    setApiBusinessId(targetShopId);

    if (typeof window !== "undefined") {
      localStorage.setItem(ACTIVE_SHOP_KEY, targetShopId);
      if (curUser) {
        const updatedUser: User = { ...stripSensitiveUserFields(curUser), businessId: targetShopId };
        sessionStorage.setItem(USER_SESSION_KEY, JSON.stringify(updatedUser));
        localStorage.setItem(USER_SESSION_KEY, JSON.stringify(updatedUser));
      }
    }

    const [biz] = await Promise.all([
      api.getBusiness(targetShopId),
      fetchCloudSheetsConfig(targetShopId).catch(() => null)
    ]);

    return biz;
  },

  verifyAdminCredentials: async (email: string, pass: string): Promise<boolean> => {
    const curUser = getCurrentUser();
    if (!isGlobalSuperAdmin(curUser)) {
      throw new Error("শুধুমাত্র সুপার অ্যাডমিন শপ ডিলিট করার অনুমতি রাখেন।");
    }

    const cleanEmail = (email || "").trim().toLowerCase();
    const cleanPass = (pass || "").trim();

    if (!cleanEmail || !cleanPass) {
      throw new Error("শপ ডিলিট নিশ্চিত করতে অ্যাডমিনের ইমেইল এবং পাসওয়ার্ড দিন।");
    }

    // 1. Verify against Firestore users collection (using PBKDF2 hash verification)
    try {
      const usersCol = collection(db, "users");
      const q = query(usersCol, where("email", "==", cleanEmail));
      const snap = await getDocs(q);
      if (!snap.empty) {
        for (const uDoc of snap.docs) {
          const uData = uDoc.data() as any;
          if (isGlobalSuperAdmin({ id: uDoc.id, ...uData })) {
            const valid = await verifyUserCredential(uData, cleanPass);
            if (valid) {
              return true;
            }
          }
        }
      }
    } catch (err) {
      console.warn("Admin verification Firestore lookup warning:", err);
    }

    // 2. Offline fallback against cached Global Super Admin record
    const cache = getLocalCache("main-business");
    const cachedAdmin = (cache.users || []).find(
      u => u.email?.toLowerCase() === cleanEmail && isGlobalSuperAdmin(u)
    );
    if (cachedAdmin && (await verifyUserCredential(cachedAdmin, cleanPass))) {
      return true;
    }

    throw new Error("অ্যাডমিনের ইমেইল অথবা পাসওয়ার্ড সঠিক নয়! সঠিক তথ্য দিয়ে আবার চেষ্টা করুন।");
  },

  deleteBusiness: async (
    shopId: string,
    adminAuth?: { email: string; password: string }
  ): Promise<{ deleted: boolean; switchedToShop?: Business }> => {
    if (!shopId || shopId === "main-business") {
      throw new Error("মেইন শপ (ডিফল্ট শপ) মুছে ফেলা যাবে না।");
    }

    // Verify Global Super Admin Role & Admin Email/Password
    await api.verifyAdminCredentials(adminAuth?.email || "", adminAuth?.password || "");

    const wasActiveShop = shopId === currentBusinessId;

    // 1. Automatically delete the shop's linked Google Sheet
    try {
      await deleteShopGoogleSheet(shopId);
    } catch (sheetErr) {
      console.warn("Auto delete Google Sheet warning:", sheetErr);
    }

    // 2. Delete all Firestore subcollections of this shop
    const collectionsToClear = ["products", "customers", "sales", "expenses", "suppliers", "categories", "sms_logs", "approval_requests", "config"];
    for (const colName of collectionsToClear) {
      try {
        const snap = await getDocs(collection(db, "businesses", shopId, colName));
        await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
      } catch {}
    }

    // 3. Delete users belonging exclusively to this shop
    try {
      const userSnap = await getDocs(collection(db, "users"));
      for (const uDoc of userSnap.docs) {
        const uData = uDoc.data();
        if (!isGlobalSuperAdmin({ id: uDoc.id, ...uData } as any) && uData.businessId === shopId) {
          await deleteDoc(uDoc.ref);
        }
      }
    } catch {}

    // 4. Delete the shop document itself
    await deleteDoc(doc(db, "businesses", shopId));

    // 5. Clear local cache for this shop
    if (typeof window !== "undefined") {
      localStorage.removeItem(getLocalCacheKey(shopId));
      localStorage.removeItem(`hishab_google_sheets_config_v1_${shopId}`);
    }

    // 6. If the deleted shop was currently active, automatically switch back to main-business
    let switchedToShop: Business | undefined = undefined;
    if (wasActiveShop) {
      switchedToShop = await api.switchBusiness("main-business");
    }

    return { deleted: true, switchedToShop };
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

    const totalDue = customers.reduce((sum, c) => {
      const d = Number(c.dueAmount) || 0;
      return d > 0 ? sum + d : sum;
    }, 0);
    const totalCustomerAdvance = customers.reduce((sum, c) => {
      const d = Number(c.dueAmount) || 0;
      return d < 0 ? sum + Math.abs(d) : sum;
    }, 0);
    const lowStockCount = products.filter(p => !isOtherProduct(p) && (Number(p.stock) || 0) <= (Number(p.minStock) || 5)).length;

    return {
      todaySales: todayRevenue,
      monthlySales: monthlyRevenue,
      totalProfit: Math.round(totalProfit),
      totalDue,
      totalCustomerAdvance,
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
    syncEntityToGoogleSheets('sms', log, 'upsert', currentBusinessId);
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
    const [users, products, categories, customers, suppliers, sales, expenses, business, approvalRequests, smsLogs, smsConfig] = await Promise.all([
      api.getUsers(),
      api.getProducts(),
      api.getCategories(),
      api.getCustomers(),
      api.getSuppliers(),
      api.getSales(),
      api.getExpenses(),
      api.getBusiness(),
      api.getApprovalRequests(),
      api.getSMSLogs(),
      api.getSMSConfig()
    ]);

    return {
      version: "3.0-CLOUD",
      timestamp: new Date().toISOString(),
      business,
      users,
      products,
      categories,
      customers,
      suppliers,
      sales,
      expenses,
      approvalRequests,
      smsLogs,
      smsConfig
    };
  },

  restoreDB: async (data: any): Promise<any> => {
    if (!data || typeof data !== "object") {
      throw new Error("ভুল ডেটা ফরম্যাট।");
    }

    // Normalize restored users strictly into the active shop and avoid reintroducing plaintext passwords
    const normalizedUsers: any[] = [];
    if (Array.isArray(data.users)) {
      for (const rawUser of data.users) {
        if (!rawUser || !rawUser.id) continue;
        const globalSuper = isGlobalSuperAdmin(rawUser);
        const uCopy: any = {
          ...rawUser,
          businessId: globalSuper ? (rawUser.businessId || "main-business") : currentBusinessId
        };
        if (typeof uCopy.password === "string" && uCopy.password.trim().length > 0 && !uCopy.passwordHash) {
          const { hash, salt } = await hashPassword(uCopy.password.trim());
          uCopy.passwordHash = hash;
          uCopy.passwordSalt = salt;
        }
        delete uCopy.password;
        normalizedUsers.push(uCopy);
      }
    }

    // Restore to Firestore strictly scoped to currentBusinessId
    try {
      if (Array.isArray(data.products)) {
        for (const p of data.products) {
          if (p.id) await setDoc(doc(db, "businesses", currentBusinessId, "products", p.id), cleanForFirestore(p));
        }
      }
      if (Array.isArray(data.categories)) {
        for (const cat of data.categories) {
          if (cat.id) await setDoc(doc(db, "businesses", currentBusinessId, "categories", cat.id), cleanForFirestore(cat));
        }
      }
      if (Array.isArray(data.customers)) {
        for (const c of data.customers) {
          if (c.id) await setDoc(doc(db, "businesses", currentBusinessId, "customers", c.id), cleanForFirestore(c));
        }
      }
      if (Array.isArray(data.suppliers)) {
        for (const s of data.suppliers) {
          if (s.id) await setDoc(doc(db, "businesses", currentBusinessId, "suppliers", s.id), cleanForFirestore(s));
        }
      }
      if (Array.isArray(data.sales)) {
        for (const s of data.sales) {
          if (s.id) await setDoc(doc(db, "businesses", currentBusinessId, "sales", s.id), cleanForFirestore(s));
        }
      }
      if (Array.isArray(data.expenses)) {
        for (const e of data.expenses) {
          if (e.id) await setDoc(doc(db, "businesses", currentBusinessId, "expenses", e.id), cleanForFirestore(e));
        }
      }
      if (Array.isArray(data.approvalRequests)) {
        for (const req of data.approvalRequests) {
          if (req.id) await setDoc(doc(db, "businesses", currentBusinessId, "approval_requests", req.id), cleanForFirestore(req));
        }
      }
      if (Array.isArray(data.smsLogs)) {
        for (const log of data.smsLogs) {
          if (log.id) await setDoc(doc(db, "businesses", currentBusinessId, "sms_logs", log.id), cleanForFirestore(log));
        }
      }
      for (const u of normalizedUsers) {
        await setDoc(doc(db, "users", u.id), cleanForFirestore(u), { merge: true });
      }
      if (data.business) {
        const savedPrinter =
          typeof window !== "undefined"
            ? (localStorage.getItem(`smart_printer_${currentBusinessId}`) as 'thermal' | 'a4' | null)
            : null;
        const scopedBusiness = {
          ...data.business,
          id: currentBusinessId,
          defaultPrinter: savedPrinter || data.business.defaultPrinter || "thermal"
        };
        await setDoc(doc(db, "businesses", currentBusinessId), cleanForFirestore(scopedBusiness), { merge: true });
      }
    } catch (fsErr) {
      console.warn("Firestore restore encountered warning:", fsErr);
    }

    const cache = getLocalCache();
    if (data.products) cache.products = data.products;
    if (data.categories) cache.categories = data.categories;
    if (data.customers) cache.customers = data.customers;
    if (data.suppliers) cache.suppliers = data.suppliers;
    if (data.sales) cache.sales = data.sales;
    if (data.expenses) cache.expenses = data.expenses;
    if (data.approvalRequests) cache.approvalRequests = data.approvalRequests;
    if (data.smsLogs) cache.smsLogs = data.smsLogs;
    if (normalizedUsers.length > 0) cache.users = normalizedUsers;
    if (data.business) {
      const savedPrinter =
        typeof window !== "undefined"
          ? (localStorage.getItem(`smart_printer_${currentBusinessId}`) as 'thermal' | 'a4' | null)
          : null;
      cache.business = {
        ...cache.business,
        ...data.business,
        id: currentBusinessId,
        defaultPrinter: savedPrinter || data.business.defaultPrinter || cache.business?.defaultPrinter || "thermal"
      };
    }
    saveLocalCache(cache);

    return { success: true };
  },

  clearAllData: async (): Promise<any> => {
    const curUser = getCurrentUser();
    if (!isShopAdmin(curUser)) {
      throw new Error("শুধুমাত্র অ্যাডমিন শপের ডাটা মুছে ফেলতে পারবেন।");
    }

    const collectionsToClear = ["products", "customers", "sales", "expenses", "suppliers", "categories", "sms_logs", "approval_requests"];

    for (const colName of collectionsToClear) {
      try {
        const snap = await getDocs(collection(db, "businesses", currentBusinessId, colName));
        const deletePromises = snap.docs.map(d => deleteDoc(d.ref));
        await Promise.all(deletePromises);
      } catch (colErr) {
        console.warn(`Error clearing Firestore collection ${colName}:`, colErr);
      }
    }

    // Delete non-admin users belonging ONLY to the current shop from Firestore
    try {
      const userSnap = await getDocs(collection(db, "users"));
      for (const uDoc of userSnap.docs) {
        const uData = uDoc.data();
        const userBizId = uData.businessId || "main-business";
        if (
          userBizId === currentBusinessId &&
          !isShopAdmin({ id: uDoc.id, ...uData } as any)
        ) {
          await deleteDoc(uDoc.ref);
        }
      }
    } catch (uErr) {
      console.warn("Error deleting non-admin users from Firestore:", uErr);
    }

    const cache = getLocalCache();
    cache.users = (cache.users || []).filter(u => isShopAdmin(u));
    cache.products = [];
    cache.categories = [];
    cache.customers = [];
    cache.customerPayments = [];
    cache.suppliers = [];
    cache.supplierTransactions = [];
    cache.sales = [];
    cache.expenses = [];
    cache.smsLogs = [];
    cache.approvalRequests = [];
    saveLocalCache(cache);

    return { success: true };
  },

  // --- Google Sheets Master Database Integration (Per Shop & All Shops) ---
  syncAllToGoogleSheets: async (customUrl?: string) => {
    const allData = await api.getAllData();
    return syncAllToGoogleSheets(allData, customUrl, currentBusinessId);
  },

  getShopAllData: async (shopId: string): Promise<any> => {
    const targetShopId = shopId || "main-business";
    if (targetShopId === currentBusinessId) {
      return api.getAllData();
    }
    try {
      const [
        bizSnap,
        prodSnap,
        catSnap,
        custSnap,
        supSnap,
        salesSnap,
        expSnap,
        appSnap,
        smsSnap,
        usersSnap
      ] = await Promise.all([
        getDoc(doc(db, "businesses", targetShopId)),
        getDocs(collection(db, "businesses", targetShopId, "products")),
        getDocs(collection(db, "businesses", targetShopId, "categories")),
        getDocs(collection(db, "businesses", targetShopId, "customers")),
        getDocs(collection(db, "businesses", targetShopId, "suppliers")),
        getDocs(collection(db, "businesses", targetShopId, "sales")),
        getDocs(collection(db, "businesses", targetShopId, "expenses")),
        getDocs(collection(db, "businesses", targetShopId, "approval_requests")),
        getDocs(collection(db, "businesses", targetShopId, "sms_logs")),
        getDocs(collection(db, "users"))
      ]);

      const business = bizSnap.exists()
        ? ({ id: bizSnap.id, ...bizSnap.data() } as Business)
        : ({ id: targetShopId, name: targetShopId } as Business);
      const products = prodSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const categories = catSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const customers = custSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const suppliers = supSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const sales = salesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const expenses = expSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const approvalRequests = appSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const smsLogs = smsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const users = usersSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as any))
        .filter(u => (u.businessId || "main-business") === targetShopId)
        .map(stripSensitiveUserFields);

      return {
        version: "3.0-CLOUD",
        timestamp: new Date().toISOString(),
        business,
        users,
        products,
        categories,
        customers,
        suppliers,
        sales,
        expenses,
        approvalRequests,
        smsLogs
      };
    } catch (e) {
      return {
        version: "3.0-CLOUD",
        timestamp: new Date().toISOString(),
        business: { id: targetShopId, name: targetShopId },
        users: [],
        products: [],
        categories: [],
        customers: [],
        suppliers: [],
        sales: [],
        expenses: [],
        approvalRequests: [],
        smsLogs: []
      };
    }
  },

  syncAllShopsToGoogleSheets: async (): Promise<{ syncedShops: number; totalShops: number; results: any[] }> => {
    const curUser = getCurrentUser();
    if (!isGlobalSuperAdmin(curUser)) {
      throw new Error("শুধুমাত্র সুপার অ্যাডমিন সকল শপের গুগল শিট একসাথে আপডেট করতে পারবেন।");
    }

    const shops = await api.getBusinesses();
    const results: any[] = [];
    let syncedShops = 0;

    for (const shop of shops) {
      try {
        const shopData = await api.getShopAllData(shop.id);
        let cfg = await fetchCloudSheetsConfig(shop.id);
        if (!cfg.spreadsheetId && !cfg.sheetUrl) {
          const recognized = await ensureShopGoogleSheet(shop, cfg.webAppUrl || undefined, shopData, {
            allowCreateIfMissing: false,
            silentIfMissing: true
          });
          if (recognized) cfg = recognized;
        }
        const res = await syncAllToGoogleSheets(shopData, cfg.webAppUrl || undefined, shop.id);
        if (res.success) syncedShops++;
        results.push({ shopId: shop.id, shopName: shop.name, ...res });
      } catch (err: any) {
        results.push({ shopId: shop.id, shopName: shop.name, success: false, error: err?.message });
      }
    }

    return {
      syncedShops,
      totalShops: shops.length,
      results
    };
  },

  restoreFromGoogleSheets: async (customUrl?: string) => {
    const data = await fetchDataFromGoogleSheets(customUrl, currentBusinessId);
    return api.restoreDB(data);
  },

  testGoogleSheets: async (url: string) => {
    return testGoogleSheetsConnection(url);
  },

  getGoogleSheetsConfig: async (shopId?: string) => {
    return fetchCloudSheetsConfig(shopId || currentBusinessId);
  },

  saveGoogleSheetsConfig: async (config: any, shopId?: string) => {
    return saveSheetsConfig(config, shopId || currentBusinessId);
  },

  autoCreateShopGoogleSheet: async (shop?: Business, customWebAppUrl?: string) => {
    const targetShop = shop || (await api.getBusiness(currentBusinessId));
    return autoCreateShopGoogleSheet(targetShop, customWebAppUrl);
  },

  ensureShopGoogleSheet: async (
    shopId?: string,
    options?: { allowCreateIfMissing?: boolean; forceRestoreFromSheet?: boolean; silentIfMissing?: boolean }
  ) => {
    const curUser = getCurrentUser();
    if (!isShopAdmin(curUser)) return null;
    const targetId = shopId || curUser?.businessId || currentBusinessId || "main-business";
    const [shop, allData] = await Promise.all([
      api.getBusiness(targetId),
      api.getShopAllData(targetId)
    ]);
    const result = await ensureShopGoogleSheet(shop, undefined, allData, options);
    // Automatically restore data back into the active shop if the recognized Google Sheet had previous data!
    if (result?.restoredFromSheetData && targetId === currentBusinessId) {
      try {
        await api.restoreDB(result.restoredFromSheetData);
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("shop-sheet-restored", {
              detail: {
                shopId: targetId,
                shopName: shop?.name || targetId,
                sheetName: result.sheetName
              }
            })
          );
        }
      } catch (restoreErr) {
        console.warn("[EnsureShopSheet] Auto-restore from recognized sheet warning:", restoreErr);
      }
    }
    return result;
  }
};
