/**
 * @license
 * @fileoverview Direct Google Sheets REST API v4 & Drive v3 database engine for Multi-Shop ERP.
 * Enables creating a dedicated Google Sheet per shop automatically on shop creation and reading/writing
 * all 12 Bengali Slide Menu tabs directly without requiring manual Google Apps Script setup.
 * SPDX-License-Identifier: Apache-2.0
 */

import { formatDhakaDate, formatDhakaDateTime } from "./utils";

export const SHEET_TABS = {
  DASHBOARD: "ড্যাশবোর্ড",
  SALES: "বিক্রয় ও মেমো",
  APPROVALS: "বিক্রয় অর্ডার",
  PRODUCTS: "পণ্য তালিকা",
  CATEGORIES: "ক্যাটাগরি",
  CUSTOMERS: "ক্রেতা",
  SUPPLIERS: "সরবরাহকারী",
  EXPENSES: "হিসাব ও খরচ",
  DUES: "বকেয়া খাতা",
  SMS_LOGS: "এসএমএস লগ",
  USERS: "ইউজার ও স্টাফ",
  SETTINGS: "প্রতিষ্ঠান সেটিংস"
} as const;

export const ORDERED_TAB_LIST = [
  SHEET_TABS.DASHBOARD,
  SHEET_TABS.SALES,
  SHEET_TABS.APPROVALS,
  SHEET_TABS.PRODUCTS,
  SHEET_TABS.CATEGORIES,
  SHEET_TABS.CUSTOMERS,
  SHEET_TABS.SUPPLIERS,
  SHEET_TABS.EXPENSES,
  SHEET_TABS.DUES,
  SHEET_TABS.SMS_LOGS,
  SHEET_TABS.USERS,
  SHEET_TABS.SETTINGS
];

const TAB_HEADER_COLORS: Record<string, { red: number; green: number; blue: number }> = {
  [SHEET_TABS.DASHBOARD]: { red: 0.118, green: 0.227, blue: 0.541 },
  [SHEET_TABS.SALES]: { red: 0.427, green: 0.157, blue: 0.851 },
  [SHEET_TABS.APPROVALS]: { red: 0.706, green: 0.325, blue: 0.035 },
  [SHEET_TABS.PRODUCTS]: { red: 0.059, green: 0.463, blue: 0.431 },
  [SHEET_TABS.CATEGORIES]: { red: 0.012, green: 0.412, blue: 0.631 },
  [SHEET_TABS.CUSTOMERS]: { red: 0.114, green: 0.306, blue: 0.847 },
  [SHEET_TABS.SUPPLIERS]: { red: 0.263, green: 0.220, blue: 0.792 },
  [SHEET_TABS.EXPENSES]: { red: 0.745, green: 0.071, blue: 0.235 },
  [SHEET_TABS.DUES]: { red: 0.600, green: 0.106, blue: 0.106 },
  [SHEET_TABS.SMS_LOGS]: { red: 0.055, green: 0.455, blue: 0.565 },
  [SHEET_TABS.USERS]: { red: 0.200, green: 0.255, blue: 0.333 },
  [SHEET_TABS.SETTINGS]: { red: 0.118, green: 0.161, blue: 0.231 }
};

export const HEADERS = {
  SALES: [
    "মেমো নং (Invoice)", "তারিখ ও সময় (ঢাকা)", "ক্রেতার নাম", "মোবাইল", "পণ্যের বিবরণ",
    "মোট টাকা (৳)", "ছাড় (৳)", "ভ্যাট (৳)", "প্রদেয় বিল (৳)", "নগদ জমা (৳)",
    "বকেয়া পরিমাণ (৳)", "ক্রেতা পাবে / অ্যাডভান্স (৳)", "নিট ব্যালেন্স (৳)",
    "পেমেন্ট মাধ্যম", "মেমোর অবস্থা", "বিক্রয়কর্মী", "ক্রেতার আইডি", "বিক্রয় আইডি", "র কালেকশন JSON"
  ],
  APPROVALS: [
    "রিকুয়েস্ট আইডি", "তারিখ ও সময় (ঢাকা)", "রিকুয়েস্টের ধরন", "টেম্পোরারি ভাউচার/মেমো",
    "চূড়ান্ত মেমো নং", "সেলসম্যানের নাম", "ক্রেতার নাম", "ক্রেতার মোবাইল",
    "মোট বিল / জমার পরিমাণ (৳)", "নগদ জমা (৳)", "বকেয়া / ব্যালেন্স (৳)",
    "বর্তমান স্ট্যাটাস", "সিদ্ধান্ত গ্রহণকারী", "সিদ্ধান্তের সময়", "বিস্তারিত JSON"
  ],
  PRODUCTS: [
    "আইডি (ID)", "পণ্যের নাম", "বাংলা নাম", "SKU", "বারকোড", "ক্যাটাগরি",
    "ক্রয়মূল্য (৳)", "বিক্রয়মূল্য (৳)", "বর্তমান স্টক", "সর্বনিম্ন স্টক",
    "একক", "স্টকের অবস্থা", "পণ্যের ধরন", "মেয়াদ উত্তীর্ণের তারিখ"
  ],
  CATEGORIES: ["ক্যাটাগরি আইডি", "ক্যাটাগরির নাম", "বিবরণ"],
  CUSTOMERS: [
    "ক্রেতার আইডি", "ক্রেতার নাম", "মোবাইল নম্বর", "ঠিকানা",
    "বকেয়া পরিমাণ (৳)", "ক্রেতা পাবে / অ্যাডভান্স (৳)", "নিট ব্যালেন্স (৳)",
    "হিসাবের অবস্থা", "সর্বমোট কেনাকাটা (৳)", "ইউজার আইডি (CreatedBy)", "নিবন্ধন তারিখ"
  ],
  SUPPLIERS: [
    "সরবরাহকারী আইডি", "নাম", "কোম্পানির নাম", "মোবাইল নম্বর", "ঠিকানা",
    "আমাদের বর্তমান দেনা (৳)", "দেনার অবস্থা", "সর্বশেষ তারিখ"
  ],
  EXPENSES: [
    "খরচ আইডি", "তারিখ (ঢাকা সময়)", "খরচের খাত (Category)", "টাকার পরিমাণ (৳)",
    "বিবরণ / নোট", "এন্ট্রিকারী (ইউজার)", "হিসাবের ধরন", "ইউজার আইডি"
  ],
  DUES: [
    "ক্রমিক", "ক্রেতার আইডি", "ক্রেতার নাম", "মোবাইল নম্বর", "ঠিকানা",
    "বকেয়া পরিমাণ (৳)", "ক্রেতা পাবে / অ্যাডভান্স (৳)", "নিট ব্যালেন্স (৳)",
    "মোট ক্রয় (৳)", "হিসাবের অবস্থা", "তাগাদা স্ট্যাটাস"
  ],
  SMS_LOGS: ["এসএমএস আইডি", "তারিখ ও সময় (ঢাকা)", "প্রাপকের মোবাইল নম্বর", "বার্তা (Message)", "স্ট্যাটাস"],
  USERS: ["ইউজার আইডি", "নাম", "ইমেইল", "মোবাইল", "রোল (Role)", "শপ আইডি (BusinessId)"],
  SETTINGS: ["সেটিংস প্যারামিটার", "মান / কনফিগারেশন"]
};

