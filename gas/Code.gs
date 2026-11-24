/**
 * =========================================================================
 * হিসাবপাতি ERP (HishabPati ERP) - Google Sheets Master Database Engine
 * =========================================================================
 * অ্যাপের স্লাইড মেনু (Slide Menu), জমা-খরচ (Accounting), বকেয়া ও ক্রেতা পাবে (Due & Advance),
 * অন্যান্য পণ্য (Custom Price / No Stock), এবং সেলসম্যান অনুমোদন রিকুয়েস্ট (Approvals) এর
 * সাথে ১০০% সামঞ্জস্যপূর্ণ মাল্টি-শপ গুগল শিট ডাটাবেজ ইঞ্জিন।
 *
 * অ্যাপের স্লাইড মেনু অনুযায়ী ট্যাবসমূহ (বাম থেকে ডানে):
 * 1. ড্যাশবোর্ড (Dashboard, জমা-খরচ ও রিপোর্ট সামারি)
 * 2. বিক্রয় ও মেমো (POS & Sales Invoices - চূড়ান্ত ও TEMPORARY মেমো)
 * 3. অনুমোদন রিকুয়েস্ট (Salesman POS & Due Payment Approval Requests)
 * 4. পণ্য তালিকা (Products Inventory & 'অন্যান্য' কাস্টম মূল্য পণ্য)
 * 5. ক্যাটাগরি (Product Categories)
 * 6. ক্রেতা (Customers - বকেয়া পরিমাণ ও ক্রেতা পাবে সহ)
 * 7. সরবরাহকারী (Suppliers & Payable Ledger)
 * 8. হিসাব ও খরচ (Accounting - জমা-খরচ ও ব্যয়ের বিবরণ)
 * 9. বকেয়া খাতা (Due & Customer Advance Book - বকেয়া পরিমাণ ও ক্রেতা পাবে)
 * 10. এসএমএস লগ (SMS History & Notifications)
 * 11. ইউজার ও স্টাফ (Shop Users, Roles & Permissions)
 * 12. প্রতিষ্ঠান সেটিংস (Shop Profile & Sync Configuration)
 * =========================================================================
 */

const SHEETS = {
  DASHBOARD: 'ড্যাশবোর্ড',
  SALES: 'বিক্রয় ও মেমো',
  APPROVALS: 'অনুমোদন রিকুয়েস্ট',
  PRODUCTS: 'পণ্য তালিকা',
  CATEGORIES: 'ক্যাটাগরি',
  CUSTOMERS: 'ক্রেতা',
  SUPPLIERS: 'সরবরাহকারী',
  EXPENSES: 'হিসাব ও খরচ',
  DUES: 'বকেয়া খাতা',
  SMS: 'এসএমএস লগ',
  USERS: 'ইউজার ও স্টাফ',
  SETTINGS: 'প্রতিষ্ঠান সেটিংস'
};

const ORDERED_SHEET_NAMES = [
  SHEETS.DASHBOARD,
  SHEETS.SALES,
  SHEETS.APPROVALS,
  SHEETS.PRODUCTS,
  SHEETS.CATEGORIES,
  SHEETS.CUSTOMERS,
  SHEETS.SUPPLIERS,
  SHEETS.EXPENSES,
  SHEETS.DUES,
  SHEETS.SMS,
  SHEETS.USERS,
  SHEETS.SETTINGS
];

const LEGACY_DUPLICATE_SHEETS = [
  'Sheet1',
  'পণ্য (Products)',
  'বিক্রি (Sales)',
  'গ্রাহক (Customers)',
  'বকেয়া ও ক্রেতা পাবে (Due List)',
  'বকেয়া কাস্টমার (Due List)',
  'বাকি বিক্রি (Due Sales)',
  'খরচ (Expenses)',
  'সরবরাহকারী (Suppliers)',
  'সারসংক্ষেপ (Summary)'
];

const THEME = {
  HEADER_BG: '#1e3a8a',
  HEADER_FG: '#ffffff',
  ACCENT_BG: '#2563eb',
  ACCENT_FG: '#ffffff',
  HIGHLIGHT_BG: '#eff6ff',
  DUE_BG: '#fee2e2',
  DUE_FG: '#991b1b',
  SUCCESS_BG: '#dcfce7',
  SUCCESS_FG: '#166534',
  WARN_BG: '#fef3c7',
  WARN_FG: '#92400e',
  BORDER_COLOR: '#cbd5e1'
};

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('📊 হিসাবপাতি ERP মেনু')
    .addItem('🔄 সকল শিট, কলাম ও ফর্মুলা রিফ্রেশ করুন', 'initializeAllSheets')
    .addSeparator()
    .addItem('➕ নতুন বিক্রয় মেমো যুক্ত করুন', 'menuAddSalePrompt')
    .addItem('➕ নতুন পণ্য যুক্ত করুন', 'menuAddProductPrompt')
    .addItem('💰 বকেয়া / অ্যাডভান্স টাকা জমা নিন', 'menuRecordDuePaymentPrompt')
    .addSeparator()
    .addItem('📥 অ্যাপের জন্য ব্যাকআপ JSON এক্সপোর্ট', 'menuExportJson')
    .addToUi();
}

function isOtherProductItem(p) {
  if (!p) return false;
  if (p.isCustomPrice === true) return true;
  const n = String(p.name || '').trim();
  const bn = String(p.bnName || '').trim();
  return n === 'অন্যান্য' || n === 'অন্যন্য' || bn === 'অন্যান্য' || bn === 'অন্যন্য' || n.toLowerCase() === 'other' || n.toLowerCase() === 'others';
}

function getTargetSpreadsheet(paramsOrPayload, allowAutoCreate) {
  const sheetId = paramsOrPayload && (paramsOrPayload.spreadsheetId || paramsOrPayload.sheetId);
  const bizId = paramsOrPayload && paramsOrPayload.businessId;
  const props = PropertiesService.getScriptProperties();

  if (sheetId) {
    try {
      const opened = SpreadsheetApp.openById(sheetId);
      if (bizId) {
        props.setProperty('SHOP_SHEET_' + bizId, sheetId);
      }
      return opened;
    } catch (e) {}
  }

  if (bizId) {
    try {
      const savedSheetId = props.getProperty('SHOP_SHEET_' + bizId);
      if (savedSheetId) {
        return SpreadsheetApp.openById(savedSheetId);
      }
    } catch (e) {}

    if (bizId !== 'main-business' && allowAutoCreate !== false) {
      try {
        const rawShopName =
          paramsOrPayload.shopName ||
          (paramsOrPayload.data && paramsOrPayload.data.business && paramsOrPayload.data.business.name) ||
          (paramsOrPayload.business && paramsOrPayload.business.name) ||
          ('নতুন শপ - ' + bizId);
        const shopTitle = rawShopName + ' - হিসাবপাতি ডাটাবেজ';
        const createdSS = SpreadsheetApp.create(shopTitle);
        props.setProperty('SHOP_SHEET_' + bizId, createdSS.getId());
        initializeAllSheets(createdSS);
        return createdSS;
      } catch (createErr) {}
    }
  }

  return SpreadsheetApp.getActiveSpreadsheet();
}

