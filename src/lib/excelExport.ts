/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as XLSX from "xlsx";
import { formatDhakaDateTime, formatDhakaDate } from "./utils";

const isOtherProductItem = (p: any): boolean => {
  if (!p) return false;
  if (p.isCustomPrice === true) return true;
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

export function generateExcelWorkbook(data: any): Blob {
  const wb = XLSX.utils.book_new();
  const biz = data?.business || {};
  const products = Array.isArray(data?.products) ? data.products : [];
  const categories = Array.isArray(data?.categories) ? data.categories : [];
  const customers = Array.isArray(data?.customers) ? data.customers : [];
  const sales = Array.isArray(data?.sales) ? data.sales : [];
  const approvalRequests = Array.isArray(data?.approvalRequests) ? data.approvalRequests : [];
  const suppliers = Array.isArray(data?.suppliers) ? data.suppliers : [];
  const expenses = Array.isArray(data?.expenses) ? data.expenses : [];
  const smsLogs = Array.isArray(data?.smsLogs) ? data.smsLogs : [];
  const users = Array.isArray(data?.users) ? data.users : [];

  // Calculate live metrics for ড্যাশবোর্ড (Dashboard & জমা-খরচ সামারি)
  const confirmedSales = sales.filter(
    (s: any) => !s.isTemporary && s.approvalStatus !== "pending" && s.approvalStatus !== "rejected"
  );
  const totalSalesRevenue = confirmedSales.reduce(
    (sum: number, s: any) => sum + (Number(s.payableAmount ?? s.totalAmount) || 0),
    0
  );
  const totalPaidCashIn = confirmedSales.reduce(
    (sum: number, s: any) => sum + (Number(s.paidAmount) || 0),
    0
  );
  const totalExpensesOut = expenses.reduce(
    (sum: number, e: any) => sum + (Number(e.amount) || 0),
    0
  );
  const netAccountingBalance = totalSalesRevenue - totalExpensesOut;
  const netCashInHand = totalPaidCashIn - totalExpensesOut;

  const dueCustomers = customers.filter((c: any) => (Number(c.dueAmount) || 0) > 0);
  const advanceCustomers = customers.filter((c: any) => (Number(c.dueAmount) || 0) < 0);
  const totalCustomerDue = dueCustomers.reduce(
    (sum: number, c: any) => sum + (Number(c.dueAmount) || 0),
    0
  );
  const totalCustomerAdvance = advanceCustomers.reduce(
    (sum: number, c: any) => sum + Math.abs(Number(c.dueAmount) || 0),
    0
  );
  const totalSupplierDue = suppliers.reduce(
    (sum: number, s: any) => sum + (Number(s.dueAmount) || 0),
    0
  );
  const lowStockCount = products.filter(
    (p: any) => !isOtherProductItem(p) && (Number(p.stock) || 0) <= (Number(p.minStock) || 5)
  ).length;
  const pendingApprovalsCount = approvalRequests.filter((r: any) => r.status === "pending").length;

  // 1. ড্যাশবোর্ড (Slide Menu #1: ড্যাশবোর্ড, জমা-খরচ ও রিপোর্ট সামারি)
  const dashboardRows = [
    {
      "বিষয় / মেট্রিক (স্লাইড মেনু ও জমা-খরচ সামারি)": "🏪 প্রতিষ্ঠানের নাম",
      "বর্তমান মান": biz.name || "হিসাব পাতি ERP",
      "বিবরণ ও হিসাব সূত্র": `আপনার শপের নাম (শপ আইডি: ${biz.id || "main-business"})`,
      "স্থিতি": "সক্রিয়"
    },
    {
      "বিষয় / মেট্রিক (স্লাইড মেনু ও জমা-খরচ সামারি)": "📍 ঠিকানা ও মোবাইল",
      "বর্তমান মান": `${biz.address || ""} | ${biz.phone || ""}`,
      "বিবরণ ও হিসাব সূত্র": "যোগাযোগের বিবরণ",
      "স্থিতি": "ভেরিফাইড"
    },
    {
      "বিষয় / মেট্রিক (স্লাইড মেনু ও জমা-খরচ সামারি)": "🕒 সর্বশেষ সিঙ্কের সময়",
      "বর্তমান মান": formatDhakaDateTime(new Date()),
      "বিবরণ ও হিসাব সূত্র": "সরাসরি হিসাবপাতি অ্যাপ থেকে সিঙ্ক হয়েছে",
      "স্থিতি": "আপ-টু-ডেট"
    },
    {
      "বিষয় / মেট্রিক (স্লাইড মেনু ও জমা-খরচ সামারি)": "==============================",
      "বর্তমান মান": "====================",
      "বিবরণ ও হিসাব সূত্র": "==============================",
      "স্থিতি": "=========="
    },
    {
      "বিষয় / মেট্রিক (স্লাইড মেনু ও জমা-খরচ সামারি)": "💰 মোট বিক্রয় আয় (জমা - চূড়ান্ত মেমো)",
      "বর্তমান মান": totalSalesRevenue,
      "বিবরণ ও হিসাব সূত্র": `'বিক্রয় ও মেমো' শিটের সকল চূড়ান্ত বিলের যোগফল (${confirmedSales.length} টি মেমো)`,
      "স্থিতি": "মোট আয়"
    },
    {
      "বিষয় / মেট্রিক (স্লাইড মেনু ও জমা-খরচ সামারি)": "💵 মোট নগদ আদায় (Paid Cash In)",
      "বর্তমান মান": totalPaidCashIn,
      "বিবরণ ও হিসাব সূত্র": "'বিক্রয় ও মেমো' শিটের নগদ আদায়কৃত টাকা",
      "স্থিতি": "ক্যাশ ইন"
    },
    {
      "বিষয় / মেট্রিক (স্লাইড মেনু ও জমা-খরচ সামারি)": "💸 মোট ব্যয় / খরচ (Expenses Out)",
      "বর্তমান মান": totalExpensesOut,
      "বিবরণ ও হিসাব সূত্র": `'হিসাব ও খরচ' শিটের সকল খরচের যোগফল (${expenses.length} টি এন্ট্রি)`,
      "স্থিতি": "ক্যাশ আউট"
    },
    {
      "বিষয় / মেট্রিক (স্লাইড মেনু ও জমা-খরচ সামারি)": "🏦 নিট ব্যালেন্স (মোট আয় - মোট ব্যয়)",
      "বর্তমান মান": netAccountingBalance,
      "বিবরণ ও হিসাব সূত্র": "হিসাব ট্যাবের নিট ব্যালেন্স (মোট বিক্রয় আয় বিয়োগ মোট খরচ)",
      "স্থিতি": "হিসাব-নিকাশ"
    },
    {
      "বিষয় / মেট্রিক (স্লাইড মেনু ও জমা-খরচ সামারি)": "💼 নগদ ক্যাশ উদ্বৃত্ত (নগদ জমা - খরচ)",
      "বর্তমান মান": netCashInHand,
      "বিবরণ ও হিসাব সূত্র": "হাতে থাকা নগদ ক্যাশ (আদায়কৃত টাকা বিয়োগ খরচ)",
      "স্থিতি": "ক্যাশবুক"
    },
    {
      "বিষয় / মেট্রিক (স্লাইড মেনু ও জমা-খরচ সামারি)": "==============================",
      "বর্তমান মান": "====================",
      "বিবরণ ও হিসাব সূত্র": "==============================",
      "স্থিতি": "=========="
    },
    {
      "বিষয় / মেট্রিক (স্লাইড মেনু ও জমা-খরচ সামারি)": "🔴 মোট পাওনা বকেয়া (বকেয়া পরিমাণ)",
      "বর্তমান মান": totalCustomerDue,
      "বিবরণ ও হিসাব সূত্র": `'ক্রেতা' ও 'বকেয়া খাতা' শিটের মোট পাওনা বকেয়া (${dueCustomers.length} জন ক্রেতা)`,
      "স্থিতি": "বকেয়া আদায়যোগ্য"
    },
    {
      "বিষয় / মেট্রিক (স্লাইড মেনু ও জমা-খরচ সামারি)": "🟢 মোট ক্রেতা পাবে (অ্যাডভান্স জমা)",
      "বর্তমান মান": totalCustomerAdvance,
      "বিবরণ ও হিসাব সূত্র": `'ক্রেতা' ও 'বকেয়া খাতা' শিটের ক্রেতাদের অতিরিক্ত অ্যাডভান্স জমা (${advanceCustomers.length} জন ক্রেতা)`,
      "স্থিতি": "ক্রেতা পাবে"
    },
    {
      "বিষয় / মেট্রিক (স্লাইড মেনু ও জমা-খরচ সামারি)": "🏭 সরবরাহকারীর কাছে দেনা (সাপ্লায়ার)",
      "বর্তমান মান": totalSupplierDue,
      "বিবরণ ও হিসাব সূত্র": "'সরবরাহকারী' শিটের মহাজন/সাপ্লায়ারদের প্রদেয় টাকা",
      "স্থিতি": "পরিশোধযোগ্য"
    },
    {
      "বিষয় / মেট্রিক (স্লাইড মেনু ও জমা-খরচ সামারি)": "==============================",
      "বর্তমান মান": "====================",
      "বিবরণ ও হিসাব সূত্র": "==============================",
      "স্থিতি": "=========="
    },
    {
      "বিষয় / মেট্রিক (স্লাইড মেনু ও জমা-খরচ সামারি)": "📦 সর্বমোট পণ্যের সংখ্যা",
      "বর্তমান মান": products.length,
      "বিবরণ ও হিসাব সূত্র": "'পণ্য তালিকা' শিটের মোট পণ্য তালিকা",
      "স্থিতি": "ইনভেন্টরি"
    },
    {
      "বিষয় / মেট্রিক (স্লাইড মেনু ও জমা-খরচ সামারি)": "⚠️ কম স্টক ও স্টক শেষ পণ্যের সংখ্যা",
      "বর্তমান মান": lowStockCount,
      "বিবরণ ও হিসাব সূত্র": "অন্যান্য পণ্য বাদে যেসব পণ্যের স্টক কম বা শেষ",
      "স্থিতি": "রি-অর্ডার প্রয়োজন"
    },
    {
      "বিষয় / মেট্রিক (স্লাইড মেনু ও জমা-খরচ সামারি)": "⏳ অপেক্ষমান বিক্রয় অর্ডার",
      "বর্তমান মান": pendingApprovalsCount,
      "বিবরণ ও হিসাব সূত্র": "'বিক্রয় অর্ডার' শিটে সেলসম্যানের পেন্ডিং বিক্রয় অর্ডার",
      "স্থিতি": "অ্যাডমিন অনুমোদন"
    }
  ];
  const wsDashboard = XLSX.utils.json_to_sheet(dashboardRows);
  XLSX.utils.book_append_sheet(wb, wsDashboard, "ড্যাশবোর্ড");

  // 2. বিক্রয় ও মেমো (Slide Menu #2 & #3: পিওএস ও বিক্রয়)
  const salesHeader = [
    "মেমো নং (Invoice)",
    "তারিখ ও সময় (ঢাকা)",
    "ক্রেতার নাম",
    "মোবাইল",
    "পণ্যের বিবরণ",
    "মোট টাকা (৳)",
    "ছাড় (৳)",
    "ভ্যাট (৳)",
    "প্রদেয় বিল (৳)",
    "নগদ জমা (৳)",
    "বকেয়া পরিমাণ (৳)",
    "ক্রেতা পাবে / অ্যাডভান্স (৳)",
    "নিট ব্যালেন্স (৳)",
    "পেমেন্ট মাধ্যম",
    "মেমোর অবস্থা",
    "বিক্রয়কর্মী",
    "ক্রেতার আইডি",
    "বিক্রয় আইডি",
    "র কালেকশন JSON"
  ];
  const salesData = sales.map((s: any) => {
    const itemsSummary = Array.isArray(s.items)
      ? s.items.map((it: any) => `${it.name || "পণ্য"} (${it.quantity || 1} x ${it.unitPrice || 0}৳)`).join("; ")
      : "";
    const payMethodName =
      s.paymentMethod === "mobile_pay" ? "বিকাশ/নগদ" : s.paymentMethod === "card" ? "কার্ড" : "নগদ ক্যাশ";
    const payable = Number(s.payableAmount ?? s.totalAmount) || 0;
    const paid = Number(s.paidAmount) || 0;
    const netDue =
      s.dueAmount !== undefined && s.dueAmount !== null && !Number.isNaN(Number(s.dueAmount))
        ? Number(s.dueAmount)
        : payable - paid;
    let memoStatus = "চূড়ান্ত মেমো";
    if (s.approvalStatus === "rejected") {
      memoStatus = "বাতিলকৃত (Rejected)";
    } else if (s.isTemporary || s.approvalStatus === "pending" || String(s.invoiceNo || "").startsWith("TMP-")) {
      memoStatus = "TEMPORARY (অনুমোদনের অপেক্ষায়)";
    }

    return {
      "মেমো নং (Invoice)": s.invoiceNo || s.id || "",
      "তারিখ ও সময় (ঢাকা)": s.createdAt ? formatDhakaDateTime(s.createdAt) : "",
      "ক্রেতার নাম": s.customerName || "ক্রেতা",
      "মোবাইল": s.customerPhone || "",
      "পণ্যের বিবরণ": itemsSummary,
      "মোট টাকা (৳)": Number(s.totalAmount) || payable,
      "ছাড় (৳)": Number(s.discount) || 0,
      "ভ্যাট (৳)": Number(s.vat) || 0,
      "প্রদেয় বিল (৳)": payable,
      "নগদ জমা (৳)": paid,
      "বকেয়া পরিমাণ (৳)": netDue > 0 ? netDue : 0,
      "ক্রেতা পাবে / অ্যাডভান্স (৳)": netDue < 0 ? Math.abs(netDue) : 0,
      "নিট ব্যালেন্স (৳)": netDue,
      "পেমেন্ট মাধ্যম": payMethodName,
      "মেমোর অবস্থা": memoStatus,
      "বিক্রয়কর্মী": s.userName || s.userId || "এডমিন",
      "ক্রেতার আইডি": s.customerId || "",
      "বিক্রয় আইডি": s.id || s.invoiceNo || "",
      "র কালেকশন JSON": JSON.stringify(s.items || [])
    };
  });
  const wsSales = XLSX.utils.json_to_sheet(salesData, { header: salesHeader });
  XLSX.utils.book_append_sheet(wb, wsSales, "বিক্রয় ও মেমো");

  // 3. বিক্রয় অর্ডার (Slide Menu #4: বিক্রয় অর্ডার)
  const approvalsHeader = [
    "রিকুয়েস্ট আইডি",
    "তারিখ ও সময় (ঢাকা)",
    "রিকুয়েস্টের ধরন",
    "টেম্পোরারি ভাউচার/মেমো",
    "চূড়ান্ত মেমো নং",
    "সেলসম্যানের নাম",
    "ক্রেতার নাম",
    "ক্রেতার মোবাইল",
    "মোট বিল / জমার পরিমাণ (৳)",
    "নগদ জমা (৳)",
    "বকেয়া / ব্যালেন্স (৳)",
    "বর্তমান স্ট্যাটাস",
    "সিদ্ধান্ত গ্রহণকারী",
    "সিদ্ধান্তের সময়",
    "বিস্তারিত JSON"
  ];
  const approvalsData = approvalRequests.map((req: any) => {
    const isSale = req.type === "sale";
    const sData = req.saleData || {};
    const pData = req.paymentData || {};
    const statusLabel =
      req.status === "approved"
        ? "অনুমোদিত (Approved)"
        : req.status === "rejected"
        ? "বাতিলকৃত (Rejected)"
        : "অপেক্ষমান (Pending)";

    return {
      "রিকুয়েস্ট আইডি": req.id || "",
      "তারিখ ও সময় (ঢাকা)": req.createdAt ? formatDhakaDateTime(req.createdAt) : "",
      "রিকুয়েস্টের ধরন": isSale ? "বিক্রয় অর্ডার (POS)" : "বকেয়া / জমা অর্ডার",
      "টেম্পোরারি ভাউচার/মেমো": req.temporaryInvoiceNo || "",
      "চূড়ান্ত মেমো নং": req.finalInvoiceNo || "-",
      "সেলসম্যানের নাম": req.userName || "সেলসম্যান",
      "ক্রেতার নাম": isSale ? sData.customerName || "ক্রেতা" : pData.customerName || "ক্রেতা",
      "ক্রেতার মোবাইল": isSale ? sData.customerPhone || "" : pData.customerPhone || "",
      "মোট বিল / জমার পরিমাণ (৳)": isSale
        ? Number(sData.payableAmount ?? sData.totalAmount) || 0
        : Number(pData.amount) || 0,
      "নগদ জমা (৳)": isSale ? Number(sData.paidAmount) || 0 : Number(pData.amount) || 0,
      "বকেয়া / ব্যালেন্স (৳)": isSale
        ? Number(sData.dueAmount) || 0
        : (Number(pData.currentDueBefore) || 0) - (Number(pData.amount) || 0),
      "বর্তমান স্ট্যাটাস": statusLabel,
      "সিদ্ধান্ত গ্রহণকারী": req.reviewedBy || "-",
      "সিদ্ধান্তের সময়": req.reviewedAt ? formatDhakaDateTime(req.reviewedAt) : "-",
      "বিস্তারিত JSON": JSON.stringify(req)
    };
  });
  const wsApprovals = XLSX.utils.json_to_sheet(approvalsData, { header: approvalsHeader });
  XLSX.utils.book_append_sheet(wb, wsApprovals, "বিক্রয় অর্ডার");

  // 4. পণ্য তালিকা (Slide Menu #5: পণ্য তালিকা - অন্যান্য কাস্টম মূল্য পণ্য সহ)
  const productsHeader = [
    "আইডি (ID)",
    "পণ্যের নাম",
    "বাংলা নাম",
    "SKU",
    "বারকোড",
    "ক্যাটাগরি",
    "ক্রয়মূল্য (৳)",
    "বিক্রয়মূল্য (৳)",
    "বর্তমান স্টক",
    "সর্বনিম্ন স্টক",
    "একক",
    "স্টকের অবস্থা",
    "পণ্যের ধরন",
    "মেয়াদ উত্তীর্ণের তারিখ"
  ];
  const productsData = products.map((p: any) => {
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

    return {
      "আইডি (ID)": p.id || "",
      "পণ্যের নাম": p.name || "",
      "বাংলা নাম": p.bnName || p.name || "",
      "SKU": p.sku || "",
      "বারকোড": p.barcode || (Array.isArray(p.barcodes) ? p.barcodes.join(", ") : ""),
      "ক্যাটাগরি": p.categoryId || (isOther ? "অন্যান্য" : "সাধারণ"),
      "ক্রয়মূল্য (৳)": Number(p.purchasePrice) || 0,
      "বিক্রয়মূল্য (৳)": Number(p.salePrice) || 0,
      "বর্তমান স্টক": stock,
      "সর্বনিম্ন স্টক": minStock,
      "একক": p.unit || "পিস",
      "স্টকের অবস্থা": status,
      "পণ্যের ধরন": isOther ? "অন্যান্য (কাস্টম মূল্য)" : "সাধারণ পণ্য",
      "মেয়াদ উত্তীর্ণের তারিখ": p.expiryDate || ""
    };
  });
  const wsProducts = XLSX.utils.json_to_sheet(productsData, { header: productsHeader });
  XLSX.utils.book_append_sheet(wb, wsProducts, "পণ্য তালিকা");

  // 5. ক্যাটাগরি (Product Categories)
  const categoriesHeader = ["ক্যাটাগরি আইডি", "ক্যাটাগরির নাম", "বিবরণ"];
  const categoriesData = categories.map((c: any) => ({
    "ক্যাটাগরি আইডি": c.id || "",
    "ক্যাটাগরির নাম": c.name || "",
    "বিবরণ": c.description || ""
  }));
  const wsCategories = XLSX.utils.json_to_sheet(categoriesData, { header: categoriesHeader });
  XLSX.utils.book_append_sheet(wb, wsCategories, "ক্যাটাগরি");

  // 6. ক্রেতা (Slide Menu #6: ক্রেতা - বকেয়া পরিমাণ ও ক্রেতা পাবে সহ)
  const customersHeader = [
    "ক্রেতার আইডি",
    "ক্রেতার নাম",
    "মোবাইল নম্বর",
    "ঠিকানা",
    "বকেয়া পরিমাণ (৳)",
    "ক্রেতা পাবে / অ্যাডভান্স (৳)",
    "নিট ব্যালেন্স (৳)",
    "হিসাবের অবস্থা",
    "সর্বমোট কেনাকাটা (৳)",
    "ইউজার আইডি (CreatedBy)",
    "নিবন্ধন তারিখ"
  ];
  const customersData = customers.map((c: any) => {
    const bal = Number(c.dueAmount) || 0;
    return {
      "ক্রেতার আইডি": c.id || "",
      "ক্রেতার নাম": c.name || "ক্রেতা",
      "মোবাইল নম্বর": c.phone || "",
      "ঠিকানা": c.address || "",
      "বকেয়া পরিমাণ (৳)": bal > 0 ? bal : 0,
      "ক্রেতা পাবে / অ্যাডভান্স (৳)": bal < 0 ? Math.abs(bal) : 0,
      "নিট ব্যালেন্স (৳)": bal,
      "হিসাবের অবস্থা": bal < 0 ? "ক্রেতা পাবে" : bal > 0 ? "বকেয়া পরিমাণ" : "পরিশোধিত",
      "সর্বমোট কেনাকাটা (৳)": Number(c.totalSpent) || 0,
      "ইউজার আইডি (CreatedBy)": c.createdBy || "admin-1",
      "নিবন্ধন তারিখ": c.createdAt ? formatDhakaDate(c.createdAt) : ""
    };
  });
  const wsCustomers = XLSX.utils.json_to_sheet(customersData, { header: customersHeader });
  XLSX.utils.book_append_sheet(wb, wsCustomers, "ক্রেতা");

  // 7. সরবরাহকারী (Slide Menu #7: সরবরাহকারী)
  const suppliersHeader = [
    "সরবরাহকারী আইডি",
    "নাম",
    "কোম্পানির নাম",
    "মোবাইল নম্বর",
    "ঠিকানা",
    "আমাদের বর্তমান দেনা (৳)",
    "দেনার অবস্থা",
    "সর্বশেষ তারিখ"
  ];
  const suppliersData = suppliers.map((sup: any) => {
    const due = Number(sup.dueAmount) || 0;
    return {
      "সরবরাহকারী আইডি": sup.id || "",
      "নাম": sup.name || "সরবরাহকারী",
      "কোম্পানির নাম": sup.company || "",
      "মোবাইল নম্বর": sup.phone || "",
      "ঠিকানা": sup.address || "",
      "আমাদের বর্তমান দেনা (৳)": due,
      "দেনার অবস্থা": due > 0 ? "দেনা আছে (পরিশোধযোগ্য)" : "পরিশোধিত",
      "সর্বশেষ তারিখ": sup.createdAt ? formatDhakaDate(sup.createdAt) : ""
    };
  });
  const wsSuppliers = XLSX.utils.json_to_sheet(suppliersData, { header: suppliersHeader });
  XLSX.utils.book_append_sheet(wb, wsSuppliers, "সরবরাহকারী");

  // 8. হিসাব ও খরচ (Slide Menu #8: হিসাব / জমা-খরচ)
  const expensesHeader = [
    "খরচ আইডি",
    "তারিখ (ঢাকা সময়)",
    "খরচের খাত (Category)",
    "টাকার পরিমাণ (৳)",
    "বিবরণ / নোট",
    "এন্ট্রিকারী (ইউজার)",
    "হিসাবের ধরন",
    "ইউজার আইডি"
  ];
  const expensesData = expenses.map((e: any) => ({
    "খরচ আইডি": e.id || "",
    "তারিখ (ঢাকা সময়)": e.date ? formatDhakaDate(e.date) : "",
    "খরচের খাত (Category)": e.category || "সাধারণ খরচ",
    "টাকার পরিমাণ (৳)": Number(e.amount) || 0,
    "বিবরণ / নোট": e.note || e.description || "",
    "এন্ট্রিকারী (ইউজার)": e.userName || e.userId || "এডমিন",
    "হিসাবের ধরন": "ব্যয় / খরচ (Expense)",
    "ইউজার আইডি": e.userId || "1"
  }));
  const wsExpenses = XLSX.utils.json_to_sheet(expensesData, { header: expensesHeader });
  XLSX.utils.book_append_sheet(wb, wsExpenses, "হিসাব ও খরচ");

  // 9. বকেয়া খাতা (Slide Menu #9: বকেয়া - বকেয়া পরিমাণ ও ক্রেতা পাবে উভয়ই)
  const duesHeader = [
    "ক্রমিক",
    "ক্রেতার আইডি",
    "ক্রেতার নাম",
    "মোবাইল নম্বর",
    "ঠিকানা",
    "বকেয়া পরিমাণ (৳)",
    "ক্রেতা পাবে / অ্যাডভান্স (৳)",
    "নিট ব্যালেন্স (৳)",
    "মোট ক্রয় (৳)",
    "হিসাবের অবস্থা",
    "তাগাদা স্ট্যাটাস"
  ];
  const activeBalanceCustomers = customers
    .filter((c: any) => (Number(c.dueAmount) || 0) !== 0)
    .sort((a: any, b: any) => Math.abs(Number(b.dueAmount) || 0) - Math.abs(Number(a.dueAmount) || 0));

  const dueCustomersData = activeBalanceCustomers.map((c: any, index: number) => {
    const bal = Number(c.dueAmount) || 0;
    const isAdvance = bal < 0;
    return {
      "ক্রমিক": index + 1,
      "ক্রেতার আইডি": c.id || "",
      "ক্রেতার নাম": c.name || "ক্রেতা",
      "মোবাইল নম্বর": c.phone || "",
      "ঠিকানা": c.address || "",
      "বকেয়া পরিমাণ (৳)": bal > 0 ? bal : 0,
      "ক্রেতা পাবে / অ্যাডভান্স (৳)": isAdvance ? Math.abs(bal) : 0,
      "নিট ব্যালেন্স (৳)": bal,
      "মোট ক্রয় (৳)": Number(c.totalSpent) || 0,
      "হিসাবের অবস্থা": isAdvance ? "ক্রেতা পাবে" : "বকেয়া পরিমাণ",
      "তাগাদা স্ট্যাটাস": isAdvance ? "ক্রেতার অতিরিক্ত অ্যাডভান্স জমা আছে" : "বকেয়া পরিশোধের তাগাদা দিন"
    };
  });
  const wsDueCustomers = XLSX.utils.json_to_sheet(dueCustomersData, { header: duesHeader });
  XLSX.utils.book_append_sheet(wb, wsDueCustomers, "বকেয়া খাতা");

  // 10. এসএমএস লগ (Slide Menu #10: এসএমএস)
  const smsHeader = [
    "এসএমএস আইডি",
    "তারিখ ও সময় (ঢাকা)",
    "প্রাপকের মোবাইল নম্বর",
    "বার্তা (Message)",
    "স্ট্যাটাস"
  ];
  const smsData = smsLogs.map((log: any) => ({
    "এসএমএস আইডি": log.id || "",
    "তারিখ ও সময় (ঢাকা)": log.createdAt ? formatDhakaDateTime(log.createdAt) : "",
    "প্রাপকের মোবাইল নম্বর": log.recipient || "",
    "বার্তা (Message)": log.message || "",
    "স্ট্যাটাস": log.status === "sent" ? "প্রেরিত (Sent)" : log.status || "Sent"
  }));
  const wsSMS = XLSX.utils.json_to_sheet(smsData, { header: smsHeader });
  XLSX.utils.book_append_sheet(wb, wsSMS, "এসএমএস লগ");

  // 11. ইউজার ও স্টাফ (Slide Menu #11: ইউজার)
  const usersHeader = [
    "ইউজার আইডি",
    "নাম",
    "ইমেইল",
    "মোবাইল",
    "পদবী / রোল",
    "শপ আইডি (Business ID)",
    "অনুমতিসমূহ",
    "সর্বশেষ সক্রিয়"
  ];
  const usersData = users.map((u: any) => ({
    "ইউজার আইডি": u.id || "",
    "নাম": u.name || "ইউজার",
    "ইমেইল": u.email || "",
    "মোবাইল": u.phone || "",
    "পদবী / রোল": u.role === "admin" ? "অ্যাডমিন" : u.role === "manager" ? "ম্যানেজার" : "সেলসম্যান",
    "শপ আইডি (Business ID)": u.businessId || "main-business",
    "অনুমতিসমূহ": Array.isArray(u.permissions) ? u.permissions.join(", ") : "সকল পারমিশন",
    "সর্বশেষ সক্রিয়": u.lastSeen ? formatDhakaDateTime(u.lastSeen) : ""
  }));
  const wsUsers = XLSX.utils.json_to_sheet(usersData, { header: usersHeader });
  XLSX.utils.book_append_sheet(wb, wsUsers, "ইউজার ও স্টাফ");

  // 12. প্রতিষ্ঠান সেটিংস (Slide Menu #12: সেটিংস)
  const settingsData = [
    { "কনফিগারেশন ফিল্ড": "business_id", "মান (Value)": biz.id || "main-business", "বর্ণনা": "প্রতিষ্ঠানের প্রধান আইডি" },
    { "কনফিগারেশন ফিল্ড": "name", "মান (Value)": biz.name || "হিসাব পাতি ERP", "বর্ণনা": "প্রতিষ্ঠানের নাম" },
    { "কনফিগারেশন ফিল্ড": "address", "মান (Value)": biz.address || "ঢাকা, বাংলাদেশ", "বর্ণনা": "দোকানের ঠিকানা" },
    { "কনফিগারেশন ফিল্ড": "phone", "মান (Value)": biz.phone || "01700000000", "বর্ণনা": "দোকানের ফোন নম্বর" },
    { "কনফিগারেশন ফিল্ড": "currency", "মান (Value)": biz.currency || "৳", "বর্ণনা": "মুদ্রা" },
    { "কনফিগারেশন ফিল্ড": "default_printer", "মান (Value)": biz.defaultPrinter || "thermal", "বর্ণনা": "ডিফল্ট প্রিন্টার টাইপ" },
    { "কনফিগারেশন ফিল্ড": "theme", "মান (Value)": biz.theme || "light", "বর্ণনা": "অ্যাপ থিম" },
    { "কনফিগারেশন ফিল্ড": "sync_updated_at", "মান (Value)": formatDhakaDateTime(new Date()), "বর্ণনা": "সর্বশেষ সিঙ্কের তারিখ ও সময়" }
  ];
  const wsSettings = XLSX.utils.json_to_sheet(settingsData);
  XLSX.utils.book_append_sheet(wb, wsSettings, "প্রতিষ্ঠান সেটিংস");

  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Blob([wbout], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