const isOtherProductItem = (p: any): boolean => {
  if (!p) return false;
  if (p.isCustomPrice === true || p.isCustomProduct === true) return true;
  const n = String(p.name || "").trim();
  const bn = String(p.bnName || "").trim();
  return (
    n === "অন্যান্য" ||
    n === "অন্যন্য" ||
    bn === "অন্যান্য" ||
    bn === "অন্যন্য" ||
    n.toLowerCase() === "other" ||
    n.toLowerCase() === "others"
  );
};

// ---------------- Row Builders ----------------

export const buildDashboardRows = (biz: any = {}) => [
  ["📊 হিসাবপাতি ERP — ড্যাশবোর্ড, জমা-খরচ ও সার্বিক রিপোর্ট", "", "", ""],
  ["🏪 প্রতিষ্ঠানের নাম", biz.name || "হিসাবপাতি ERP", `শপ আইডি: ${biz.id || "main-business"}`, "সক্রিয়"],
  ["📍 ঠিকানা ও মোবাইল", `${biz.address || ""} | ${biz.phone || ""}`, "সর্বশেষ সিঙ্ক", formatDhakaDateTime(new Date())],
  ["বিষয় / মেট্রিক", "বর্তমান মান / ব্যালেন্স", "বিবরণ ও সূত্র", "স্থিতি"],
  ["💰 মোট বিক্রয় আয় (জমা - চূড়ান্ত মেমো)", `=SUMIF('${SHEET_TABS.SALES}'!O:O,"চূড়ান্ত মেমো",'${SHEET_TABS.SALES}'!I:I)`, "চূড়ান্ত মেমোর মোট বিল", "মোট আয়"],
  ["💵 মোট নগদ আদায় (Paid Cash In)", `=SUMIF('${SHEET_TABS.SALES}'!O:O,"চূড়ান্ত মেমো",'${SHEET_TABS.SALES}'!J:J)`, "বিক্রয় থেকে নগদ প্রাপ্ত টাকা", "ক্যাশ ইন"],
  ["💸 মোট ব্যয় / খরচ (Expenses Out)", `=SUM('${SHEET_TABS.EXPENSES}'!D2:D)`, "হিসাব ও খরচ ট্যাবের সকল ব্যয়", "ক্যাশ আউট"],
  ["🏦 নিট ব্যালেন্স (মোট আয় - মোট ব্যয়)", `=B5-B7`, "হিসাব-নিকাশ (জমা-খরচ) নিট ব্যালেন্স", "হিসাব-নিকাশ"],
  ["💼 নগদ ক্যাশ উদ্বৃত্ত (নগদ জমা - খরচ)", `=B6-B7`, "হাতে থাকা নগদ ক্যাশ ব্যালেন্স", "ক্যাশবুক"],
  ["🔴 মোট পাওনা বকেয়া (বকেয়া পরিমাণ)", `=SUM('${SHEET_TABS.CUSTOMERS}'!E2:E)`, "ক্রেতাদের কাছে মোট পাওনা বকেয়া", "আদায়যোগ্য"],
  ["🟢 মোট ক্রেতা পাবে (অ্যাডভান্স জমা)", `=SUM('${SHEET_TABS.CUSTOMERS}'!F2:F)`, "ক্রেতাদের অতিরিক্ত অ্যাডভান্স জমা", "ক্রেতা পাবে"],
  ["🏭 সরবরাহকারীর কাছে দেনা (সাপ্লায়ার)", `=SUM('${SHEET_TABS.SUPPLIERS}'!F2:F)`, "সরবরাহকারীদের প্রদেয় বকেয়া", "পরিশোধযোগ্য"],
  ["📦 সর্বমোট পণ্যের সংখ্যা", `=MAX(0,COUNTA('${SHEET_TABS.PRODUCTS}'!A2:A))`, "মোট নিবন্ধিত পণ্য", "ইনভেন্টরি"],
  ["⚠️ কম স্টক ও স্টক শেষ পণ্য", `=COUNTIF('${SHEET_TABS.PRODUCTS}'!L2:L,"কম স্টক")+COUNTIF('${SHEET_TABS.PRODUCTS}'!L2:L,"স্টক শেষ")`, "অন্যান্য পণ্য বাদে সতর্কতা", "রি-অর্ডার"],
  ["⏳ অপেক্ষমান বিক্রয় অর্ডার", `=COUNTIF('${SHEET_TABS.APPROVALS}'!L2:L,"অপেক্ষমান (Pending)")`, "সেলসম্যানের পেন্ডিং বিক্রয় অর্ডার", "পর্যালোচনা"]
];

export const buildSaleRow = (s: any): any[] => {
  const itemsSummary = Array.isArray(s.items)
    ? s.items.map((it: any) => `${it.name || "পণ্য"} (${it.quantity || 1} x ${it.unitPrice || 0}৳)`).join("; ")
    : "";
  const payMethod = s.paymentMethod === "mobile_pay" ? "বিকাশ/নগদ" : s.paymentMethod === "card" ? "কার্ড" : "নগদ ক্যাশ";
  const payable = Number(s.payableAmount ?? s.totalAmount) || 0;
  const paid = Number(s.paidAmount) || 0;
  const netDue = s.dueAmount !== undefined && s.dueAmount !== null && !Number.isNaN(Number(s.dueAmount))
    ? Number(s.dueAmount)
    : payable - paid;
  let memoStatus = "চূড়ান্ত মেমো";
  if (s.approvalStatus === "rejected") {
    memoStatus = "বাতিলকৃত (Rejected)";
  } else if (s.isTemporary || s.approvalStatus === "pending" || String(s.invoiceNo || "").startsWith("TMP-")) {
    memoStatus = "TEMPORARY (অনুমোদনের অপেক্ষায়)";
  }

  return [
    String(s.invoiceNo || s.id || ""),
    s.createdAt ? formatDhakaDateTime(s.createdAt) : formatDhakaDateTime(new Date()),
    s.customerName || "ক্রেতা",
    s.customerPhone || "",
    itemsSummary,
    Number(s.totalAmount) || payable,
    Number(s.discount) || 0,
    Number(s.vat) || 0,
    payable,
    paid,
    netDue > 0 ? netDue : 0,
    netDue < 0 ? Math.abs(netDue) : 0,
    netDue,
    payMethod,
    memoStatus,
    s.userName || s.userId || "এডমিন",
    String(s.customerId || ""),
    String(s.id || s.invoiceNo || ""),
    JSON.stringify(s.items || [])
  ];
};

export const buildApprovalRow = (req: any): any[] => {
  const isSale = req.type === "sale";
  const sData = req.saleData || {};
  const pData = req.paymentData || {};
  const statusLabel =
    req.status === "approved"
      ? "অনুমোদিত (Approved)"
      : req.status === "rejected"
      ? "বাতিলকৃত (Rejected)"
      : "অপেক্ষমান (Pending)";

  return [
    String(req.id || ""),
    req.createdAt ? formatDhakaDateTime(req.createdAt) : formatDhakaDateTime(new Date()),
    isSale ? "বিক্রয় অর্ডার (POS)" : "বকেয়া / জমা অর্ডার",
    req.temporaryInvoiceNo || "",
    req.finalInvoiceNo || "-",
    req.userName || "সেলসম্যান",
    isSale ? sData.customerName || "ক্রেতা" : pData.customerName || "ক্রেতা",
    isSale ? sData.customerPhone || "" : pData.customerPhone || "",
    isSale ? Number(sData.payableAmount ?? sData.totalAmount) || 0 : Number(pData.amount) || 0,
    isSale ? Number(sData.paidAmount) || 0 : Number(pData.amount) || 0,
    isSale ? Number(sData.dueAmount) || 0 : (Number(pData.currentDueBefore) || 0) - (Number(pData.amount) || 0),
    statusLabel,
    req.reviewedBy || "-",
    req.reviewedAt ? formatDhakaDateTime(req.reviewedAt) : "-",
    JSON.stringify(req)
  ];
};