function doGet(e) {
  try {
    const params = (e && e.parameter) ? e.parameter : {};
    const action = params.action || 'ping';
    const ss = getTargetSpreadsheet(params, true);

    if (action === 'ping') {
      return jsonResponse({
        status: 'online',
        message: 'হিসাবপাতি গুগল শিট ডাটাবেজ সক্রিয় রয়েছে।',
        spreadsheetName: ss.getName(),
        spreadsheetId: ss.getId(),
        spreadsheetUrl: ss.getUrl(),
        timestamp: new Date().toISOString()
      });
    }

    if (action === 'fetchData' || action === 'getAllData') {
      const allData = readAllSpreadsheetData(ss);
      allData.spreadsheetId = ss.getId();
      allData.spreadsheetUrl = ss.getUrl();
      allData.spreadsheetName = ss.getName();
      return jsonResponse(allData);
    }

    if (action === 'getDashboard') {
      return jsonResponse({
        status: 'online',
        spreadsheetId: ss.getId(),
        spreadsheetName: ss.getName()
      });
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

    // 0a. Delete shop's dedicated Google Sheet when shop is deleted
    if (action === 'deleteShopSpreadsheet') {
      const props = PropertiesService.getScriptProperties();
      const bizId = payload.businessId || '';
      const targetSheetId = payload.spreadsheetId || payload.sheetId || (bizId ? props.getProperty('SHOP_SHEET_' + bizId) : '');
      let deleted = false;

      if (targetSheetId) {
        try {
          DriveApp.getFileById(targetSheetId).setTrashed(true);
          deleted = true;
        } catch (driveErr) {
          try {
            const targetSS = SpreadsheetApp.openById(targetSheetId);
            targetSS.rename('[DELETED] ' + targetSS.getName());
            targetSS.getSheets().forEach(sh => sh.clear());
            deleted = true;
          } catch (ssErr) {}
        }
      }
      if (bizId) {
        try {
          props.deleteProperty('SHOP_SHEET_' + bizId);
        } catch (e) {}
      }
      return jsonResponse({
        success: true,
        deleted: deleted,
        message: 'শপের গুগল শিট স্বয়ংক্রিয়ভাবে ডিলিট করা হয়েছে!'
      });
    }

    const ss = getTargetSpreadsheet(payload, action === 'createShopSpreadsheet' || action === 'fullSync');

    // 0b. Rename shop's dedicated Google Sheet when shop name is changed
    if (action === 'renameShopSpreadsheet') {
      const cleanShopName = (payload.shopName || (payload.business && payload.business.name) || '').trim();
      if (cleanShopName) {
        const newSheetTitle = cleanShopName + ' - হিসাবপাতি ডাটাবেজ';
        try {
          ss.rename(newSheetTitle);
        } catch (renErr) {}
        try {
          if (payload.business) {
            writeSettingsSheet(ss, payload.business);
          }
          const dashSheet = ss.getSheetByName(SHEETS.DASHBOARD);
          if (dashSheet && dashSheet.getLastRow() >= 2) {
            dashSheet.getRange('B2').setValue(cleanShopName);
          }
        } catch (updErr) {}
      }
      return jsonResponse({
        success: true,
        message: 'শপের গুগল শিটের নাম সফলভাবে পরিবর্তন হয়েছে!',
        spreadsheetId: ss.getId(),
        spreadsheetUrl: ss.getUrl(),
        spreadsheetName: ss.getName(),
        timestamp: new Date().toISOString()
      });
    }

    // 0c. Create & initialize a brand-new Google Sheet for a shop
    if (action === 'createShopSpreadsheet') {
      const initData = payload.data || {
        business: payload.business || { id: payload.businessId || 'main-business', name: payload.shopName || ss.getName() },
        products: [],
        customers: [],
        sales: [],
        suppliers: [],
        expenses: [],
        categories: [],
        users: [],
        approvalRequests: [],
        smsLogs: []
      };
      if (payload.shopName) {
        try {
          ss.rename(payload.shopName + ' - হিসাবপাতি ডাটাবেজ');
        } catch (e) {}
      }
      const result = performFullDatabaseSync(ss, initData);
      return jsonResponse({
        success: true,
        message: 'নতুন শপের জন্য আলাদা গুগল শিট স্বয়ংক্রিয়ভাবে তৈরি ও যুক্ত হয়েছে!',
        spreadsheetId: ss.getId(),
        spreadsheetUrl: ss.getUrl(),
        spreadsheetName: ss.getName(),
        details: result,
        timestamp: new Date().toISOString()
      });
    }

    // 1. Full Synchronization of entire shop state
    if (action === 'fullSync') {
      const data = payload.data || payload;
      const result = performFullDatabaseSync(ss, data);
      return jsonResponse({
        success: true,
        message: 'সকল তথ্য সফলভাবে গুগল শিটে সিঙ্ক হয়েছে।',
        spreadsheetId: ss.getId(),
        spreadsheetUrl: ss.getUrl(),
        spreadsheetName: ss.getName(),
        details: result,
        timestamp: new Date().toISOString()
      });
    }

    // 2. Real-time Single Entity Sync
    if (action === 'syncProduct') {
      syncSingleProduct(ss, payload.item, payload.operation || 'upsert');
      return jsonResponse({ success: true, message: 'পণ্য শিটে আপডেট হয়েছে', spreadsheetId: ss.getId() });
    }

    if (action === 'syncSale') {
      syncSingleSale(ss, payload.item, payload.operation || 'upsert');
      return jsonResponse({ success: true, message: 'বিক্রয় মেমো শিটে যুক্ত হয়েছে', spreadsheetId: ss.getId() });
    }

    if (action === 'syncApproval') {
      syncSingleApproval(ss, payload.item, payload.operation || 'upsert');
      return jsonResponse({ success: true, message: 'অনুমোদন রিকুয়েস্ট শিটে আপডেট হয়েছে', spreadsheetId: ss.getId() });
    }

    if (action === 'syncCustomer') {
      syncSingleCustomer(ss, payload.item, payload.operation || 'upsert');
      return jsonResponse({ success: true, message: 'ক্রেতা ও বকেয়া খাতা শিটে আপডেট হয়েছে', spreadsheetId: ss.getId() });
    }

    if (action === 'syncSupplier') {
      syncSingleSupplier(ss, payload.item, payload.operation || 'upsert');
      return jsonResponse({ success: true, message: 'সরবরাহকারী শিটে আপডেট হয়েছে', spreadsheetId: ss.getId() });
    }

    if (action === 'syncExpense') {
      syncSingleExpense(ss, payload.item, payload.operation || 'upsert');
      return jsonResponse({ success: true, message: 'হিসাব ও খরচ শিটে আপডেট হয়েছে', spreadsheetId: ss.getId() });
    }

    if (action === 'syncSMS') {
      syncSingleSMS(ss, payload.item, payload.operation || 'upsert');
      return jsonResponse({ success: true, message: 'এসএমএস লগ শিটে যুক্ত হয়েছে', spreadsheetId: ss.getId() });
    }

    if (action === 'syncUser') {
      syncSingleUser(ss, payload.item, payload.operation || 'upsert');
      return jsonResponse({ success: true, message: 'ইউজার শিটে আপডেট হয়েছে', spreadsheetId: ss.getId() });
    }

    if (action === 'syncCategory') {
      syncSingleCategory(ss, payload.item, payload.operation || 'upsert');
      return jsonResponse({ success: true, message: 'ক্যাটাগরি শিটে আপডেট হয়েছে', spreadsheetId: ss.getId() });
    }

    if (action === 'recordPayment') {
      syncCustomerPayment(ss, payload);
      return jsonResponse({ success: true, message: 'পেমেন্ট ও বকেয়া খাতা শিটে আপডেট হয়েছে', spreadsheetId: ss.getId() });
    }

    return jsonResponse({ error: 'অজানা পোস্ট অ্যাকশন', action: action });
  } catch (err) {
    return jsonResponse({ error: err.toString(), stack: err.stack });
  }
}

function performFullDatabaseSync(ss, data) {
  initializeAllSheets(ss);

  const counts = {
    products: 0,
    sales: 0,
    approvals: 0,
    customers: 0,
    suppliers: 0,
    expenses: 0,
    users: 0,
    categories: 0,
    dues: 0,
    smsLogs: 0
  };

  if (data.business) {
    writeSettingsSheet(ss, data.business, data.smsConfig);
  }

  if (Array.isArray(data.categories)) {
    writeCategoriesSheet(ss, data.categories);
    counts.categories = data.categories.length;
  }

  if (Array.isArray(data.products)) {
    writeProductsSheet(ss, data.products);
    counts.products = data.products.length;
  }

  if (Array.isArray(data.customers)) {
    writeCustomersSheet(ss, data.customers);
    writeDuesSheet(ss, data.customers);
    counts.customers = data.customers.length;
    counts.dues = data.customers.filter(c => (Number(c.dueAmount) || 0) !== 0).length;
  }

  if (Array.isArray(data.sales)) {
    writeSalesSheet(ss, data.sales);
    counts.sales = data.sales.length;
  }

  if (Array.isArray(data.approvalRequests)) {
    writeApprovalsSheet(ss, data.approvalRequests);
    counts.approvals = data.approvalRequests.length;
  }

  if (Array.isArray(data.suppliers)) {
    writeSuppliersSheet(ss, data.suppliers);
    counts.suppliers = data.suppliers.length;
  }

  if (Array.isArray(data.expenses)) {
    writeExpensesSheet(ss, data.expenses);
    counts.expenses = data.expenses.length;
  }

  if (Array.isArray(data.smsLogs)) {
    writeSMSSheet(ss, data.smsLogs);
    counts.smsLogs = data.smsLogs.length;
  }

  if (Array.isArray(data.users)) {
    writeUsersSheet(ss, data.users);
    counts.users = data.users.length;
  }

  writeDashboardSheet(ss, data);
  reorderAllSheetsToMatchMenu(ss);

  return counts;
}

function initializeAllSheets(targetSS) {
  const ss = targetSS || SpreadsheetApp.getActiveSpreadsheet();

  const configs = [
    {
      name: SHEETS.DASHBOARD,
      headers: ['বিষয় / মেট্রিক (স্লাইড মেনু ও জমা-খরচ সামারি)', 'বর্তমান মান', 'বিবরণ ও হিসাব সূত্র', 'স্থিতি'],
      colWidths: [270, 200, 310, 160]
    },
    {
      name: SHEETS.SALES,
      headers: ['মেমো নং (Invoice)', 'তারিখ ও সময় (ঢাকা)', 'ক্রেতার নাম', 'মোবাইল', 'পণ্যের বিবরণ', 'মোট টাকা (৳)', 'ছাড় (৳)', 'ভ্যাট (৳)', 'প্রদেয় বিল (৳)', 'নগদ জমা (৳)', 'বকেয়া পরিমাণ (৳)', 'ক্রেতা পাবে / অ্যাডভান্স (৳)', 'নিট ব্যালেন্স (৳)', 'পেমেন্ট মাধ্যম', 'মেমোর অবস্থা', 'বিক্রয়কর্মী', 'ক্রেতার আইডি', 'বিক্রয় আইডি', 'র কালেকশন JSON'],
      colWidths: [130, 160, 160, 125, 250, 110, 85, 85, 115, 115, 125, 145, 120, 115, 145, 125, 125, 125, 180]
    },
    {
      name: SHEETS.APPROVALS,
      headers: ['রিকুয়েস্ট আইডি', 'তারিখ ও সময় (ঢাকা)', 'রিকুয়েস্টের ধরন', 'টেম্পোরারি ভাউচার/মেমো', 'চূড়ান্ত মেমো নং', 'সেলসম্যানের নাম', 'ক্রেতার নাম', 'ক্রেতার মোবাইল', 'মোট বিল / জমার পরিমাণ (৳)', 'নগদ জমা (৳)', 'বকেয়া / ব্যালেন্স (৳)', 'বর্তমান স্ট্যাটাস', 'সিদ্ধান্ত গ্রহণকারী', 'সিদ্ধান্তের সময়', 'বিস্তারিত JSON'],
      colWidths: [140, 155, 165, 145, 130, 145, 155, 125, 150, 120, 130, 140, 135, 150, 180]
    },
    {
      name: SHEETS.PRODUCTS,
      headers: ['আইডি (ID)', 'পণ্যের নাম', 'বাংলা নাম', 'SKU', 'বারকোড', 'ক্যাটাগরি', 'ক্রয়মূল্য (৳)', 'বিক্রয়মূল্য (৳)', 'বর্তমান স্টক', 'সর্বনিম্ন স্টক', 'একক', 'স্টকের অবস্থা', 'পণ্যের ধরন', 'মেয়াদ উত্তীর্ণের তারিখ'],
      colWidths: [135, 190, 175, 115, 130, 120, 110, 110, 110, 110, 80, 190, 155, 135]
    },
    {
      name: SHEETS.CATEGORIES,
      headers: ['ক্যাটাগরি আইডি', 'ক্যাটাগরির নাম', 'বিবরণ'],
      colWidths: [140, 200, 260]
    },
    {
      name: SHEETS.CUSTOMERS,
      headers: ['ক্রেতার আইডি', 'ক্রেতার নাম', 'মোবাইল নম্বর', 'ঠিকানা', 'বকেয়া পরিমাণ (৳)', 'ক্রেতা পাবে / অ্যাডভান্স (৳)', 'নিট ব্যালেন্স (৳)', 'হিসাবের অবস্থা', 'সর্বমোট কেনাকাটা (৳)', 'ইউজার আইডি (CreatedBy)', 'নিবন্ধন তারিখ'],
      colWidths: [135, 175, 130, 200, 135, 155, 135, 150, 145, 135, 130]
    },
    {
      name: SHEETS.SUPPLIERS,
      headers: ['সরবরাহকারী আইডি', 'নাম', 'কোম্পানির নাম', 'মোবাইল নম্বর', 'ঠিকানা', 'আমাদের বর্তমান দেনা (৳)', 'দেনার অবস্থা', 'সর্বশেষ তারিখ'],
      colWidths: [140, 175, 175, 130, 200, 155, 145, 135]
    },
    {
      name: SHEETS.EXPENSES,
      headers: ['খরচ আইডি', 'তারিখ (ঢাকা সময়)', 'খরচের খাত (Category)', 'টাকার পরিমাণ (৳)', 'বিবরণ / নোট', 'এন্ট্রিকারী (ইউজার)', 'হিসাবের ধরন', 'ইউজার আইডি'],
      colWidths: [135, 150, 165, 135, 250, 140, 135, 125]
    },
    {
      name: SHEETS.DUES,
      headers: ['ক্রমিক', 'ক্রেতার আইডি', 'ক্রেতার নাম', 'মোবাইল নম্বর', 'ঠিকানা', 'বকেয়া পরিমাণ (৳)', 'ক্রেতা পাবে / অ্যাডভান্স (৳)', 'নিট ব্যালেন্স (৳)', 'মোট ক্রয় (৳)', 'হিসাবের অবস্থা', 'তাগাদা স্ট্যাটাস'],
      colWidths: [65, 130, 175, 130, 195, 140, 160, 135, 135, 145, 190]
    },
    {
      name: SHEETS.SMS,
      headers: ['এসএমএস আইডি', 'তারিখ ও সময় (ঢাকা)', 'প্রাপকের মোবাইল নম্বর', 'বার্তা (Message)', 'স্ট্যাটাস'],
      colWidths: [135, 160, 150, 340, 110]
    },
    {
      name: SHEETS.USERS,
      headers: ['ইউজার আইডি', 'নাম', 'ইমেইল', 'মোবাইল', 'পদবী / রোল', 'শপ আইডি (Business ID)', 'অনুমতিসমূহ', 'সর্বশেষ সক্রিয়', 'পাসওয়ার্ড'],
      colWidths: [130, 175, 200, 130, 115, 145, 250, 150, 120]
    },
    {
      name: SHEETS.SETTINGS,
      headers: ['কনফিগারেশন ফিল্ড', 'মান (Value)', 'বর্ণনা'],
      colWidths: [200, 280, 260]
    }
  ];

  configs.forEach(cfg => {
    let sheet = ss.getSheetByName(cfg.name);
    if (!sheet) {
      sheet = ss.insertSheet(cfg.name);
    }
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(cfg.headers);
      applyHeaderStyle(sheet, cfg.headers.length);
    }
    if (cfg.colWidths) {
      cfg.colWidths.forEach((w, i) => {
        try {
          sheet.setColumnWidth(i + 1, w);
        } catch (e) {}
      });
    }
  });

  // Clean up legacy duplicate sheets if any exist
  LEGACY_DUPLICATE_SHEETS.forEach(oldName => {
    try {
      const oldSheet = ss.getSheetByName(oldName);
      if (oldSheet && ss.getSheets().length > 1) {
        ss.deleteSheet(oldSheet);
      }
    } catch (e) {}
  });

  reorderAllSheetsToMatchMenu(ss);
  return true;
}

