/**
 * @license
 * @fileoverview Per-shop Google Sheets synchronization and automatic Google Sheet provisioning
 * SPDX-License-Identifier: Apache-2.0
 */

import { db, collection, doc, getDoc, getDocs, setDoc } from "./firebase";
import { getDriveAccessToken } from "./drive";
import { generateExcelWorkbook } from "./excelExport";

export interface GoogleSheetsConfig {
  webAppUrl: string;
  spreadsheetId?: string;
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

const LEGACY_STORAGE_KEY = "hishab_google_sheets_config_v1";

let currentSheetsBusinessId: string = "main-business";

export const setSheetsBusinessId = (businessId: string | null) => {
  if (businessId) {
    currentSheetsBusinessId = businessId;
  }
};

export const getSheetsBusinessId = (): string => currentSheetsBusinessId;

const getStorageKey = (businessId: string = currentSheetsBusinessId): string => {
  return `${LEGACY_STORAGE_KEY}_${businessId || "main-business"}`;
};

const DEFAULT_CONFIG: GoogleSheetsConfig = {
  webAppUrl: "",
  spreadsheetId: "",
  sheetUrl: "",
  sheetName: "",
  autoSync: true,
  lastSyncAt: undefined,
  lastSyncStatus: undefined
};

/**
 * Extract spreadsheetId from a Google Sheets URL if present
 */
export const extractSpreadsheetIdFromUrl = (url?: string): string => {
  if (!url) return "";
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : "";
};

/**
 * Read locally saved Google Sheets configuration for a specific shop (businessId)
 */
export const getLocalSheetsConfig = (businessId: string = currentSheetsBusinessId): GoogleSheetsConfig => {
  if (typeof window === "undefined") return { ...DEFAULT_CONFIG };
  const targetBizId = businessId || currentSheetsBusinessId || "main-business";
  try {
    const key = getStorageKey(targetBizId);
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
      if (!parsed.spreadsheetId && parsed.sheetUrl) {
        parsed.spreadsheetId = extractSpreadsheetIdFromUrl(parsed.sheetUrl);
      }
      return parsed;
    }
    // Migrate legacy key ONLY for main-business so new shops never inherit main-business's Google Sheet
    if (targetBizId === "main-business") {
      const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacyRaw) {
        const parsed = { ...DEFAULT_CONFIG, ...JSON.parse(legacyRaw) };
        if (!parsed.spreadsheetId && parsed.sheetUrl) {
          parsed.spreadsheetId = extractSpreadsheetIdFromUrl(parsed.sheetUrl);
        }
        localStorage.setItem(key, JSON.stringify(parsed));
        return parsed;
      }
    }
  } catch (e) {
    console.warn("Failed to parse local Google Sheets config:", e);
  }
  return { ...DEFAULT_CONFIG };
};

export const saveLocalSheetsConfig = (config: GoogleSheetsConfig, businessId: string = currentSheetsBusinessId) => {
  if (typeof window !== "undefined") {
    const targetBizId = businessId || currentSheetsBusinessId || "main-business";
    const normalized: GoogleSheetsConfig = {
      ...config,
      spreadsheetId: config.spreadsheetId || extractSpreadsheetIdFromUrl(config.sheetUrl)
    };
    localStorage.setItem(getStorageKey(targetBizId), JSON.stringify(normalized));
    if (targetBizId === "main-business") {
      localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(normalized));
    }
  }
};

/**
 * Find any configured Master Apps Script Web App URL across main-business or other shops
 */