export const buildProductRow = (p: any): any[] => {
  const isOther = isOtherProductItem(p);
  const stock = isOther ? 0 : Number(p.stock) || 0;
  const minStock = isOther ? 0 : Number(p.minStock) || 5;
  const status = isOther
    ? "স্টক প্রযোজ্য নয় (ইচ্ছেমতো মূল্য)"
    : stock <= 0
    ? "স্টক শেষ"
    : stock <= minStock
    ? "কম স্টক"
    : "পর্যাপ্ত স্টক";

  return [
    String(p.id || ""),
    p.name || "",
    p.bnName || p.name || "",
    p.sku || "",
    p.barcode || (Array.isArray(p.barcodes) ? p.barcodes.join(", ") : ""),
    p.categoryId || (isOther ? "অন্যান্য" : "সাধারণ"),
    Number(p.purchasePrice) || 0,
    Number(p.salePrice) || 0,
    stock,
    minStock,
    p.unit || "পিস",
    status,
    isOther ? "অন্যান্য (কাস্টম মূল্য)" : "সাধারণ পণ্য",
    p.expiryDate || ""
  ];
};

export const buildCategoryRow = (cat: any): any[] => [
  String(cat.id || ""),
  cat.name || "",
  cat.description || ""
];

export const buildCustomerRow = (c: any): any[] => {
  const bal = Number(c.dueAmount) || 0;
  return [
    String(c.id || ""),
    c.name || "ক্রেতা",
    c.phone || "",
    c.address || "",
    bal > 0 ? bal : 0,
    bal < 0 ? Math.abs(bal) : 0,
    bal,
    bal < 0 ? "ক্রেতা পাবে" : bal > 0 ? "বকেয়া পরিমাণ" : "পরিশোধিত",
    Number(c.totalSpent) || 0,
    String(c.createdBy || "admin-1"),
    c.createdAt ? formatDhakaDate(c.createdAt) : ""
  ];
};

export const buildSupplierRow = (sup: any): any[] => {
  const due = Number(sup.dueAmount) || 0;
  return [
    String(sup.id || ""),
    sup.name || "সরবরাহকারী",
    sup.company || "",
    sup.phone || "",
    sup.address || "",
    due,
    due > 0 ? "দেনা আছে (পরিশোধযোগ্য)" : "পরিশোধিত",
    sup.createdAt ? formatDhakaDate(sup.createdAt) : ""
  ];
};

export const buildExpenseRow = (e: any): any[] => [
  String(e.id || ""),
  e.date ? formatDhakaDate(e.date) : formatDhakaDate(new Date()),
  e.category || "সাধারণ খরচ",
  Number(e.amount) || 0,
  e.note || e.description || "",
  e.userName || e.userId || "এডমিন",
  "ব্যয় / খরচ (Expense)",
  String(e.userId || "admin-1")
];

export const buildDuesRows = (customers: any[]): any[][] => {
  const active = (customers || [])
    .filter((c: any) => (Number(c.dueAmount) || 0) !== 0)
    .sort((a: any, b: any) => Math.abs(Number(b.dueAmount) || 0) - Math.abs(Number(a.dueAmount) || 0));

  return active.map((c: any, idx: number) => {
    const bal = Number(c.dueAmount) || 0;
    const isAdvance = bal < 0;
    return [
      idx + 1,
      String(c.id || ""),
      c.name || "ক্রেতা",
      c.phone || "",
      c.address || "",
      bal > 0 ? bal : 0,
      isAdvance ? Math.abs(bal) : 0,
      bal,
      Number(c.totalSpent) || 0,
      isAdvance ? "ক্রেতা পাবে" : "বকেয়া পরিমাণ",
      isAdvance ? "ক্রেতার অতিরিক্ত অ্যাডভান্স জমা আছে" : "বকেয়া পরিশোধের তাগাদা দিন"
    ];
  });
};

export const buildSmsRow = (log: any): any[] => [
  String(log.id || ""),
  log.createdAt ? formatDhakaDateTime(log.createdAt) : formatDhakaDateTime(new Date()),
  log.recipient || "",
  log.message || "",
  log.status === "sent" ? "প্রেরিত (Sent)" : log.status || "Sent"
];

export const buildUserRow = (u: any): any[] => [
  String(u.id || ""),
  u.name || "ব্যবহারকারী",
  u.email || "",
  u.phone || "",
  u.role || "salesman",
  String(u.businessId || "main-business")
];

export const buildSettingsRows = (biz: any = {}): any[][] => [
  HEADERS.SETTINGS,
  ["শপ আইডি (Business ID)", biz.id || "main-business"],
  ["দোকানের নাম (Shop Name)", biz.name || "হিসাবপাতি ERP"],
  ["দোকানের মোবাইল নম্বর", biz.phone || ""],
  ["দোকানের ঠিকানা", biz.address || ""],
  ["মুদ্রা (Currency)", biz.currency || "৳"],
  ["ডিফল্ট প্রিন্টার", biz.defaultPrinter || "thermal"],
  ["ডাটাবেজ ইঞ্জিন", "Google Sheets Live Master DB (Native REST API v4)"],
  ["সর্বশেষ সিঙ্ক", formatDhakaDateTime(new Date())]
];

// ---------------- Google Sheets REST API v4 Helpers ----------------

const SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

const sheetsFetch = async (url: string, accessToken: string, options: RequestInit = {}) => {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const msg = errBody?.error?.message || `Google Sheets API Error (${res.status})`;
    const error = new Error(msg) as Error & { status?: number };
    error.status = res.status;
    throw error;
  }
  return res.json();
};

/**
 * Ensure all 12 Bengali Slide Menu tabs exist and are ordered left-to-right.
 */