function reorderAllSheetsToMatchMenu(ss) {
  try {
    ORDERED_SHEET_NAMES.forEach((name, idx) => {
      const sheet = ss.getSheetByName(name);
      if (sheet) {
        ss.setActiveSheet(sheet);
        ss.moveActiveSheet(idx + 1);
      }
    });
    const dash = ss.getSheetByName(SHEETS.DASHBOARD);
    if (dash) ss.setActiveSheet(dash);
  } catch (e) {}
}

function applyHeaderStyle(sheet, colCount) {
  const headerRange = sheet.getRange(1, 1, 1, colCount);
  headerRange.setBackground(THEME.HEADER_BG)
    .setFontColor(THEME.HEADER_FG)
    .setFontWeight('bold')
    .setFontFamily('Arial')
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

  const headers = ['বিষয় / মেট্রিক (স্লাইড মেনু ও জমা-খরচ সামারি)', 'বর্তমান মান', 'বিবরণ ও হিসাব সূত্র', 'স্থিতি'];
  sheet.appendRow(headers);
  applyHeaderStyle(sheet, headers.length);

  const biz = (data && data.business) ? data.business : {};

  const rows = [
    ['🏪 প্রতিষ্ঠানের নাম', biz.name || 'হিসাব পাতি ERP', 'আপনার শপের নাম (শপ আইডি: ' + (biz.id || 'main-business') + ')', 'সক্রিয়'],
    ['📍 ঠিকানা ও মোবাইল', `${biz.address || ''} | ${biz.phone || ''}`, 'যোগাযোগের বিবরণ', 'ভেরিফাইড'],
    ['🕒 সর্বশেষ সিঙ্কের সময়', formatDhakaDateTime(new Date()), 'সরাসরি হিসাবপাতি অ্যাপ থেকে সিঙ্ক হয়েছে', 'আপ-টু-ডেট'],
    ['==============================', '====================', '==============================', '=========='],
    ['💰 মোট বিক্রয় আয় (জমা - চূড়ান্ত মেমো)', `=SUMIF('${SHEETS.SALES}'!O2:O, "চূড়ান্ত মেমো", '${SHEETS.SALES}'!I2:I)`, `'${SHEETS.SALES}' শিটের সকল চূড়ান্ত বিলের যোগফল`, 'মোট আয়'],
    ['💵 মোট নগদ আদায় (Paid Cash In)', `=SUMIF('${SHEETS.SALES}'!O2:O, "চূড়ান্ত মেমো", '${SHEETS.SALES}'!J2:J)`, `'${SHEETS.SALES}' শিটের নগদ আদায়কৃত টাকা`, 'ক্যাশ ইন'],
    ['💸 মোট ব্যয় / খরচ (Expenses Out)', `=SUM('${SHEETS.EXPENSES}'!D2:D)`, `'${SHEETS.EXPENSES}' শিটের সকল খরচের যোগফল`, 'ক্যাশ আউট'],
    ['🏦 নিট ব্যালেন্স (মোট আয় - মোট ব্যয়)', `=SUMIF('${SHEETS.SALES}'!O2:O, "চূড়ান্ত মেমো", '${SHEETS.SALES}'!I2:I) - SUM('${SHEETS.EXPENSES}'!D2:D)`, 'হিসাব ট্যাবের নিট ব্যালেন্স (মোট বিক্রয় আয় বিয়োগ মোট খরচ)', 'হিসাব-নিকাশ'],
    ['💼 নগদ ক্যাশ উদ্বৃত্ত (নগদ জমা - খরচ)', `=SUMIF('${SHEETS.SALES}'!O2:O, "চূড়ান্ত মেমো", '${SHEETS.SALES}'!J2:J) - SUM('${SHEETS.EXPENSES}'!D2:D)`, 'হাতে থাকা নগদ ক্যাশ (আদায়কৃত টাকা বিয়োগ খরচ)', 'ক্যাশবুক'],
    ['==============================', '====================', '==============================', '=========='],
    ['🔴 মোট পাওনা বকেয়া (বকেয়া পরিমাণ)', `=SUM('${SHEETS.CUSTOMERS}'!E2:E)`, `'${SHEETS.CUSTOMERS}' শিটের কাস্টমারদের কাছে মোট পাওনা বকেয়া`, 'বকেয়া আদায়যোগ্য'],
    ['🟢 মোট ক্রেতা পাবে (অ্যাডভান্স জমা)', `=SUM('${SHEETS.CUSTOMERS}'!F2:F)`, `'${SHEETS.CUSTOMERS}' শিটের ক্রেতাদের অতিরিক্ত অ্যাডভান্স জমা`, 'ক্রেতা পাবে'],
    ['🏭 সরবরাহকারীর কাছে দেনা (সাপ্লায়ার)', `=SUM('${SHEETS.SUPPLIERS}'!F2:F)`, `'${SHEETS.SUPPLIERS}' শিটের মহাজন/সাপ্লায়ারদের প্রদেয় টাকা`, 'পরিশোধযোগ্য'],
    ['==============================', '====================', '==============================', '=========='],
    ['📦 সর্বমোট পণ্যের সংখ্যা', `=COUNTA('${SHEETS.PRODUCTS}'!B2:B)`, `'${SHEETS.PRODUCTS}' শিটের মোট পণ্য তালিকা`, 'ইনভেন্টরি'],
    ['⚠️ কম স্টক ও স্টক শেষ পণ্যের সংখ্যা', `=COUNTIF('${SHEETS.PRODUCTS}'!L2:L, "স্টক শেষ") + COUNTIF('${SHEETS.PRODUCTS}'!L2:L, "কম স্টক")`, 'অন্যান্য পণ্য বাদে যেসব পণ্যের স্টক কম বা শেষ', 'রি-অর্ডার প্রয়োজন'],
    ['⏳ অপেক্ষমান অনুমোদন রিকুয়েস্ট', `=COUNTIF('${SHEETS.APPROVALS}'!L2:L, "অপেক্ষমান (Pending)")`, `'${SHEETS.APPROVALS}' শিটে সেলসম্যানের পেন্ডিং রিকুয়েস্ট`, 'অ্যাডমিন অনুমোদন']
  ];

  rows.forEach(r => sheet.appendRow(r));

  sheet.setColumnWidth(1, 270);
  sheet.setColumnWidth(2, 200);
  sheet.setColumnWidth(3, 310);
  sheet.setColumnWidth(4, 160);

  sheet.getRange('B6:B10').setNumberFormat('৳ #,##0.00').setFontWeight('bold');
  sheet.getRange('B12:B14').setNumberFormat('৳ #,##0.00').setFontWeight('bold');
}

