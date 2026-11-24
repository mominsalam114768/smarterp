/**
 * @license
 * @fileoverview Per-shop Google Sheets synchronization and automatic Google Sheet provisioning
 * SPDX-License-Identifier: Apache-2.0
 */

import { db, collection, doc, getDoc, getDocs, setDoc } from "./firebase";
import { getDriveAccessToken, clearInMemoryGoogleToken } from "./drive";
import { generateExcelWorkbook } from "./excelExport";
import {
  createNativeShopSpreadsheet,
  writeFullDataViaSheetsApi,
  syncSingleEntityViaSheetsApi,
  readAllDataViaSheetsApi,
  renameSpreadsheetViaSheetsApi,
  testSpreadsheetViaSheetsApi,
  tagSpreadsheetWithShopMetadata,
  findExistingShopSpreadsheetInDrive,
  ensureAllTabsExistAndOrdered
} from "./sheetsApiClient";

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
    approvals?: number;
    customers?: number;
    suppliers?: number;
    expenses?: number;
    dues?: number;
    smsLogs?: number;
    users?: number;
    categories?: number;
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
      // Prevent any secondary shop from accidentally inheriting main-business's spreadsheetId
      if (targetBizId !== "main-business" && parsed.spreadsheetId) {
        try {
          const mainRaw = localStorage.getItem(getStorageKey("main-business")) || localStorage.getItem(LEGACY_STORAGE_KEY);
          if (mainRaw) {
            const mainParsed = JSON.parse(mainRaw);
            const mainId = mainParsed?.spreadsheetId || extractSpreadsheetIdFromUrl(mainParsed?.sheetUrl);
            if (mainId && parsed.spreadsheetId === mainId) {
              parsed.spreadsheetId = "";
              parsed.sheetUrl = "";
              parsed.sheetName = "";
            }
          }
        } catch {}
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
  shop: { id: string; name: string; phone?: string; address?: string; currency?: string; defaultPrinter?: string },
  initialData?: any
): Promise<{ spreadsheetId: string; sheetUrl: string; sheetName: string } | null> => {
  const token = getDriveAccessToken();
  if (!token) return null;

  const sheetTitle = `${shop.name} - হিসাবপাতি ডাটাবেজ`;

  // 0. Preferred: Direct Google Sheets API v4 Creation (12 Bengali tabs, live formulas & formatting)
  try {
    const created = await createNativeShopSpreadsheet(token, shop, initialData);
    if (created?.spreadsheetId) {
      return created;
    }
  } catch (sheetsErr: any) {
    if (sheetsErr?.status === 401) {
      clearInMemoryGoogleToken();
    }
    console.warn("[Auto Sheet] Sheets API v4 creation failed, trying Drive API:", sheetsErr);
  }

  // 1. Fallback: Multipart Upload converting initial multi-tab workbook into a native Google Spreadsheet
  try {
    const workbookBlob = generateExcelWorkbook(
      initialData || {
        business: shop,
        products: [],
        customers: [],
        sales: [],
        suppliers: [],
        expenses: [],
        categories: [],
        users: [],
        approvalRequests: []
      }
    );

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
 * Uses Google Sheets API v4 / Drive API (direct OAuth) AND optionally Master Apps Script Web App.
 */
export const autoCreateShopGoogleSheet = async (
  shop: { id: string; name: string; phone?: string; address?: string; currency?: string; defaultPrinter?: string },
  customWebAppUrl?: string,
  initialData?: any
): Promise<GoogleSheetsConfig> => {
  const targetBizId = shop.id;
  const existingCfg = getLocalSheetsConfig(targetBizId);
  const masterUrl = (customWebAppUrl || existingCfg.webAppUrl || (await findMasterWebAppUrl()) || "").trim();

  let spreadsheetId = existingCfg.spreadsheetId || extractSpreadsheetIdFromUrl(existingCfg.sheetUrl) || "";
  let sheetUrl = existingCfg.sheetUrl || "";
  let sheetName = `${shop.name} - হিসাবপাতি ডাটাবেজ`;
  let syncSuccess = false;
  let syncMessage = "";

  // Step 1: Create a native 12-tab Google Spreadsheet via Google Sheets API v4 / Drive API if not created yet
  if (!spreadsheetId && !sheetUrl) {
    const driveSheet = await createGoogleSheetViaDriveApi(shop, initialData);
    if (driveSheet) {
      spreadsheetId = driveSheet.spreadsheetId;
      sheetUrl = driveSheet.sheetUrl;
      sheetName = driveSheet.sheetName;
      syncSuccess = true;
      syncMessage = "স্বয়ংক্রিয়ভাবে নতুন গুগল শিট তৈরি হয়ে শপের ডাটাবেজ হিসেবে সংযুক্ত হয়েছে";
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

export interface EnsureShopSheetOptions {
  allowCreateIfMissing?: boolean;
  forceRestoreFromSheet?: boolean;
  silentIfMissing?: boolean;
}

export interface EnsureShopSheetResult extends GoogleSheetsConfig {
  restoredFromSheetData?: any;
  connectionAction?: 'existing_verified' | 'reconnected_from_drive' | 'created_new';
}

const ensureShopSheetLocks = new Map<string, Promise<EnsureShopSheetResult | null>>();

/**
 * Redeploy-safe Google Sheet recognizer & binder for each shop:
 * 1. Checks Firestore & local config for this shop's existing spreadsheetId.
 * 2. If a Google token is active, verifies the spreadsheet exists (not 404/trashed) OR searches Google Drive
 *    for this shop's existing spreadsheet (`<Shop Name> - হিসাবপাতি ডাটাবেজ` or `appProperties.hishabpatiShopId`).
 * 3. If an existing sheet is found, binds it as the shop's database and reads back previous data if the shop is empty
 *    or was reconnected after a redeploy.
 * 4. If NO existing sheet is found in config or Google Drive:
 *    - If `options.allowCreateIfMissing === true` (e.g. brand-new shop creation or user confirmed modal), creates a new sheet.
 *    - Otherwise, dispatches `shop-sheet-missing-confirm` so the user can confirm before creating a new sheet.
 */
export const ensureShopGoogleSheet = async (
  shop: { id: string; name: string; phone?: string; address?: string; currency?: string; defaultPrinter?: string; googleSheetsConfig?: any },
  customWebAppUrl?: string,
  initialData?: any,
  options?: EnsureShopSheetOptions
): Promise<EnsureShopSheetResult | null> => {
  const targetBizId = shop?.id || currentSheetsBusinessId || "main-business";
  const existingLock = ensureShopSheetLocks.get(targetBizId);
  if (existingLock && !options?.allowCreateIfMissing && !options?.forceRestoreFromSheet) {
    return existingLock;
  }

  const run = (async (): Promise<EnsureShopSheetResult | null> => {
    try {
      const localCfg = getLocalSheetsConfig(targetBizId);
      const cloudCfg = await fetchCloudSheetsConfig(targetBizId);
      const shopEmbeddedCfg = shop?.googleSheetsConfig || {};

      // Guard against cross-shop sheet collision: a secondary shop must never share main-business's spreadsheetId
      const mainShopId =
        targetBizId !== "main-business"
          ? getLocalSheetsConfig("main-business").spreadsheetId ||
            extractSpreadsheetIdFromUrl(getLocalSheetsConfig("main-business").sheetUrl)
          : "";

      const sanitizeShopSheetId = (candidateId?: string): string => {
        const clean = (candidateId || "").trim();
        if (!clean) return "";
        if (targetBizId !== "main-business" && mainShopId && clean === mainShopId) {
          return "";
        }
        return clean;
      };

      // Permanently merge all known sources (cloud config, shop doc embedded config, local config) so a shop's sheet is NEVER lost
      const existingId =
        sanitizeShopSheetId(cloudCfg.spreadsheetId || extractSpreadsheetIdFromUrl(cloudCfg.sheetUrl)) ||
        sanitizeShopSheetId(shopEmbeddedCfg.spreadsheetId || extractSpreadsheetIdFromUrl(shopEmbeddedCfg.sheetUrl)) ||
        sanitizeShopSheetId(localCfg.spreadsheetId || extractSpreadsheetIdFromUrl(localCfg.sheetUrl)) ||
        "";

      const existingUrl = existingId
        ? `https://docs.google.com/spreadsheets/d/${existingId}/edit`
        : "";

      const existingName =
        cloudCfg.sheetName ||
        shopEmbeddedCfg.sheetName ||
        localCfg.sheetName ||
        `${shop?.name || "হিসাব পাতি"} - হিসাবপাতি ডাটাবেজ`;

      const cfg: GoogleSheetsConfig = {
        ...DEFAULT_CONFIG,
        ...localCfg,
        ...shopEmbeddedCfg,
        ...cloudCfg,
        spreadsheetId: existingId,
        sheetUrl: existingUrl,
        sheetName: existingName
      };

      const token = getDriveAccessToken();
      const masterUrl = (customWebAppUrl || cfg.webAppUrl || "").trim();

      // Check whether the shop currently has empty local/cloud records so we know if we should auto-hydrate from the sheet
      const shopHasNoRecords =
        !initialData ||
        ((!Array.isArray(initialData.products) || initialData.products.length === 0) &&
          (!Array.isArray(initialData.customers) || initialData.customers.length === 0) &&
          (!Array.isArray(initialData.sales) || initialData.sales.length === 0) &&
          (!Array.isArray(initialData.expenses) || initialData.expenses.length === 0));

      // 1. PERMANENT BINDING RULE: If this shop already has a linked spreadsheetId, keep it permanently bound to this shop!
      if (existingId && !options?.allowCreateIfMissing) {
        // Persist the merged binding back to both local and Firestore if any source was missing it
        if (!cloudCfg.spreadsheetId || !localCfg.spreadsheetId) {
          await saveSheetsConfig(cfg, targetBizId);
        }

        if (!token) {
          return { ...cfg, spreadsheetId: existingId, connectionAction: "existing_verified" };
        }

        try {
          const verified = await testSpreadsheetViaSheetsApi(token, existingId);
          // Tag in Drive so future redeploy always recognizes it
          await tagSpreadsheetWithShopMetadata(token, existingId, shop);
          await ensureAllTabsExistAndOrdered(token, existingId);

          const updatedCfg = await saveSheetsConfig(
            {
              ...cfg,
              spreadsheetId: existingId,
              sheetUrl: verified.spreadsheetUrl || existingUrl,
              sheetName: verified.spreadsheetName || existingName,
              autoSync: true,
              lastSyncStatus: "success",
              lastSyncMessage: "শপের নিজস্ব গুগল শিট ডাটাবেজ আজীবন সংযুক্ত আছে"
            },
            targetBizId
          );

          let restoredData: any = undefined;
          if (shopHasNoRecords || options?.forceRestoreFromSheet) {
            try {
              const sheetData = await readAllDataViaSheetsApi(token, existingId);
              const totalFound =
                (sheetData?.products?.length || 0) +
                (sheetData?.customers?.length || 0) +
                (sheetData?.sales?.length || 0) +
                (sheetData?.expenses?.length || 0) +
                (sheetData?.suppliers?.length || 0);
              if (totalFound > 0) {
                restoredData = sheetData;
              }
            } catch (readErr) {
              console.warn("[EnsureShopSheet] Could not read existing sheet for auto-restore:", readErr);
            }
          }

          return {
            ...updatedCfg,
            restoredFromSheetData: restoredData,
            connectionAction: "existing_verified"
          };
        } catch (verifyErr: any) {
          // Even if offline, token expired, or Drive scope restricted, NEVER wipe a shop's bound spreadsheetId
          // or show the "previous sheet not found" popup during normal shop switching!
          console.warn(`[EnsureShopSheet] Keeping permanent sheet binding (${existingId}) for shop ${targetBizId}:`, verifyErr);
          return {
            ...cfg,
            spreadsheetId: existingId,
            sheetUrl: existingUrl,
            sheetName: existingName,
            connectionAction: "existing_verified"
          };
        }
      }

      // 2. If no spreadsheetId was saved in config yet, search Google Drive for this shop's existing spreadsheet
      if (token) {
        const discovered = await findExistingShopSpreadsheetInDrive(token, shop);
        if (discovered?.spreadsheetId) {
          await ensureAllTabsExistAndOrdered(token, discovered.spreadsheetId);
          let restoredData: any = undefined;
          try {
            const sheetData = await readAllDataViaSheetsApi(token, discovered.spreadsheetId);
            const totalFound =
              (sheetData?.products?.length || 0) +
              (sheetData?.customers?.length || 0) +
              (sheetData?.sales?.length || 0) +
              (sheetData?.expenses?.length || 0) +
              (sheetData?.suppliers?.length || 0);
            if (totalFound > 0) {
              restoredData = sheetData;
            } else if (initialData && !shopHasNoRecords) {
              await writeFullDataViaSheetsApi(token, discovered.spreadsheetId, initialData);
            }
          } catch (readErr) {
            console.warn("[EnsureShopSheet] Error reading discovered Drive spreadsheet:", readErr);
          }

          const reconnectedCfg = await saveSheetsConfig(
            {
              ...cfg,
              webAppUrl: masterUrl,
              spreadsheetId: discovered.spreadsheetId,
              sheetUrl: discovered.sheetUrl,
              sheetName: discovered.sheetName,
              autoSync: true,
              lastSyncAt: new Date().toISOString(),
              lastSyncStatus: "success",
              lastSyncMessage: "পূর্বের গুগল শিট স্বয়ংক্রিয়ভাবে শনাক্ত ও ডাটাবেজ হিসেবে স্থায়ীভাবে সংযুক্ত হয়েছে"
            },
            targetBizId
          );

          return {
            ...reconnectedCfg,
            restoredFromSheetData: restoredData,
            connectionAction: "reconnected_from_drive"
          };
        }
      }

      // 3. No existing Google Sheet found in Firestore config, localStorage, or Google Drive
      if (!token && !masterUrl) {
        return null;
      }

      // Automatically create and permanently bind the shop's dedicated Google Sheet so the user is never nagged
      // when switching shops or logging into the initial shop!
      const created = await autoCreateShopGoogleSheet(shop, masterUrl || undefined, initialData);
      if (initialData && (created.spreadsheetId || created.webAppUrl)) {
        try {
          await syncAllToGoogleSheets(initialData, created.webAppUrl || undefined, targetBizId);
        } catch {}
      }
      return {
        ...created,
        connectionAction: "created_new"
      };
    } catch (err) {
      console.warn(`[EnsureShopSheet] Could not ensure Google Sheet for ${targetBizId}:`, err);
      return null;
    } finally {
      ensureShopSheetLocks.delete(targetBizId);
    }
  })();

  ensureShopSheetLocks.set(targetBizId, run);
  return run;
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

  // 1. Rename via Google Sheets API v4 & Drive API v3 if token and spreadsheetId are available
  const token = getDriveAccessToken();
  if (token && spreadsheetId) {
    try {
      await renameSpreadsheetViaSheetsApi(token, spreadsheetId, newSheetTitle, updatedBusiness);
    } catch (sheetsRenErr) {
      console.warn("[RenameShopSheet] Sheets API rename skipped:", sheetsRenErr);
    }
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
  const localCfg = getLocalSheetsConfig(targetBizId);
  const localId = localCfg.spreadsheetId || extractSpreadsheetIdFromUrl(localCfg.sheetUrl);

  try {
    const [cfgSnap, bizSnap] = await Promise.all([
      getDoc(doc(db, "businesses", targetBizId, "config", "google_sheets")).catch(() => null),
      getDoc(doc(db, "businesses", targetBizId)).catch(() => null)
    ]);

    const subData = cfgSnap && cfgSnap.exists() ? (cfgSnap.data() as GoogleSheetsConfig) : null;
    const bizEmbedded =
      bizSnap && bizSnap.exists() && bizSnap.data()?.googleSheetsConfig
        ? (bizSnap.data()?.googleSheetsConfig as GoogleSheetsConfig)
        : null;

    const subId = subData?.spreadsheetId || extractSpreadsheetIdFromUrl(subData?.sheetUrl);
    const bizId = bizEmbedded?.spreadsheetId || extractSpreadsheetIdFromUrl(bizEmbedded?.sheetUrl);

    const mainId =
      targetBizId !== "main-business"
        ? getLocalSheetsConfig("main-business").spreadsheetId ||
          extractSpreadsheetIdFromUrl(getLocalSheetsConfig("main-business").sheetUrl)
        : "";

    const rawCandidateId = subId || bizId || localId || "";
    const resolvedSpreadsheetId =
      targetBizId !== "main-business" && mainId && rawCandidateId === mainId
        ? ""
        : rawCandidateId;
    const resolvedSheetUrl = resolvedSpreadsheetId
      ? `https://docs.google.com/spreadsheets/d/${resolvedSpreadsheetId}/edit`
      : "";
    const resolvedSheetName =
      resolvedSpreadsheetId
        ? subData?.sheetName ||
          bizEmbedded?.sheetName ||
          localCfg.sheetName ||
          ""
        : "";

    let webAppUrl = (subData?.webAppUrl || bizEmbedded?.webAppUrl || localCfg.webAppUrl || "").trim();
    if (!webAppUrl) {
      webAppUrl = await findMasterWebAppUrl();
    }

    if (subData || bizEmbedded || localId) {
      const merged: GoogleSheetsConfig = {
        ...DEFAULT_CONFIG,
        ...localCfg,
        ...(bizEmbedded || {}),
        ...(subData || {}),
        webAppUrl,
        spreadsheetId: resolvedSpreadsheetId,
        sheetUrl: resolvedSheetUrl,
        sheetName: resolvedSheetName
      };
      saveLocalSheetsConfig(merged, targetBizId);
      return merged;
    }
  } catch (err) {
    console.warn("Failed to fetch cloud Google Sheets config:", err);
  }
  return localCfg;
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
  const incomingId = config.spreadsheetId || extractSpreadsheetIdFromUrl(config.sheetUrl);
  const existingId = current.spreadsheetId || extractSpreadsheetIdFromUrl(current.sheetUrl);
  const resolvedId = incomingId || existingId || "";
  const resolvedUrl =
    config.sheetUrl ||
    current.sheetUrl ||
    (resolvedId ? `https://docs.google.com/spreadsheets/d/${resolvedId}/edit` : "");

  const merged: GoogleSheetsConfig = {
    ...current,
    ...config,
    spreadsheetId: resolvedId,
    sheetUrl: resolvedUrl,
    sheetName: config.sheetName || current.sheetName || ""
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
 * Test connectivity with Google Sheets (supports both direct Google Sheets API v4 & Apps Script Web App)
 */
export const testGoogleSheetsConnection = async (
  webAppUrl: string,
  businessId: string = currentSheetsBusinessId
): Promise<{ success: boolean; message: string; sheetName?: string; spreadsheetId?: string; sheetUrl?: string }> => {
  const cleanUrl = (webAppUrl || "").trim();
  const targetBizId = businessId || currentSheetsBusinessId || "main-business";
  const config = getLocalSheetsConfig(targetBizId);
  const token = getDriveAccessToken();
  const spreadsheetId = config.spreadsheetId || extractSpreadsheetIdFromUrl(config.sheetUrl) || extractSpreadsheetIdFromUrl(cleanUrl);

  // 1. If Google OAuth access token & spreadsheetId are available, test directly via Google Sheets API v4
  if (token && spreadsheetId && (!cleanUrl || cleanUrl.includes("docs.google.com/spreadsheets"))) {
    const info = await testSpreadsheetViaSheetsApi(token, spreadsheetId);
    await saveSheetsConfig({
      spreadsheetId: info.spreadsheetId,
      sheetUrl: info.spreadsheetUrl,
      sheetName: info.spreadsheetName
    }, targetBizId);
    return {
      success: true,
      message: `গুগল শিট API সংযোগ সফল! (${info.tabCount}টি ট্যাব পাওয়া গেছে)`,
      sheetName: info.spreadsheetName,
      spreadsheetId: info.spreadsheetId,
      sheetUrl: info.spreadsheetUrl
    };
  }

  if (!cleanUrl) {
    if (token && spreadsheetId) {
      const info = await testSpreadsheetViaSheetsApi(token, spreadsheetId);
      return {
        success: true,
        message: `সরাসরি গুগল শিট ডাটাবেজ সংযোগ সফল! (${info.tabCount}টি ট্যাব)`,
        sheetName: info.spreadsheetName,
        spreadsheetId: info.spreadsheetId,
        sheetUrl: info.spreadsheetUrl
      };
    }
    throw new Error("গুগল দিয়ে সাইন-ইন করুন অথবা Apps Script Web App URL প্রদান করুন।");
  }

  const queryParams = new URLSearchParams({
    action: "ping",
    businessId: targetBizId
  });
  if (spreadsheetId) {
    queryParams.set("spreadsheetId", spreadsheetId);
  }

  const pingUrl = cleanUrl.includes("?") 
    ? `${cleanUrl}&${queryParams.toString()}` 
    : `${cleanUrl}?${queryParams.toString()}`;

  try {
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

    if (token && spreadsheetId) {
      const info = await testSpreadsheetViaSheetsApi(token, spreadsheetId);
      return {
        success: true,
        message: `সরাসরি গুগল শিট API সংযোগ সফল! (${info.tabCount}টি ট্যাব)`,
        sheetName: info.spreadsheetName,
        spreadsheetId: info.spreadsheetId,
        sheetUrl: info.spreadsheetUrl
      };
    }

    throw new Error(
      "গুগল শিটে সংযোগ করা যায়নি। Google দিয়ে সাইন-ইন করুন অথবা Apps Script 'Anyone' অ্যাক্সেস যাচাই করুন।"
    );
  }
};

/**
 * Full Database Synchronization to Google Sheets (All 12 Bengali tabs) for the active shop.
 * Automatically uses Native Google Sheets REST API v4 when signed in with Google, plus Apps Script if configured.
 */
export const syncAllToGoogleSheets = async (
  allData: any, 
  customUrl?: string,
  businessId: string = currentSheetsBusinessId
): Promise<{ success: boolean; message: string; counts?: any; sheetUrl?: string; spreadsheetId?: string }> => {
  const targetBizId = businessId || currentSheetsBusinessId || "main-business";
  const config = getLocalSheetsConfig(targetBizId);
  let targetUrl = (customUrl || config.webAppUrl || "").trim();
  const token = getDriveAccessToken();

  if (!targetUrl && !token) {
    targetUrl = await findMasterWebAppUrl();
  }

  const shopName = allData?.business?.name || config.sheetName || targetBizId;
  let spreadsheetId = config.spreadsheetId || extractSpreadsheetIdFromUrl(config.sheetUrl);
  let sheetUrl = config.sheetUrl || (spreadsheetId ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit` : "");
  let sheetName = config.sheetName || `${shopName} - হিসাবপাতি ডাটাবেজ`;

  let success = false;
  let responseData: any = null;
  let errorMsg = "";

  // 1. Preferred: Native Google Sheets API v4 using in-memory OAuth accessToken
  if (token) {
    try {
      if (!spreadsheetId) {
        const created = await createNativeShopSpreadsheet(
          token,
          allData?.business || { id: targetBizId, name: shopName },
          allData
        );
        spreadsheetId = created.spreadsheetId;
        sheetUrl = created.sheetUrl;
        sheetName = created.sheetName;
        success = true;
        responseData = {
          spreadsheetId,
          spreadsheetUrl: sheetUrl,
          spreadsheetName: sheetName,
          message: `"${shopName}" এর জন্য নতুন গুগল শিট তৈরি ও ১২টি বাংলা ট্যাবে ডাটা সিঙ্ক হয়েছে!`,
          details: {
            products: allData.products?.length || 0,
            sales: allData.sales?.length || 0,
            approvals: allData.approvalRequests?.length || 0,
            customers: allData.customers?.length || 0,
            suppliers: allData.suppliers?.length || 0,
            expenses: allData.expenses?.length || 0,
            dues: (allData.customers || []).filter((c: any) => (Number(c.dueAmount) || 0) !== 0).length,
            smsLogs: allData.smsLogs?.length || 0,
            users: allData.users?.length || 0,
            categories: allData.categories?.length || 0
          }
        };
      } else {
        const apiRes = await writeFullDataViaSheetsApi(token, spreadsheetId, allData);
        success = true;
        responseData = {
          spreadsheetId: apiRes.spreadsheetId,
          spreadsheetUrl: sheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
          spreadsheetName: sheetName,
          message: "সরাসরি Google Sheets API দিয়ে ১২টি বাংলা ট্যাবে সমস্ত ডাটা সিঙ্ক হয়েছে!",
          details: apiRes.details
        };
      }
    } catch (apiErr: any) {
      if (apiErr?.status === 401) {
        clearInMemoryGoogleToken();
        errorMsg = "গুগল সেশন মেয়াদ শেষ হয়েছে। অনুগ্রহ করে পুনরায় 'Sign in with Google' করুন।";
      } else {
        errorMsg = apiErr?.message || String(apiErr);
      }
      console.warn("[Sheets Sync API v4] Warning:", apiErr);
    }
  }

  // 2. Fallback or Secondary: Apps Script Web App if configured
  if (targetUrl && !success) {
    const payload = {
      action: "fullSync",
      businessId: targetBizId,
      shopName,
      spreadsheetId: spreadsheetId || undefined,
      timestamp: new Date().toISOString(),
      data: allData
    };
    const jsonStr = JSON.stringify(payload);

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
  }

  if (!success && !token && !targetUrl) {
    throw new Error("গুগল শিটে ডাটা পাঠাতে একবার 'Sign in with Google' বাটনে ক্লিক করে গুগল শিট সংযুক্ত করুন (অথবা Apps Script URL দিন)।");
  }

  // Record sync status for this specific shop
  const now = new Date().toISOString();
  if (success) {
    const returnedSheetId = responseData?.spreadsheetId || spreadsheetId;
    const returnedSheetUrl = responseData?.spreadsheetUrl || sheetUrl || (returnedSheetId ? `https://docs.google.com/spreadsheets/d/${returnedSheetId}/edit` : "");
    const returnedSheetName = responseData?.spreadsheetName || sheetName;

    await saveSheetsConfig({
      webAppUrl: targetUrl,
      spreadsheetId: returnedSheetId,
      sheetUrl: returnedSheetUrl,
      sheetName: returnedSheetName,
      lastSyncAt: now,
      lastSyncStatus: 'success',
      lastSyncMessage: responseData?.message || 'সফলভাবে গুগল শিটের সকল ট্যাবে ডাটা সিঙ্ক হয়েছে',
      lastSyncCount: responseData?.details || {
        products: allData.products?.length || 0,
        sales: allData.sales?.length || 0,
        approvals: allData.approvalRequests?.length || 0,
        customers: allData.customers?.length || 0,
        suppliers: allData.suppliers?.length || 0,
        expenses: allData.expenses?.length || 0,
        dues: (allData.customers || []).filter((c: any) => (Number(c.dueAmount) || 0) !== 0).length,
        smsLogs: allData.smsLogs?.length || 0,
        users: allData.users?.length || 0,
        categories: allData.categories?.length || 0
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
 * Fetch all records from Google Sheets for 1-click restore / database load for the active shop
 */
export const fetchDataFromGoogleSheets = async (customUrl?: string, businessId: string = currentSheetsBusinessId): Promise<any> => {
  const targetBizId = businessId || currentSheetsBusinessId || "main-business";
  const config = getLocalSheetsConfig(targetBizId);
  const targetUrl = (customUrl || config.webAppUrl || "").trim();
  const spreadsheetId = config.spreadsheetId || extractSpreadsheetIdFromUrl(config.sheetUrl);
  const token = getDriveAccessToken();

  // 1. Direct read via Google Sheets REST API v4
  if (token && spreadsheetId) {
    try {
      const sheetData = await readAllDataViaSheetsApi(token, spreadsheetId);
      if (sheetData) {
        return sheetData;
      }
    } catch (apiErr: any) {
      if (apiErr?.status === 401) {
        clearInMemoryGoogleToken();
      }
      console.warn("[Sheets Restore API v4] Failed, trying Apps Script fallback:", apiErr);
    }
  }

  if (!targetUrl) {
    throw new Error("গুগল শিট থেকে ডাটা আনতে অনুগ্রহ করে প্রথমে 'Sign in with Google' করুন অথবা Web App URL সেট করুন।");
  }

  const queryParams = new URLSearchParams({
    action: "fetchData",
    businessId: targetBizId
  });
  if (spreadsheetId) {
    queryParams.set("spreadsheetId", spreadsheetId);
  }

  const fetchUrl = targetUrl.includes("?") 
    ? `${targetUrl}&${queryParams.toString()}` 
    : `${targetUrl}?${queryParams.toString()}`;

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

  try {
    const proxyRes = await fetch(`/api/sheets/proxy?url=${encodeURIComponent(fetchUrl)}`);
    if (proxyRes.ok) {
      const pData = await proxyRes.json();
      if (pData && (Array.isArray(pData.products) || Array.isArray(pData.customers))) {
        return pData;
      }
    }
  } catch (pErr) {}

  throw new Error("গুগল শিট থেকে ডাটা রিড করা সম্ভব হয়নি। শিটে সঠিক ডাটা রয়েছে কিনা এবং সংযোগ সচল আছে কিনা যাচাই করুন।");
};

/**
 * Real-time background sync for single entities (strictly isolated to the active shop's Google Sheet).
 * Uses Google Sheets API v4 directly when signed in, plus Apps Script Web App fallback if configured.
 */
export const syncEntityToGoogleSheets = async (
  entityType: 'product' | 'sale' | 'approval' | 'customer' | 'supplier' | 'expense' | 'payment' | 'sms' | 'user' | 'category',
  item: any,
  operation: 'upsert' | 'delete' = 'upsert',
  businessId: string = currentSheetsBusinessId
) => {
  const targetBizId = businessId || currentSheetsBusinessId || "main-business";
  let config = getLocalSheetsConfig(targetBizId);

  if ((!config.webAppUrl && !config.spreadsheetId) || (!config.spreadsheetId && targetBizId !== "main-business")) {
    try {
      config = await fetchCloudSheetsConfig(targetBizId);
    } catch {}
  }

  if (config.autoSync === false) {
    return;
  }

  const token = getDriveAccessToken();
  const spreadsheetId = config.spreadsheetId || extractSpreadsheetIdFromUrl(config.sheetUrl);

  // 1. Direct real-time Google Sheets API v4 sync
  if (token && spreadsheetId) {
    syncSingleEntityViaSheetsApi(token, spreadsheetId, entityType, item, operation)
      .then(() => {
        saveLocalSheetsConfig({
          ...config,
          lastSyncAt: new Date().toISOString(),
          lastSyncStatus: "success",
          lastSyncMessage: "লাইভ Google Sheets API ডাটাবেজ আপডেট হয়েছে"
        }, targetBizId);
      })
      .catch((err: any) => {
        if (err?.status === 401) {
          clearInMemoryGoogleToken();
        }
        console.warn("[Live Sheets API Sync] Warning:", err);
      });
  }

  // 2. Also trigger Apps Script Web App if configured
  if (!config.webAppUrl) {
    return;
  }

  const actionMap: Record<string, string> = {
    product: 'syncProduct',
    sale: 'syncSale',
    approval: 'syncApproval',
    customer: 'syncCustomer',
    supplier: 'syncSupplier',
    expense: 'syncExpense',
    payment: 'recordPayment',
    sms: 'syncSMS',
    user: 'syncUser',
    category: 'syncCategory'
  };

  const action = actionMap[entityType] || 'syncProduct';

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