export const ensureAllTabsExistAndOrdered = async (
  accessToken: string,
  spreadsheetId: string
): Promise<Record<string, number>> => {
  const meta = await sheetsFetch(
    `${SHEETS_API_BASE}/${spreadsheetId}?fields=properties.title,sheets.properties`,
    accessToken
  );

  const existingSheets: Array<{ properties: { sheetId: number; title: string; index: number } }> =
    meta.sheets || [];

  const titleToId: Record<string, number> = {};
  existingSheets.forEach((s) => {
    if (s.properties?.title !== undefined && s.properties?.sheetId !== undefined) {
      titleToId[s.properties.title] = s.properties.sheetId;
    }
  });

  const requests: any[] = [];

  // Add any missing Slide Menu tabs
  ORDERED_TAB_LIST.forEach((tabTitle, idx) => {
    if (titleToId[tabTitle] === undefined) {
      requests.push({
        addSheet: {
          properties: {
            title: tabTitle,
            index: idx,
            gridProperties: { frozenRowCount: tabTitle === SHEET_TABS.DASHBOARD ? 0 : 1 }
          }
        }
      });
    }
  });

  if (requests.length > 0) {
    const batchRes = await sheetsFetch(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, accessToken, {
      method: "POST",
      body: JSON.stringify({ requests })
    });
    (batchRes.replies || []).forEach((rep: any) => {
      if (rep.addSheet?.properties) {
        titleToId[rep.addSheet.properties.title] = rep.addSheet.properties.sheetId;
      }
    });
  }

  // Reorder tabs & remove default empty "Sheet1" if we added our Bengali tabs
  const reorderRequests: any[] = [];
  ORDERED_TAB_LIST.forEach((tabTitle, idx) => {
    const sid = titleToId[tabTitle];
    if (sid !== undefined) {
      reorderRequests.push({
        updateSheetProperties: {
          properties: {
            sheetId: sid,
            index: idx,
            gridProperties: { frozenRowCount: tabTitle === SHEET_TABS.DASHBOARD ? 0 : 1 }
          },
          fields: "index,gridProperties.frozenRowCount"
        }
      });
    }
  });

  // Delete default Sheet1 / শীট১ if present and we have all 12 tabs
  const defaultSheetNames = ["Sheet1", "sheet1", "শীট১"];
  defaultSheetNames.forEach((name) => {
    if (titleToId[name] !== undefined && Object.keys(titleToId).length > 1) {
      reorderRequests.push({ deleteSheet: { sheetId: titleToId[name] } });
      delete titleToId[name];
    }
  });

  if (reorderRequests.length > 0) {
    await sheetsFetch(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, accessToken, {
      method: "POST",
      body: JSON.stringify({ requests: reorderRequests })
    });
  }

  return titleToId;
};

/**
 * Build styling requests for header rows on all 12 tabs.
 */
const buildHeaderFormattingRequests = (titleToId: Record<string, number>) => {
  const requests: any[] = [];

  ORDERED_TAB_LIST.forEach((tabTitle) => {
    const sheetId = titleToId[tabTitle];
    if (sheetId === undefined) return;
    const bgColor = TAB_HEADER_COLORS[tabTitle] || { red: 0.12, green: 0.23, blue: 0.54 };
    const headerRowIdx = tabTitle === SHEET_TABS.DASHBOARD ? 3 : 0;

    requests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: headerRowIdx,
          endRowIndex: headerRowIdx + 1,
          startColumnIndex: 0,
          endColumnIndex: 20
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: bgColor,
            textFormat: {
              foregroundColor: { red: 1, green: 1, blue: 1 },
              bold: true,
              fontSize: 10
            },
            horizontalAlignment: "LEFT",
            verticalAlignment: "MIDDLE"
          }
        },
        fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)"
      }
    });

    if (tabTitle === SHEET_TABS.DASHBOARD) {
      requests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 4 },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.059, green: 0.463, blue: 0.431 },
              textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true, fontSize: 12 }
            }
          },
          fields: "userEnteredFormat(backgroundColor,textFormat)"
        }
      });
    }
  });

  return requests;
};

/**
 * Create a brand-new native Google Spreadsheet titled `${shop.name} - হিসাবপাতি ডাটাবেজ`
 * directly via Google Sheets API v4 with all 12 Bengali Slide Menu tabs ready as a database.
 */
export const createNativeShopSpreadsheet = async (
  accessToken: string,
  shop: { id: string; name: string; phone?: string; address?: string; currency?: string; defaultPrinter?: string },
  initialData?: any
): Promise<{ spreadsheetId: string; sheetUrl: string; sheetName: string }> => {
  const sheetTitle = `${shop.name} - হিসাবপাতি ডাটাবেজ`;

  const body = {
    properties: {
      title: sheetTitle,
      locale: "bn_BD",
      timeZone: "Asia/Dhaka"
    },
    sheets: ORDERED_TAB_LIST.map((title, index) => ({
      properties: {
        title,
        index,
        gridProperties: {
          frozenRowCount: title === SHEET_TABS.DASHBOARD ? 0 : 1
        }
      }
    }))
  };

  const created = await sheetsFetch(SHEETS_API_BASE, accessToken, {
    method: "POST",
    body: JSON.stringify(body)
  });

  const spreadsheetId: string = created.spreadsheetId;
  const sheetUrl: string = created.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

  const titleToId: Record<string, number> = {};
  (created.sheets || []).forEach((s: any) => {
    if (s.properties?.title && s.properties?.sheetId !== undefined) {
      titleToId[s.properties.title] = s.properties.sheetId;
    }
  });

  // Tag the file in Google Drive with appProperties so redeploy/future sessions always recognize this shop's sheet
  await tagSpreadsheetWithShopMetadata(accessToken, spreadsheetId, shop);

  // Populate all 12 tabs with headers + initial shop data (or empty tables ready for live DB writes)
  await writeFullDataViaSheetsApi(
    accessToken,
    spreadsheetId,
    initialData || {
      business: shop,
      products: [],
      categories: [],
      customers: [],
      suppliers: [],
      expenses: [],
      sales: [],
      approvalRequests: [],
      smsLogs: [],
      users: []
    },
    titleToId
  );

  return {
    spreadsheetId,
    sheetUrl,
    sheetName: created.properties?.title || sheetTitle
  };
};

/**
 * Tag a Google Spreadsheet in Drive with shop metadata (`hishabpatiShopId`) so it can always be
 * recognized even after redeploy, domain change, or sheet rename.
 */
export const tagSpreadsheetWithShopMetadata = async (
  accessToken: string,
  spreadsheetId: string,
  shop: { id: string; name: string }
): Promise<void> => {
  if (!accessToken || !spreadsheetId || !shop?.id) return;
  try {
    await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(spreadsheetId)}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        appProperties: {
          hishabpatiShopId: String(shop.id),
          hishabpatiShopName: String(shop.name || "").slice(0, 80)
        }
      })
    });
  } catch (err) {
    console.warn("[SheetsAPI] tagSpreadsheetWithShopMetadata warning:", err);
  }
};

/**
 * Search the user's Google Drive for an existing non-trashed Google Sheet belonging to this shop.
 * Prevents duplicate sheet creation on app redeploy or new device login.
 */