function writeProductsSheet(ss, products) {
  let sheet = ss.getSheetByName(SHEETS.PRODUCTS);
  if (!sheet) sheet = ss.insertSheet(SHEETS.PRODUCTS);
  sheet.clear();

  const headers = ['আইডি (ID)', 'পণ্যের নাম', 'বাংলা নাম', 'SKU', 'বারকোড', 'ক্যাটাগরি', 'ক্রয়মূল্য (৳)', 'বিক্রয়মূল্য (৳)', 'বর্তমান স্টক', 'সর্বনিম্ন স্টক', 'একক', 'স্টকের অবস্থা', 'পণ্যের ধরন', 'মেয়াদ উত্তীর্ণের তারিখ'];
  sheet.appendRow(headers);
  applyHeaderStyle(sheet, headers.length);

  if (!products || products.length === 0) return;

  const rows = products.map(p => {
    const isOther = isOtherProductItem(p);
    const stock = isOther ? 0 : (Number(p.stock) || 0);
    const minStock = isOther ? 0 : (Number(p.minStock) || 5);
    let status = 'পর্যাপ্ত স্টক';
    if (isOther) {
      status = 'স্টক প্রযোজ্য নয় (ইচ্ছেমতো মূল্য)';
    } else if (stock <= 0) {
      status = 'স্টক শেষ';
    } else if (stock <= minStock) {
      status = 'কম স্টক';
    }

    const barcodeVal = p.barcode || (Array.isArray(p.barcodes) ? p.barcodes.join(', ') : '');

    return [
      p.id || '',
      p.name || '',
      p.bnName || p.name || '',
      p.sku || '',
      barcodeVal,
      p.categoryId || (isOther ? 'অন্যান্য' : 'সাধারণ'),
      Number(p.purchasePrice) || 0,
      Number(p.salePrice) || 0,
      stock,
      minStock,
      p.unit || 'পিস',
      status,
      isOther ? 'অন্যান্য (কাস্টম মূল্য)' : 'সাধারণ পণ্য',
      p.expiryDate || ''
    ];
  });

  const range = sheet.getRange(2, 1, rows.length, headers.length);
  range.setValues(rows);

  sheet.getRange(2, 7, rows.length, 2).setNumberFormat('৳ #,##0.00');
  sheet.getRange(2, 9, rows.length, 2).setNumberFormat('#,##0');
}

function writeSalesSheet(ss, sales) {
  let sheet = ss.getSheetByName(SHEETS.SALES);
  if (!sheet) sheet = ss.insertSheet(SHEETS.SALES);
  sheet.clear();

  const headers = ['মেমো নং (Invoice)', 'তারিখ ও সময় (ঢাকা)', 'ক্রেতার নাম', 'মোবাইল', 'পণ্যের বিবরণ', 'মোট টাকা (৳)', 'ছাড় (৳)', 'ভ্যাট (৳)', 'প্রদেয় বিল (৳)', 'নগদ জমা (৳)', 'বকেয়া পরিমাণ (৳)', 'ক্রেতা পাবে / অ্যাডভান্স (৳)', 'নিট ব্যালেন্স (৳)', 'পেমেন্ট মাধ্যম', 'মেমোর অবস্থা', 'বিক্রয়কর্মী', 'ক্রেতার আইডি', 'বিক্রয় আইডি', 'র কালেকশন JSON'];
  sheet.appendRow(headers);
  applyHeaderStyle(sheet, headers.length);

  if (!sales || sales.length === 0) return;

  const rows = sales.map(s => buildSaleRowValues(s));
  const range = sheet.getRange(2, 1, rows.length, headers.length);
  range.setValues(rows);

  sheet.getRange(2, 6, rows.length, 8).setNumberFormat('৳ #,##0.00');
}

function buildSaleRowValues(s) {
  let itemsSummary = '';
  if (Array.isArray(s.items)) {
    itemsSummary = s.items.map(it => `${it.name || 'পণ্য'} (${it.quantity || 1} x ${it.unitPrice || 0}৳)`).join('; ');
  }

  const payMethodName = s.paymentMethod === 'mobile_pay' ? 'বিকাশ/নগদ' : (s.paymentMethod === 'card' ? 'কার্ড' : 'নগদ ক্যাশ');
  const payable = Number(s.payableAmount ?? s.totalAmount) || 0;
  const paid = Number(s.paidAmount) || 0;
  const netDue = s.dueAmount !== undefined && s.dueAmount !== null && !isNaN(Number(s.dueAmount))
    ? Number(s.dueAmount)
    : (payable - paid);
  const duePositive = netDue > 0 ? netDue : 0;
  const advancePositive = netDue < 0 ? Math.abs(netDue) : 0;

  let memoStatus = 'চূড়ান্ত মেমো';
  if (s.approvalStatus === 'rejected') {
    memoStatus = 'বাতিলকৃত (Rejected)';
  } else if (s.isTemporary || s.approvalStatus === 'pending' || String(s.invoiceNo || '').indexOf('TMP-') === 0) {
    memoStatus = 'TEMPORARY (অনুমোদনের অপেক্ষায়)';
  }

  return [
    s.invoiceNo || s.id || '',
    formatDhakaDateTime(s.createdAt),
    s.customerName || 'ক্রেতা',
    s.customerPhone || '',
    itemsSummary,
    Number(s.totalAmount) || payable,
    Number(s.discount) || 0,
    Number(s.vat) || 0,
    payable,
    paid,
    duePositive,
    advancePositive,
    netDue,
    payMethodName,
    memoStatus,
    s.userName || s.userId || 'এডমিন',
    s.customerId || '',
    s.id || s.invoiceNo || '',
    JSON.stringify(s.items || [])
  ];
}

function writeApprovalsSheet(ss, approvals) {
  let sheet = ss.getSheetByName(SHEETS.APPROVALS);
  if (!sheet) sheet = ss.insertSheet(SHEETS.APPROVALS);
  sheet.clear();

  const headers = ['রিকুয়েস্ট আইডি', 'তারিখ ও সময় (ঢাকা)', 'রিকুয়েস্টের ধরন', 'টেম্পোরারি ভাউচার/মেমো', 'চূড়ান্ত মেমো নং', 'সেলসম্যানের নাম', 'ক্রেতার নাম', 'ক্রেতার মোবাইল', 'মোট বিল / জমার পরিমাণ (৳)', 'নগদ জমা (৳)', 'বকেয়া / ব্যালেন্স (৳)', 'বর্তমান স্ট্যাটাস', 'সিদ্ধান্ত গ্রহণকারী', 'সিদ্ধান্তের সময়', 'বিস্তারিত JSON'];
  sheet.appendRow(headers);
  applyHeaderStyle(sheet, headers.length);

  if (!approvals || approvals.length === 0) return;

  const rows = approvals.map(req => buildApprovalRowValues(req));
  const range = sheet.getRange(2, 1, rows.length, headers.length);
  range.setValues(rows);

  sheet.getRange(2, 9, rows.length, 3).setNumberFormat('৳ #,##0.00');
}

function buildApprovalRowValues(req) {
  const isSale = req.type === 'sale';
  const typeLabel = isSale ? 'বিক্রয় মেমো রিকুয়েস্ট (POS)' : 'বকেয়া / জমা আদায় রিকুয়েস্ট';
  const sData = req.saleData || {};
  const pData = req.paymentData || {};

  const custName = isSale ? (sData.customerName || 'ক্রেতা') : (pData.customerName || 'ক্রেতা');
  const custPhone = isSale ? (sData.customerPhone || '') : (pData.customerPhone || '');
  const totalOrAmt = isSale ? (Number(sData.payableAmount ?? sData.totalAmount) || 0) : (Number(pData.amount) || 0);
  const paidAmt = isSale ? (Number(sData.paidAmount) || 0) : (Number(pData.amount) || 0);
  const dueOrBal = isSale ? (Number(sData.dueAmount) || 0) : ((Number(pData.currentDueBefore) || 0) - (Number(pData.amount) || 0));

  let statusLabel = 'অপেক্ষমান (Pending)';
  if (req.status === 'approved') statusLabel = 'অনুমোদিত (Approved)';
  else if (req.status === 'rejected') statusLabel = 'বাতিলকৃত (Rejected)';

  return [
    req.id || '',
    formatDhakaDateTime(req.createdAt),
    typeLabel,
    req.temporaryInvoiceNo || '',
    req.finalInvoiceNo || '-',
    req.userName || 'সেলসম্যান',
    custName,
    custPhone,
    totalOrAmt,
    paidAmt,
    dueOrBal,
    statusLabel,
    req.reviewedBy || '-',
    req.reviewedAt ? formatDhakaDateTime(req.reviewedAt) : '-',
    JSON.stringify(req)
  ];
}

