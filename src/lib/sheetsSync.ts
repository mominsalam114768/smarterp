/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { db, doc, getDoc, setDoc } from "./firebase";

export interface GoogleSheetsConfig {
  webAppUrl: string;
  sheetUrl?: string;
  sheetName?: string;
  autoSync: boolean;
  lastSyncAt?: string;
  lastSyncStatus?: 'success' | 'error';
  lastSyncMessage?: string;
  lastSyncCount?: {
    products?: number;
    sales?: number;
    customers?: number;
    suppliers?: number;
    expenses?: number;
    dues?: number;
  };
}

const STORAGE_KEY = "hishab_google_sheets_config_v1";

const DEFAULT_CONFIG: GoogleSheetsConfig = {
  webAppUrl: "",
  sheetUrl: "",
  autoSync: true,
  lastSyncAt: undefined,
  lastSyncStatus: undefined
};

/**
 * Read locally saved Google Sheets configuration
 */
export const getLocalSheetsConfig = (): GoogleSheetsConfig => {
  if (typeof window === "undefined") return DEFAULT_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.warn("Failed to parse local Google Sheets config:", e);
  }
  return DEFAULT_CONFIG;
};

/**
 * Fetch latest Google Sheets config from Firestore cloud database
 */
export const fetchCloudSheetsConfig = async (businessId: string = "main-business"): Promise<GoogleSheetsConfig> => {
  try {
    const ref = doc(db, "businesses", businessId, "config", "google_sheets");
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data() as GoogleSheetsConfig;
      if (data && data.webAppUrl) {
        saveLocalSheetsConfig(data);
        return data;
      }
    }
  } catch (err) {
    console.warn("Failed to fetch cloud Google Sheets config:", err);
  }
  return getLocalSheetsConfig();
};

/**
 * Save Google Sheets config locally and in Firestore
 */
export const saveSheetsConfig = async (
  config: Partial<GoogleSheetsConfig>, 
  businessId: string = "main-business"
): Promise<GoogleSheetsConfig> => {
  const current = getLocalSheetsConfig();
  const merged: GoogleSheetsConfig = { ...current, ...config };

  saveLocalSheetsConfig(merged);

  try {
    const ref = doc(db, "businesses", businessId, "config", "google_sheets");
    await setDoc(ref, {
      ...merged,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.warn("Could not save Google Sheets config to Firestore:", err);
  }

  return merged;
};

export const saveLocalSheetsConfig = (config: GoogleSheetsConfig) => {
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }
};

/**
 * Test connectivity with Google Apps Script Web App
 */
export const testGoogleSheetsConnection = async (webAppUrl: string): Promise<{ success: boolean; message: string; sheetName?: string }> => {
  const cleanUrl = (webAppUrl || "").trim();
  if (!cleanUrl) {
    throw new Error("গুগল অ্যাপস স্ক্রিপ্ট (Web App URL) প্রদান করুন।");
  }

  const pingUrl = cleanUrl.includes("?") 
    ? `${cleanUrl}&action=ping` 
    : `${cleanUrl}?action=ping`;

  try {
    // 1. Try direct fetch
    const response = await fetch(pingUrl, {
      method: "GET",
      headers: { Accept: "application/json" }
    });

    if (response.ok) {
      const data = await response.json();
      return {
        success: true,
        message: data.message || "গুগল শিট ডাটাবেজ সফলভাবে সংযুক্ত হয়েছে!",
        sheetName: data.spreadsheetName
      };
    }
    throw new Error(`HTTP Error: ${response.status}`);
  } catch (err: any) {
    console.warn("[Sheets Ping] Direct fetch error, trying proxy fallback:", err);

    // 2. Try server proxy fallback
    try {
      const proxyRes = await fetch(`/api/sheets/proxy?url=${encodeURIComponent(pingUrl)}`);
      if (proxyRes.ok) {
        const pData = await proxyRes.json();
        return {
          success: true,
          message: pData.message || "গুগল শিট ডাটাবেজ সফলভাবে সংযুক্ত হয়েছে!",
          sheetName: pData.spreadsheetName
        };
      }
    } catch (proxyErr) {}

    throw new Error(
      "গুগল শিটে সংযোগ করা যায়নি। দয়া করে নিশ্চিত করুন আপনার Apps Script Deploy করার সময় 'Who has access' অপশনটি 'Anyone' দেয়া আছে।"
    );
  }
};

/**
 * Full Database Synchronization to Google Sheets (All tabs)
 */
export const syncAllToGoogleSheets = async (
  allData: any, 
  customUrl?: string
): Promise<{ success: boolean; message: string; counts?: any }> => {
  const config = getLocalSheetsConfig();
  const targetUrl = (customUrl || config.webAppUrl || "").trim();

  if (!targetUrl) {
    throw new Error("গুগল শিট Web App URL কনফিগার করা নেই। Settings -> গুগল শিট ডাটাবেজে গিয়ে URL বসিয়ে নিন।");
  }

  const payload = {
    action: "fullSync",
    timestamp: new Date().toISOString(),
    data: allData
  };

  const jsonStr = JSON.stringify(payload);

  let success = false;
  let responseData: any = null;
  let errorMsg = "";

  // 1. Direct fetch using text/plain (avoids CORS preflight in browsers with Google Apps Script)
  try {
    const res = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: jsonStr
    });

    if (res.ok) {
      responseData = await res.json();
      success = true;
    } else {
      errorMsg = `Server response: ${res.status}`;
    }
  } catch (directErr: any) {
    console.warn("[Sheets Sync] Direct POST failed, attempting server proxy:", directErr);
    errorMsg = directErr.message || String(directErr);
  }

  // 2. If direct fetch had issues, try local server-side proxy
  if (!success) {
    try {
      const proxyRes = await fetch("/api/sheets/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUrl, payload })
      });
      if (proxyRes.ok) {
        responseData = await proxyRes.json();
        success = true;
      } else {
        const pErr = await proxyRes.json().catch(() => ({}));
        errorMsg = pErr.error || errorMsg;
      }
    } catch (proxyErr: any) {
      console.error("[Sheets Sync] Proxy POST failed:", proxyErr);
    }
  }

  // Record sync status
  const now = new Date().toISOString();
  if (success) {
    await saveSheetsConfig({
      lastSyncAt: now,
      lastSyncStatus: 'success',
      lastSyncMessage: 'সফলভাবে গুগল শিটের সকল ট্যাবে ডাটা সিঙ্ক হয়েছে',
      lastSyncCount: responseData?.details || {
        products: allData.products?.length || 0,
        sales: allData.sales?.length || 0,
        customers: allData.customers?.length || 0,
        suppliers: allData.suppliers?.length || 0,
        expenses: allData.expenses?.length || 0,
        dues: (allData.customers || []).filter((c: any) => (Number(c.dueAmount) || 0) > 0).length
      }
    });

    return {
      success: true,
      message: responseData?.message || "গুগল শিটের প্রতিটি ট্যাবে সমস্ত তথ্য সফলভাবে আপডেট হয়েছে!",
      counts: responseData?.details
    };
  } else {
    await saveSheetsConfig({
      lastSyncAt: now,
      lastSyncStatus: 'error',
      lastSyncMessage: errorMsg || "সিঙ্ক ব্যর্থ হয়েছে"
    });
    throw new Error(errorMsg || "গুগল শিটে ডাটা পাঠাতে ব্যর্থ হয়েছে।");
  }
};