export const findExistingShopSpreadsheetInDrive = async (
  accessToken: string,
  shop: { id: string; name: string }
): Promise<{ spreadsheetId: string; sheetUrl: string; sheetName: string } | null> => {
  if (!accessToken || !shop?.id) return null;
  const cleanShopName = (shop.name || "").trim();
  const expectedTitle = `${cleanShopName} - হিসাবপাতি ডাটাবেজ`;
  const escapedShopId = String(shop.id).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const escapedTitle = expectedTitle.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

  try {
    // 1. Search by hishabpatiShopId appProperty OR exact expected spreadsheet title
    const q = `mimeType='application/vnd.google-apps.spreadsheet' and trashed=false and (appProperties has { key='hishabpatiShopId' and value='${escapedShopId}' } or name='${escapedTitle}')`;
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,webViewLink,trashed,modifiedTime,appProperties)&orderBy=modifiedTime desc&pageSize=15`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (res.ok) {
      const data = await res.json();
      const files: Array<any> = (data.files || []).filter((f: any) => {
        if (!f || !f.id || f.trashed) return false;
        // Never claim a spreadsheet explicitly tagged to a different shop
        if (f.appProperties?.hishabpatiShopId && f.appProperties.hishabpatiShopId !== String(shop.id)) {
          return false;
        }
        return true;
      });
      const exactIdMatch = files.find((f) => f.appProperties?.hishabpatiShopId === String(shop.id));
      let chosen = exactIdMatch;
      if (!chosen && files.length > 0) {
        // Verify untagged candidate's internal Business ID cell in 'প্রতিষ্ঠান সেটিংস'!B2 so another shop's untagged sheet is never claimed
        for (const candidate of files) {
          try {
            const settingsCheck = await sheetsFetch(
              `${SHEETS_API_BASE}/${candidate.id}/values/'${encodeURIComponent(SHEET_TABS.SETTINGS)}'!A1:B6`,
              accessToken
            );
            const rows: any[][] = settingsCheck?.values || [];
            const idRow = rows.find((r) => String(r[0] || "").includes("Business ID"));
            const embeddedBizId = idRow ? String(idRow[1] || "").trim() : "";
            if (embeddedBizId && embeddedBizId !== String(shop.id)) {
              continue; // Belongs to a different shop
            }
            chosen = candidate;
            break;
          } catch {
            chosen = candidate;
            break;
          }
        }
      }
      if (chosen) {
        await tagSpreadsheetWithShopMetadata(accessToken, chosen.id, shop);
        return {
          spreadsheetId: chosen.id,
          sheetUrl: chosen.webViewLink || `https://docs.google.com/spreadsheets/d/${chosen.id}/edit`,
          sheetName: chosen.name || expectedTitle
        };
      }
    }

    // 2. Broader search among spreadsheets created by this app in Drive
    const fallbackQ = `mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
    const fallbackUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(fallbackQ)}&fields=files(id,name,webViewLink,trashed,modifiedTime,appProperties)&orderBy=modifiedTime desc&pageSize=50`;
    const fbRes = await fetch(fallbackUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (fbRes.ok) {
      const fbData = await fbRes.json();
      const allFiles: Array<any> = (fbData.files || []).filter((f: any) => f && f.id && !f.trashed);

      // 2a. First check if any file has matching hishabpatiShopId
      const byProp = allFiles.find((f) => f.appProperties?.hishabpatiShopId === String(shop.id));
      if (byProp) {
        return {
          spreadsheetId: byProp.id,
          sheetUrl: byProp.webViewLink || `https://docs.google.com/spreadsheets/d/${byProp.id}/edit`,
          sheetName: byProp.name || expectedTitle
        };
      }

      // 2b. Check normalized title or shop name match (only among untagged sheets or sheets tagged for this shop)
      const normalizedTarget = expectedTitle.toLowerCase().replace(/\s+/g, " ").trim();
      const normalizedShopName = cleanShopName.toLowerCase().replace(/\s+/g, " ").trim();
      const byTitle = allFiles.find((f) => {
        if (f.appProperties?.hishabpatiShopId && f.appProperties.hishabpatiShopId !== String(shop.id)) {
          return false;
        }
        const normName = String(f.name || "").toLowerCase().replace(/\s+/g, " ").trim();
        if (normName === normalizedTarget) return true;
        if (normalizedShopName && normName.startsWith(normalizedShopName) && normName.includes("হিসাবপাতি")) return true;
        return false;
      });
      if (byTitle) {
        await tagSpreadsheetWithShopMetadata(accessToken, byTitle.id, shop);
        return {
          spreadsheetId: byTitle.id,
          sheetUrl: byTitle.webViewLink || `https://docs.google.com/spreadsheets/d/${byTitle.id}/edit`,
          sheetName: byTitle.name || expectedTitle
        };
      }

      // 2c. For main-business (default initial shop), if there is an untagged "হিসাবপাতি ডাটাবেজ" sheet created before shop rename, bind it!
      if (shop.id === "main-business") {
        const untaggedMain = allFiles.find(
          (f) =>
            !f.appProperties?.hishabpatiShopId &&
            String(f.name || "").includes("হিসাবপাতি ডাটাবেজ")
        );
        if (untaggedMain) {
          await tagSpreadsheetWithShopMetadata(accessToken, untaggedMain.id, shop);
          return {
            spreadsheetId: untaggedMain.id,
            sheetUrl: untaggedMain.webViewLink || `https://docs.google.com/spreadsheets/d/${untaggedMain.id}/edit`,
            sheetName: untaggedMain.name || expectedTitle
          };
        }
      }
    }
  } catch (err) {
    console.warn("[SheetsAPI] findExistingShopSpreadsheetInDrive warning:", err);
  }
  return null;
};

/**
 * Full 12-tab sync directly via Google Sheets API v4 (no Apps Script required).
 */
export const writeFullDataViaSheetsApi = async (
  accessToken: string,
  spreadsheetId: string,
  allData: any,
  preloadedTitleToId?: Record<string, number>
): Promise<{ spreadsheetId: string; details: Record<string, number> }> => {
  const titleToId = preloadedTitleToId || (await ensureAllTabsExistAndOrdered(accessToken, spreadsheetId));

  const biz = allData?.business || {};
  const products = Array.isArray(allData?.products) ? allData.products : [];
  const categories = Array.isArray(allData?.categories) ? allData.categories : [];
  const customers = Array.isArray(allData?.customers) ? allData.customers : [];
  const suppliers = Array.isArray(allData?.suppliers) ? allData.suppliers : [];
  const expenses = Array.isArray(allData?.expenses) ? allData.expenses : [];
  const sales = Array.isArray(allData?.sales) ? allData.sales : [];
  const approvals = Array.isArray(allData?.approvalRequests) ? allData.approvalRequests : [];
  const smsLogs = Array.isArray(allData?.smsLogs) ? allData.smsLogs : [];
  const users = Array.isArray(allData?.users) ? allData.users : [];

  const duesRows = buildDuesRows(customers);

  // 1. Clear all 12 tabs first so removed rows don't stay stale
  await sheetsFetch(`${SHEETS_API_BASE}/${spreadsheetId}/values:batchClear`, accessToken, {
    method: "POST",
    body: JSON.stringify({
      ranges: ORDERED_TAB_LIST.map((t) => `'${t}'!A1:Z`)
    })
  });

  // 2. Write all 12 tabs atomically in 1 batchUpdate
  const dataRanges = [
    { range: `'${SHEET_TABS.DASHBOARD}'!A1`, values: buildDashboardRows(biz) },
    { range: `'${SHEET_TABS.SALES}'!A1`, values: [HEADERS.SALES, ...sales.map(buildSaleRow)] },
    { range: `'${SHEET_TABS.APPROVALS}'!A1`, values: [HEADERS.APPROVALS, ...approvals.map(buildApprovalRow)] },
    { range: `'${SHEET_TABS.PRODUCTS}'!A1`, values: [HEADERS.PRODUCTS, ...products.map(buildProductRow)] },
    { range: `'${SHEET_TABS.CATEGORIES}'!A1`, values: [HEADERS.CATEGORIES, ...categories.map(buildCategoryRow)] },
    { range: `'${SHEET_TABS.CUSTOMERS}'!A1`, values: [HEADERS.CUSTOMERS, ...customers.map(buildCustomerRow)] },
    { range: `'${SHEET_TABS.SUPPLIERS}'!A1`, values: [HEADERS.SUPPLIERS, ...suppliers.map(buildSupplierRow)] },
    { range: `'${SHEET_TABS.EXPENSES}'!A1`, values: [HEADERS.EXPENSES, ...expenses.map(buildExpenseRow)] },
    { range: `'${SHEET_TABS.DUES}'!A1`, values: [HEADERS.DUES, ...duesRows] },
    { range: `'${SHEET_TABS.SMS_LOGS}'!A1`, values: [HEADERS.SMS_LOGS, ...smsLogs.map(buildSmsRow)] },
    { range: `'${SHEET_TABS.USERS}'!A1`, values: [HEADERS.USERS, ...users.map(buildUserRow)] },
    { range: `'${SHEET_TABS.SETTINGS}'!A1`, values: buildSettingsRows(biz) }
  ];

  await sheetsFetch(`${SHEETS_API_BASE}/${spreadsheetId}/values:batchUpdate`, accessToken, {
    method: "POST",
    body: JSON.stringify({
      valueInputOption: "USER_ENTERED",
      data: dataRanges
    })
  });

  // 3. Apply clean header styling (best-effort)
  try {
    const formatRequests = buildHeaderFormattingRequests(titleToId);
    if (formatRequests.length > 0) {
      await sheetsFetch(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, accessToken, {
        method: "POST",
        body: JSON.stringify({ requests: formatRequests })
      });
    }
  } catch (fmtErr) {
    console.warn("[SheetsAPI] Formatting warning:", fmtErr);
  }

  return {
    spreadsheetId,
    details: {
      products: products.length,
      sales: sales.length,
      approvals: approvals.length,
      customers: customers.length,
      suppliers: suppliers.length,
      expenses: expenses.length,
      dues: duesRows.length,
      smsLogs: smsLogs.length,
      users: users.length,
      categories: categories.length
    }
  };
};