export const findMasterWebAppUrl = async (): Promise<string> => {
  // 1. Check main-business local config
  const mainLocal = getLocalSheetsConfig("main-business");
  if (mainLocal.webAppUrl && mainLocal.webAppUrl.trim()) {
    return mainLocal.webAppUrl.trim();
  }

  // 2. Check current active business local config
  const activeLocal = getLocalSheetsConfig(currentSheetsBusinessId);
  if (activeLocal.webAppUrl && activeLocal.webAppUrl.trim()) {
    return activeLocal.webAppUrl.trim();
  }

  // 3. Scan localStorage for any configured shop Web App URL
  if (typeof window !== "undefined") {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(LEGACY_STORAGE_KEY)) {
        try {
          const parsed = JSON.parse(localStorage.getItem(k) || "{}");
          if (parsed?.webAppUrl && typeof parsed.webAppUrl === "string" && parsed.webAppUrl.trim()) {
            return parsed.webAppUrl.trim();
          }
        } catch {}
      }
    }
  }

  // 4. Check main-business cloud config in Firestore
  try {
    const ref = doc(db, "businesses", "main-business", "config", "google_sheets");
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data() as GoogleSheetsConfig;
      if (data?.webAppUrl && data.webAppUrl.trim()) {
        return data.webAppUrl.trim();
      }
    }
  } catch {}

  // 5. Scan all businesses in Firestore if needed
  try {
    const bizSnap = await getDocs(collection(db, "businesses"));
    for (const bDoc of bizSnap.docs) {
      const bData = bDoc.data();
      if (bData?.googleSheetsConfig?.webAppUrl) {
        return String(bData.googleSheetsConfig.webAppUrl).trim();
      }
      try {
        const cfgSnap = await getDoc(doc(db, "businesses", bDoc.id, "config", "google_sheets"));
        if (cfgSnap.exists()) {
          const cData = cfgSnap.data() as GoogleSheetsConfig;
          if (cData?.webAppUrl && cData.webAppUrl.trim()) {
            return cData.webAppUrl.trim();
          }
        }
      } catch {}
    }
  } catch {}

  return "";
};

/**
 * Create a brand-new multi-tab Google Spreadsheet directly in the user's Google Drive using Drive API v3
 * by uploading a structured Excel workbook and converting it to a native Google Sheet.
 */
export const createGoogleSheetViaDriveApi = async (
  shop: { id: string; name: string; phone?: string; address?: string; currency?: string }
): Promise<{ spreadsheetId: string; sheetUrl: string; sheetName: string } | null> => {
  const token = getDriveAccessToken();
  if (!token) return null;

  const sheetTitle = `${shop.name} - হিসাবপাতি ডাটাবেজ`;

  // 1. Try Multipart Upload converting initial multi-tab workbook into a native Google Spreadsheet
  try {
    const workbookBlob = generateExcelWorkbook({
      business: shop,
      products: [],
      customers: [],
      sales: [],
      suppliers: [],
      expenses: [],
      categories: [],
      users: [],
      approvalRequests: []
    });

    const boundary = "-------HishabPatiShopSheet" + Date.now();
    const delimiter = "\r\n--" + boundary + "\r\n";
    const closeDelim = "\r\n--" + boundary + "--";

    const metadata = {
      name: sheetTitle,
      mimeType: "application/vnd.google-apps.spreadsheet",
      description: `HishabPati Smart ERP Dedicated Google Sheet for ${shop.name}`
    };

    const multipartBody = new Blob(
      [
        delimiter,
        "Content-Type: application/json; charset=UTF-8\r\n\r\n",
        JSON.stringify(metadata),
        delimiter,
        "Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n",
        workbookBlob,
        closeDelim
      ],
      { type: `multipart/related; boundary=${boundary}` }
    );

    const uploadRes = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": `multipart/related; boundary=${boundary}`
        },
        body: multipartBody
      }
    );

    if (uploadRes.ok) {
      const data = await uploadRes.json();
      if (data?.id) {
        return {
          spreadsheetId: data.id,
          sheetUrl: `https://docs.google.com/spreadsheets/d/${data.id}/edit`,
          sheetName: data.name || sheetTitle
        };
      }
    }
  } catch (err) {
    console.warn("[Auto Sheet] Multipart Google Sheet conversion skipped, trying direct metadata create:", err);
  }

  // 2. Fallback: Simple metadata creation of native Google Spreadsheet
  try {
    const res = await fetch("https://www.googleapis.com/drive/v3/files", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: sheetTitle,
        mimeType: "application/vnd.google-apps.spreadsheet",
        description: `HishabPati Smart ERP Dedicated Google Sheet for ${shop.name}`
      })
    });

    if (res.ok) {
      const data = await res.json();
      if (data?.id) {
        return {
          spreadsheetId: data.id,
          sheetUrl: `https://docs.google.com/spreadsheets/d/${data.id}/edit`,
          sheetName: data.name || sheetTitle
        };
      }
    }
  } catch (err) {
    console.warn("[Auto Sheet] Drive API spreadsheet creation skipped:", err);
  }
  return null;
};

