/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const GOOGLE_APPS_SCRIPT_CODE = `/**
 * =========================================================================
 * হিসাবপাতি ERP (HishabPati ERP) - Google Sheets Master Database Engine
 * =========================================================================
 * এই স্ক্রিপ্টটি আপনার গুগল স্প্রেডশিটকে একটি সম্পূর্ণ স্বয়ংসম্পূর্ণ ERP ডাটাবেজে রূপান্তর করে।
 * অ্যাপের প্রতিটি ট্যাবের অনুরূপ বাংলা নামে শিট থাকবে:
 * 1. ড্যাশবোর্ড (Dashboard Summary & Auto-Formulas)
 * 2. পণ্য তালিকা (Products Inventory)
 * 3. বিক্রয় ও মেমো (Sales & Invoices)
 * 4. ক্রেতা (Customers & Balance)
 * 5. সরবরাহকারী (Suppliers Ledger)
 * 6. হিসাব ও খরচ (Accounting & Expenses)
 * 7. বকেয়া খাতা (Customer Due Management)
 * 8. ইউজার ও স্টাফ (Staff & Users)
 * 9. প্রতিষ্ঠান সেটিংস (Shop & Business Profile)
 *
 * যদি হিসাবপাতি ওয়েব অ্যাপ কোনো কারণে বন্ধ বা নষ্ট হয়ে যায়, তবুও এই গুগল শিটটি 
 * স্বয়ংক্রিয় ফর্মুলা, হিসাব-নিকাশ এবং কাস্টম মেনু দিয়ে অ্যাপের মতোই কাজ করবে!
 *
 * ইন্সটলেশন নির্দেশিকা:
 * 1. Google Sheets এর মেনু থেকে Extensions -> Apps Script এ যান।
 * 2. বিদ্যমান কোড মুছে এই সম্পূর্ণ কোডটি পেস্ট করুন।
 * 3. Deploy -> New Deployment -> Web App নির্বাচন করুন।
 * 4. 'Who has access' অপশনে 'Anyone' নির্বাচন করে Deploy দিন।
 * 5. প্রাপ্ত Web App URL টি হিসাবপাতি অ্যাপের Settings এ বসিয়ে দিন।
 * =========================================================================
 */

const SHEETS = {
  DASHBOARD: 'ড্যাশবোর্ড',
  PRODUCTS: 'পণ্য তালিকা',
  SALES: 'বিক্রয় ও মেমো',
  CUSTOMERS: 'ক্রেতা',
  SUPPLIERS: 'সরবরাহকারী',
  EXPENSES: 'হিসাব ও খরচ',
  DUES: 'বকেয়া খাতা',
  USERS: 'ইউজার ও স্টাফ',
  SETTINGS: 'প্রতিষ্ঠান সেটিংস'
};

const THEME = {
  HEADER_BG: '#1e3a8a',
  HEADER_FG: '#ffffff',
  ACCENT_BG: '#2563eb',
  ACCENT_FG: '#ffffff',
  DUE_BG: '#fee2e2',
  DUE_FG: '#991b1b',
  BORDER_COLOR: '#cbd5e1'
};

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('📊 হিসাবপাতি ERP মেনু')
    .addItem('🔄 সকল শিট ও ফর্মুলা রিফ্রেশ করুন', 'initializeAllSheets')
    .addSeparator()
    .addItem('➕ নতুন বিক্রয় মেমো যুক্ত করুন', 'menuAddSalePrompt')
    .addItem('➕ নতুন পণ্য যুক্ত করুন', 'menuAddProductPrompt')
    .addItem('💰 বকেয়া টাকা জমা নিন', 'menuRecordDuePaymentPrompt')
    .addSeparator()
    .addItem('📥 অ্যাপের জন্য ব্যাকআপ JSON এক্সপোর্ট', 'menuExportJson')
    .addToUi();
}

function doGet(e) {
  try {
    const action = e?.parameter?.action || 'ping';
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    if (action === 'ping') {
      return jsonResponse({
        status: 'online',
        message: 'হিসাবপাতি গুগল শিট ডাটাবেজ সক্রিয় রয়েছে।',
        spreadsheetName: ss.getName(),
        spreadsheetId: ss.getId(),
        timestamp: new Date().toISOString()
      });
    }

    if (action === 'fetchData' || action === 'getAllData') {
      return jsonResponse(readAllSpreadsheetData(ss));
    }

    return jsonResponse({ error: 'অজানা অ্যাকশন', action: action });
  } catch (err) {
    return jsonResponse({ error: err.toString() });
  }
}

function doPost(e) {
  try {
    let payload = {};
    if (e && e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    } else if (e && e.parameter) {
      payload = e.parameter;
    }

    const action = payload.action || 'fullSync';
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    if (action === 'fullSync') {
      const data = payload.data || payload;
      const result = performFullDatabaseSync(ss, data);
      return jsonResponse({
        success: true,
        message: 'সকল তথ্য সফলভাবে গুগল শিটে সিঙ্ক হয়েছে।',
        details: result,
        timestamp: new Date().toISOString()
      });
    }

    if (action === 'syncProduct') {
      syncSingleProduct(ss, payload.item, payload.operation || 'upsert');
      return jsonResponse({ success: true, message: 'পণ্য শিটে আপডেট হয়েছে' });
    }

    if (action === 'syncSale') {
      syncSingleSale(ss, payload.item);
      return jsonResponse({ success: true, message: 'বিক্রয় মেমো শিটে যুক্ত হয়েছে' });
    }

    if (action === 'syncCustomer') {
      syncSingleCustomer(ss, payload.item, payload.operation || 'upsert');
      return jsonResponse({ success: true, message: 'ক্রেতার তথ্য শিটে আপডেট হয়েছে' });
    }

    if (action === 'syncSupplier') {
      syncSingleSupplier(ss, payload.item, payload.operation || 'upsert');
      return jsonResponse({ success: true, message: 'সরবরাহকারী শিটে আপডেট হয়েছে' });
    }

    if (action === 'syncExpense') {
      syncSingleExpense(ss, payload.item);
      return jsonResponse({ success: true, message: 'খরচ শিটে যুক্ত হয়েছে' });
    }

    if (action === 'recordPayment') {
      syncCustomerPayment(ss, payload);
      return jsonResponse({ success: true, message: 'পেমেন্ট শিটে আপডেট হয়েছে' });
    }

    return jsonResponse({ error: 'অজানা পোস্ট অ্যাকশন', action: action });
  } catch (err) {
    return jsonResponse({ error: err.toString() });
  }
}

function performFullDatabaseSync(ss, data) {
  initializeAllSheets();
  const counts = { products: 0, sales: 0, customers: 0, suppliers: 0, expenses: 0, dues: 0 };

  if (data.business) writeSettingsSheet(ss, data.business);
  if (Array.isArray(data.products)) {
    writeProductsSheet(ss, data.products);
    counts.products = data.products.length;
  }
  if (Array.isArray(data.customers)) {
    writeCustomersSheet(ss, data.customers);
    writeDuesSheet(ss, data.customers);
    counts.customers = data.customers.length;
    counts.dues = data.customers.filter(c => (Number(c.dueAmount) || 0) > 0).length;
  }
  if (Array.isArray(data.sales)) {
    writeSalesSheet(ss, data.sales);
    counts.sales = data.sales.length;
  }
  if (Array.isArray(data.suppliers)) {
    writeSuppliersSheet(ss, data.suppliers);
    counts.suppliers = data.suppliers.length;
  }
  if (Array.isArray(data.expenses)) {
    writeExpensesSheet(ss, data.expenses);
    counts.expenses = data.expenses.length;
  }
  if (Array.isArray(data.users)) {
    writeUsersSheet(ss, data.users);
  }

  writeDashboardSheet(ss, data);
  return counts;
}

function initializeAllSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const configs = [
    { name: SHEETS.DASHBOARD, headers: ['বিষয় / মেট্রিক', 'বর্তমান মান', 'বিবরণ', 'ফর্মুলা / স্থিতি'], widths: [220, 180, 260, 200] },
    { name: SHEETS.PRODUCTS, headers: ['আইডি (ID)', 'পণ্যের নাম', 'বাংলা নাম', 'SKU', 'বারকোড', 'ক্যাটাগরি', 'ক্রয়মূল্য (৳)', 'বিক্রয়মূল্য (৳)', 'বর্তমান স্টক', 'সর্বনিম্ন স্টক', 'একক', 'স্টকের অবস্থা'], widths: [140, 200, 180, 120, 130, 120, 110, 110, 110, 110, 80, 130] },
    { name: SHEETS.SALES, headers: ['মেমো নং (Invoice)', 'তারিখ ও সময় (ঢাকা)', 'ক্রেতার নাম', 'মোবাইল', 'পণ্যের বিবরণ', 'মোট টাকা (৳)', 'ছাড় (৳)', 'ভ্যাট (৳)', 'প্রদেয় বিল (৳)', 'নগদ জমা (৳)', 'বাকি টাকা (৳)', 'পেমেন্ট মাধ্যম', 'বিক্রয়কর্মী'], widths: [130, 160, 170, 130, 260, 110, 90, 90, 110, 110, 110, 120, 130] },
    { name: SHEETS.CUSTOMERS, headers: ['ক্রেতার আইডি', 'ক্রেতার নাম', 'মোবাইল নম্বর', 'ঠিকানা', 'বর্তমান মোট বকেয়া (৳)', 'সর্বমোট কেনাকাটা (৳)', 'নিবন্ধন তারিখ'], widths: [130, 180, 130, 220, 150, 150, 140] },
    { name: SHEETS.DUES, headers: ['ক্রমিক', 'ক্রেতার নাম', 'মোবাইল নম্বর', 'ঠিকানা', 'বর্তমান বকেয়া টাকা (৳)', 'মোট ক্রয় (৳)', 'বকেয়ার অবস্থা', 'তাগাদা স্ট্যাটাস'], widths: [70, 180, 130, 220, 150, 140, 130, 140] },
    { name: SHEETS.SUPPLIERS, headers: ['সরবরাহকারী আইডি', 'নাম', 'কোম্পানির নাম', 'মোবাইল নম্বর', 'ঠিকানা', 'আমাদের বর্তমান দেনা (৳)', 'সর্বশেষ তারিখ'], widths: [140, 180, 180, 130, 220, 160, 140] },
    { name: SHEETS.EXPENSES, headers: ['খরচ আইডি', 'তারিখ (ঢাকা সময়)', 'খরচের খাত', 'টাকার পরিমাণ (৳)', 'বিবরণ / নোট', 'খরচকারী'], widths: [130, 150, 160, 130, 260, 140] },
    { name: SHEETS.USERS, headers: ['ইউজার আইডি', 'নাম', 'ইমেইল', 'মোবাইল', 'পদবী / রোল', 'অনুমতিসমূহ', 'সর্বশেষ সক্রিয়'], widths: [130, 180, 200, 130, 120, 260, 150] },
    { name: SHEETS.SETTINGS, headers: ['কনফিগারেশন ফিল্ড', 'মান (Value)', 'বর্ণনা'], widths: [200, 280, 260] }
  ];

  configs.forEach(cfg => {
    let sheet = ss.getSheetByName(cfg.name);
    if (!sheet) sheet = ss.insertSheet(cfg.name);
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(cfg.headers);
      applyHeaderStyle(sheet, cfg.headers.length);
    }
    if (cfg.widths) {
      cfg.widths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));
    }
  });
  return true;
}

function applyHeaderStyle(sheet, colCount) {
  const headerRange = sheet.getRange(1, 1, 1, colCount);
  headerRange.setBackground(THEME.HEADER_BG)
    .setFontColor(THEME.HEADER_FG)
    .setFontWeight('bold')
    .setFontSize(10)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  sheet.setRowHeight(1, 34);
  sheet.setFrozenRows(1);
}

function writeDashboardSheet(ss, data) {
  let sheet = ss.getSheetByName(SHEETS.DASHBOARD);
  if (!sheet) sheet = ss.insertSheet(SHEETS.DASHBOARD);
  sheet.clear();
  const headers = ['বিষয় / মেট্রিক', 'বর্তমান মান', 'বিবরণ ও হিসাব সূত্র', 'স্থিতি'];
  sheet.appendRow(headers);
  applyHeaderStyle(sheet, headers.length);

  const biz = data.business || {};
  const rows = [
    ['🏪 প্রতিষ্ঠানের নাম', biz.name || 'হিসাব পাতি ERP', 'আপনার ব্যবসার নাম', 'সক্রিয়'],
    ['📍 ঠিকানা ও মোবাইল', (biz.address || '') + ' | ' + (biz.phone || ''), 'যোগাযোগ বিবরণ', 'ভেরিফাইড'],
    ['🕒 সর্বশেষ সিঙ্কের সময়', formatDhakaDateTime(new Date()), 'সরাসরি হিসাবপাতি অ্যাপ থেকে সিঙ্ক হয়েছে', 'আপ-টু-ডেট'],
    ['------------------------------', '------------------------------', '------------------------------', '----------'],
    ['💰 সর্বমোট বিক্রয় (Life-Time)', "=SUM('" + SHEETS.SALES + "'!I2:I)", "'বিক্রয় ও মেমো' এর মোট প্রদেয় বিক্রির যোগফল", 'স্বয়ংক্রিয়'],
    ['💵 মোট নগদ আদায় (Paid Total)', "=SUM('" + SHEETS.SALES + "'!J2:J)", "'বিক্রয় ও মেমো' এর নগদ আদায়কৃত টাকা", 'স্বয়ংক্রিয়'],
    ['🔴 মোট কাস্টমার বকেয়া (Due)', "=SUM('" + SHEETS.CUSTOMERS + "'!E2:E)", "'ক্রেতা' তালিকা অনুযায়ী মোট পাওনা", 'তাগাদা দিন'],
    ['📦 সর্বমোট পন্যের সংখ্যা', "=COUNTA('" + SHEETS.PRODUCTS + "'!B2:B)", "'পণ্য তালিকা' মোট সক্রিয় আইটেম", 'ইনভেন্টরি'],
    ['⚠️ কম স্টকের পন্যের সংখ্যা', "=COUNTIF('" + SHEETS.PRODUCTS + "'!L:L, \\"স্টক শেষ\\") + COUNTIF('" + SHEETS.PRODUCTS + "'!L:L, \\"কম স্টক\\")", 'যেসব পণ্যের স্টক ফুরিয়ে যাচ্ছে', 'রি-অর্ডার প্রয়োজন'],
    ['💸 মোট খরচের পরিমাণ', "=SUM('" + SHEETS.EXPENSES + "'!D2:D)", "'হিসাব ও খরচ' এর মোট যোগফল", 'হিসাবভুক্ত'],
    ['🏭 সরবরাহকারীর কাছে দেনা', "=SUM('" + SHEETS.SUPPLIERS + "'!F2:F)", "'সরবরাহকারী' সাপ্লায়ারদের কাছে আমাদের দেনা", 'পরিশোধযোগ্য'],
    ['------------------------------', '------------------------------', '------------------------------', '----------'],
    ['💡 অ্যাপ বন্ধ থাকলেও পরামর্শ', 'গুগল শিট থেকে সরাসরি প্রিন্ট ও হিসাব করুন', 'উপরের মেনু থেকে "হিসাবপাতি ERP" ক্লিক করুন', 'রেডি']
  ];

  rows.forEach(r => sheet.appendRow(r));
  sheet.setColumnWidth(1, 240);
  sheet.setColumnWidth(2, 220);
  sheet.setColumnWidth(3, 300);
  sheet.setColumnWidth(4, 160);
  sheet.getRange('B5:B7').setNumberFormat('৳ #,##0.00').setFontWeight('bold');
  sheet.getRange('B10:B11').setNumberFormat('৳ #,##0.00').setFontWeight('bold');
}

function writeProductsSheet(ss, products) {
  let sheet = ss.getSheetByName(SHEETS.PRODUCTS);
  if (!sheet) sheet = ss.insertSheet(SHEETS.PRODUCTS);
  sheet.clear();
  const headers = ['আইডি (ID)', 'পণ্যের নাম', 'বাংলা নাম', 'SKU', 'বারকোড', 'ক্যাটাগরি', 'ক্রয়মূল্য (৳)', 'বিক্রয়মূল্য (৳)', 'বর্তমান স্টক', 'সর্বনিম্ন স্টক', 'একক', 'স্টকের অবস্থা'];
  sheet.appendRow(headers);
  applyHeaderStyle(sheet, headers.length);
  if (!products || products.length === 0) return;

  const rows = products.map(p => {
    const stock = Number(p.stock) || 0;
    const minStock = Number(p.minStock) || 5;
    let status = stock <= 0 ? 'স্টক শেষ' : (stock <= minStock ? 'কম স্টক' : 'পর্যাপ্ত স্টক');
    const barcodeVal = p.barcode || (Array.isArray(p.barcodes) ? p.barcodes.join(', ') : '');
    return [
      p.id || '',
      p.name || '',
      p.bnName || '',
      p.sku || '',
      barcodeVal,
      p.categoryId || 'সাধারণ',
      Number(p.purchasePrice) || 0,
      Number(p.salePrice) || 0,
      stock,
      minStock,
      p.unit || 'পিস',
      status
    ];
  });
  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  sheet.getRange(2, 7, rows.length, 2).setNumberFormat('৳ #,##0.00');
  sheet.getRange(2, 9, rows.length, 2).setNumberFormat('#,##0');
}

function writeSalesSheet(ss, sales) {
  let sheet = ss.getSheetByName(SHEETS.SALES);
  if (!sheet) sheet = ss.insertSheet(SHEETS.SALES);
  sheet.clear();
  const headers = ['মেমো নং (Invoice)', 'তারিখ ও সময় (ঢাকা)', 'ক্রেতার নাম', 'মোবাইল', 'পণ্যের বিবরণ', 'মোট টাকা (৳)', 'ছাড় (৳)', 'ভ্যাট (৳)', 'প্রদেয় বিল (৳)', 'নগদ জমা (৳)', 'বাকি টাকা (৳)', 'পেমেন্ট মাধ্যম', 'বিক্রয়কর্মী'];
  sheet.appendRow(headers);
  applyHeaderStyle(sheet, headers.length);
  if (!sales || sales.length === 0) return;

  const rows = sales.map(s => {
    let itemsSummary = '';
    if (Array.isArray(s.items)) {
      itemsSummary = s.items.map(it => (it.name || 'পণ্য') + ' (' + (it.quantity || 1) + 'x' + (it.unitPrice || 0) + '৳)').join('; ');
    }
    const payMethodName = s.paymentMethod === 'mobile_pay' ? 'বিকাশ/নগদ' : (s.paymentMethod === 'card' ? 'কার্ড' : 'নগদ ক্যাশ');
    return [
      s.invoiceNo || s.id || '',
      formatDhakaDateTime(s.createdAt),
      s.customerName || 'সাধারণ ক্রেতা',
      s.customerPhone || '',
      itemsSummary,
      Number(s.totalAmount) || 0,
      Number(s.discount) || 0,
      Number(s.vat) || 0,
      Number(s.payableAmount || s.totalAmount) || 0,
      Number(s.paidAmount) || 0,
      Number(s.dueAmount) || 0,
      payMethodName,
      s.userName || s.userId || 'এডমিন'
    ];
  });
  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  sheet.getRange(2, 6, rows.length, 6).setNumberFormat('৳ #,##0.00');
}

function writeCustomersSheet(ss, customers) {
  let sheet = ss.getSheetByName(SHEETS.CUSTOMERS);
  if (!sheet) sheet = ss.insertSheet(SHEETS.CUSTOMERS);
  sheet.clear();
  const headers = ['ক্রেতার আইডি', 'ক্রেতার নাম', 'মোবাইল নম্বর', 'ঠিকানা', 'বর্তমান মোট বকেয়া (৳)', 'সর্বমোট কেনাকাটা (৳)', 'নিবন্ধন তারিখ'];
  sheet.appendRow(headers);
  applyHeaderStyle(sheet, headers.length);
  if (!customers || customers.length === 0) return;

  const rows = customers.map(c => [
    c.id || '',
    c.name || 'ক্রেতা',
    c.phone || '',
    c.address || '',
    Number(c.dueAmount) || 0,
    Number(c.totalSpent) || 0,
    formatDhakaDateOnly(c.createdAt)
  ]);
  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  sheet.getRange(2, 5, rows.length, 2).setNumberFormat('৳ #,##0.00');
}

function writeDuesSheet(ss, customers) {
  let sheet = ss.getSheetByName(SHEETS.DUES);
  if (!sheet) sheet = ss.insertSheet(SHEETS.DUES);
  sheet.clear();
  const headers = ['ক্রমিক', 'ক্রেতার নাম', 'মোবাইল নম্বর', 'ঠিকানা', 'বর্তমান বকেয়া টাকা (৳)', 'মোট ক্রয় (৳)', 'বকেয়ার অবস্থা', 'তাগাদা স্ট্যাটাস'];
  sheet.appendRow(headers);
  applyHeaderStyle(sheet, headers.length);

  const dueCustomers = (customers || [])
    .filter(c => (Number(c.dueAmount) || 0) > 0)
    .sort((a, b) => (Number(b.dueAmount) || 0) - (Number(a.dueAmount) || 0));

  if (dueCustomers.length === 0) {
    sheet.appendRow([1, 'কোনো গ্রাহকের বকেয়া নেই (আলহামদুলিল্লাহ)', '-', '-', 0, 0, 'পরিশোধিত', 'কোনো তাগাদা প্রয়োজন নেই']);
    return;
  }

  const rows = dueCustomers.map((c, idx) => [
    idx + 1,
    c.name || 'ক্রেতা',
    c.phone || '',
    c.address || '',
    Number(c.dueAmount) || 0,
    Number(c.totalSpent) || 0,
    'বকেয়া রয়েছে',
    'জরুরি তাগাদা দিন'
  ]);
  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  sheet.getRange(2, 5, rows.length, 2).setNumberFormat('৳ #,##0.00');
  sheet.getRange(2, 5, rows.length, 1).setBackground(THEME.DUE_BG).setFontColor(THEME.DUE_FG).setFontWeight('bold');
}

function writeSuppliersSheet(ss, suppliers) {
  let sheet = ss.getSheetByName(SHEETS.SUPPLIERS);
  if (!sheet) sheet = ss.insertSheet(SHEETS.SUPPLIERS);
  sheet.clear();
  const headers = ['সরবরাহকারী আইডি', 'নাম', 'কোম্পানির নাম', 'মোবাইল নম্বর', 'ঠিকানা', 'আমাদের বর্তমান দেনা (৳)', 'সর্বশেষ তারিখ'];
  sheet.appendRow(headers);
  applyHeaderStyle(sheet, headers.length);
  if (!suppliers || suppliers.length === 0) return;

  const rows = suppliers.map(s => [
    s.id || '',
    s.name || 'সরবরাহকারী',
    s.company || '',
    s.phone || '',
    s.address || '',
    Number(s.dueAmount) || 0,
    formatDhakaDateOnly(s.createdAt)
  ]);
  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  sheet.getRange(2, 6, rows.length, 1).setNumberFormat('৳ #,##0.00');
}

function writeExpensesSheet(ss, expenses) {
  let sheet = ss.getSheetByName(SHEETS.EXPENSES);
  if (!sheet) sheet = ss.insertSheet(SHEETS.EXPENSES);
  sheet.clear();
  const headers = ['খরচ আইডি', 'তারিখ (ঢাকা সময়)', 'খরচের খাত', 'টাকার পরিমাণ (৳)', 'বিবরণ / নোট', 'খরচকারী'];
  sheet.appendRow(headers);
  applyHeaderStyle(sheet, headers.length);
  if (!expenses || expenses.length === 0) return;

  const rows = expenses.map(e => [
    e.id || '',
    formatDhakaDateTime(e.date),
    e.category || 'সাধারণ খরচ',
    Number(e.amount) || 0,
    e.note || e.description || '',
    e.userName || e.userId || 'এডমিন'
  ]);
  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  sheet.getRange(2, 4, rows.length, 1).setNumberFormat('৳ #,##0.00');
}

function writeUsersSheet(ss, users) {
  let sheet = ss.getSheetByName(SHEETS.USERS);
  if (!sheet) sheet = ss.insertSheet(SHEETS.USERS);
  sheet.clear();
  const headers = ['ইউজার আইডি', 'নাম', 'ইমেইল', 'মোবাইল', 'পদবী / রোল', 'অনুমতিসমূহ', 'সর্বশেষ সক্রিয়'];
  sheet.appendRow(headers);
  applyHeaderStyle(sheet, headers.length);
  if (!users || users.length === 0) return;

  const rows = users.map(u => {
    const roleText = u.role === 'admin' ? 'অ্যাডমিন' : (u.role === 'manager' ? 'ম্যানেজার' : 'সেলসম্যান');
    const perms = Array.isArray(u.permissions) ? u.permissions.join(', ') : 'সকল পারমিশন';
    return [
      u.id || '',
      u.name || 'ইউজার',
      u.email || '',
      u.phone || '',
      roleText,
      perms,
      formatDhakaDateTime(u.lastSeen)
    ];
  });
  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
}

function writeSettingsSheet(ss, biz) {
  let sheet = ss.getSheetByName(SHEETS.SETTINGS);
  if (!sheet) sheet = ss.insertSheet(SHEETS.SETTINGS);
  sheet.clear();
  const headers = ['কনফিগারেশন ফিল্ড', 'মান (Value)', 'বর্ণনা'];
  sheet.appendRow(headers);
  applyHeaderStyle(sheet, headers.length);

  const rows = [
    ['business_id', biz.id || 'main-business', 'প্রতিষ্ঠানের প্রধান আইডি'],
    ['name', biz.name || 'হিসাব পাতি ERP', 'প্রতিষ্ঠানের নাম'],
    ['address', biz.address || 'ঢাকা, বাংলাদেশ', 'দোকানের ঠিকানা'],
    ['phone', biz.phone || '01700000000', 'দোকানের ফোন নম্বর'],
    ['currency', biz.currency || 'BDT', 'মুদ্রা'],
    ['default_printer', biz.defaultPrinter || 'thermal', 'ডিফল্ট প্রিন্টার টাইপ (thermal / a4)'],
    ['sync_engine', 'Google Apps Script Web App', 'গুগল শিট লাইভ ডাটাবেজ ইঞ্জিন'],
    ['sync_updated_at', formatDhakaDateTime(new Date()), 'সর্বশেষ সিঙ্কের তারিখ ও সময়']
  ];
  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
}

function syncSingleProduct(ss, product, operation) {
  const sheet = ss.getSheetByName(SHEETS.PRODUCTS);
  if (!sheet) { initializeAllSheets(); return; }
  const data = sheet.getDataRange().getValues();
  let foundRow = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(product.id)) { foundRow = i + 1; break; }
  }
  if (operation === 'delete') {
    if (foundRow !== -1) sheet.deleteRow(foundRow);
    return;
  }
  const stock = Number(product.stock) || 0;
  const minStock = Number(product.minStock) || 5;
  let status = stock <= 0 ? 'স্টক শেষ' : (stock <= minStock ? 'কম স্টক' : 'পর্যাপ্ত স্টক');
  const barcodeVal = product.barcode || (Array.isArray(product.barcodes) ? product.barcodes.join(', ') : '');
  const rowValues = [
    product.id || '', product.name || '', product.bnName || '', product.sku || '', barcodeVal,
    product.categoryId || 'সাধারণ', Number(product.purchasePrice) || 0, Number(product.salePrice) || 0,
    stock, minStock, product.unit || 'পিস', status
  ];
  if (foundRow !== -1) {
    sheet.getRange(foundRow, 1, 1, rowValues.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }
}

function syncSingleSale(ss, sale) {
  let salesSheet = ss.getSheetByName(SHEETS.SALES);
  if (!salesSheet) { initializeAllSheets(); salesSheet = ss.getSheetByName(SHEETS.SALES); }
  let itemsSummary = '';
  if (Array.isArray(sale.items)) {
    itemsSummary = sale.items.map(it => (it.name || 'পণ্য') + ' (' + (it.quantity || 1) + 'x' + (it.unitPrice || 0) + '৳)').join('; ');
  }
  const payMethodName = sale.paymentMethod === 'mobile_pay' ? 'বিকাশ/নগদ' : (sale.paymentMethod === 'card' ? 'কার্ড' : 'নগদ ক্যাশ');
  const rowValues = [
    sale.invoiceNo || sale.id || '', formatDhakaDateTime(sale.createdAt || new Date()),
    sale.customerName || 'সাধারণ ক্রেতা', sale.customerPhone || '', itemsSummary,
    Number(sale.totalAmount) || 0, Number(sale.discount) || 0, Number(sale.vat) || 0,
    Number(sale.payableAmount || sale.totalAmount) || 0, Number(sale.paidAmount) || 0,
    Number(sale.dueAmount) || 0, payMethodName, sale.userName || sale.userId || 'এডমিন'
  ];
  salesSheet.appendRow(rowValues);

  if (Array.isArray(sale.items)) {
    const prodSheet = ss.getSheetByName(SHEETS.PRODUCTS);
    if (prodSheet) {
      const pData = prodSheet.getDataRange().getValues();
      sale.items.forEach(item => {
        const pId = item.productId || item.id;
        for (let i = 1; i < pData.length; i++) {
          if (String(pData[i][0]) === String(pId)) {
            const curStock = Number(pData[i][8]) || 0;
            const newStock = Math.max(0, curStock - (Number(item.quantity) || 1));
            prodSheet.getRange(i + 1, 9).setValue(newStock);
            const minStock = Number(pData[i][9]) || 5;
            const status = newStock <= 0 ? 'স্টক শেষ' : (newStock <= minStock ? 'কম স্টক' : 'পর্যাপ্ত স্টক');
            prodSheet.getRange(i + 1, 12).setValue(status);
            break;
          }
        }
      });
    }
  }
}

function syncSingleCustomer(ss, customer, operation) {
  const sheet = ss.getSheetByName(SHEETS.CUSTOMERS);
  if (!sheet) return;
  const data = sheet.getDataRange().getValues();
  let foundRow = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(customer.id)) { foundRow = i + 1; break; }
  }
  if (operation === 'delete') {
    if (foundRow !== -1) sheet.deleteRow(foundRow);
    return;
  }
  const rowValues = [
    customer.id || '', customer.name || 'ক্রেতা', customer.phone || '', customer.address || '',
    Number(customer.dueAmount) || 0, Number(customer.totalSpent) || 0, formatDhakaDateOnly(customer.createdAt || new Date())
  ];
  if (foundRow !== -1) {
    sheet.getRange(foundRow, 1, 1, rowValues.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }
}

function syncSingleSupplier(ss, supplier, operation) {
  const sheet = ss.getSheetByName(SHEETS.SUPPLIERS);
  if (!sheet) return;
  const data = sheet.getDataRange().getValues();
  let foundRow = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(supplier.id)) { foundRow = i + 1; break; }
  }
  if (operation === 'delete') {
    if (foundRow !== -1) sheet.deleteRow(foundRow);
    return;
  }
  const rowValues = [
    supplier.id || '', supplier.name || 'সরবরাহকারী', supplier.company || '', supplier.phone || '',
    supplier.address || '', Number(supplier.dueAmount) || 0, formatDhakaDateOnly(supplier.createdAt || new Date())
  ];
  if (foundRow !== -1) {
    sheet.getRange(foundRow, 1, 1, rowValues.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }
}

function syncSingleExpense(ss, expense) {
  let sheet = ss.getSheetByName(SHEETS.EXPENSES);
  if (!sheet) return;
  const rowValues = [
    expense.id || '', formatDhakaDateTime(expense.date || new Date()),
    expense.category || 'সাধারণ খরচ', Number(expense.amount) || 0,
    expense.note || expense.description || '', expense.userName || expense.userId || 'এডমিন'
  ];
  sheet.appendRow(rowValues);
}

function syncCustomerPayment(ss, payload) {
  const { customerId, amount } = payload;
  const cSheet = ss.getSheetByName(SHEETS.CUSTOMERS);
  if (!cSheet) return;
  const data = cSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(customerId)) {
      const currentDue = Number(data[i][4]) || 0;
      const currentSpent = Number(data[i][5]) || 0;
      cSheet.getRange(i + 1, 5).setValue(Math.max(0, currentDue - (Number(amount) || 0)));
      cSheet.getRange(i + 1, 6).setValue(currentSpent + (Number(amount) || 0));
      break;
    }
  }
}

function readAllSpreadsheetData(ss) {
  const result = {
    version: '2.5-SHEETS', timestamp: new Date().toISOString(), source: 'Google Sheets Live Database',
    business: {}, products: [], customers: [], sales: [], suppliers: [], expenses: [], users: []
  };

  const pSheet = ss.getSheetByName(SHEETS.PRODUCTS);
  if (pSheet && pSheet.getLastRow() > 1) {
    const pRows = pSheet.getRange(2, 1, pSheet.getLastRow() - 1, pSheet.getLastColumn()).getValues();
    result.products = pRows.map(r => ({
      id: String(r[0] || ('prod_' + Date.now())),
      name: String(r[1] || ''),
      bnName: String(r[2] || ''),
      sku: String(r[3] || ''),
      barcode: String(r[4] || ''),
      categoryId: String(r[5] || 'general'),
      purchasePrice: Number(r[6]) || 0,
      salePrice: Number(r[7]) || 0,
      stock: Number(r[8]) || 0,
      minStock: Number(r[9]) || 5,
      unit: String(r[10] || 'পিস')
    }));
  }

  const cSheet = ss.getSheetByName(SHEETS.CUSTOMERS);
  if (cSheet && cSheet.getLastRow() > 1) {
    const cRows = cSheet.getRange(2, 1, cSheet.getLastRow() - 1, cSheet.getLastColumn()).getValues();
    result.customers = cRows.map(r => ({
      id: String(r[0] || ('cust_' + Date.now())),
      name: String(r[1] || 'ক্রেতা'),
      phone: String(r[2] || ''),
      address: String(r[3] || ''),
      dueAmount: Number(r[4]) || 0,
      totalSpent: Number(r[5]) || 0
    }));
  }

  const sSheet = ss.getSheetByName(SHEETS.SALES);
  if (sSheet && sSheet.getLastRow() > 1) {
    const sRows = sSheet.getRange(2, 1, sSheet.getLastRow() - 1, sSheet.getLastColumn()).getValues();
    result.sales = sRows.map((r, i) => ({
      id: 'sale_' + (i + 1),
      invoiceNo: String(r[0] || ('INV-' + (1000 + i))),
      createdAt: String(r[1] || new Date().toISOString()),
      customerName: String(r[2] || ''),
      customerPhone: String(r[3] || ''),
      totalAmount: Number(r[5]) || 0,
      discount: Number(r[6]) || 0,
      vat: Number(r[7]) || 0,
      payableAmount: Number(r[8]) || 0,
      paidAmount: Number(r[9]) || 0,
      dueAmount: Number(r[10]) || 0,
      paymentMethod: r[11] === 'বিকাশ/নগদ' ? 'mobile_pay' : (r[11] === 'কার্ড' ? 'card' : 'cash'),
      items: []
    }));
  }

  const supSheet = ss.getSheetByName(SHEETS.SUPPLIERS);
  if (supSheet && supSheet.getLastRow() > 1) {
    const supRows = supSheet.getRange(2, 1, supSheet.getLastRow() - 1, supSheet.getLastColumn()).getValues();
    result.suppliers = supRows.map(r => ({
      id: String(r[0] || ('sup_' + Date.now())),
      name: String(r[1] || 'সরবরাহকারী'),
      company: String(r[2] || ''),
      phone: String(r[3] || ''),
      address: String(r[4] || ''),
      dueAmount: Number(r[5]) || 0
    }));
  }

  const eSheet = ss.getSheetByName(SHEETS.EXPENSES);
  if (eSheet && eSheet.getLastRow() > 1) {
    const eRows = eSheet.getRange(2, 1, eSheet.getLastRow() - 1, eSheet.getLastColumn()).getValues();
    result.expenses = eRows.map((r, i) => ({
      id: String(r[0] || ('exp_' + (i + 1))),
      date: String(r[1] || new Date().toISOString()),
      category: String(r[2] || 'সাধারণ খরচ'),
      amount: Number(r[3]) || 0,
      note: String(r[4] || '')
    }));
  }

  const setSheet = ss.getSheetByName(SHEETS.SETTINGS);
  if (setSheet && setSheet.getLastRow() > 1) {
    const setRows = setSheet.getRange(2, 1, setSheet.getLastRow() - 1, 2).getValues();
    const bizObj = {};
    setRows.forEach(r => { bizObj[r[0]] = r[1]; });
    result.business = {
      id: bizObj.business_id || 'main-business',
      name: bizObj.name || 'হিসাব পাতি ERP',
      address: bizObj.address || '',
      phone: bizObj.phone || '',
      currency: bizObj.currency || 'BDT',
      defaultPrinter: bizObj.default_printer || 'thermal'
    };
  }

  return result;
}

function menuAddProductPrompt() {
  const ui = SpreadsheetApp.getUi();
  const nameResp = ui.prompt('নতুন পণ্য যুক্ত করুন', 'পণ্যের নাম লিখুন:', ui.ButtonSet.OK_CANCEL);
  if (nameResp.getSelectedButton() !== ui.Button.OK) return;
  const priceResp = ui.prompt('বিক্রয়মূল্য', 'পণ্যের বিক্রয়মূল্য (টাকায়) লিখুন:', ui.ButtonSet.OK_CANCEL);
  if (priceResp.getSelectedButton() !== ui.Button.OK) return;
  const stockResp = ui.prompt('বর্তমান স্টক', 'বর্তমান স্টকের পরিমাণ লিখুন:', ui.ButtonSet.OK_CANCEL);
  if (stockResp.getSelectedButton() !== ui.Button.OK) return;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const pSheet = ss.getSheetByName(SHEETS.PRODUCTS);
  if (!pSheet) return;

  const newId = 'prod_' + Date.now();
  const name = nameResp.getResponseText();
  const salePrice = Number(priceResp.getResponseText()) || 0;
  const stock = Number(stockResp.getResponseText()) || 0;

  pSheet.appendRow([
    newId, name, name, 'SKU-' + Date.now().toString().slice(-4), '', 'সাধারণ',
    salePrice * 0.7, salePrice, stock, 5, 'পিস',
    stock > 5 ? 'পর্যাপ্ত স্টক' : (stock > 0 ? 'কম স্টক' : 'স্টক শেষ')
  ]);
  ui.alert('সফল!', 'পণ্য "' + name + '" গুগল শিটে সফলভাবে যুক্ত করা হয়েছে।', ui.ButtonSet.OK);
}

function menuAddSalePrompt() {
  const ui = SpreadsheetApp.getUi();
  const custResp = ui.prompt('নতুন বিক্রয় মেমো', 'ক্রেতার নাম লিখুন:', ui.ButtonSet.OK_CANCEL);
  if (custResp.getSelectedButton() !== ui.Button.OK) return;
  const billResp = ui.prompt('মোট বিল', 'মোট বিলের পরিমাণ লিখুন (৳):', ui.ButtonSet.OK_CANCEL);
  if (billResp.getSelectedButton() !== ui.Button.OK) return;
  const paidResp = ui.prompt('জমা টাকা', 'ক্রেতা কত টাকা পরিশোধ করেছেন? (৳):', ui.ButtonSet.OK_CANCEL);
  if (paidResp.getSelectedButton() !== ui.Button.OK) return;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sSheet = ss.getSheetByName(SHEETS.SALES);
  if (!sSheet) return;

  const custName = custResp.getResponseText();
  const total = Number(billResp.getResponseText()) || 0;
  const paid = Number(paidResp.getResponseText()) || 0;
  const due = Math.max(0, total - paid);
  const invNo = 'INV-' + (sSheet.getLastRow() + 1000);

  sSheet.appendRow([
    invNo, formatDhakaDateTime(new Date()), custName, '', 'সরাসরি গুগল শিট থেকে বিক্রয় এন্ট্রি',
    total, 0, 0, total, paid, due, 'নগদ ক্যাশ', 'গুগল শিট এডমিন'
  ]);
  ui.alert('মেমো সফলভাবে এন্ট্রি হয়েছে!', 'ইনভয়েস: ' + invNo + '\\nক্রেতা: ' + custName + '\\nমোট: ' + total + '৳\\nজমা: ' + paid + '৳\\nবাকি: ' + due + '৳', ui.ButtonSet.OK);
}

function menuRecordDuePaymentPrompt() {
  const ui = SpreadsheetApp.getUi();
  const phoneResp = ui.prompt('বকেয়া টাকা জমা', 'ক্রেতার মোবাইল নম্বর বা নাম লিখুন:', ui.ButtonSet.OK_CANCEL);
  if (phoneResp.getSelectedButton() !== ui.Button.OK) return;
  const amtResp = ui.prompt('জমা পরিমাণ', 'জমা টাকার পরিমাণ (৳) লিখুন:', ui.ButtonSet.OK_CANCEL);
  if (amtResp.getSelectedButton() !== ui.Button.OK) return;

  const search = phoneResp.getResponseText().trim().toLowerCase();
  const amount = Number(amtResp.getResponseText()) || 0;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const cSheet = ss.getSheetByName(SHEETS.CUSTOMERS);
  if (!cSheet) return;

  const data = cSheet.getDataRange().getValues();
  let found = false;
  for (let i = 1; i < data.length; i++) {
    const name = String(data[i][1]).toLowerCase();
    const phone = String(data[i][2]);
    if (name.includes(search) || phone.includes(search)) {
      const curDue = Number(data[i][4]) || 0;
      const newDue = Math.max(0, curDue - amount);
      cSheet.getRange(i + 1, 5).setValue(newDue);
      found = true;
      ui.alert('জমা সফল!', 'গ্রাহক: ' + data[i][1] + '\\nআগের বকেয়া: ' + curDue + '৳\\nজমা: ' + amount + '৳\\nনতুন বকেয়া: ' + newDue + '৳', ui.ButtonSet.OK);
      break;
    }
  }
  if (!found) ui.alert('পাওয়া যায়নি', 'উক্ত নাম বা নম্বরে কোনো ক্রেতা পাওয়া যায়নি।', ui.ButtonSet.OK);
}

function menuExportJson() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const allData = readAllSpreadsheetData(ss);
  const jsonString = JSON.stringify(allData, null, 2);
  const htmlOutput = HtmlService.createHtmlOutput(
    '<h3>হিসাবপাতি ব্যাকআপ JSON</h3><p>নিচের কোডটি কপি করে হিসাবপাতি অ্যাপে রিস্টোর করতে পারেন:</p><textarea style="width:100%;height:300px;">' + jsonString + '</textarea>'
  ).setWidth(600).setHeight(400);
  SpreadsheetApp.getUi().showModalDialog(htmlOutput, 'অ্যাপ ব্যাকআপ JSON');
}

function formatDhakaDateTime(date) {
  if (!date) return '';
  try {
    return Utilities.formatDate(new Date(date), 'Asia/Dhaka', 'yyyy-MM-dd hh:mm:ss a');
  } catch (e) {
    return String(date);
  }
}

function formatDhakaDateOnly(date) {
  if (!date) return '';
  try {
    return Utilities.formatDate(new Date(date), 'Asia/Dhaka', 'yyyy-MM-dd');
  } catch (e) {
    return String(date);
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
`;