function writeCustomersSheet(ss, customers) {
  let sheet = ss.getSheetByName(SHEETS.CUSTOMERS);
  if (!sheet) sheet = ss.insertSheet(SHEETS.CUSTOMERS);
  sheet.clear();

  const headers = ['ক্রেতার আইডি', 'ক্রেতার নাম', 'মোবাইল নম্বর', 'ঠিকানা', 'বকেয়া পরিমাণ (৳)', 'ক্রেতা পাবে / অ্যাডভান্স (৳)', 'নিট ব্যালেন্স (৳)', 'হিসাবের অবস্থা', 'সর্বমোট কেনাকাটা (৳)', 'ইউজার আইডি (CreatedBy)', 'নিবন্ধন তারিখ'];
  sheet.appendRow(headers);
  applyHeaderStyle(sheet, headers.length);

  if (!customers || customers.length === 0) return;

  const rows = customers.map(c => buildCustomerRowValues(c));
  const range = sheet.getRange(2, 1, rows.length, headers.length);
  range.setValues(rows);

  sheet.getRange(2, 5, rows.length, 3).setNumberFormat('৳ #,##0.00');
  sheet.getRange(2, 9, rows.length, 1).setNumberFormat('৳ #,##0.00');
}

function buildCustomerRowValues(c) {
  const bal = Number(c.dueAmount) || 0;
  const dueAmt = bal > 0 ? bal : 0;
  const advanceAmt = bal < 0 ? Math.abs(bal) : 0;
  const statusText = bal < 0 ? 'ক্রেতা পাবে' : (bal > 0 ? 'বকেয়া পরিমাণ' : 'পরিশোধিত');

  return [
    c.id || '',
    c.name || 'ক্রেতা',
    c.phone || '',
    c.address || '',
    dueAmt,
    advanceAmt,
    bal,
    statusText,
    Number(c.totalSpent) || 0,
    c.createdBy || 'admin-1',
    formatDhakaDateOnly(c.createdAt)
  ];
}

/**
 * বকেয়া খাতা (Dues & Customer Advance Sheet)
 * বকেয়া পরিমাণ (due > 0) এবং ক্রেতা পাবে (due < 0) উভয়ই প্রদর্শন করে
 */
function writeDuesSheet(ss, customers) {
  let sheet = ss.getSheetByName(SHEETS.DUES);
  if (!sheet) sheet = ss.insertSheet(SHEETS.DUES);
  sheet.clear();

  const headers = ['ক্রমিক', 'ক্রেতার আইডি', 'ক্রেতার নাম', 'মোবাইল নম্বর', 'ঠিকানা', 'বকেয়া পরিমাণ (৳)', 'ক্রেতা পাবে / অ্যাডভান্স (৳)', 'নিট ব্যালেন্স (৳)', 'মোট ক্রয় (৳)', 'হিসাবের অবস্থা', 'তাগাদা স্ট্যাটাস'];
  sheet.appendRow(headers);
  applyHeaderStyle(sheet, headers.length);

  const activeCustomers = (customers || [])
    .filter(c => (Number(c.dueAmount) || 0) !== 0)
    .sort((a, b) => Math.abs(Number(b.dueAmount) || 0) - Math.abs(Number(a.dueAmount) || 0));

  if (activeCustomers.length === 0) {
    sheet.appendRow([1, '-', 'কোনো গ্রাহকের বকেয়া বা অ্যাডভান্স নেই (আলহামদুলিল্লাহ)', '-', '-', 0, 0, 0, 0, 'পরিশোধিত', 'কোনো তাগাদা প্রয়োজন নেই']);
    return;
  }

  const rows = activeCustomers.map((c, idx) => {
    const bal = Number(c.dueAmount) || 0;
    const isAdvance = bal < 0;
    return [
      idx + 1,
      c.id || '',
      c.name || 'ক্রেতা',
      c.phone || '',
      c.address || '',
      bal > 0 ? bal : 0,
      isAdvance ? Math.abs(bal) : 0,
      bal,
      Number(c.totalSpent) || 0,
      isAdvance ? 'ক্রেতা পাবে' : 'বকেয়া পরিমাণ',
      isAdvance ? 'ক্রেতার অতিরিক্ত অ্যাডভান্স জমা আছে' : 'বকেয়া পরিশোধের তাগাদা দিন'
    ];
  });

  const range = sheet.getRange(2, 1, rows.length, headers.length);
  range.setValues(rows);

  sheet.getRange(2, 6, rows.length, 4).setNumberFormat('৳ #,##0.00');

  // Color-code each row according to বকেয়া পরিমাণ vs ক্রেতা পাবে
  for (let i = 0; i < activeCustomers.length; i++) {
    const bal = Number(activeCustomers[i].dueAmount) || 0;
    const rowIdx = i + 2;
    if (bal < 0) {
      sheet.getRange(rowIdx, 7, 1, 1).setBackground(THEME.SUCCESS_BG).setFontColor(THEME.SUCCESS_FG).setFontWeight('bold');
      sheet.getRange(rowIdx, 10, 1, 1).setBackground(THEME.SUCCESS_BG).setFontColor(THEME.SUCCESS_FG).setFontWeight('bold');
    } else if (bal > 0) {
      sheet.getRange(rowIdx, 6, 1, 1).setBackground(THEME.DUE_BG).setFontColor(THEME.DUE_FG).setFontWeight('bold');
      sheet.getRange(rowIdx, 10, 1, 1).setBackground(THEME.DUE_BG).setFontColor(THEME.DUE_FG).setFontWeight('bold');
    }
  }
}

function refreshDuesFromCustomersSheet(ss) {
  try {
    const cSheet = ss.getSheetByName(SHEETS.CUSTOMERS);
    if (!cSheet || cSheet.getLastRow() <= 1) {
      writeDuesSheet(ss, []);
      return;
    }
    const cRows = cSheet.getRange(2, 1, cSheet.getLastRow() - 1, cSheet.getLastColumn()).getValues();
    const customers = cRows.map(r => {
      const hasExtendedCols = r.length >= 9;
      let netDue = 0;
      if (hasExtendedCols) {
        const dueCol = Number(r[4]) || 0;
        const advCol = Number(r[5]) || 0;
        const netCol = Number(r[6]);
        netDue = !isNaN(netCol) && netCol !== 0 ? netCol : (advCol > 0 ? -advCol : dueCol);
      } else {
        netDue = Number(r[4]) || 0;
      }
      return {
        id: String(r[0] || ''),
        name: String(r[1] || 'ক্রেতা'),
        phone: String(r[2] || ''),
        address: String(r[3] || ''),
        dueAmount: netDue,
        totalSpent: Number(hasExtendedCols ? r[8] : r[5]) || 0
      };
    });
    writeDuesSheet(ss, customers);
  } catch (e) {}
}

function writeSuppliersSheet(ss, suppliers) {
  let sheet = ss.getSheetByName(SHEETS.SUPPLIERS);
  if (!sheet) sheet = ss.insertSheet(SHEETS.SUPPLIERS);
  sheet.clear();

  const headers = ['সরবরাহকারী আইডি', 'নাম', 'কোম্পানির নাম', 'মোবাইল নম্বর', 'ঠিকানা', 'আমাদের বর্তমান দেনা (৳)', 'দেনার অবস্থা', 'সর্বশেষ তারিখ'];
  sheet.appendRow(headers);
  applyHeaderStyle(sheet, headers.length);

  if (!suppliers || suppliers.length === 0) return;

  const rows = suppliers.map(s => {
    const due = Number(s.dueAmount) || 0;
    return [
      s.id || '',
      s.name || 'সরবরাহকারী',
      s.company || '',
      s.phone || '',
      s.address || '',
      due,
      due > 0 ? 'দেনা আছে (পরিশোধযোগ্য)' : 'পরিশোধিত',
      formatDhakaDateOnly(s.createdAt)
    ];
  });

  const range = sheet.getRange(2, 1, rows.length, headers.length);
  range.setValues(rows);

  sheet.getRange(2, 6, rows.length, 1).setNumberFormat('৳ #,##0.00');
}

function writeExpensesSheet(ss, expenses) {
  let sheet = ss.getSheetByName(SHEETS.EXPENSES);
  if (!sheet) sheet = ss.insertSheet(SHEETS.EXPENSES);
  sheet.clear();

  const headers = ['খরচ আইডি', 'তারিখ (ঢাকা সময়)', 'খরচের খাত (Category)', 'টাকার পরিমাণ (৳)', 'বিবরণ / নোট', 'এন্ট্রিকারী (ইউজার)', 'হিসাবের ধরন', 'ইউজার আইডি'];
  sheet.appendRow(headers);
  applyHeaderStyle(sheet, headers.length);

  if (!expenses || expenses.length === 0) return;

  const rows = expenses.map(e => [
    e.id || '',
    formatDhakaDateOnly(e.date),
    e.category || 'সাধারণ খরচ',
    Number(e.amount) || 0,
    e.note || e.description || '',
    e.userName || e.userId || 'এডমিন',
    'ব্যয় / খরচ (Expense)',
    e.userId || '1'
  ]);

  const range = sheet.getRange(2, 1, rows.length, headers.length);
  range.setValues(rows);

  sheet.getRange(2, 4, rows.length, 1).setNumberFormat('৳ #,##0.00');
}