/**
 * Refresh the 'বকেয়া খাতা' tab directly from the 'ক্রেতা' tab values in Google Sheets
 * so both 'বকেয়া পরিমাণ' (due > 0) and 'ক্রেতা পাবে' (due < 0) always stay 100% synced.
 */
const refreshDuesTabFromCustomersTab = async (
  accessToken: string,
  spreadsheetId: string
) => {
  try {
    const res = await sheetsFetch(
      `${SHEETS_API_BASE}/${spreadsheetId}/values/'${encodeURIComponent(SHEET_TABS.CUSTOMERS)}'!A2:K`,
      accessToken
    );
    const rows: any[][] = res.values || [];
    const parsedCustomers = rows.map((r) => ({
      id: r[0] || "",
      name: r[1] || "ক্রেতা",
      phone: r[2] || "",
      address: r[3] || "",
      dueAmount: Number(r[6] ?? (Number(r[4]) || 0) - (Number(r[5]) || 0)) || 0,
      totalSpent: Number(r[8]) || 0
    }));
    const duesRows = buildDuesRows(parsedCustomers);

    await sheetsFetch(`${SHEETS_API_BASE}/${spreadsheetId}/values:batchClear`, accessToken, {
      method: "POST",
      body: JSON.stringify({ ranges: [`'${SHEET_TABS.DUES}'!A1:K`] })
    });

    await sheetsFetch(`${SHEETS_API_BASE}/${spreadsheetId}/values:batchUpdate`, accessToken, {
      method: "POST",
      body: JSON.stringify({
        valueInputOption: "USER_ENTERED",
        data: [{ range: `'${SHEET_TABS.DUES}'!A1`, values: [HEADERS.DUES, ...duesRows] }]
      })
    });
  } catch (err) {
    console.warn("[SheetsAPI] refreshDuesTab warning:", err);
  }
};

/**
 * Real-time single entity upsert/delete directly via Google Sheets API v4.
 */