/**
 * Automatically create and connect a dedicated Google Sheet for a newly created (or existing) shop!
 * Uses both Google Drive API (if connected) and the Master Apps Script Web App (`createShopSpreadsheet` + `fullSync`).
 */
export const autoCreateShopGoogleSheet = async (
  shop: { id: string; name: string; phone?: string; address?: string; currency?: string },
  customWebAppUrl?: string
): Promise<GoogleSheetsConfig> => {
  const targetBizId = shop.id;
  const existingCfg = getLocalSheetsConfig(targetBizId);
  const masterUrl = (customWebAppUrl || existingCfg.webAppUrl || (await findMasterWebAppUrl()) || "").trim();

  let spreadsheetId = existingCfg.spreadsheetId || extractSpreadsheetIdFromUrl(existingCfg.sheetUrl) || "";
  let sheetUrl = existingCfg.sheetUrl || "";
  let sheetName = `${shop.name} - হিসাবপাতি ডাটাবেজ`;
  let syncSuccess = false;
  let syncMessage = "";

  // Step 1: Create a native multi-tab Google Spreadsheet via Google Drive API if not created yet
  if (!spreadsheetId && !sheetUrl) {
    const driveSheet = await createGoogleSheetViaDriveApi(shop);
    if (driveSheet) {
      spreadsheetId = driveSheet.spreadsheetId;
      sheetUrl = driveSheet.sheetUrl;
      sheetName = driveSheet.sheetName;
      syncSuccess = true;
      syncMessage = "স্বয়ংক্রিয়ভাবে নতুন গুগল শিট তৈরি ও সংযুক্ত হয়েছে";
    }
  }

  // Step 2: Call Master Apps Script Web App to either create the spreadsheet via SpreadsheetApp.create()
  // or initialize all 10 Bengali sheets inside the newly created spreadsheet
  if (masterUrl) {
    const baseData = {
      business: {
        id: shop.id,
        name: shop.name,
        phone: shop.phone || "",
        address: shop.address || "",
        currency: shop.currency || "৳"
      },
      products: [],
      customers: [],
      sales: [],
      suppliers: [],
      expenses: [],
      categories: [],
      users: [],
      approvalRequests: []
    };

    const payload = {
      action: "createShopSpreadsheet",
      businessId: targetBizId,
      shopName: shop.name,
      spreadsheetId: spreadsheetId || undefined,
      business: baseData.business,
      data: baseData,
      timestamp: new Date().toISOString()
    };

    let responseData: any = null;

    // 2a. Try direct POST
    try {
      const res = await fetch(masterUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        responseData = await res.json();
      }
    } catch (directErr) {
      console.warn("[AutoCreateShopSheet] Direct POST failed, trying server proxy:", directErr);
    }

    // 2b. Try proxy fallback
    if (!responseData) {
      try {
        const proxyRes = await fetch("/api/sheets/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetUrl: masterUrl, payload })
        });
        if (proxyRes.ok) {
          responseData = await proxyRes.json();
        }
      } catch (proxyErr) {
        console.warn("[AutoCreateShopSheet] Proxy POST failed:", proxyErr);
      }
    }

    // 2c. If the deployed Apps Script is an older version that didn't recognize 'createShopSpreadsheet',
    // fallback to 'fullSync' so it still initializes all tabs for this shop!
    if (!responseData || responseData.status === "error" || !responseData.success) {
      const fallbackPayload = {
        action: "fullSync",
        businessId: targetBizId,
        shopName: shop.name,
        spreadsheetId: spreadsheetId || undefined,
        timestamp: new Date().toISOString(),
        data: baseData
      };
      try {
        const res = await fetch(masterUrl, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(fallbackPayload)
        });
        if (res.ok) {
          responseData = await res.json();
        }
      } catch {}

      if (!responseData || !responseData.success) {
        try {
          const proxyRes = await fetch("/api/sheets/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ targetUrl: masterUrl, payload: fallbackPayload })
          });
          if (proxyRes.ok) {
            responseData = await proxyRes.json();
          }
        } catch {}
      }
    }

    if (responseData && (responseData.success || responseData.status === "success")) {
      if (responseData.spreadsheetId) {
        spreadsheetId = responseData.spreadsheetId;
      }
      if (responseData.spreadsheetUrl) {
        sheetUrl = responseData.spreadsheetUrl;
      } else if (spreadsheetId && !sheetUrl) {
        sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
      }
      if (responseData.spreadsheetName) {
        sheetName = responseData.spreadsheetName;
      }
      syncSuccess = true;
      syncMessage = responseData.message || "স্বয়ংক্রিয়ভাবে নতুন গুগল শিট তৈরি ও সকল ট্যাব প্রস্তুত করা হয়েছে";
    }
  }

  const now = new Date().toISOString();
  const newConfig: GoogleSheetsConfig = {
    webAppUrl: masterUrl,
    spreadsheetId: spreadsheetId || extractSpreadsheetIdFromUrl(sheetUrl),
    sheetUrl: sheetUrl,
    sheetName: sheetName,
    autoSync: true,
    lastSyncAt: syncSuccess || masterUrl ? now : undefined,
    lastSyncStatus: syncSuccess || masterUrl ? "success" : undefined,
    lastSyncMessage: syncMessage || "স্বয়ংক্রিয়ভাবে গুগল শিট সংযুক্ত করা হয়েছে",
    lastSyncCount: existingCfg.lastSyncCount || {
      products: 0,
      sales: 0,
      customers: 0,
      suppliers: 0,
      expenses: 0,
      dues: 0
    }
  };

  return await saveSheetsConfig(newConfig, targetBizId);
};