function writeSMSSheet(ss, smsLogs) {
  let sheet = ss.getSheetByName(SHEETS.SMS);
  if (!sheet) sheet = ss.insertSheet(SHEETS.SMS);
  sheet.clear();

  const headers = ['এসএমএস আইডি', 'তারিখ ও সময় (ঢাকা)', 'প্রাপকের মোবাইল নম্বর', 'বার্তা (Message)', 'স্ট্যাটাস'];
  sheet.appendRow(headers);
  applyHeaderStyle(sheet, headers.length);

  if (!smsLogs || smsLogs.length === 0) return;

  const rows = smsLogs.map(log => [
    log.id || '',
    formatDhakaDateTime(log.createdAt),
    log.recipient || '',
    log.message || '',
    log.status === 'sent' ? 'প্রেরিত (Sent)' : (log.status || 'Sent')
  ]);

  const range = sheet.getRange(2, 1, rows.length, headers.length);
  range.setValues(rows);
}

function writeUsersSheet(ss, users) {
  let sheet = ss.getSheetByName(SHEETS.USERS);
  if (!sheet) sheet = ss.insertSheet(SHEETS.USERS);
  sheet.clear();

  const headers = ['ইউজার আইডি', 'নাম', 'ইমেইল', 'মোবাইল', 'পদবী / রোল', 'শপ আইডি (Business ID)', 'অনুমতিসমূহ', 'সর্বশেষ সক্রিয়', 'পাসওয়ার্ড'];
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
      u.businessId || 'main-business',
      perms,
      formatDhakaDateTime(u.lastSeen),
      u.password || '123456'
    ];
  });

  const range = sheet.getRange(2, 1, rows.length, headers.length);
  range.setValues(rows);
}

function writeCategoriesSheet(ss, categories) {
  let sheet = ss.getSheetByName(SHEETS.CATEGORIES);
  if (!sheet) sheet = ss.insertSheet(SHEETS.CATEGORIES);
  sheet.clear();

  const headers = ['ক্যাটাগরি আইডি', 'ক্যাটাগরির নাম', 'বিবরণ'];
  sheet.appendRow(headers);
  applyHeaderStyle(sheet, headers.length);

  if (!categories || categories.length === 0) return;

  const rows = categories.map(c => [
    c.id || '',
    c.name || '',
    c.description || ''
  ]);

  const range = sheet.getRange(2, 1, rows.length, headers.length);
  range.setValues(rows);
}

function writeSettingsSheet(ss, biz, smsConfig) {
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
    ['currency', biz.currency || '৳', 'মুদ্রা'],
    ['default_printer', biz.defaultPrinter || 'thermal', 'ডিফল্ট প্রিন্টার টাইপ (thermal / a4)'],
    ['theme', biz.theme || 'light', 'অ্যাপ থিম'],
    ['sms_sender_id', (smsConfig && smsConfig.senderId) || '', 'এসএমএস সেন্ডার আইডি'],
    ['sms_auto', (smsConfig && smsConfig.autoSMS) ? 'true' : 'false', 'অটো এসএমএস স্ট্যাটাস'],
    ['sync_engine', 'Google Apps Script Multi-Shop Engine v3.0', 'গুগল শিট লাইভ ডাটাবেজ ইঞ্জিন'],
    ['sync_updated_at', formatDhakaDateTime(new Date()), 'সর্বশেষ সিঙ্কের তারিখ ও সময়']
  ];

  const range = sheet.getRange(2, 1, rows.length, headers.length);
  range.setValues(rows);
}

/**
 * Real-time Single Entity Handlers
 */
function syncSingleProduct(ss, product, operation) {
  let sheet = ss.getSheetByName(SHEETS.PRODUCTS);
  if (!sheet) {
    initializeAllSheets(ss);
    sheet = ss.getSheetByName(SHEETS.PRODUCTS);
  }
  if (!product) return;

  const data = sheet.getDataRange().getValues();
  let foundRow = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(product.id)) {
      foundRow = i + 1;
      break;
    }
  }

  if (operation === 'delete') {
    if (foundRow !== -1) sheet.deleteRow(foundRow);
    return;
  }

  const isOther = isOtherProductItem(product);
  const stock = isOther ? 0 : (Number(product.stock) || 0);
  const minStock = isOther ? 0 : (Number(product.minStock) || 5);
  let status = isOther ? 'স্টক প্রযোজ্য নয় (ইচ্ছেমতো মূল্য)' : (stock <= 0 ? 'স্টক শেষ' : (stock <= minStock ? 'কম স্টক' : 'পর্যাপ্ত স্টক'));
  const barcodeVal = product.barcode || (Array.isArray(product.barcodes) ? product.barcodes.join(', ') : '');

  const rowValues = [
    product.id || '',
    product.name || '',
    product.bnName || product.name || '',
    product.sku || '',
    barcodeVal,
    product.categoryId || (isOther ? 'অন্যান্য' : 'সাধারণ'),
    Number(product.purchasePrice) || 0,
    Number(product.salePrice) || 0,
    stock,
    minStock,
    product.unit || 'পিস',
    status,
    isOther ? 'অন্যান্য (কাস্টম মূল্য)' : 'সাধারণ পণ্য',
    product.expiryDate || ''
  ];

  if (foundRow !== -1) {
    sheet.getRange(foundRow, 1, 1, rowValues.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }
}

function syncSingleSale(ss, sale, operation) {
  let salesSheet = ss.getSheetByName(SHEETS.SALES);
  if (!salesSheet) {
    initializeAllSheets(ss);
    salesSheet = ss.getSheetByName(SHEETS.SALES);
  }
  if (!sale) return;

  const invKey = String(sale.invoiceNo || sale.id || '');
  const idKey = String(sale.id || '');
  const sData = salesSheet.getDataRange().getValues();
  let foundRow = -1;
  for (let i = 1; i < sData.length; i++) {
    if (String(sData[i][0]) === invKey || (idKey && String(sData[i][17]) === idKey)) {
      foundRow = i + 1;
      break;
    }
  }

  if (operation === 'delete') {
    if (foundRow !== -1) salesSheet.deleteRow(foundRow);
    return;
  }

  const rowValues = buildSaleRowValues(sale);

  if (foundRow !== -1) {
    salesSheet.getRange(foundRow, 1, 1, rowValues.length).setValues([rowValues]);
  } else {
    salesSheet.appendRow(rowValues);
  }

  // Only deduct stock in Products sheet for confirmed (non-temporary) sales and non-other products
  if (!sale.isTemporary && sale.approvalStatus !== 'pending' && Array.isArray(sale.items) && foundRow === -1) {
    const prodSheet = ss.getSheetByName(SHEETS.PRODUCTS);
    if (prodSheet) {
      const pData = prodSheet.getDataRange().getValues();
      sale.items.forEach(item => {
        if (isOtherProductItem(item)) return;
        const pId = item.productId || item.id;
        for (let i = 1; i < pData.length; i++) {
          if (String(pData[i][0]) === String(pId)) {
            if (String(pData[i][12] || '').indexOf('অন্যান্য') !== -1) break;
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

function syncSingleApproval(ss, req, operation) {
  let sheet = ss.getSheetByName(SHEETS.APPROVALS);
  if (!sheet) {
    initializeAllSheets(ss);
    sheet = ss.getSheetByName(SHEETS.APPROVALS);
  }
  if (!req) return;

  const data = sheet.getDataRange().getValues();
  let foundRow = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(req.id)) {
      foundRow = i + 1;
      break;
    }
  }

  if (operation === 'delete') {
    if (foundRow !== -1) sheet.deleteRow(foundRow);
    return;
  }

  const rowValues = buildApprovalRowValues(req);
  if (foundRow !== -1) {
    sheet.getRange(foundRow, 1, 1, rowValues.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }
}

function syncSingleCustomer(ss, customer, operation) {
  let sheet = ss.getSheetByName(SHEETS.CUSTOMERS);
  if (!sheet) {
    initializeAllSheets(ss);
    sheet = ss.getSheetByName(SHEETS.CUSTOMERS);
  }
  if (!customer) return;

  const data = sheet.getDataRange().getValues();
  let foundRow = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(customer.id)) {
      foundRow = i + 1;
      break;
    }
  }

  if (operation === 'delete') {
    if (foundRow !== -1) sheet.deleteRow(foundRow);
    refreshDuesFromCustomersSheet(ss);
    return;
  }

  const rowValues = buildCustomerRowValues(customer);

  if (foundRow !== -1) {
    sheet.getRange(foundRow, 1, 1, rowValues.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }

  // Always keep বকেয়া খাতা (Dues & Advance Sheet) 100% live in sync!
  refreshDuesFromCustomersSheet(ss);
}

function syncSingleSupplier(ss, supplier, operation) {
  let sheet = ss.getSheetByName(SHEETS.SUPPLIERS);
  if (!sheet) {
    initializeAllSheets(ss);
    sheet = ss.getSheetByName(SHEETS.SUPPLIERS);
  }
  if (!supplier) return;

  const data = sheet.getDataRange().getValues();
  let foundRow = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(supplier.id)) {
      foundRow = i + 1;
      break;
    }
  }

  if (operation === 'delete') {
    if (foundRow !== -1) sheet.deleteRow(foundRow);
    return;
  }

  const due = Number(supplier.dueAmount) || 0;
  const rowValues = [
    supplier.id || '',
    supplier.name || 'সরবরাহকারী',
    supplier.company || '',
    supplier.phone || '',
    supplier.address || '',
    due,
    due > 0 ? 'দেনা আছে (পরিশোধযোগ্য)' : 'পরিশোধিত',
    formatDhakaDateOnly(supplier.createdAt || new Date())
  ];

  if (foundRow !== -1) {
    sheet.getRange(foundRow, 1, 1, rowValues.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }
}

function syncSingleExpense(ss, expense, operation) {
  let sheet = ss.getSheetByName(SHEETS.EXPENSES);
  if (!sheet) {
    initializeAllSheets(ss);
    sheet = ss.getSheetByName(SHEETS.EXPENSES);
  }
  if (!expense) return;

  const data = sheet.getDataRange().getValues();
  let foundRow = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(expense.id)) {
      foundRow = i + 1;
      break;
    }
  }

  if (operation === 'delete') {
    if (foundRow !== -1) sheet.deleteRow(foundRow);
    return;
  }

  const rowValues = [
    expense.id || '',
    formatDhakaDateOnly(expense.date || new Date()),
    expense.category || 'সাধারণ খরচ',
    Number(expense.amount) || 0,
    expense.note || expense.description || '',
    expense.userName || expense.userId || 'এডমিন',
    'ব্যয় / খরচ (Expense)',
    expense.userId || '1'
  ];

  if (foundRow !== -1) {
    sheet.getRange(foundRow, 1, 1, rowValues.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }
}

function syncSingleSMS(ss, smsLog, operation) {
  let sheet = ss.getSheetByName(SHEETS.SMS);
  if (!sheet) {
    initializeAllSheets(ss);
    sheet = ss.getSheetByName(SHEETS.SMS);
  }
  if (!smsLog) return;

  if (operation === 'delete') return;

  const rowValues = [
    smsLog.id || `sms_${Date.now()}`,
    formatDhakaDateTime(smsLog.createdAt || new Date()),
    smsLog.recipient || '',
    smsLog.message || '',
    smsLog.status === 'sent' ? 'প্রেরিত (Sent)' : (smsLog.status || 'Sent')
  ];
  sheet.appendRow(rowValues);
}

function syncSingleUser(ss, user, operation) {
  let sheet = ss.getSheetByName(SHEETS.USERS);
  if (!sheet) {
    initializeAllSheets(ss);
    sheet = ss.getSheetByName(SHEETS.USERS);
  }
  if (!user) return;

  const data = sheet.getDataRange().getValues();
  let foundRow = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(user.id)) {
      foundRow = i + 1;
      break;
    }
  }

  if (operation === 'delete') {
    if (foundRow !== -1) sheet.deleteRow(foundRow);
    return;
  }

  const roleText = user.role === 'admin' ? 'অ্যাডমিন' : (user.role === 'manager' ? 'ম্যানেজার' : 'সেলসম্যান');
  const perms = Array.isArray(user.permissions) ? user.permissions.join(', ') : 'সকল পারমিশন';
  const rowValues = [
    user.id || '',
    user.name || 'ইউজার',
    user.email || '',
    user.phone || '',
    roleText,
    user.businessId || 'main-business',
    perms,
    formatDhakaDateTime(user.lastSeen || new Date()),
    user.password || '123456'
  ];

  if (foundRow !== -1) {
    sheet.getRange(foundRow, 1, 1, rowValues.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }
}

function syncSingleCategory(ss, category, operation) {
  let sheet = ss.getSheetByName(SHEETS.CATEGORIES);
  if (!sheet) {
    initializeAllSheets(ss);
    sheet = ss.getSheetByName(SHEETS.CATEGORIES);
  }
  if (!category) return;

  const data = sheet.getDataRange().getValues();
  let foundRow = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(category.id)) {
      foundRow = i + 1;
      break;
    }
  }

  if (operation === 'delete') {
    if (foundRow !== -1) sheet.deleteRow(foundRow);
    return;
  }

  const rowValues = [
    category.id || '',
    category.name || '',
    category.description || ''
  ];

  if (foundRow !== -1) {
    sheet.getRange(foundRow, 1, 1, rowValues.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }
}

function syncCustomerPayment(ss, payload) {
  const { customerId, amount } = payload;
  const cSheet = ss.getSheetByName(SHEETS.CUSTOMERS);
  if (!cSheet) return;

  const data = cSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(customerId)) {
      const hasExtended = data[i].length >= 9;
      const currentNetDue = hasExtended ? (Number(data[i][6]) || 0) : (Number(data[i][4]) || 0);
      const currentSpent = hasExtended ? (Number(data[i][8]) || 0) : (Number(data[i][5]) || 0);
      const newNetDue = currentNetDue - (Number(amount) || 0);

      const updatedCustomer = {
        id: data[i][0],
        name: data[i][1],
        phone: data[i][2],
        address: data[i][3],
        dueAmount: newNetDue,
        totalSpent: currentSpent,
        createdBy: hasExtended ? (data[i][9] || 'admin-1') : 'admin-1',
        createdAt: hasExtended ? data[i][10] : data[i][6]
      };
      const rowValues = buildCustomerRowValues(updatedCustomer);
      cSheet.getRange(i + 1, 1, 1, rowValues.length).setValues([rowValues]);
      break;
    }
  }

  refreshDuesFromCustomersSheet(ss);
}