export const syncSingleEntityViaSheetsApi = async (
  accessToken: string,
  spreadsheetId: string,
  entityType: 'product' | 'sale' | 'approval' | 'customer' | 'supplier' | 'expense' | 'payment' | 'sms' | 'user' | 'category',
  item: any,
  operation: 'upsert' | 'delete' = 'upsert'
) => {
  if (!item) return;

  // Special handling: customer due payment updates customer's balance in ক্রেতা + বকেয়া খাতা
  if (entityType === "payment" && item.customerId) {
    const res = await sheetsFetch(
      `${SHEETS_API_BASE}/${spreadsheetId}/values/'${encodeURIComponent(SHEET_TABS.CUSTOMERS)}'!A1:K`,
      accessToken
    );
    const rows: any[][] = res.values || [];
    const targetId = String(item.customerId);
    const matchIdx = rows.findIndex((r, idx) => idx > 0 && (String(r[0]) === targetId || String(r[2]) === targetId));
    if (matchIdx !== -1) {
      const existing = rows[matchIdx];
      const currentBal = Number(existing[6] ?? (Number(existing[4]) || 0) - (Number(existing[5]) || 0)) || 0;
      const nextBal =
        item.newDue !== undefined && !Number.isNaN(Number(item.newDue))
          ? Number(item.newDue)
          : currentBal - (Number(item.amount) || 0);
      const updatedCustomerRow = buildCustomerRow({
        id: existing[0],
        name: existing[1],
        phone: existing[2],
        address: existing[3],
        dueAmount: nextBal,
        totalSpent: existing[8],
        createdBy: existing[9],
        createdAt: existing[10]
      });
      await sheetsFetch(
        `${SHEETS_API_BASE}/${spreadsheetId}/values/'${encodeURIComponent(SHEET_TABS.CUSTOMERS)}'!A${matchIdx + 1}:K${matchIdx + 1}?valueInputOption=USER_ENTERED`,
        accessToken,
        { method: "PUT", body: JSON.stringify({ values: [updatedCustomerRow] }) }
      );
      await refreshDuesTabFromCustomersTab(accessToken, spreadsheetId);
    }
    return;
  }

  let tabName: string = SHEET_TABS.PRODUCTS;
  let headers: string[] = HEADERS.PRODUCTS;
  let rowData: any[] = [];
  let idColIndex = 0; // 0-based column index used to match existing row
  let targetId = String(item.id || "");

  switch (entityType) {
    case "product":
      tabName = SHEET_TABS.PRODUCTS;
      headers = HEADERS.PRODUCTS;
      rowData = buildProductRow(item);
      break;
    case "category":
      tabName = SHEET_TABS.CATEGORIES;
      headers = HEADERS.CATEGORIES;
      rowData = buildCategoryRow(item);
      break;
    case "customer":
      tabName = SHEET_TABS.CUSTOMERS;
      headers = HEADERS.CUSTOMERS;
      rowData = buildCustomerRow(item);
      break;
    case "supplier":
      tabName = SHEET_TABS.SUPPLIERS;
      headers = HEADERS.SUPPLIERS;
      rowData = buildSupplierRow(item);
      break;
    case "expense":
      tabName = SHEET_TABS.EXPENSES;
      headers = HEADERS.EXPENSES;
      rowData = buildExpenseRow(item);
      break;
    case "sale":
      tabName = SHEET_TABS.SALES;
      headers = HEADERS.SALES;
      rowData = buildSaleRow(item);
      idColIndex = 17; // Column R: বিক্রয় আইডি
      targetId = String(item.id || item.invoiceNo || "");
      break;
    case "approval":
      tabName = SHEET_TABS.APPROVALS;
      headers = HEADERS.APPROVALS;
      rowData = buildApprovalRow(item);
      break;
    case "sms":
      tabName = SHEET_TABS.SMS_LOGS;
      headers = HEADERS.SMS_LOGS;
      rowData = buildSmsRow(item);
      break;
    case "user":
      tabName = SHEET_TABS.USERS;
      headers = HEADERS.USERS;
      rowData = buildUserRow(item);
      break;
    default:
      return;
  }

  // Ensure tab exists and fetch existing rows
  let existingRows: any[][] = [];
  try {
    const valRes = await sheetsFetch(
      `${SHEETS_API_BASE}/${spreadsheetId}/values/'${encodeURIComponent(tabName)}'!A1:Z`,
      accessToken
    );
    existingRows = valRes.values || [];
  } catch (err: any) {
    if (err.status === 400) {
      await ensureAllTabsExistAndOrdered(accessToken, spreadsheetId);
    } else {
      throw err;
    }
  }

  if (existingRows.length === 0) {
    await sheetsFetch(
      `${SHEETS_API_BASE}/${spreadsheetId}/values/'${encodeURIComponent(tabName)}'!A1?valueInputOption=USER_ENTERED`,
      accessToken,
      { method: "PUT", body: JSON.stringify({ values: [headers] }) }
    );
    existingRows = [headers];
  }

  const matchRowIdx = existingRows.findIndex((r, idx) => {
    if (idx === 0) return false;
    const cellId = String(r[idColIndex] || "");
    if (cellId && cellId === targetId) return true;
    // Also check col 0 for sales invoiceNo fallback
    if (entityType === "sale" && item.invoiceNo && String(r[0] || "") === String(item.invoiceNo)) return true;
    return false;
  });

  if (operation === "delete") {
    if (matchRowIdx > 0) {
      const meta = await sheetsFetch(
        `${SHEETS_API_BASE}/${spreadsheetId}?fields=sheets.properties`,
        accessToken
      );
      const sheetObj = (meta.sheets || []).find((s: any) => s.properties?.title === tabName);
      if (sheetObj) {
        await sheetsFetch(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, accessToken, {
          method: "POST",
          body: JSON.stringify({
            requests: [
              {
                deleteDimension: {
                  range: {
                    sheetId: sheetObj.properties.sheetId,
                    dimension: "ROWS",
                    startIndex: matchRowIdx,
                    endIndex: matchRowIdx + 1
                  }
                }
              }
            ]
          })
        });
      }
    }
  } else if (matchRowIdx > 0) {
    const rowNumber = matchRowIdx + 1;
    await sheetsFetch(
      `${SHEETS_API_BASE}/${spreadsheetId}/values/'${encodeURIComponent(tabName)}'!A${rowNumber}?valueInputOption=USER_ENTERED`,
      accessToken,
      { method: "PUT", body: JSON.stringify({ values: [rowData] }) }
    );
  } else {
    await sheetsFetch(
      `${SHEETS_API_BASE}/${spreadsheetId}/values/'${encodeURIComponent(tabName)}'!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      accessToken,
      { method: "POST", body: JSON.stringify({ values: [rowData] }) }
    );
  }

  if (entityType === "customer") {
    await refreshDuesTabFromCustomersTab(accessToken, spreadsheetId);
  }
};

/**
 * Rename spreadsheet natively via Google Sheets API v4.
 */
export const renameSpreadsheetViaSheetsApi = async (
  accessToken: string,
  spreadsheetId: string,
  newTitle: string,
  updatedBusiness?: any
) => {
  await sheetsFetch(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, accessToken, {
    method: "POST",
    body: JSON.stringify({
      requests: [
        {
          updateSpreadsheetProperties: {
            properties: { title: newTitle },
            fields: "title"
          }
        }
      ]
    })
  });

  if (updatedBusiness) {
    try {
      await sheetsFetch(`${SHEETS_API_BASE}/${spreadsheetId}/values:batchUpdate`, accessToken, {
        method: "POST",
        body: JSON.stringify({
          valueInputOption: "USER_ENTERED",
          data: [
            { range: `'${SHEET_TABS.SETTINGS}'!A1`, values: buildSettingsRows(updatedBusiness) },
            { range: `'${SHEET_TABS.DASHBOARD}'!B2`, values: [[updatedBusiness.name || newTitle]] }
          ]
        })
      });
    } catch {}
  }
};

/**
 * Read entire shop database back from Google Sheets API v4 (no Apps Script required).
 */
export const readAllDataViaSheetsApi = async (
  accessToken: string,
  spreadsheetId: string
): Promise<any> => {
  // Always inspect metadata first rather than assuming tab names
  const meta = await sheetsFetch(
    `${SHEETS_API_BASE}/${spreadsheetId}?fields=properties.title,sheets.properties`,
    accessToken
  );
  const availableTitles = new Set<string>(
    (meta.sheets || []).map((s: any) => s.properties?.title).filter(Boolean)
  );

  const approvalsTabToRead = availableTitles.has(SHEET_TABS.APPROVALS)
    ? SHEET_TABS.APPROVALS
    : availableTitles.has("অনুমোদন রিকুয়েস্ট")
    ? "অনুমোদন রিকুয়েস্ট"
    : null;

  const tabsToRead = [
    SHEET_TABS.PRODUCTS,
    SHEET_TABS.CATEGORIES,
    SHEET_TABS.CUSTOMERS,
    SHEET_TABS.SUPPLIERS,
    SHEET_TABS.EXPENSES,
    SHEET_TABS.SALES,
    ...(approvalsTabToRead ? [approvalsTabToRead] : []),
    SHEET_TABS.SMS_LOGS,
    SHEET_TABS.USERS,
    SHEET_TABS.SETTINGS
  ].filter((t) => availableTitles.has(t));

  if (tabsToRead.length === 0) {
    return {
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
  }

  const rangeParams = tabsToRead.map((t) => `ranges=${encodeURIComponent(`'${t}'!A1:Z`)}`).join("&");
  const batchRes = await sheetsFetch(
    `${SHEETS_API_BASE}/${spreadsheetId}/values:batchGet?${rangeParams}`,
    accessToken
  );

  const tabValuesMap: Record<string, any[][]> = {};
  (batchRes.valueRanges || []).forEach((vr: any, idx: number) => {
    const tabName = tabsToRead[idx];
    tabValuesMap[tabName] = vr.values || [];
  });

  const rowsOf = (tab: string) => (tabValuesMap[tab] || []).slice(1);

  const products = rowsOf(SHEET_TABS.PRODUCTS)
    .filter((r) => r[0] || r[1])
    .map((r) => {
      const isCustom =
        String(r[11] || "").includes("স্টক প্রযোজ্য নয়") ||
        String(r[12] || "").includes("অন্যান্য") ||
        String(r[1] || "").trim() === "অন্যান্য";
      return {
        id: String(r[0] || `prod_${Date.now()}`),
        name: r[1] || "",
        bnName: r[2] || r[1] || "",
        sku: r[3] || "",
        barcode: r[4] || "",
        categoryId: r[5] || "general",
        purchasePrice: Number(r[6]) || 0,
        salePrice: Number(r[7]) || 0,
        stock: isCustom ? 0 : Number(r[8]) || 0,
        minStock: isCustom ? 0 : Number(r[9]) || 0,
        unit: r[10] || "পিস",
        isCustomPrice: isCustom,
        expiryDate: r[13] || ""
      };
    });

  const categories = rowsOf(SHEET_TABS.CATEGORIES)
    .filter((r) => r[0] || r[1])
    .map((r) => ({
      id: String(r[0] || ""),
      name: r[1] || "",
      description: r[2] || ""
    }));

  const customers = rowsOf(SHEET_TABS.CUSTOMERS)
    .filter((r) => r[0] || r[1])
    .map((r) => {
      const dueCol = Number(r[4]) || 0;
      const advCol = Number(r[5]) || 0;
      const netCol = r[6] !== undefined && r[6] !== "" ? Number(r[6]) : dueCol - advCol;
      return {
        id: String(r[0] || ""),
        name: r[1] || "ক্রেতা",
        phone: String(r[2] || ""),
        address: r[3] || "",
        dueAmount: Number.isNaN(netCol) ? 0 : netCol,
        totalSpent: Number(r[8]) || 0,
        createdBy: r[9] || "admin-1",
        createdAt: r[10] || new Date().toISOString()
      };
    });

  const suppliers = rowsOf(SHEET_TABS.SUPPLIERS)
    .filter((r) => r[0] || r[1])
    .map((r) => ({
      id: String(r[0] || ""),
      name: r[1] || "",
      company: r[2] || "",
      phone: String(r[3] || ""),
      address: r[4] || "",
      dueAmount: Number(r[5]) || 0,
      createdAt: r[7] || new Date().toISOString()
    }));

  const expenses = rowsOf(SHEET_TABS.EXPENSES)
    .filter((r) => r[0] || r[2])
    .map((r) => ({
      id: String(r[0] || ""),
      date: r[1] || new Date().toISOString(),
      category: r[2] || "সাধারণ খরচ",
      amount: Number(r[3]) || 0,
      note: r[4] || "",
      userName: r[5] || "এডমিন",
      userId: r[7] || "admin-1"
    }));

  const sales = rowsOf(SHEET_TABS.SALES)
    .filter((r) => r[0] || r[17])
    .map((r) => {
      let parsedItems: any[] = [];
      try {
        if (r[18]) parsedItems = JSON.parse(r[18]);
      } catch {}
      const statusText = String(r[14] || "");
      const isTemp = statusText.includes("TEMPORARY");
      const isRejected = statusText.includes("বাতিল");
      return {
        invoiceNo: String(r[0] || ""),
        createdAt: r[1] || new Date().toISOString(),
        customerName: r[2] || "ক্রেতা",
        customerPhone: String(r[3] || ""),
        totalAmount: Number(r[5]) || 0,
        discount: Number(r[6]) || 0,
        vat: Number(r[7]) || 0,
        payableAmount: Number(r[8]) || 0,
        paidAmount: Number(r[9]) || 0,
        dueAmount: r[12] !== undefined && r[12] !== "" ? Number(r[12]) : (Number(r[10]) || 0) - (Number(r[11]) || 0),
        paymentMethod: String(r[13] || "").includes("বিকাশ") ? "mobile_pay" : String(r[13] || "").includes("কার্ড") ? "card" : "cash",
        isTemporary: isTemp,
        approvalStatus: isRejected ? "rejected" : isTemp ? "pending" : "approved",
        userName: r[15] || "এডমিন",
        customerId: String(r[16] || ""),
        id: String(r[17] || r[0] || ""),
        items: parsedItems
      };
    });

  const approvalRows = rowsOf(SHEET_TABS.APPROVALS).length
    ? rowsOf(SHEET_TABS.APPROVALS)
    : rowsOf("অনুমোদন রিকুয়েস্ট");
  const approvalRequests = approvalRows
    .filter((r) => r[0])
    .map((r) => {
      try {
        if (r[14]) return JSON.parse(r[14]);
      } catch {}
      return {
        id: String(r[0]),
        createdAt: r[1] || new Date().toISOString(),
        type: String(r[2] || "").includes("POS") ? "sale" : "due_payment",
        temporaryInvoiceNo: r[3] || "",
        finalInvoiceNo: r[4] === "-" ? undefined : r[4],
        userName: r[5] || "সেলসম্যান",
        status: String(r[11] || "").includes("অনুমোদিত")
          ? "approved"
          : String(r[11] || "").includes("বাতিল")
          ? "rejected"
          : "pending"
      };
    });

  const smsLogs = rowsOf(SHEET_TABS.SMS_LOGS)
    .filter((r) => r[0] || r[2])
    .map((r) => ({
      id: String(r[0] || ""),
      createdAt: r[1] || new Date().toISOString(),
      recipient: String(r[2] || ""),
      message: r[3] || "",
      status: String(r[4] || "").includes("Sent") || String(r[4] || "").includes("প্রেরিত") ? "sent" : r[4] || "sent"
    }));

  const users = rowsOf(SHEET_TABS.USERS)
    .filter((r) => r[0] && r[2])
    .map((r) => ({
      id: String(r[0]),
      name: r[1] || "ব্যবহারকারী",
      email: r[2] || "",
      phone: String(r[3] || ""),
      role: r[4] || "salesman",
      businessId: r[5] || "main-business"
    }));

  const settingsRows = rowsOf(SHEET_TABS.SETTINGS);
  const business: any = {};
  settingsRows.forEach((r) => {
    const key = String(r[0] || "");
    const val = r[1];
    if (key.includes("Business ID")) business.id = val;
    else if (key.includes("দোকানের নাম")) business.name = val;
    else if (key.includes("মোবাইল")) business.phone = val;
    else if (key.includes("ঠিকানা")) business.address = val;
    else if (key.includes("মুদ্রা")) business.currency = val;
    else if (key.includes("প্রিন্টার")) business.defaultPrinter = val;
  });

  return {
    business: Object.keys(business).length > 0 ? business : undefined,
    products,
    categories,
    customers,
    suppliers,
    expenses,
    sales,
    approvalRequests,
    smsLogs,
    users
  };
};

/**
 * Test connectivity to an existing spreadsheet via Google Sheets API v4 (and ensure it is not in Drive Trash).
 */
export const testSpreadsheetViaSheetsApi = async (
  accessToken: string,
  spreadsheetId: string
): Promise<{ spreadsheetId: string; spreadsheetName: string; spreadsheetUrl: string; tabCount: number }> => {
  // 1. Primary verification via Google Sheets API v4 (works with both spreadsheets and drive.file scopes)
  const meta = await sheetsFetch(
    `${SHEETS_API_BASE}/${spreadsheetId}?fields=properties.title,spreadsheetUrl,sheets.properties.title`,
    accessToken
  );

  // 2. Best-effort check via Drive API to see if the spreadsheet is explicitly marked trashed=true
  // (Ignore Drive 404/403 caused by drive.file scope restrictions when Sheets API v4 already succeeded!)
  try {
    const driveRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(spreadsheetId)}?fields=id,name,trashed`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (driveRes.ok) {
      const driveMeta = await driveRes.json();
      if (driveMeta.trashed === true) {
        const err = new Error("গুগল শিটটি ট্র্যাশ (Trash) ফোল্ডারে রয়েছে") as Error & { status?: number };
        err.status = 404;
        throw err;
      }
    }
  } catch (err: any) {
    if (err?.message?.includes("Trash")) throw err;
  }

  return {
    spreadsheetId,
    spreadsheetName: meta.properties?.title || "Google Sheet",
    spreadsheetUrl: meta.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    tabCount: Array.isArray(meta.sheets) ? meta.sheets.length : 0
  };
};