/**
 * Automatically rename a shop's dedicated Google Sheet when the shop's name is changed,
 * while preserving the exact same spreadsheetId, sheetUrl, and webAppUrl connection!
 */
export const renameShopGoogleSheet = async (
  shopId: string,
  newShopName: string,
  updatedBusiness?: any
): Promise<GoogleSheetsConfig> => {
  const targetBizId = shopId || currentSheetsBusinessId || "main-business";
  const cleanName = (newShopName || "").trim();
  const cfg = await fetchCloudSheetsConfig(targetBizId);
  if (!cleanName) return cfg;

  const newSheetTitle = `${cleanName} - হিসাবপাতি ডাটাবেজ`;
  const spreadsheetId = cfg.spreadsheetId || extractSpreadsheetIdFromUrl(cfg.sheetUrl);
  const webAppUrl = (cfg.webAppUrl || (await findMasterWebAppUrl()) || "").trim();

  // 1. Rename via Google Drive API v3 if token and spreadsheetId are available
  const token = getDriveAccessToken();
  if (token && spreadsheetId) {
    try {
      await fetch(`https://www.googleapis.com/drive/v3/files/${spreadsheetId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: newSheetTitle,
          description: `HishabPati Smart ERP Dedicated Google Sheet for ${cleanName}`
        })
      });
    } catch (driveErr) {
      console.warn("[RenameShopSheet] Drive API rename skipped:", driveErr);
    }
  }

  // 2. Rename via Google Apps Script Web App (`renameShopSpreadsheet`)
  if (webAppUrl) {
    const payload = {
      action: "renameShopSpreadsheet",
      businessId: targetBizId,
      spreadsheetId: spreadsheetId || undefined,
      shopName: cleanName,
      business: updatedBusiness || { id: targetBizId, name: cleanName },
      timestamp: new Date().toISOString()
    };

    let renamed = false;
    try {
      const res = await fetch(webAppUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
      });
      if (res.ok) renamed = true;
    } catch {}

    if (!renamed) {
      try {
        await fetch("/api/sheets/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetUrl: webAppUrl, payload })
        });
      } catch {}
    }
  }

  // 3. Save updated sheetName while keeping spreadsheetId, sheetUrl, and webAppUrl completely intact
  return await saveSheetsConfig({
    ...cfg,
    webAppUrl: webAppUrl || cfg.webAppUrl,
    spreadsheetId: spreadsheetId || cfg.spreadsheetId,
    sheetUrl: cfg.sheetUrl || (spreadsheetId ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit` : ""),
    sheetName: newSheetTitle
  }, targetBizId);
};

/**
 * Automatically delete a shop's dedicated Google Sheet when the shop is deleted by the Admin
 */