/**
 * Read all data from Google Sheet tabs to restore A-to-Z into HishabPati ERP app
 */
function readAllSpreadsheetData(ss) {
  const result = {
    version: '3.0-SHEETS',
    timestamp: new Date().toISOString(),
    source: 'Google Sheets Live Database',
    business: {},
    categories: [],
    products: [],
    customers: [],
    sales: [],
    approvalRequests: [],
    suppliers: [],
    expenses: [],
    smsLogs: [],
    users: []
  };

  // Categories
  const catSheet = ss.getSheetByName(SHEETS.CATEGORIES);
  if (catSheet && catSheet.getLastRow() > 1) {
    const catRows = catSheet.getRange(2, 1, catSheet.getLastRow() - 1, catSheet.getLastColumn()).getValues();
    result.categories = catRows.map(r => ({
      id: String(r[0] || `cat_${Date.now()}`),
      name: String(r[1] || ''),
      description: String(r[2] || '')
    }));
  }

  // Products
  const pSheet = ss.getSheetByName(SHEETS.PRODUCTS);
  if (pSheet && pSheet.getLastRow() > 1) {
    const pRows = pSheet.getRange(2, 1, pSheet.getLastRow() - 1, pSheet.getLastColumn()).getValues();
    result.products = pRows.map(r => {
      const name = String(r[1] || '');
      const bnName = String(r[2] || '');
      const typeCol = String(r[12] || '');
      const statusCol = String(r[11] || '');
      const isCustomPrice =
        typeCol.indexOf('অন্যান্য') !== -1 ||
        statusCol.indexOf('প্রযোজ্য নয়') !== -1 ||
        name.trim() === 'অন্যান্য' ||
        name.trim() === 'অন্যন্য' ||
        bnName.trim() === 'অন্যান্য' ||
        bnName.trim() === 'অন্যন্য';

      return {
        id: String(r[0] || `prod_${Date.now()}`),
        name: name,
        bnName: bnName || name,
        sku: String(r[3] || ''),
        barcode: String(r[4] || ''),
        categoryId: String(r[5] || (isCustomPrice ? 'অন্যান্য' : 'general')),
        purchasePrice: Number(r[6]) || 0,
        salePrice: Number(r[7]) || 0,
        stock: isCustomPrice ? 0 : (Number(r[8]) || 0),
        minStock: isCustomPrice ? 0 : (Number(r[9]) || 5),
        unit: String(r[10] || 'পিস'),
        isCustomPrice: isCustomPrice,
        expiryDate: r[13] ? String(r[13]) : undefined
      };
    });
  }

  // Customers (supports both new 11-column format with ক্রেতা পাবে and legacy 7-column format)
  const cSheet = ss.getSheetByName(SHEETS.CUSTOMERS);
  if (cSheet && cSheet.getLastRow() > 1) {
    const cRows = cSheet.getRange(2, 1, cSheet.getLastRow() - 1, cSheet.getLastColumn()).getValues();
    result.customers = cRows.map(r => {
      const isNewFormat = r.length >= 9;
      let netDue = 0;
      if (isNewFormat) {
        const dueCol = Number(r[4]) || 0;
        const advCol = Number(r[5]) || 0;
        const netCol = Number(r[6]);
        netDue = !isNaN(netCol) && netCol !== 0 ? netCol : (advCol > 0 ? -advCol : dueCol);
      } else {
        netDue = Number(r[4]) || 0;
      }

      return {
        id: String(r[0] || `cust_${Date.now()}`),
        name: String(r[1] || 'ক্রেতা'),
        phone: String(r[2] || ''),
        address: String(r[3] || ''),
        dueAmount: netDue,
        totalSpent: Number(isNewFormat ? r[8] : r[5]) || 0,
        createdBy: isNewFormat ? String(r[9] || 'admin-1') : 'admin-1',
        createdAt: String((isNewFormat ? r[10] : r[6]) || new Date().toISOString())
      };
    });
  }

  // Sales (supports both new 19-column format and legacy 14-column format)
  const sSheet = ss.getSheetByName(SHEETS.SALES);
  if (sSheet && sSheet.getLastRow() > 1) {
    const sRows = sSheet.getRange(2, 1, sSheet.getLastRow() - 1, sSheet.getLastColumn()).getValues();
    result.sales = sRows.map((r, i) => {
      const isNewSaleFormat = r.length >= 18;
      const jsonColIdx = isNewSaleFormat ? 18 : 13;
      let items = [];
      if (r[jsonColIdx]) {
        try {
          items = JSON.parse(String(r[jsonColIdx]));
        } catch (e) {
          items = [];
        }
      }
      if (!Array.isArray(items) || items.length === 0) {
        const summary = String(r[4] || '');
        if (summary) {
          items = summary.split(';').map(part => ({
            name: part.trim(),
            quantity: 1,
            unitPrice: 0,
            total: 0
          }));
        }
      }

      const netDue = isNewSaleFormat
        ? (Number(r[12]) || ((Number(r[11]) || 0) > 0 ? -Number(r[11]) : (Number(r[10]) || 0)))
        : (Number(r[10]) || 0);
      const payMethodRaw = String(isNewSaleFormat ? r[13] : r[11]);
      const statusRaw = isNewSaleFormat ? String(r[14] || '') : '';
      const isTemporary = statusRaw.indexOf('TEMPORARY') !== -1 || String(r[0] || '').indexOf('TMP-') === 0;

      return {
        id: String((isNewSaleFormat && r[17]) ? r[17] : `sale_${i + 1}`),
        invoiceNo: String(r[0] || `INV-${1000 + i}`),
        createdAt: String(r[1] || new Date().toISOString()),
        customerName: String(r[2] || ''),
        customerPhone: String(r[3] || ''),
        customerId: isNewSaleFormat ? String(r[16] || '') : '',
        totalAmount: Number(r[5]) || 0,
        discount: Number(r[6]) || 0,
        vat: Number(r[7]) || 0,
        payableAmount: Number(r[8]) || 0,
        paidAmount: Number(r[9]) || 0,
        dueAmount: netDue,
        paymentMethod: payMethodRaw === 'বিকাশ/নগদ' ? 'mobile_pay' : (payMethodRaw === 'কার্ড' ? 'card' : 'cash'),
        isTemporary: isTemporary,
        approvalStatus: statusRaw.indexOf('বাতিল') !== -1 ? 'rejected' : (isTemporary ? 'pending' : 'approved'),
        userName: String((isNewSaleFormat ? r[15] : r[12]) || 'এডমিন'),
        items: items
      };
    });
  }

  // Approval Requests
  const appSheet = ss.getSheetByName(SHEETS.APPROVALS);
  if (appSheet && appSheet.getLastRow() > 1) {
    const aRows = appSheet.getRange(2, 1, appSheet.getLastRow() - 1, appSheet.getLastColumn()).getValues();
    result.approvalRequests = aRows.map(r => {
      if (r[14]) {
        try {
          return JSON.parse(String(r[14]));
        } catch (e) {}
      }
      return {
        id: String(r[0] || `req_${Date.now()}`),
        createdAt: String(r[1] || new Date().toISOString()),
        type: String(r[2] || '').indexOf('বকেয়া') !== -1 ? 'due_payment' : 'sale',
        temporaryInvoiceNo: String(r[3] || ''),
        finalInvoiceNo: String(r[4] || ''),
        userName: String(r[5] || 'সেলসম্যান'),
        status: String(r[11] || '').indexOf('Approved') !== -1 ? 'approved' : (String(r[11] || '').indexOf('Rejected') !== -1 ? 'rejected' : 'pending')
      };
    });
  }

  // Suppliers
  const supSheet = ss.getSheetByName(SHEETS.SUPPLIERS);
  if (supSheet && supSheet.getLastRow() > 1) {
    const supRows = supSheet.getRange(2, 1, supSheet.getLastRow() - 1, supSheet.getLastColumn()).getValues();
    result.suppliers = supRows.map(r => ({
      id: String(r[0] || `sup_${Date.now()}`),
      name: String(r[1] || 'সরবরাহকারী'),
      company: String(r[2] || ''),
      phone: String(r[3] || ''),
      address: String(r[4] || ''),
      dueAmount: Number(r[5]) || 0
    }));
  }

  // Expenses
  const eSheet = ss.getSheetByName(SHEETS.EXPENSES);
  if (eSheet && eSheet.getLastRow() > 1) {
    const eRows = eSheet.getRange(2, 1, eSheet.getLastRow() - 1, eSheet.getLastColumn()).getValues();
    result.expenses = eRows.map((r, i) => ({
      id: String(r[0] || `exp_${i + 1}`),
      date: String(r[1] || new Date().toISOString()),
      category: String(r[2] || 'সাধারণ খরচ'),
      amount: Number(r[3]) || 0,
      note: String(r[4] || ''),
      userName: String(r[5] || 'এডমিন'),
      userId: String(r[7] || '1')
    }));
  }

  // SMS Logs
  const smsSheet = ss.getSheetByName(SHEETS.SMS);
  if (smsSheet && smsSheet.getLastRow() > 1) {
    const smsRows = smsSheet.getRange(2, 1, smsSheet.getLastRow() - 1, smsSheet.getLastColumn()).getValues();
    result.smsLogs = smsRows.map((r, i) => ({
      id: String(r[0] || `sms_${i + 1}`),
      createdAt: String(r[1] || new Date().toISOString()),
      recipient: String(r[2] || ''),
      message: String(r[3] || ''),
      status: 'sent'
    }));
  }

  // Users (supports both new 9-column format with businessId and legacy 8-column format)
  const uSheet = ss.getSheetByName(SHEETS.USERS);
  if (uSheet && uSheet.getLastRow() > 1) {
    const uRows = uSheet.getRange(2, 1, uSheet.getLastRow() - 1, uSheet.getLastColumn()).getValues();
    result.users = uRows.map(r => {
      const hasBizCol = r.length >= 9;
      const roleRaw = String(r[4] || '').trim();
      const role = (roleRaw === 'অ্যাডমিন' || roleRaw === 'admin') ? 'admin' : ((roleRaw === 'ম্যানেজার' || roleRaw === 'manager') ? 'manager' : 'salesman');
      const permsRaw = String(hasBizCol ? r[6] : r[5] || '');
      const permissions = permsRaw ? permsRaw.split(',').map(p => p.trim()) : [];
      return {
        id: String(r[0] || `user_${Date.now()}`),
        name: String(r[1] || 'ইউজার'),
        email: String(r[2] || ''),
        phone: String(r[3] || ''),
        role: role,
        businessId: hasBizCol ? String(r[5] || 'main-business') : 'main-business',
        permissions: permissions,
        lastSeen: String((hasBizCol ? r[7] : r[6]) || ''),
        password: String((hasBizCol ? r[8] : r[7]) || '123456')
      };
    });
  }

  // Business Settings
  const setSheet = ss.getSheetByName(SHEETS.SETTINGS);
  if (setSheet && setSheet.getLastRow() > 1) {
    const setRows = setSheet.getRange(2, 1, setSheet.getLastRow() - 1, 2).getValues();
    const bizObj = {};
    setRows.forEach(r => {
      bizObj[r[0]] = r[1];
    });
    result.business = {
      id: bizObj.business_id || 'main-business',
      name: bizObj.name || 'হিসাব পাতি ERP',
      address: bizObj.address || '',
      phone: bizObj.phone || '',
      currency: bizObj.currency || '৳',
      defaultPrinter: bizObj.default_printer || 'thermal',
      theme: bizObj.theme || 'light'
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
  const isOther = isOtherProductItem({ name: name });
  const salePrice = Number(priceResp.getResponseText()) || 0;
  const stock = isOther ? 0 : (Number(stockResp.getResponseText()) || 0);

  pSheet.appendRow([
    newId,
    name,
    name,
    'SKU-' + Date.now().toString().slice(-4),
    '',
    isOther ? 'অন্যান্য' : 'সাধারণ',
    salePrice * 0.7,
    salePrice,
    stock,
    isOther ? 0 : 5,
    'পিস',
    isOther ? 'স্টক প্রযোজ্য নয় (ইচ্ছেমতো মূল্য)' : (stock > 5 ? 'পর্যাপ্ত স্টক' : (stock > 0 ? 'কম স্টক' : 'স্টক শেষ')),
    isOther ? 'অন্যান্য (কাস্টম মূল্য)' : 'সাধারণ পণ্য',
    ''
  ]);

  ui.alert('সফল!', `পণ্য "${name}" গুগল শিটে সফলভাবে যুক্ত করা হয়েছে।`, ui.ButtonSet.OK);
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
  const netDue = total - paid;
  const invNo = 'INV-' + (sSheet.getLastRow() + 1000);

  sSheet.appendRow(buildSaleRowValues({
    id: 'sale_' + Date.now(),
    invoiceNo: invNo,
    createdAt: new Date(),
    customerName: custName,
    totalAmount: total,
    payableAmount: total,
    paidAmount: paid,
    dueAmount: netDue,
    paymentMethod: 'cash',
    userName: 'গুগল শিট এডমিন',
    items: [{ name: 'সরাসরি গুগল শিট মেমো', quantity: 1, unitPrice: total }]
  }));

  ui.alert('মেমো সফলভাবে এন্ট্রি হয়েছে!', `ইনভয়েস: ${invNo}\nক্রেতা: ${custName}\nমোট: ${total}৳\nজমা: ${paid}৳\nব্যালেন্স: ${netDue}৳`, ui.ButtonSet.OK);
}

function menuRecordDuePaymentPrompt() {
  const ui = SpreadsheetApp.getUi();
  const phoneResp = ui.prompt('বকেয়া / অ্যাডভান্স টাকা জমা', 'ক্রেতার মোবাইল নম্বর বা নাম লিখুন:', ui.ButtonSet.OK_CANCEL);
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
      syncCustomerPayment(ss, { customerId: data[i][0], amount: amount });
      found = true;
      ui.alert('জমা সফল!', `গ্রাহক: ${data[i][1]} এর পেমেন্ট ৳${amount} জমা হয়েছে এবং বকেয়া খাতা আপডেট করা হয়েছে।`, ui.ButtonSet.OK);
      break;
    }
  }

  if (!found) {
    ui.alert('পাওয়া যায়নি', 'উক্ত নাম বা নম্বরে কোনো ক্রেতা পাওয়া যায়নি।', ui.ButtonSet.OK);
  }
}

function menuExportJson() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const allData = readAllSpreadsheetData(ss);
  const jsonString = JSON.stringify(allData, null, 2);
  const htmlOutput = HtmlService.createHtmlOutput(
    `<h3>হিসাবপাতি ব্যাকআপ JSON</h3>
     <p>নিচের কোডটি কপি করে হিসাবপাতি অ্যাপে রিস্টোর করতে পারেন:</p>
     <textarea style="width:100%;height:300px;">${jsonString}</textarea>`
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

function getDhakaDateOnly() {
  return Utilities.formatDate(new Date(), 'Asia/Dhaka', 'yyyy-MM-dd');
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