/**
 * Fetch all records from Google Sheets for 1-click restore
 */
export const fetchDataFromGoogleSheets = async (customUrl?: string): Promise<any> => {
  const config = getLocalSheetsConfig();
  const targetUrl = (customUrl || config.webAppUrl || "").trim();

  if (!targetUrl) {
    throw new Error("গুগল শিট Web App URL পাওয়া যায়নি।");
  }

  const fetchUrl = targetUrl.includes("?") 
    ? `${targetUrl}&action=fetchData` 
    : `${targetUrl}?action=fetchData`;

  // 1. Direct fetch
  try {
    const res = await fetch(fetchUrl, {
      method: "GET",
      headers: { Accept: "application/json" }
    });
    if (res.ok) {
      const data = await res.json();
      if (data && (Array.isArray(data.products) || Array.isArray(data.customers))) {
        return data;
      }
    }
  } catch (e) {
    console.warn("[Sheets Restore] Direct fetch failed, trying proxy:", e);
  }

  // 2. Server proxy fallback
  try {
    const proxyRes = await fetch(`/api/sheets/proxy?url=${encodeURIComponent(fetchUrl)}`);
    if (proxyRes.ok) {
      const pData = await proxyRes.json();
      if (pData && (Array.isArray(pData.products) || Array.isArray(pData.customers))) {
        return pData;
      }
    }
  } catch (pErr) {}

  throw new Error("গুগল শিট থেকে ডাটা রিড করা সম্ভব হয়নি। শিটে সঠিক ডাটা রয়েছে কিনা এবং লিংকটি সচল আছে কিনা যাচাই করুন।");
};

/**
 * Real-time background sync for single entities
 * Called asynchronously when adding/editing products, sales, customers, etc.
 */
export const syncEntityToGoogleSheets = async (
  entityType: 'product' | 'sale' | 'customer' | 'supplier' | 'expense' | 'payment',
  item: any,
  operation: 'upsert' | 'delete' = 'upsert'
) => {
  const config = getLocalSheetsConfig();
  if (!config.webAppUrl || config.autoSync === false) {
    return; // Sync not configured or auto-sync is paused
  }

  const actionMap: Record<string, string> = {
    product: 'syncProduct',
    sale: 'syncSale',
    customer: 'syncCustomer',
    supplier: 'syncSupplier',
    expense: 'syncExpense',
    payment: 'recordPayment'
  };

  const action = actionMap[entityType] || 'syncProduct';

  const payload = {
    action,
    operation,
    item,
    customerId: item?.customerId,
    amount: item?.amount,
    timestamp: new Date().toISOString()
  };

  // Fire-and-forget in background, non-blocking
  try {
    fetch(config.webAppUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      mode: "no-cors" // Guaranteed not to fail in background
    }).catch(() => {});
  } catch (e) {
    // Silent background handling
  }
};