export const deleteShopGoogleSheet = async (shopId: string): Promise<boolean> => {
  if (!shopId || shopId === "main-business") return false;
  const cfg = await fetchCloudSheetsConfig(shopId);
  const spreadsheetId = cfg.spreadsheetId || extractSpreadsheetIdFromUrl(cfg.sheetUrl);
  const webAppUrl = (cfg.webAppUrl || (await findMasterWebAppUrl()) || "").trim();

  // 1. Delete or trash via Google Drive API v3 if token and spreadsheetId are available
  const token = getDriveAccessToken();
  if (token && spreadsheetId) {
    try {
      const delRes = await fetch(`https://www.googleapis.com/drive/v3/files/${spreadsheetId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!delRes.ok) {
        await fetch(`https://www.googleapis.com/drive/v3/files/${spreadsheetId}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ trashed: true })
        });
      }
    } catch (driveErr) {
      console.warn("[DeleteShopSheet] Drive API delete skipped:", driveErr);
    }
  }

  // 2. Delete via Google Apps Script Web App (`deleteShopSpreadsheet`)
  if (webAppUrl) {
    const payload = {
      action: "deleteShopSpreadsheet",
      businessId: shopId,
      spreadsheetId: spreadsheetId || undefined,
      timestamp: new Date().toISOString()
    };

    let deletedViaGas = false;
    try {
      const res = await fetch(webAppUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
      });
      if (res.ok) deletedViaGas = true;
    } catch {}

    if (!deletedViaGas) {
      try {
        await fetch("/api/sheets/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetUrl: webAppUrl, payload })
        });
      } catch {}
    }
  }

  if (typeof window !== "undefined") {
    localStorage.removeItem(getStorageKey(shopId));
  }
  return true;
};

/**
 * Fetch latest Google Sheets config from Firestore cloud database for a specific shop
 */
export const fetchCloudSheetsConfig = async (businessId: string = currentSheetsBusinessId): Promise<GoogleSheetsConfig> => {
  const targetBizId = businessId || currentSheetsBusinessId || "main-business";
  try {
    const ref = doc(db, "businesses", targetBizId, "config", "google_sheets");
    const snap = await getDoc(ref);
    let data: GoogleSheetsConfig | null = null;
    if (snap.exists()) {
      data = snap.data() as GoogleSheetsConfig;
    } else {
      const bizSnap = await getDoc(doc(db, "businesses", targetBizId));
      if (bizSnap.exists() && bizSnap.data()?.googleSheetsConfig) {
        data = bizSnap.data()?.googleSheetsConfig as GoogleSheetsConfig;
      }
    }

    if (data) {
      let webAppUrl = (data.webAppUrl || "").trim();
      if (!webAppUrl) {
        webAppUrl = await findMasterWebAppUrl();
      }
      const merged: GoogleSheetsConfig = {
        ...DEFAULT_CONFIG,
        ...data,
        webAppUrl,
        spreadsheetId: data.spreadsheetId || extractSpreadsheetIdFromUrl(data.sheetUrl)
      };
      saveLocalSheetsConfig(merged, targetBizId);
      return merged;
    } else if (targetBizId !== "main-business") {
      return getLocalSheetsConfig(targetBizId);
    }
  } catch (err) {
    console.warn("Failed to fetch cloud Google Sheets config:", err);
  }
  return getLocalSheetsConfig(targetBizId);
};

/**
 * Save Google Sheets config locally and in Firestore for a specific shop
 */
export const saveSheetsConfig = async (
  config: Partial<GoogleSheetsConfig>, 
  businessId: string = currentSheetsBusinessId
): Promise<GoogleSheetsConfig> => {
  const targetBizId = businessId || currentSheetsBusinessId || "main-business";
  const current = getLocalSheetsConfig(targetBizId);
  const merged: GoogleSheetsConfig = {
    ...current,
    ...config,
    spreadsheetId: config.spreadsheetId || extractSpreadsheetIdFromUrl(config.sheetUrl) || current.spreadsheetId || extractSpreadsheetIdFromUrl(current.sheetUrl)
  };

  saveLocalSheetsConfig(merged, targetBizId);

  try {
    const ref = doc(db, "businesses", targetBizId, "config", "google_sheets");
    await setDoc(ref, {
      ...merged,
      updatedAt: new Date().toISOString()
    }, { merge: true });

    // Also mirror googleSheetsConfig on the shop document itself
    await setDoc(doc(db, "businesses", targetBizId), {
      googleSheetsConfig: {
        ...merged,
        updatedAt: new Date().toISOString()
      }
    }, { merge: true });
  } catch (err) {
    console.warn("Could not save Google Sheets config to Firestore:", err);
  }

  return merged;
};

/**
 * Test connectivity with Google Apps Script Web App for a specific shop
 */
export const testGoogleSheetsConnection = async (
  webAppUrl: string,
  businessId: string = currentSheetsBusinessId
): Promise<{ success: boolean; message: string; sheetName?: string; spreadsheetId?: string; sheetUrl?: string }> => {
  const cleanUrl = (webAppUrl || "").trim();
  if (!cleanUrl) {
    throw new Error("গুগল অ্যাপস স্ক্রিপ্ট (Web App URL) প্রদান করুন।");
  }

  const targetBizId = businessId || currentSheetsBusinessId || "main-business";
  const config = getLocalSheetsConfig(targetBizId);
  const queryParams = new URLSearchParams({
    action: "ping",
    businessId: targetBizId
  });
  if (config.spreadsheetId) {
    queryParams.set("spreadsheetId", config.spreadsheetId);
  }

  const pingUrl = cleanUrl.includes("?") 
    ? `${cleanUrl}&${queryParams.toString()}` 
    : `${cleanUrl}?${queryParams.toString()}`;

  try {
    // 1. Try direct fetch
    const response = await fetch(pingUrl, {
      method: "GET",
      headers: { Accept: "application/json" }
    });

    if (response.ok) {
      const data = await response.json();
      if (data.spreadsheetId || data.spreadsheetUrl || data.spreadsheetName) {
        await saveSheetsConfig({
          spreadsheetId: data.spreadsheetId || config.spreadsheetId,
          sheetUrl: data.spreadsheetUrl || config.sheetUrl,
          sheetName: data.spreadsheetName || config.sheetName
        }, targetBizId);
      }
      return {
        success: true,
        message: data.message || "গুগল শিট ডাটাবেজ সফলভাবে সংযুক্ত হয়েছে!",
        sheetName: data.spreadsheetName,
        spreadsheetId: data.spreadsheetId,
        sheetUrl: data.spreadsheetUrl
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
        if (pData.spreadsheetId || pData.spreadsheetUrl || pData.spreadsheetName) {
          await saveSheetsConfig({
            spreadsheetId: pData.spreadsheetId || config.spreadsheetId,
            sheetUrl: pData.spreadsheetUrl || config.sheetUrl,
            sheetName: pData.spreadsheetName || config.sheetName
          }, targetBizId);
        }
        return {
          success: true,
          message: pData.message || "গুগল শিট ডাটাবেজ সফলভাবে সংযুক্ত হয়েছে!",
          sheetName: pData.spreadsheetName,
          spreadsheetId: pData.spreadsheetId,
          sheetUrl: pData.spreadsheetUrl
        };
      }
    } catch (proxyErr) {}

    throw new Error(
      "গুগল শিটে সংযোগ করা যায়নি। দয়া করে নিশ্চিত করুন আপনার Apps Script Deploy করার সময় 'Who has access' অপশনটি 'Anyone' দেয়া আছে।"
    );
  }
};

/**
 * Full Database Synchronization to Google Sheets (All tabs) for the active shop
 */
export const syncAllToGoogleSheets = async (
  allData: any, 
  customUrl?: string,
  businessId: string = currentSheetsBusinessId
): Promise<{ success: boolean; message: string; counts?: any; sheetUrl?: string; spreadsheetId?: string }> => {
  const targetBizId = businessId || currentSheetsBusinessId || "main-business";
  const config = getLocalSheetsConfig(targetBizId);
  let targetUrl = (customUrl || config.webAppUrl || "").trim();

  if (!targetUrl) {
    targetUrl = await findMasterWebAppUrl();
  }

  if (!targetUrl) {
    throw new Error("এই শপের জন্য গুগল শিট Web App URL কনফিগার করা নেই। Settings -> গুগল শিট ডাটাবেজে গিয়ে URL বসিয়ে নিন।");
  }

  const shopName = allData?.business?.name || config.sheetName || targetBizId;
  const spreadsheetId = config.spreadsheetId || extractSpreadsheetIdFromUrl(config.sheetUrl);

  const payload = {
    action: "fullSync",
    businessId: targetBizId,
    shopName,
    spreadsheetId: spreadsheetId || undefined,
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

  // Record sync status for this specific shop
  const now = new Date().toISOString();
  if (success) {
    const returnedSheetId = responseData?.spreadsheetId || spreadsheetId;
    const returnedSheetUrl = responseData?.spreadsheetUrl || config.sheetUrl || (returnedSheetId ? `https://docs.google.com/spreadsheets/d/${returnedSheetId}/edit` : "");
    const returnedSheetName = responseData?.spreadsheetName || config.sheetName || `${shopName} - হিসাবপাতি ডাটাবেজ`;

    await saveSheetsConfig({
      webAppUrl: targetUrl,
      spreadsheetId: returnedSheetId,
      sheetUrl: returnedSheetUrl,
      sheetName: returnedSheetName,
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
    }, targetBizId);

    return {
      success: true,
      message: responseData?.message || "গুগল শিটের প্রতিটি ট্যাবে সমস্ত তথ্য সফলভাবে আপডেট হয়েছে!",
      counts: responseData?.details,
      sheetUrl: returnedSheetUrl,
      spreadsheetId: returnedSheetId
    };
  } else {
    await saveSheetsConfig({
      lastSyncAt: now,
      lastSyncStatus: 'error',
      lastSyncMessage: errorMsg || "সিঙ্ক ব্যর্থ হয়েছে"
    }, targetBizId);
    throw new Error(errorMsg || "গুগল শিটে ডাটা পাঠাতে ব্যর্থ হয়েছে।");
  }
};

/**
 * Fetch all records from Google Sheets for 1-click restore for the active shop
 */
export const fetchDataFromGoogleSheets = async (customUrl?: string, businessId: string = currentSheetsBusinessId): Promise<any> => {
  const targetBizId = businessId || currentSheetsBusinessId || "main-business";
  const config = getLocalSheetsConfig(targetBizId);
  const targetUrl = (customUrl || config.webAppUrl || "").trim();

  if (!targetUrl) {
    throw new Error("এই শপের গুগল শিট Web App URL পাওয়া যায়নি।");
  }

  const queryParams = new URLSearchParams({
    action: "fetchData",
    businessId: targetBizId
  });
  const spreadsheetId = config.spreadsheetId || extractSpreadsheetIdFromUrl(config.sheetUrl);
  if (spreadsheetId) {
    queryParams.set("spreadsheetId", spreadsheetId);
  }

  const fetchUrl = targetUrl.includes("?") 
    ? `${targetUrl}&${queryParams.toString()}` 
    : `${targetUrl}?${queryParams.toString()}`;

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
 * Real-time background sync for single entities (strictly isolated to the active shop's Google Sheet)
 */
export const syncEntityToGoogleSheets = async (
  entityType: 'product' | 'sale' | 'customer' | 'supplier' | 'expense' | 'payment' | 'user' | 'category',
  item: any,
  operation: 'upsert' | 'delete' = 'upsert',
  businessId: string = currentSheetsBusinessId
) => {
  const targetBizId = businessId || currentSheetsBusinessId || "main-business";
  let config = getLocalSheetsConfig(targetBizId);

  // If salesman or admin is on a device where this shop's Google Sheet config hasn't been cached yet, load it from Firestore
  if (!config.webAppUrl || (!config.spreadsheetId && targetBizId !== "main-business")) {
    try {
      config = await fetchCloudSheetsConfig(targetBizId);
    } catch {}
  }

  if (!config.webAppUrl || config.autoSync === false) {
    return; // Sync not configured for this shop or auto-sync is paused
  }

  const actionMap: Record<string, string> = {
    product: 'syncProduct',
    sale: 'syncSale',
    customer: 'syncCustomer',
    supplier: 'syncSupplier',
    expense: 'syncExpense',
    payment: 'recordPayment',
    user: 'syncUser',
    category: 'syncCategory'
  };

  const action = actionMap[entityType] || 'syncProduct';
  const spreadsheetId = config.spreadsheetId || extractSpreadsheetIdFromUrl(config.sheetUrl);

  const payload = {
    action,
    businessId: targetBizId,
    spreadsheetId: spreadsheetId || undefined,
    operation,
    item,
    customerId: item?.customerId,
    amount: item?.amount,
    timestamp: new Date().toISOString()
  };

  // Fire-and-forget in background with proxy fallback
  try {
    fetch(config.webAppUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      mode: "no-cors"
    }).catch(() => {
      fetch("/api/sheets/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUrl: config.webAppUrl, payload })
      }).catch(() => {});
    });
  } catch (e) {
    // Silent background handling
  }
};
