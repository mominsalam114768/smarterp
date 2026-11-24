/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, FormEvent, ChangeEvent } from "react";
import { api, isGlobalSuperAdmin } from "../services/api";
import { Business, User } from "../types";
import { cn, getDhakaDateString, formatDhakaDateTime } from "../lib/utils";
import { 
  Settings as SettingsIcon, 
  Store, 
  MapPin, 
  Phone, 
  DollarSign, 
  Save, 
  ShieldCheck, 
  Lock,
  Globe,
  Printer,
  Database,
  Download,
  Upload,
  Mail,
  ShieldAlert,
  FileCode,
  Trash2,
  FileSpreadsheet,
  Cloud,
  CheckCircle,
  RefreshCw,
  Copy,
  Check,
  ExternalLink,
  Play,
  AlertCircle,
  HelpCircle,
  Layers,
  Sparkles,
  Building2,
  Plus,
  ArrowRightLeft,
  Eye,
  EyeOff,
  FileText,
  Search,
  ShoppingCart,
  Wallet,
  Receipt
} from "lucide-react";
import { motion } from "motion/react";
import CryptoJS from "crypto-js";
import { generateExcelWorkbook } from "../lib/excelExport";
import { 
  googleDriveSignIn, 
  uploadFileToDrive, 
  initDriveAuth, 
  getDriveAccessToken,
  getSavedDriveAccount,
  disconnectDriveAccount,
  fetchCloudDriveAccount,
  hasActiveGoogleToken,
  subscribeGoogleTokenChange
} from "../lib/drive";
import { 
  getLocalSheetsConfig, 
  saveSheetsConfig, 
  fetchCloudSheetsConfig, 
  testGoogleSheetsConnection, 
  syncAllToGoogleSheets, 
  fetchDataFromGoogleSheets,
  findMasterWebAppUrl,
  GoogleSheetsConfig
} from "../lib/sheetsSync";

const defaultBusiness: Business = {
  id: "main-business",
  name: "হিসাব পাতি",
  address: "ঢাকা, বাংলাদেশ",
  phone: "",
  currency: "৳",
  backupEmail: "",
  smtpConfig: {
    user: "",
    pass: "",
    senderName: "Smart Business Backup"
  }
};

export function Settings({ 
  user,
  onBusinessUpdate,
  onShopSwitch
}: { 
  user?: User | null;
  onBusinessUpdate?: (b: Business) => void;
  onShopSwitch?: (b: Business) => void;
}) {
  const canManageShops = isGlobalSuperAdmin(user);
  const [business, setBusiness] = useState<Business>(defaultBusiness);
  const [shopsList, setShopsList] = useState<Business[]>([]);
  const [shopSheetStatuses, setShopSheetStatuses] = useState<Record<string, GoogleSheetsConfig>>({});
  const [switchingShopId, setSwitchingShopId] = useState<string | null>(null);
  const [showAddShopModal, setShowAddShopModal] = useState(false);
  const [creatingShop, setCreatingShop] = useState(false);
  const [switchImmediately, setSwitchImmediately] = useState(true);
  const [newShopForm, setNewShopForm] = useState({
    name: "",
    phone: "",
    address: "ঢাকা, বাংলাদেশ",
    currency: "BDT",
    webAppUrl: "",
    sheetUrl: ""
  });

  // Shop Deletion Admin Verification Modal States
  const [shopToDelete, setShopToDelete] = useState<Business | null>(null);
  const [deleteAuthForm, setDeleteAuthForm] = useState({ email: "", password: "" });
  const [showDeletePass, setShowDeletePass] = useState(false);
  const [deletingShop, setDeletingShop] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'shops' | 'profile' | 'logs' | 'sheets' | 'printer' | 'backup'>(canManageShops ? 'shops' : 'profile');
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error' | 'info'} | null>(null);

  // Categorized Transaction Logs States (Per Active Shop - Strictly Separated)
  const [logCategory, setLogCategory] = useState<'sales' | 'orders' | 'payments' | 'purchases' | 'supplier_payments' | 'expenses'>('sales');
  const [logSearchTerm, setLogSearchTerm] = useState("");
  const [logsLoading, setLogsLoading] = useState(false);
  const [shopLogs, setShopLogs] = useState<{
    sales: any[];
    orders: any[];
    payments: any[];
    suppliers: any[];
    expenses: any[];
  }>({
    sales: [],
    orders: [],
    payments: [],
    suppliers: [],
    expenses: []
  });
  
  // Google Sheets Master Database States (Isolated per Shop)
  const [sheetsConfig, setSheetsConfig] = useState<GoogleSheetsConfig>(getLocalSheetsConfig());
  const [testingSheets, setTestingSheets] = useState(false);
  const [syncingSheets, setSyncingSheets] = useState(false);
  const [syncingAllShops, setSyncingAllShops] = useState(false);
  const [restoringSheets, setRestoringSheets] = useState(false);
  const [savingSheets, setSavingSheets] = useState(false);
  const [recognizingSheet, setRecognizingSheet] = useState(false);

  // States for Security tab
  const [passwords, setPasswords] = useState({ current: "", new: "", confirm: "" });
  
  // State for Printer tab
  const [selectedPrinter, setSelectedPrinter] = useState('thermal');

  // Backup loading state
  const [backupAction, setBackupAction] = useState(false);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [lastImportedData, setLastImportedData] = useState<any>(null);
  const [driveUser, setDriveUser] = useState<any>(null);
  const [hasGoogleToken, setHasGoogleToken] = useState<boolean>(() => hasActiveGoogleToken());
  const [driveUploading, setDriveUploading] = useState(false);
  const [isConnectingDrive, setIsConnectingDrive] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    show: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    variant?: 'danger' | 'primary';
    onConfirm: () => Promise<void> | void;
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [driveAuthHelp, setDriveAuthHelp] = useState<{
    show: boolean;
    errorMsg: string;
    domain: string;
  }>({ show: false, errorMsg: "", domain: "" });
  const [importStatus, setImportStatus] = useState<{
    stage: 'idle' | 'reading' | 'decrypting' | 'reviewing' | 'restoring' | 'success' | 'error',
    message?: string,
    summary?: { products: number, sales: number, users: number, businessName: string }
  }>({ stage: 'idle' });
  const [backupPassModal, setBackupPassModal] = useState<{
    mode: 'export_local' | 'export_drive' | 'import_bak';
    file?: File;
  } | null>(null);
  const [backupPassphrase, setBackupPassphrase] = useState("");
  const [backupPassConfirm, setBackupPassConfirm] = useState("");
  const [backupPassError, setBackupPassError] = useState("");

  useEffect(() => {
    const unsubToken = subscribeGoogleTokenChange((active) => {
      setHasGoogleToken(active);
    });

    // 1. Immediately read locally saved Google account profile
    const saved = getSavedDriveAccount();
    if (saved && saved.email) {
      setDriveUser(saved);
      if (saved.lastBackupAt) setLastBackupAt(saved.lastBackupAt);
    }

    // 2. Fetch latest status from Firestore cloud config
    fetchCloudDriveAccount().then(cloudAcc => {
      if (cloudAcc && cloudAcc.email) {
        setDriveUser(cloudAcc);
        if (cloudAcc.lastBackupAt) setLastBackupAt(cloudAcc.lastBackupAt);
      }
    });

    const unsub = initDriveAuth(
      (u) => {
        setDriveUser(u);
        setHasGoogleToken(hasActiveGoogleToken());
      },
      () => {
        setHasGoogleToken(hasActiveGoogleToken());
        const stillSaved = getSavedDriveAccount();
        if (stillSaved && stillSaved.email) {
          setDriveUser(stillSaved);
        } else {
          setDriveUser(null);
        }
      }
    );
    return () => {
      unsubToken();
      if (typeof unsub === "function") unsub();
    };
  }, []);

  const loadAllShopsAndConfig = async () => {
    setLoading(true);
    try {
      const [bizData, allShops, users, backupStatus] = await Promise.all([
        api.getBusiness(),
        canManageShops ? api.getBusinesses() : Promise.resolve([] as Business[]),
        api.getUsers(),
        api.getBackupStatus()
      ]);
      const activeShopId = bizData?.id || user?.businessId || "main-business";
      const scopedShops = canManageShops ? allShops : (bizData ? [bizData] : []);
      if (bizData) {
        setBusiness(prev => ({
          ...prev,
          ...bizData,
          smtpConfig: {
            ...(prev.smtpConfig || {}),
            ...(bizData.smtpConfig || {})
          }
        }));
        const savedLocalPrinter = typeof window !== "undefined" ? localStorage.getItem(`smart_printer_${activeShopId}`) : null;
        if (savedLocalPrinter === 'a4' || savedLocalPrinter === 'thermal') {
          setSelectedPrinter(savedLocalPrinter);
        } else if (bizData.defaultPrinter) {
          setSelectedPrinter(bizData.defaultPrinter);
        }
      }
      setShopsList(scopedShops);
      setLastBackupAt(backupStatus.lastBackupAt || null);

      const admin = users.find(u => u.id === user?.id) || users.find(u => u.role === 'admin');
      if (admin) setCurrentUser(admin);

      // Load Google Sheets config specifically for the active shop
      const localCfg = getLocalSheetsConfig(activeShopId);
      setSheetsConfig(localCfg);
      fetchCloudSheetsConfig(activeShopId).then(cfg => {
        if (cfg) {
          setSheetsConfig(cfg);
          setShopSheetStatuses(prev => ({ ...prev, [activeShopId]: cfg }));
        }
      });

      // Load permanently bound Google Sheets status for permitted shops
      const statusMap: Record<string, GoogleSheetsConfig> = {};
      for (const s of scopedShops) {
        statusMap[s.id] = getLocalSheetsConfig(s.id);
      }
      setShopSheetStatuses(statusMap);
      Promise.all(
        scopedShops.map(async (s) => {
          try {
            const c = await fetchCloudSheetsConfig(s.id);
            return { id: s.id, cfg: c };
          } catch {
            return { id: s.id, cfg: getLocalSheetsConfig(s.id) };
          }
        })
      ).then(results => {
        const nextMap: Record<string, GoogleSheetsConfig> = {};
        results.forEach(r => {
          nextMap[r.id] = r.cfg;
          if (r.id === activeShopId && r.cfg) {
            setSheetsConfig(r.cfg);
          }
        });
        setShopSheetStatuses(nextMap);
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadTransactionLogs = async () => {
    setLogsLoading(true);
    try {
      const [salesList, approvalList, customerPayList, supplierTxList, expenseList] = await Promise.all([
        api.getSales(),
        api.getApprovalRequests("all"),
        api.getAllCustomerPayments(),
        api.getAllSupplierTransactions(),
        api.getExpenses()
      ]);
      // Filter sales to official/confirmed memos so temporary pending sales don't appear twice alongside orders
      const confirmedSales = (salesList || []).filter(
        (s: any) => !s.isTemporary && s.approvalStatus !== "pending" && !String(s.invoiceNo || "").startsWith("TMP-")
      );
      setShopLogs({
        sales: confirmedSales,
        orders: approvalList || [],
        payments: customerPayList || [],
        suppliers: supplierTxList || [],
        expenses: expenseList || []
      });
    } catch (err) {
      console.error("Failed to load transaction logs:", err);
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    if (!canManageShops && activeSubTab === 'shops') {
      setActiveSubTab('profile');
    }
    loadAllShopsAndConfig();
    loadTransactionLogs();
  }, [user?.id, user?.businessId, canManageShops]);

  useEffect(() => {
    if (activeSubTab === 'logs') {
      loadTransactionLogs();
    }
  }, [activeSubTab, business?.id]);

  const showNotify = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3500);
  };

  const handleRecognizeOrSetupSheet = async () => {
    setRecognizingSheet(true);
    try {
      if (!getDriveAccessToken()) {
        const authRes = await googleDriveSignIn();
        if (authRes?.user) {
          setDriveUser(authRes.user);
          setHasGoogleToken(true);
        }
      }
      const activeShopId = business?.id || user?.businessId || "main-business";
      const result = await api.ensureShopGoogleSheet(activeShopId, {
        allowCreateIfMissing: false,
        forceRestoreFromSheet: true
      });
      if (result) {
        setSheetsConfig(result);
        setShopSheetStatuses(prev => ({ ...prev, [activeShopId]: result }));
        await loadTransactionLogs();
        if (result.connectionAction === "reconnected_from_drive") {
          showNotify(`পূর্বের গুগল শিট (${result.sheetName}) শনাক্ত হয়ে এই শপের সকল ডাটা পুনরুদ্ধার হয়েছে!`, "success");
        } else {
          showNotify(`"${result.sheetName}" গুগল শিট সংযুক্ত আছে এবং ডাটা সিঙ্ক প্রস্তুত।`, "success");
        }
      }
    } catch (err: any) {
      showNotify(err.message || "গুগল শিট শনাক্ত করতে সমস্যা হয়েছে", "error");
    } finally {
      setRecognizingSheet(false);
    }
  };

  const handleReverseOrDeleteLog = (logItem: {
    kind: 'sale' | 'order' | 'payment' | 'supplier' | 'expense';
    id: string;
    refNo: string;
    partyName: string;
    amount: number;
    customerId?: string;
    supplierId?: string;
    subType?: string;
  }) => {
    let title = "ভুল এন্ট্রি বাতিল ও সংশোধন নিশ্চিতকরণ";
    let message = "";

    if (logItem.kind === "sale") {
      message = `আপনি কি মেমো #${logItem.refNo} (${logItem.partyName} - ৳${logItem.amount}) ভুল এন্ট্রি হিসেবে ডিলিট করতে চান? এটি ডিলিট করলে বিক্রয়কৃত পণ্যের স্টক পুনরায় ফিরে আসবে এবং ক্রেতার বকেয়া ও মোট ক্রয় স্বয়ংক্রিয়ভাবে সমন্বয় হয়ে গুগল শিটে আপডেট হবে।`;
    } else if (logItem.kind === "order") {
      message = `আপনি কি বিক্রয় অর্ডার #${logItem.refNo} (${logItem.partyName} - ৳${logItem.amount}) ডিলিট করতে চান? এটি তালিকা ও গুগল শিট থেকে মুছে যাবে।`;
    } else if (logItem.kind === "payment") {
      message = `আপনি কি পেমেন্ট রিসিপ্ট #${logItem.refNo} (${logItem.partyName} - ৳${logItem.amount}) ভুল এন্ট্রি হিসেবে বাতিল করতে চান? এটি বাতিল করলে ক্রেতার বকেয়া খাতায় ৳${logItem.amount} পুনরায় যোগ হয়ে পূর্বের অবস্থায় ফিরে যাবে।`;
    } else if (logItem.kind === "supplier") {
      const actionDesc = logItem.subType === "payment" ? "সরবরাহকারী পেমেন্ট" : "পণ্য ক্রয়";
      message = `আপনি কি ${actionDesc} ভাউচার #${logItem.refNo} (${logItem.partyName} - ৳${logItem.amount}) ভুল এন্ট্রি হিসেবে বাতিল করতে চান? এটি বাতিল করলে সরবরাহকারীর দেনার হিসাব স্বয়ংক্রিয়ভাবে পূর্বের অবস্থায় ফিরে যাবে।`;
    } else {
      message = `আপনি কি খরচ ভাউচার #${logItem.refNo} (${logItem.partyName} - ৳${logItem.amount}) ভুল এন্ট্রি হিসেবে মুছে ফেলতে চান?`;
    }

    setConfirmDialog({
      show: true,
      title,
      message,
      confirmLabel: "হ্যাঁ, ভুল এন্ট্রি ডিলিট করুন",
      variant: "danger",
      onConfirm: async () => {
        try {
          if (logItem.kind === "sale") {
            await api.deleteSale(logItem.id);
          } else if (logItem.kind === "order") {
            await api.deleteApprovalRequest(logItem.id);
          } else if (logItem.kind === "payment") {
            await api.deleteCustomerPayment(logItem.id, logItem.customerId || "");
          } else if (logItem.kind === "supplier") {
            await api.deleteSupplierTransaction(logItem.id, logItem.supplierId || "");
          } else if (logItem.kind === "expense") {
            await api.deleteExpense(logItem.id);
          }
          await loadTransactionLogs();
          showNotify(`#${logItem.refNo} ভুল এন্ট্রি সফলভাবে বাতিল ও হিসাব সমন্বয় করা হয়েছে!`, "success");
        } catch (err: any) {
          showNotify(err.message || "এন্ট্রি বাতিল করতে সমস্যা হয়েছে", "error");
        }
      }
    });
  };

  const handleSwitchShop = async (targetShop: Business) => {
    if (!canManageShops) {
      showNotify("শুধুমাত্র সুপার অ্যাডমিন অন্য শপে প্রবেশ করতে পারবেন।", "error");
      return;
    }
    if (targetShop.id === business.id) {
      showNotify(`আপনি ইতিমধ্যে "${targetShop.name}" শপে আছেন`, "info");
      return;
    }
    setSwitchingShopId(targetShop.id);
    try {
      showNotify(`"${targetShop.name}" শপে প্রবেশ করা হচ্ছে...`, "info");
      const switchedBiz = await api.switchBusiness(targetShop.id);
      setBusiness(switchedBiz);
      if (switchedBiz.defaultPrinter) {
        setSelectedPrinter(switchedBiz.defaultPrinter);
      }
      const shopCfg = await fetchCloudSheetsConfig(switchedBiz.id);
      setSheetsConfig(shopCfg);
      setShopSheetStatuses(prev => ({ ...prev, [switchedBiz.id]: shopCfg }));
      if (onBusinessUpdate) onBusinessUpdate(switchedBiz);
      if (onShopSwitch) onShopSwitch(switchedBiz);
      showNotify(`সফলভাবে "${switchedBiz.name}" শপে পরিবর্তন করা হয়েছে! এখন এই শপের সকল ডাটা ও গুগল শিট সক্রিয়।`, "success");
    } catch (err: any) {
      showNotify(err.message || "শপ পরিবর্তন করতে সমস্যা হয়েছে", "error");
    } finally {
      setSwitchingShopId(null);
    }
  };

  const handleCreateNewShop = async (e: FormEvent) => {
    e.preventDefault();
    if (!newShopForm.name.trim()) {
      showNotify("অনুগ্রহ করে নতুন শপের নাম লিখুন", "error");
      return;
    }
    setCreatingShop(true);
    try {
      showNotify(`"${newShopForm.name.trim()}" শপ এবং নতুন গুগল শিট স্বয়ংক্রিয়ভাবে তৈরি হচ্ছে...`, "info");

      // Prefer live Google Sheets API token so a real Google Sheet is auto-created for the new shop immediately
      const masterUrl = newShopForm.webAppUrl.trim() || (await findMasterWebAppUrl());
      if (!getDriveAccessToken() && !masterUrl) {
        try {
          const driveAuth = await googleDriveSignIn();
          if (driveAuth?.user) {
            setDriveUser(driveAuth.user);
            setHasGoogleToken(true);
          }
        } catch (authErr: any) {
          showNotify(authErr?.message || "গুগল সাইন-ইন সম্পন্ন হয়নি — শপ তৈরি হচ্ছে, পরে গুগল শিট সংযুক্ত করতে পারবেন।", "info");
        }
      }

      const createdShop = await api.createBusiness({
        name: newShopForm.name.trim(),
        phone: newShopForm.phone.trim(),
        address: newShopForm.address.trim() || "ঢাকা, বাংলাদেশ",
        currency: newShopForm.currency || "BDT",
        webAppUrl: masterUrl,
        sheetUrl: newShopForm.sheetUrl.trim()
      });

      const updatedShops = await api.getBusinesses();
      setShopsList(updatedShops);
      const createdCfg = await fetchCloudSheetsConfig(createdShop.id);
      setShopSheetStatuses(prev => ({ ...prev, [createdShop.id]: createdCfg }));

      setShowAddShopModal(false);
      setNewShopForm({
        name: "",
        phone: "",
        address: "ঢাকা, বাংলাদেশ",
        currency: "BDT",
        webAppUrl: "",
        sheetUrl: ""
      });

      if (switchImmediately) {
        await handleSwitchShop(createdShop);
      }

      if (createdCfg.sheetUrl || createdCfg.spreadsheetId) {
        showNotify(`নতুন শপ "${createdShop.name}" ও এর ডেডিকেটেড গুগল শিট (${createdShop.name} - হিসাবপাতি ডাটাবেজ) তৈরি ও ডাটাবেজ হিসেবে সংযুক্ত হয়েছে!`, "success");
      } else {
        showNotify(`নতুন শপ "${createdShop.name}" তৈরি হয়েছে! গুগল শিট সংযুক্ত করতে 'Sign in with Google' করুন।`, "info");
      }
    } catch (err: any) {
      showNotify(err.message || "নতুন শপ তৈরি করতে সমস্যা হয়েছে", "error");
    } finally {
      setCreatingShop(false);
    }
  };

  const handleDeleteShop = (targetShop: Business) => {
    if (targetShop.id === "main-business") {
      showNotify("মেইন শপ (ডিফল্ট শপ) মুছে ফেলা যাবে না", "error");
      return;
    }
    setShopToDelete(targetShop);
    setDeleteAuthForm({ email: "", password: "" });
    setDeleteError("");
    setShowDeletePass(false);
  };

  const handleConfirmDeleteShop = async (e: FormEvent) => {
    e.preventDefault();
    if (!shopToDelete) return;
    if (!deleteAuthForm.email.trim() || !deleteAuthForm.password.trim()) {
      setDeleteError("অনুগ্রহ করে অ্যাডমিনের ইমেইল এবং পাসওয়ার্ড লিখুন।");
      return;
    }

    setDeletingShop(true);
    setDeleteError("");
    try {
      const targetName = shopToDelete.name;
      const targetId = shopToDelete.id;
      const res = await api.deleteBusiness(targetId, {
        email: deleteAuthForm.email.trim(),
        password: deleteAuthForm.password.trim()
      });

      const updatedShops = await api.getBusinesses();
      setShopsList(updatedShops);
      setShopSheetStatuses(prev => {
        const next = { ...prev };
        delete next[targetId];
        return next;
      });

      if (res.switchedToShop) {
        setBusiness(res.switchedToShop);
        const mainCfg = await fetchCloudSheetsConfig(res.switchedToShop.id);
        setSheetsConfig(mainCfg);
        if (onBusinessUpdate) onBusinessUpdate(res.switchedToShop);
        if (onShopSwitch) onShopSwitch(res.switchedToShop);
      }

      setShopToDelete(null);
      setDeleteAuthForm({ email: "", password: "" });
      showNotify(`অ্যাডমিন যাচাইকরণ সফল! "${targetName}" শপ এবং এর গুগল শিট স্বয়ংক্রিয়ভাবে ডিলিট করা হয়েছে।`, "success");
    } catch (err: any) {
      setDeleteError(err.message || "অ্যাডমিনের ইমেইল বা পাসওয়ার্ড সঠিক নয় অথবা ডিলিট করতে সমস্যা হয়েছে।");
    } finally {
      setDeletingShop(false);
    }
  };

  const handleTestSheets = async () => {
    if (!sheetsConfig.webAppUrl && !(hasGoogleToken && (sheetsConfig.spreadsheetId || sheetsConfig.sheetUrl))) {
      showNotify("প্রথমে 'Sign in with Google' করুন অথবা গুগল অ্যাপস স্ক্রিপ্ট Web App URL লিখুন", "error");
      return;
    }
    setTestingSheets(true);
    try {
      showNotify("গুগল শিটে সংযোগ পরীক্ষা করা হচ্ছে...", "info");
      const res = await testGoogleSheetsConnection(sheetsConfig.webAppUrl || sheetsConfig.sheetUrl || "", business.id);
      setSheetsConfig(prev => ({
        ...prev,
        spreadsheetId: res.spreadsheetId || prev.spreadsheetId,
        sheetUrl: res.sheetUrl || prev.sheetUrl,
        sheetName: res.sheetName || prev.sheetName,
        lastSyncStatus: 'success',
        lastSyncMessage: res.message
      }));
      showNotify(`সংযোগ সফল! শিটের নাম: ${res.sheetName || "সক্রিয়"}`, "success");
    } catch (e: any) {
      console.error("Sheets test error:", e);
      showNotify(e.message || "গুগল শিটে সংযোগ ব্যর্থ হয়েছে", "error");
    } finally {
      setTestingSheets(false);
    }
  };

  const handleSaveSheets = async () => {
    setSavingSheets(true);
    try {
      const saved = await saveSheetsConfig(sheetsConfig, business.id);
      setSheetsConfig(saved);
      setShopSheetStatuses(prev => ({ ...prev, [business.id]: saved }));
      showNotify(`"${business.name}" শপের গুগল শিট কনফিগারেশন সংরক্ষিত হয়েছে!`, "success");
    } catch (e: any) {
      showNotify("কনফিগারেশন সংরক্ষণে সমস্যা হয়েছে", "error");
    } finally {
      setSavingSheets(false);
    }
  };

  const executeSyncAllSheets = async () => {
    setSyncingSheets(true);
    try {
      showNotify(`"${business.name}" শপের সমস্ত তথ্য গুগল শিটে পাঠানো হচ্ছে...`, "info");
      const allData = await api.getAllData();
      const res = await syncAllToGoogleSheets(allData, sheetsConfig.webAppUrl, business.id);
      const updated = getLocalSheetsConfig(business.id);
      setSheetsConfig(updated);
      setShopSheetStatuses(prev => ({ ...prev, [business.id]: updated }));
      showNotify(res.message || "গুগল শিটের প্রতিটি ট্যাবে সমস্ত তথ্য সফলভাবে আপডেট হয়েছে!", "success");
    } catch (e: any) {
      console.error("Sync all sheets error:", e);
      showNotify(e.message || "গুগল শিটে ডাটা পাঠাতে ব্যর্থ হয়েছে", "error");
    } finally {
      setSyncingSheets(false);
    }
  };

  const handleSyncAllSheets = () => {
    if (!sheetsConfig.webAppUrl && !getDriveAccessToken()) {
      showNotify("প্রথমে 'Sign in with Google' করুন অথবা গুগল অ্যাপস স্ক্রিপ্ট Web App URL সেট করুন", "error");
      return;
    }
    const targetSheetLabel = sheetsConfig.sheetName || `${business.name} - হিসাবপাতি ডাটাবেজ`;
    setConfirmDialog({
      show: true,
      title: "গুগল শিট আপডেট নিশ্চিত করুন",
      message: `"${targetSheetLabel}" গুগল স্প্রেডশিটের ১২টি ট্যাবের তথ্য বর্তমান "${business.name}" শপের সর্বশেষ ডাটা দিয়ে আপডেট ও প্রতিস্থাপন করা হবে। আপনি কি নিশ্চিত?`,
      confirmLabel: "হ্যাঁ, শিট আপডেট করুন",
      variant: "primary",
      onConfirm: executeSyncAllSheets
    });
  };

  const executeSyncAllShopsToSheets = async () => {
    setSyncingAllShops(true);
    try {
      showNotify("সকল দোকানের গুগল শিট ও ১২টি ট্যাব/কলাম আপডেট করা হচ্ছে...", "info");
      const res = await api.syncAllShopsToGoogleSheets();
      const updated = getLocalSheetsConfig(business.id);
      setSheetsConfig(updated);
      const statusMap: Record<string, GoogleSheetsConfig> = {};
      for (const s of shopsList) {
        statusMap[s.id] = await fetchCloudSheetsConfig(s.id);
      }
      setShopSheetStatuses(statusMap);
      showNotify(`সফলভাবে ${res.syncedShops}/${res.totalShops} টি দোকানের গুগল শিটের সকল ট্যাব ও কলাম আপডেট হয়েছে!`, "success");
    } catch (e: any) {
      showNotify(e.message || "সকল শপের শিট আপডেটে সমস্যা হয়েছে", "error");
    } finally {
      setSyncingAllShops(false);
    }
  };

  const handleSyncAllShopsToSheets = () => {
    setConfirmDialog({
      show: true,
      title: "সকল শপের গুগল শিট আপডেট নিশ্চিতকরণ",
      message: `আপনার ${shopsList.length}টি দোকানের প্রতিটি গুগল শিট (যে শপের শিট নেই তার নতুন শিট তৈরি করে) আপডেট ও সিঙ্ক করা হবে। আপনি কি এগিয়ে যেতে চান?`,
      confirmLabel: "হ্যাঁ, সব শপ সিঙ্ক করুন",
      variant: "primary",
      onConfirm: executeSyncAllShopsToSheets
    });
  };

  const executeRestoreFromSheets = async () => {
    setRestoringSheets(true);
    try {
      showNotify("গুগল শিট থেকে তথ্য সংগ্রহ করে অ্যাপে রিস্টোর করা হচ্ছে...", "info");
      const sheetData = await fetchDataFromGoogleSheets(sheetsConfig.webAppUrl, business.id);
      await api.restoreDB(sheetData);
      showNotify("গুগল শিট থেকে সফলভাবে সমস্ত ডাটা রিস্টোর হয়েছে!", "success");
      setTimeout(() => {
        window.location.reload();
      }, 1200);
    } catch (e: any) {
      console.error("Restore from sheets error:", e);
      showNotify(e.message || "গুগল শিট থেকে রিস্টোর ব্যর্থ হয়েছে", "error");
    } finally {
      setRestoringSheets(false);
    }
  };

  const handleRestoreFromSheets = () => {
    if (!sheetsConfig.webAppUrl && !(getDriveAccessToken() && (sheetsConfig.spreadsheetId || sheetsConfig.sheetUrl))) {
      showNotify("প্রথমে 'Sign in with Google' করুন অথবা গুগল অ্যাপস স্ক্রিপ্ট Web App URL সেট করুন", "error");
      return;
    }
    setConfirmDialog({
      show: true,
      title: "গুগল শিট থেকে ডাটা রিস্টোর করুন",
      message: `সতর্কতা: "${sheetsConfig.sheetName || business.name}" গুগল শিটের তথ্য দিয়ে অ্যাপের "${business.name}" শপের ডাটাবেজ আপডেট ও রিস্টোর করা হবে। আপনি কি নিশ্চিত?`,
      confirmLabel: "হ্যাঁ, রিস্টোর করুন",
      variant: "primary",
      onConfirm: executeRestoreFromSheets
    });
  };

  const openBackupPassphraseModal = (mode: 'export_local' | 'export_drive' | 'import_bak', file?: File) => {
    setBackupPassphrase("");
    setBackupPassConfirm("");
    setBackupPassError("");
    setBackupPassModal({ mode, file });
  };

  const executeExportData = async (passphrase: string) => {
    setBackupAction(true);
    try {
      const allData = await api.getAllData();
      const jsonData = JSON.stringify(allData);

      // Encrypt data with user-provided backup passphrase
      const encrypted = CryptoJS.AES.encrypt(jsonData, passphrase).toString();
      const backupPayload = `HISHAB_BAK_V2:${encrypted}`;

      const blob = new Blob([backupPayload], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `smart_erp_backup_${getDhakaDateString()}.bak`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showNotify("ড্যাটা সফলভাবে এক্সপোর্ট এবং পাসওয়ার্ড দিয়ে ইনক্রিপ্ট করা হয়েছে");
    } catch (err) {
      showNotify("এক্সপোর্ট করতে সমস্যা হয়েছে", "error");
    } finally {
      setBackupAction(false);
    }
  };

  const handleExportData = () => {
    openBackupPassphraseModal('export_local');
  };

  const handleExportExcel = async () => {
    setBackupAction(true);
    try {
      const allData = await api.getAllData();
      const blob = generateExcelWorkbook({ ...allData, business });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `smart_erp_data_${getDhakaDateString()}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showNotify("সকল তথ্যের এক্সেল ফাইল (.xlsx) সফলভাবে ডাউনলোড হয়েছে", "success");
    } catch (err: any) {
      showNotify(err.message || "এক্সেল তৈরিতে সমস্যা হয়েছে", "error");
    } finally {
      setBackupAction(false);
    }
  };

  const handleConnectDrive = async () => {
    setIsConnectingDrive(true);
    try {
      showNotify("গুগল সাইন-ইন উইন্ডো খোলা হচ্ছে...", "info");
      const res = await googleDriveSignIn();
      if (res) {
        setDriveUser(res.user);
        setHasGoogleToken(true);
        const activeShopId = business?.id || user?.businessId || "main-business";
        try {
          const ensuredCfg = await api.ensureShopGoogleSheet(activeShopId, { allowCreateIfMissing: false });
          if (ensuredCfg) {
            setSheetsConfig(ensuredCfg);
            setShopSheetStatuses(prev => ({ ...prev, [activeShopId]: ensuredCfg }));
            await loadTransactionLogs();
          }
        } catch {}
        showNotify(`গুগল কানেক্ট হয়েছে (${res.user.email})!`, "success");
      }
    } catch (err: any) {
      console.error("Connect drive error:", err);
      const host = typeof window !== "undefined" ? window.location.hostname : "";
      setDriveAuthHelp({
        show: true,
        errorMsg: err.message || "গুগল ড্রাইভ কানেক্ট ব্যর্থ হয়েছে",
        domain: host
      });
      showNotify(err.message || "গুগল ড্রাইভ কানেক্ট ব্যর্থ হয়েছে", "error");
    } finally {
      setIsConnectingDrive(false);
    }
  };

  const executeDriveBackup = async (passphrase: string) => {
    let token = getDriveAccessToken();

    // If not connected yet, trigger sign-in first
    if (!token) {
      showNotify("গুগল ড্রাইভে কানেক্ট করা হচ্ছে, অনুগ্রহ করে সাইন-ইন সম্পন্ন করুন...", "info");
      setIsConnectingDrive(true);
      try {
        const res = await googleDriveSignIn();
        if (res) {
          setDriveUser(res.user);
          setHasGoogleToken(true);
          token = res.accessToken;
          showNotify(`গুগল ড্রাইভে কানেক্ট হয়েছে (${res.user.email})। ব্যাকআপ শুরু হচ্ছে...`, "info");
        } else {
          showNotify("গুগল সাইন-ইন সম্পন্ন হয়নি।", "error");
          return;
        }
      } catch (authErr: any) {
        console.error("Auth error:", authErr);
        const host = typeof window !== "undefined" ? window.location.hostname : "";
        setDriveAuthHelp({
          show: true,
          errorMsg: authErr.message || "গুগল ড্রাইভ কানেক্ট ব্যর্থ হয়েছে",
          domain: host
        });
        showNotify(authErr.message || "গুগল ড্রাইভ কানেক্ট ব্যর্থ হয়েছে", "error");
        return;
      } finally {
        setIsConnectingDrive(false);
      }
    }

    if (!token) {
      showNotify("গুগল ড্রাইভ অ্যাক্সেস টোকেন পাওয়া যায়নি", "error");
      return;
    }

    setDriveUploading(true);
    try {
      const todayStr = getDhakaDateString();
      showNotify("ডাটাবেজ থেকে সকল তথ্য সংগ্রহ করা হচ্ছে...", "info");
      const allData = await api.getAllData();
      const fullData = { ...allData, business };

      // 1. Generate & Upload Excel Workbook
      showNotify("গুগল ড্রাইভে এক্সেল শিট (.xlsx) আপলোড হচ্ছে...", "info");
      const excelBlob = generateExcelWorkbook(fullData);
      const excelFileName = `smart_erp_backup_${todayStr}.xlsx`;
      await uploadFileToDrive(excelFileName, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", excelBlob);

      // 2. Generate & Upload Encrypted .bak using admin passphrase
      showNotify("গুগল ড্রাইভে এনক্রিপ্ট ফাইল (.bak) আপলোড হচ্ছে...", "info");
      const encrypted = CryptoJS.AES.encrypt(JSON.stringify(fullData), passphrase).toString();
      const bakPayload = `HISHAB_BAK_V2:${encrypted}`;
      const bakBlob = new Blob([bakPayload], { type: "application/octet-stream" });
      const bakFileName = `smart_erp_backup_${todayStr}.bak`;
      await uploadFileToDrive(bakFileName, "application/octet-stream", bakBlob);

      const now = new Date().toISOString();
      setLastBackupAt(now);
      await api.recordBackup().catch(() => {});
      showNotify("গুগল ড্রাইভে এক্সেল ও এনক্রিপ্ট ফাইল সফলভাবে সংরক্ষিত হয়েছে!", "success");
    } catch (err: any) {
      console.error("Drive upload error:", err);
      showNotify(err.message || "গুগল ড্রাইভে ব্যাকআপ সংরক্ষণে সমস্যা হয়েছে", "error");
    } finally {
      setDriveUploading(false);
    }
  };

  const handleDriveBackup = () => {
    openBackupPassphraseModal('export_drive');
  };

  const handleImportData = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    openBackupPassphraseModal('import_bak', file);
  };

  const executeImportData = async (file: File, passphrase: string) => {
    setBackupAction(true);
    setImportStatus({ stage: 'reading', message: "ফাইল পড়া হচ্ছে..." });

    try {
      const content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (ev) => resolve(ev.target?.result as string);
        reader.onerror = () => reject(new Error("File reading failed"));
        reader.readAsText(file);
      });

      setImportStatus({ stage: 'decrypting', message: "ডিক্রিপ্ট এবং প্রসেস হচ্ছে..." });
      await new Promise(r => setTimeout(r, 400));

      let encryptedContent = content;
      if (content.startsWith('HISHAB_BAK_V2:')) {
        encryptedContent = content.replace('HISHAB_BAK_V2:', '');
      }

      const bytes = CryptoJS.AES.decrypt(encryptedContent, passphrase);
      const decryptedData = bytes.toString(CryptoJS.enc.Utf8);

      if (!decryptedData) {
        throw new Error("ভুল ব্যাকআপ পাসওয়ার্ড অথবা নষ্ট ফাইল (Decryption Failed)");
      }

      let parsedData;
      try {
        parsedData = JSON.parse(decryptedData);
      } catch (parseErr) {
        console.error("JSON Parse Error on Decrypted Data:", parseErr);
        throw new Error("ডিক্রিপ্ট করা তথ্য সঠিক নয় (Invalid JSON format)");
      }

      setLastImportedData(parsedData);

      const summary = {
        users: parsedData.users?.length || 0,
        products: parsedData.products?.length || 0,
        sales: parsedData.sales?.length || 0,
        businessName: parsedData.business?.name || "Unknown"
      };

      setImportStatus({
        stage: 'reviewing',
        message: "ব্যাকআপ ফাইল চেক করা হয়েছে। নিচের তথ্যগুলো আপনার বর্তমান শপের ডাটাবেজে যুক্ত হবে।",
        summary
      });
    } catch (err: any) {
      console.error("Import Error:", err);
      setImportStatus({
        stage: 'error',
        message: err.message || "ইমপোর্ট ব্যর্থ হয়েছে। ফাইল বা পাসওয়ার্ড সঠিক নয়।"
      });
      showNotify(err.message || "ইমপোর্ট ব্যর্থ হয়েছে।", "error");
    } finally {
      setBackupAction(false);
    }
  };

  const handleSubmitBackupPassphrase = async (e: FormEvent) => {
    e.preventDefault();
    if (!backupPassModal) return;
    const pass = backupPassphrase.trim();
    if (pass.length < 6) {
      setBackupPassError("ব্যাকআপ পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।");
      return;
    }
    if (backupPassModal.mode !== 'import_bak' && pass !== backupPassConfirm.trim()) {
      setBackupPassError("উভয় পাসওয়ার্ড মিলছে না!");
      return;
    }

    const activeModal = backupPassModal;
    setBackupPassModal(null);
    setBackupPassphrase("");
    setBackupPassConfirm("");
    setBackupPassError("");

    if (activeModal.mode === 'export_local') {
      await executeExportData(pass);
    } else if (activeModal.mode === 'export_drive') {
      await executeDriveBackup(pass);
    } else if (activeModal.mode === 'import_bak' && activeModal.file) {
      await executeImportData(activeModal.file, pass);
    }
  };

  const confirmAndRestore = async () => {
    if (!lastImportedData || importStatus.stage !== 'reviewing') return;
    
    setBackupAction(true);
    setImportStatus(prev => ({ ...prev, stage: 'restoring', message: "সার্ভারে ড্যাটা ক্লিয়ার এবং রিস্টোর হচ্ছে..." }));

    try {
      showNotify("সার্ভারে ড্যাটা পাঠানো হচ্ছে...", "success");
      
      const response = await api.restoreDB(lastImportedData);
      console.log("Server Restore Response:", response);
      
      setImportStatus({ stage: 'success', message: "সফলভাবে রিস্টোর করা হয়েছে!" });
      showNotify("সফলভাবে রিস্টোর করা হয়েছে!", "success");
      
      // We don't reload automatically, we'll show a button in the UI
    } catch (err: any) {
      console.error("Restore Error:", err);
      setImportStatus({ stage: 'error', message: err.message || "সার্ভারে ড্যাটা রিস্টোর করতে ব্যর্থ হয়েছে" });
      showNotify("রিস্টোর ব্যর্থ হয়েছে", "error");
    } finally {
      setBackupAction(false);
    }
  };

  const handleUpdateBusiness = async (e: FormEvent) => {
    e.preventDefault();
    if (!business) return;
    setSaving(true);
    try {
      const updated = await api.updateBusiness(business, business.id);
      setBusiness(updated);
      setShopsList(prev => prev.map(s => s.id === business.id ? { ...s, ...updated } : s));
      const updatedSheetCfg = getLocalSheetsConfig(business.id);
      setSheetsConfig(updatedSheetCfg);
      setShopSheetStatuses(prev => ({ ...prev, [business.id]: updatedSheetCfg }));
      if (onBusinessUpdate) onBusinessUpdate(updated);
      showNotify(`শপের তথ্য এবং সংযুক্ত গুগল শিটের নাম (${updated.name} - হিসাবপাতি ডাটাবেজ) সফলভাবে আপডেট করা হয়েছে!`);
    } catch (err) {
      showNotify("আপডেট করতে সমস্যা হয়েছে", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setSaving(true);
    try {
      await api.updateUser(currentUser.id, currentUser);
      showNotify("আপনার প্রোফাইল তথ্য আপডেট করা হয়েছে");
    } catch (err) {
      showNotify("আপডেট করতে সমস্যা হয়েছে", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (passwords.new !== passwords.confirm) {
      showNotify("নতুন পাসওয়ার্ড দুটি মিলছে না", "error");
      return;
    }
    if (passwords.new.length < 6) {
      showNotify("পাসওয়ার্ড অন্তত ৬ অক্ষরের হতে হবে", "error");
      return;
    }
    setSaving(true);
    try {
      await api.changePassword({ currentPassword: passwords.current, newPassword: passwords.new });
      showNotify("পাসওয়ার্ড সফলভাবে পরিবর্তন করা হয়েছে");
      setPasswords({ current: "", new: "", confirm: "" });
    } catch (err: any) {
      showNotify(err?.message || "পাসওয়ার্ড পরিবর্তন ব্যর্থ হয়েছে", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center animate-pulse">
        <SettingsIcon className="mx-auto w-12 h-12 text-slate-300 animate-spin-slow" />
        <p className="mt-4 font-bengali text-slate-500">সেটিংস লোড হচ্ছে...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto bg-slate-50 dark:bg-slate-950 transition-colors duration-300 min-h-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white font-bengali">
            {canManageShops ? "সিস্টেম ও মাল্টি-শপ সেটিংস" : "সিস্টেম ও শপ সেটিংস"}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm font-bengali">
            {canManageShops
              ? "আপনার সকল শপ, আলাদা ডাটাবেজ এবং গুগল শিট কনফিগারেশন (শুধুমাত্র সুপার অ্যাডমিন)"
              : "আপনার শপের প্রোফাইল, আলাদা গুগল শিট ডাটাবেজ এবং ব্যাকআপ কনফিগারেশন"}
          </p>
        </div>

        <div className="flex items-center gap-3 bg-white dark:bg-slate-900 px-4 py-2.5 rounded-2xl border border-blue-200 dark:border-blue-900/50 shadow-sm">
          <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
            <Store size={18} />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 font-bengali">বর্তমান সক্রিয় শপ</p>
            <p className="text-sm font-black text-slate-900 dark:text-white font-bengali">{business.name}</p>
          </div>
          {canManageShops && (
            <button
              type="button"
              onClick={() => setActiveSubTab('shops')}
              className="ml-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 text-blue-700 dark:text-blue-300 rounded-xl text-xs font-bold font-bengali transition-all flex items-center gap-1.5"
            >
              <ArrowRightLeft size={13} />
              <span>শপ পরিবর্তন</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Sidebar Tabs */}
        <div className="lg:col-span-1 space-y-2">
          {[
            ...(canManageShops ? [{ id: 'shops', label: 'শপ লিস্ট ও নতুন শপ', icon: Building2, badge: `${shopsList.length || 1}টি শপ` }] : []),
            { id: 'profile', label: 'শপ প্রোফাইল', icon: Store, badge: null },
            { id: 'logs', label: 'লেনদেন লগ', icon: FileText, badge: 'সার্চ ও সংশোধন' },
            { id: 'sheets', label: 'গুগল শিট ডাটাবেজ', icon: FileSpreadsheet, badge: 'অটো শিট' },
            { id: 'backup', label: 'ড্রাইভ ব্যাকআপ', icon: Database, badge: null },
            { id: 'printer', label: 'প্রিন্টার সেটিংস', icon: Printer, badge: null },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl font-bengali font-bold transition-all ${
                activeSubTab === tab.id 
                  ? 'bg-primary text-white shadow-lg shadow-primary/20' 
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <div className="flex items-center gap-3">
                <tab.icon size={18} />
                <span>{tab.label}</span>
              </div>
              {tab.badge && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bengali font-bold ${
                  activeSubTab === tab.id ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                }`}>
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="lg:col-span-3">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-colors">
            {/* MULTI-SHOP MANAGEMENT TAB (Global Super Admin Only) */}
            {canManageShops && activeSubTab === 'shops' && (
              <div className="p-6 sm:p-8 space-y-6 animate-in fade-in">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 bg-gradient-to-br from-blue-600 via-indigo-600 to-slate-900 rounded-3xl text-white shadow-xl shadow-blue-900/20">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-white/15 backdrop-blur-md rounded-2xl flex items-center justify-center shrink-0">
                      <Building2 size={30} className="text-white" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-xl font-bold font-bengali">মাল্টি-শপ ডাটাবেজ ম্যানেজমেন্ট</h3>
                        <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-400/20 text-emerald-200 border border-emerald-300/30 font-bengali">
                          ১০০% আলাদা ডাটাবেজ
                        </span>
                      </div>
                      <p className="text-xs text-blue-100/90 font-bengali mt-1">
                        প্রতিটি শপ নিজ নিজ গুগল শিট চিনে স্বয়ংক্রিয়ভাবে ডাটাবেজ সেটআপ ও পূর্বের তথ্য রিস্টোর করে নেয়।
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAddShopModal(true)}
                    className="self-start sm:self-auto px-5 py-3 bg-white text-blue-700 hover:bg-blue-50 rounded-2xl font-bold font-bengali text-xs flex items-center gap-2 shadow-lg shrink-0 transition-all hover:scale-105"
                  >
                    <Plus size={16} strokeWidth={3} />
                    <span>নতুন শপ যুক্ত করুন</span>
                  </button>
                </div>

                {/* Google Sheets Live Authorization Banner inside Multi-Shop */}
                <div className={cn(
                  "p-5 rounded-3xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4",
                  hasGoogleToken
                    ? "bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/50"
                    : "bg-amber-50/80 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/50"
                )}>
                  <div className="flex items-start sm:items-center gap-3.5">
                    <div className={cn(
                      "w-11 h-11 rounded-2xl flex items-center justify-center shrink-0",
                      hasGoogleToken
                        ? "bg-emerald-600 text-white shadow-sm"
                        : "bg-amber-500 text-white shadow-sm"
                    )}>
                      <FileSpreadsheet size={22} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-slate-900 dark:text-slate-100 font-bengali text-sm">
                          {hasGoogleToken
                            ? "Google Sheets API লাইভ ডাটাবেজ সক্রিয়"
                            : driveUser?.email
                            ? `গুগল সেশন নবায়ন করুন (${driveUser.email})`
                            : "অটোমেটিক গুগল শিট ডাটাবেজ চালু করুন"}
                        </h4>
                        {hasGoogleToken && (
                          <span className="px-2.5 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-bold font-bengali">
                            সংযুক্ত
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 font-bengali mt-0.5">
                        {hasGoogleToken
                          ? `সংযুক্ত গুগল অ্যাকাউন্ট: ${driveUser?.email || "Active"} — প্রতিটি শপ নিজস্ব গুগল শিটের সাথে সংযুক্ত।`
                          : "শপের নিজস্ব গুগল শিট শনাক্ত ও স্বয়ংক্রিয় সিঙ্কের জন্য Google দিয়ে সাইন-ইন করুন।"}
                      </p>
                    </div>
                  </div>

                  {!hasGoogleToken && (
                    <button
                      type="button"
                      disabled={isConnectingDrive}
                      onClick={handleConnectDrive}
                      className="inline-flex items-center gap-2.5 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl shadow-sm font-sans text-sm font-medium transition-all shrink-0 disabled:opacity-60"
                    >
                      {isConnectingDrive ? (
                        <RefreshCw size={18} className="animate-spin text-blue-600" />
                      ) : (
                        <svg className="w-5 h-5 shrink-0" viewBox="0 0 48 48">
                          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                        </svg>
                      )}
                      <span>Sign in with Google</span>
                    </button>
                  )}
                </div>

                {/* Shops List */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-base font-bold text-slate-900 dark:text-white font-bengali flex items-center gap-2">
                      <Store size={18} className="text-blue-600" />
                      <span>আপনার সকল শপের তালিকা ({shopsList.length}টি)</span>
                    </h4>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {shopsList.map((shop, idx) => {
                      const isActive = shop.id === business.id;
                      const shopSheet = shopSheetStatuses[shop.id];

                      return (
                        <div
                          key={shop.id}
                          className={cn(
                            "p-5 rounded-3xl border-2 transition-all flex flex-col justify-between gap-4 relative overflow-hidden",
                            isActive
                              ? "border-blue-600 bg-blue-50/40 dark:bg-blue-950/20 shadow-lg shadow-blue-500/10"
                              : "border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 hover:border-blue-300 dark:hover:border-slate-700"
                          )}
                        >
                          <div className="space-y-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-center gap-3">
                                <div className={cn(
                                  "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 font-bold text-lg overflow-hidden border",
                                  isActive
                                    ? "bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/30"
                                    : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                                )}>
                                  {shop.logo ? (
                                    <img src={shop.logo} alt={shop.name} className="w-full h-full object-contain p-1 bg-white" />
                                  ) : (
                                    <Store size={22} />
                                  )}
                                </div>
                                <div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <h5 className="font-black text-slate-900 dark:text-white font-bengali text-base">
                                      {shop.name}
                                    </h5>
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200/70 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bengali font-bold">
                                      শপ #{idx + 1}
                                    </span>
                                  </div>
                                  <p className="text-xs text-slate-500 dark:text-slate-400 font-bengali mt-0.5">
                                    {shop.address || "ঠিকানা দেওয়া হয়নি"} {shop.phone ? `• ${shop.phone}` : ""}
                                  </p>
                                </div>
                              </div>

                              {isActive && (
                                <span className="px-3 py-1 rounded-full bg-emerald-600 text-white text-[11px] font-bold font-bengali flex items-center gap-1 shadow-sm shrink-0">
                                  <CheckCircle size={12} />
                                  সক্রিয় শপ
                                </span>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                              <span className="text-[11px] px-2.5 py-1 rounded-xl font-bengali font-bold flex items-center gap-1.5 bg-emerald-100/80 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300">
                                <FileSpreadsheet size={13} />
                                <span>{shopSheet?.sheetName || `${shop.name} - হিসাবপাতি ডাটাবেজ`}</span>
                              </span>

                              {shopSheet?.sheetUrl && (
                                <a
                                  href={shopSheet.sheetUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[11px] px-2.5 py-1 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-blue-600 dark:text-blue-400 font-bengali font-bold hover:underline flex items-center gap-1"
                                >
                                  <ExternalLink size={11} />
                                  শিট খুলুন
                                </a>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 pt-1">
                            {isActive ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setActiveSubTab('profile')}
                                  className="flex-1 py-2.5 px-3 bg-white dark:bg-slate-800 border border-blue-200 dark:border-slate-700 text-blue-700 dark:text-blue-300 rounded-xl text-xs font-bold font-bengali hover:bg-blue-50 transition-all flex items-center justify-center gap-1.5"
                                >
                                  <Store size={14} />
                                  <span>নাম ও প্রোফাইল এডিট</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setActiveSubTab('sheets')}
                                  className="flex-1 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold font-bengali transition-all flex items-center justify-center gap-1.5 shadow-sm"
                                >
                                  <FileSpreadsheet size={14} />
                                  <span>গুগল শিট সেটআপ</span>
                                </button>
                                {shop.id !== "main-business" && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteShop(shop)}
                                    className="p-2.5 text-rose-500 hover:text-white hover:bg-rose-600 bg-rose-50 dark:bg-rose-950/30 rounded-xl border border-rose-200 dark:border-rose-800 transition-all shrink-0"
                                    title="শপ ও গুগল শিট ডিলিট করুন (অ্যাডমিন পাসওয়ার্ড আবশ্যক)"
                                  >
                                    <Trash2 size={15} />
                                  </button>
                                )}
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  disabled={switchingShopId === shop.id}
                                  onClick={() => handleSwitchShop(shop)}
                                  className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold font-bengali transition-all flex items-center justify-center gap-2 shadow-md shadow-blue-600/20 disabled:opacity-50"
                                >
                                  {switchingShopId === shop.id ? (
                                    <>
                                      <RefreshCw size={14} className="animate-spin" />
                                      <span>প্রবেশ করা হচ্ছে...</span>
                                    </>
                                  ) : (
                                    <>
                                      <ArrowRightLeft size={14} />
                                      <span>এই শপে প্রবেশ করুন</span>
                                    </>
                                  )}
                                </button>
                                {shop.id !== "main-business" && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteShop(shop)}
                                    className="p-2.5 text-rose-500 hover:text-white hover:bg-rose-600 bg-rose-50 dark:bg-rose-950/30 rounded-xl border border-rose-200 dark:border-rose-800 transition-all shrink-0"
                                    title="শপ ও গুগল শিট ডিলিট করুন (অ্যাডমিন পাসওয়ার্ড আবশ্যক)"
                                  >
                                    <Trash2 size={15} />
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {activeSubTab === 'profile' && business && (
              <form onSubmit={handleUpdateBusiness} className="p-8 space-y-6">
                <div className="p-4 bg-blue-50/70 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 rounded-2xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Store size={20} className="text-blue-600" />
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 font-bengali">
                      সক্রিয় শপ: <strong className="text-blue-600 dark:text-blue-400">"{business.name}"</strong>
                    </span>
                  </div>
                  {canManageShops && (
                    <button
                      type="button"
                      onClick={() => setActiveSubTab('shops')}
                      className="text-xs font-bold text-blue-600 hover:underline font-bengali"
                    >
                      অন্য শপ সিলেক্ট করুন →
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-6 mb-8 p-6 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-slate-100 dark:border-slate-800">
                  <div className="relative group">
                    <div className="w-24 h-24 bg-white dark:bg-slate-800 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center text-slate-400 dark:text-slate-600 overflow-hidden group-hover:border-primary transition-all">
                      {business.logo ? (
                        <img src={business.logo} alt="Shop Logo" className="w-full h-full object-contain" />
                      ) : (
                        <Store size={40} />
                      )}
                    </div>
                    <label className="absolute -bottom-2 -right-2 w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center cursor-pointer shadow-lg hover:scale-110 transition-all">
                      <Save size={14} />
                      <input 
                        type="file" 
                        className="hidden" 
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              setBusiness({...business, logo: reader.result as string});
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    </label>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 font-bengali">শপ লোগো</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 font-bengali">আপনার শপের লোগো আপলোড করুন (JPEG/PNG)</p>
                    {business.logo && (
                      <button 
                        type="button"
                        onClick={() => setBusiness({...business, logo: ""})}
                        className="text-xs text-rose-500 font-bold font-bengali mt-2 hover:underline"
                      >
                        লোগো মুছে ফেলুন
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700 dark:text-slate-300 font-bengali">শপের নাম</label>
                    <div className="relative">
                      <Store className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input 
                        type="text"
                        className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-xl py-2 pl-12 pr-4 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/20 outline-none transition-all font-bengali text-sm"
                        value={business.name || ""}
                        onChange={e => setBusiness({...business, name: e.target.value})}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700 dark:text-slate-300 font-bengali">ফোন নম্বর</label>
                    <div className="relative">
                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input 
                        type="text"
                        className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-xl py-2 pl-12 pr-4 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/20 outline-none transition-all font-sans text-sm"
                        value={business.phone || ""}
                        onChange={e => setBusiness({...business, phone: e.target.value})}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300 font-bengali">ঠিকানা</label>
                  <div className="relative">
                    <MapPin className="absolute left-4 top-4 text-slate-400" size={18} />
                    <textarea 
                      rows={3}
                      className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-xl py-2 pl-12 pr-4 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/20 outline-none transition-all font-bengali text-sm"
                      value={business.address || ""}
                      onChange={e => setBusiness({...business, address: e.target.value})}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700 dark:text-slate-300 font-bengali">কারেন্সি (Currency)</label>
                    <div className="relative">
                      <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <select 
                        className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-xl py-2 pl-12 pr-4 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/20 outline-none transition-all font-sans text-sm"
                        value={business.currency}
                        onChange={e => setBusiness({...business, currency: e.target.value})}
                      >
                        <option value="BDT">BDT (৳)</option>
                        <option value="USD">USD ($)</option>
                        <option value="INR">INR (₹)</option>
                      </select>
                    </div>
                  </div>
                </div>

                <button 
                  disabled={saving}
                  className="flex items-center gap-2 px-8 py-3 bg-primary text-white rounded-xl font-bold font-bengali hover:scale-105 active:scale-95 transition-all shadow-lg shadow-primary/30 disabled:opacity-50"
                  type="submit"
                >
                  <Save size={20} />
                  {saving ? "সেভ হচ্ছে..." : "পরিবর্তন সংরক্ষণ করুন"}
                </button>
              </form>
            )}

            {/* TRANSACTION LOGS & MISTAKE CORRECTION TAB (PER SHOP) */}
            {activeSubTab === 'logs' && (
              <div className="p-6 sm:p-8 space-y-6 animate-in fade-in">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 rounded-3xl text-white">
                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center shrink-0">
                      <FileText size={24} className="text-blue-300" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-lg font-bold font-bengali">লেনদেন লগ ও ভুল এন্ট্রি সংশোধন ({business.name})</h3>
                        <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-200 border border-blue-400/30 font-bengali">
                          শপভিত্তিক লগ
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 font-bengali mt-0.5">
                        ইনভয়েস বা রিসিপ্ট নাম্বার দিয়ে সার্চ করুন এবং ভুল এন্ট্রি বাতিল করলে স্টক ও বকেয়া স্বয়ংক্রিয়ভাবে সমন্বয় হবে।
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={loadTransactionLogs}
                    disabled={logsLoading}
                    className="self-start sm:self-auto px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold font-bengali flex items-center gap-2 transition-all shrink-0"
                  >
                    <RefreshCw size={14} className={logsLoading ? "animate-spin" : ""} />
                    <span>রিফ্রেশ</span>
                  </button>
                </div>

                {/* Search Input by Invoice / Receipt Number / Party Name / Phone */}
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="text"
                    value={logSearchTerm}
                    onChange={(e) => setLogSearchTerm(e.target.value)}
                    placeholder="ইনভয়েস নং (INV-...), অর্ডার নং (TMP-...), রিসিপ্ট নং (PAY-...), কাস্টমার বা সরবরাহকারীর নাম/মোবাইল দিয়ে খুঁজুন..."
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl py-3 pl-11 pr-10 text-xs sm:text-sm text-slate-900 dark:text-white font-bengali focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {logSearchTerm && (
                    <button
                      type="button"
                      onClick={() => setLogSearchTerm("")}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 font-bold"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Strictly Separated Category Sub-Tabs (No Mixing Between Categories) */}
                {(() => {
                  const salesArr = Array.isArray(shopLogs.sales) ? shopLogs.sales : [];
                  const ordersArr = Array.isArray(shopLogs.orders) ? shopLogs.orders : [];
                  const paymentsArr = Array.isArray(shopLogs.payments) ? shopLogs.payments : [];
                  const suppliersArr = Array.isArray(shopLogs.suppliers) ? shopLogs.suppliers : [];
                  const expensesArr = Array.isArray(shopLogs.expenses) ? shopLogs.expenses : [];

                  const supplierPurchasesArr = suppliersArr.filter((st: any) => st.type !== 'payment');
                  const supplierPaymentsArr = suppliersArr.filter((st: any) => st.type === 'payment');

                  const allLogs = [
                    ...salesArr.map((s: any) => ({
                      category: 'sales' as const,
                      kind: 'sale' as const,
                      id: String(s.id),
                      refNo: s.invoiceNo || `INV-${String(s.id).slice(-6).toUpperCase()}`,
                      title: 'বিক্রয় মেমো লগ',
                      badgeColor: 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300',
                      partyName: s.customerName || 'নগদ ক্রেতা',
                      partyPhone: s.customerPhone || '',
                      amount: Number(s.payableAmount ?? s.finalAmount ?? s.totalAmount ?? 0),
                      subInfo: `নগদ জমা: ৳${Number(s.paidAmount ?? 0).toLocaleString()} • বাকি: ৳${Number(s.dueAmount ?? 0).toLocaleString()}`,
                      createdAt: s.createdAt,
                      customerId: s.customerId,
                    })),
                    ...ordersArr.map((o: any) => ({
                      category: 'orders' as const,
                      kind: 'order' as const,
                      id: String(o.id),
                      refNo: o.temporaryInvoiceNo || o.tempInvoiceNo || o.finalInvoiceNo || o.approvedInvoiceNo || `TMP-${String(o.id).slice(-6).toUpperCase()}`,
                      title: o.type === 'due_payment' ? 'বকেয়া আদায় অর্ডার লগ' : 'বিক্রয় অর্ডার লগ',
                      badgeColor: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
                      partyName: o.customerName || 'সাধারণ ক্রেতা',
                      partyPhone: o.customerPhone || '',
                      amount: Number(o.amount ?? o.payableAmount ?? 0),
                      subInfo: `অবস্থা: ${o.status === 'approved' ? `অনুমোদিত (${o.finalInvoiceNo || o.approvedInvoiceNo || ''})` : o.status === 'rejected' ? 'বাতিলকৃত' : 'অপেক্ষমান (Pending)'} • স্টাফ: ${o.userName || o.createdByName || 'Staff'}`,
                      createdAt: o.createdAt,
                      customerId: o.customerId,
                    })),
                    ...paymentsArr.map((p: any) => ({
                      category: 'payments' as const,
                      kind: 'payment' as const,
                      id: String(p.id),
                      refNo: p.receiptNo || `PAY-${String(p.id).slice(-6).toUpperCase()}`,
                      title: 'ক্রেতা পেমেন্ট লগ',
                      badgeColor: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
                      partyName: p.customerName || 'ক্রেতা',
                      partyPhone: p.customerPhone || '',
                      amount: Number(p.amount || 0),
                      subInfo: `পেমেন্ট মাধ্যম: ${p.method || p.paymentMethod || 'Cash'} • গ্রহণকারী: ${p.userName || 'Admin'}${p.note ? ` • নোট: ${p.note}` : ''}`,
                      createdAt: p.date || p.createdAt,
                      customerId: p.customerId,
                    })),
                    ...supplierPurchasesArr.map((st: any) => ({
                      category: 'purchases' as const,
                      kind: 'supplier' as const,
                      id: String(st.id),
                      refNo: st.voucherNo || `SUP-PUR-${String(st.id).slice(-6).toUpperCase()}`,
                      title: 'পণ্য ক্রয় লগ (সরবরাহকারী)',
                      badgeColor: 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300',
                      partyName: st.supplierName || 'সরবরাহকারী',
                      partyPhone: st.supplierPhone || '',
                      amount: Number(st.amount || 0),
                      subInfo: `${st.note ? `${st.note} • ` : ''}মাধ্যম: ${st.paymentMethod || 'Cash'}`,
                      createdAt: st.createdAt,
                      supplierId: st.supplierId,
                      subType: st.type,
                    })),
                    ...supplierPaymentsArr.map((st: any) => ({
                      category: 'supplier_payments' as const,
                      kind: 'supplier' as const,
                      id: String(st.id),
                      refNo: st.voucherNo || `SUP-PAY-${String(st.id).slice(-6).toUpperCase()}`,
                      title: 'সরবরাহকারী পেমেন্ট লগ',
                      badgeColor: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300',
                      partyName: st.supplierName || 'সরবরাহকারী',
                      partyPhone: st.supplierPhone || '',
                      amount: Number(st.amount || 0),
                      subInfo: `${st.note ? `${st.note} • ` : ''}মাধ্যম: ${st.paymentMethod || 'Cash'}`,
                      createdAt: st.createdAt,
                      supplierId: st.supplierId,
                      subType: st.type,
                    })),
                    ...expensesArr.map((ex: any) => ({
                      category: 'expenses' as const,
                      kind: 'expense' as const,
                      id: String(ex.id),
                      refNo: `EXP-${String(ex.id).slice(-6).toUpperCase()}`,
                      title: 'খরচ ও ব্যয় লগ',
                      badgeColor: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300',
                      partyName: ex.category || 'সাধারণ খরচ',
                      partyPhone: '',
                      amount: Number(ex.amount || 0),
                      subInfo: ex.description || ex.note || 'খরচ এন্ট্রি',
                      createdAt: ex.date || ex.createdAt,
                    })),
                  ].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

                  const categoryButtons = [
                    { id: 'sales', label: 'বিক্রয় মেমো লগ', count: salesArr.length, desc: 'শুধুমাত্র চূড়ান্ত বিক্রয় ইনভয়েস (INV-...)' },
                    { id: 'orders', label: 'বিক্রয় অর্ডার লগ', count: ordersArr.length, desc: 'শুধুমাত্র বিক্রয় অর্ডার ও পেন্ডিং রিকোয়েস্ট (TMP-...)' },
                    { id: 'payments', label: 'ক্রেতা পেমেন্ট লগ', count: paymentsArr.length, desc: 'শুধুমাত্র ক্রেতার বকেয়া ও পেমেন্ট জমা রিসিপ্ট (PAY-...)' },
                    { id: 'purchases', label: 'পণ্য ক্রয় লগ (মহাজন)', count: supplierPurchasesArr.length, desc: 'শুধুমাত্র সরবরাহকারী থেকে পণ্য ক্রয় হিসাব (SUP-PUR-...)' },
                    { id: 'supplier_payments', label: 'মহাজন পেমেন্ট লগ', count: supplierPaymentsArr.length, desc: 'শুধুমাত্র সরবরাহকারীকে পরিশোধিত পেমেন্ট (SUP-PAY-...)' },
                    { id: 'expenses', label: 'খরচ ও ব্যয় লগ', count: expensesArr.length, desc: 'শুধুমাত্র দোকানের সাধারণ খরচ ও ব্যয় এন্ট্রি (EXP-...)' },
                  ] as const;

                  const activeCategoryMeta = categoryButtons.find((c) => c.id === logCategory) || categoryButtons[0];

                  const query = logSearchTerm.trim().toLowerCase();
                  const filteredLogs = allLogs.filter((item) => {
                    if (item.category !== logCategory) return false;
                    if (!query) return true;
                    return (
                      item.refNo.toLowerCase().includes(query) ||
                      item.id.toLowerCase().includes(query) ||
                      item.partyName.toLowerCase().includes(query) ||
                      item.partyPhone.toLowerCase().includes(query) ||
                      item.subInfo.toLowerCase().includes(query) ||
                      item.title.toLowerCase().includes(query)
                    );
                  });

                  const activeCategoryTotal = filteredLogs.reduce((acc, item) => acc + (Number(item.amount) || 0), 0);

                  return (
                    <>
                      <div className="flex items-center gap-2 overflow-x-auto pb-1">
                        {categoryButtons.map((cat) => (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => setLogCategory(cat.id)}
                            className={cn(
                              "px-3.5 py-2.5 rounded-xl text-xs font-bold font-bengali whitespace-nowrap transition-all flex items-center gap-1.5 border",
                              logCategory === cat.id
                                ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                                : "bg-slate-50 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100"
                            )}
                          >
                            <span>{cat.label}</span>
                            <span className={cn(
                              "px-1.5 py-0.5 rounded-md text-[10px] font-sans",
                              logCategory === cat.id
                                ? "bg-white/20 text-white"
                                : "bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-300"
                            )}>
                              {cat.count}
                            </span>
                          </button>
                        ))}
                      </div>

                      {/* Active Isolated Category Header Banner */}
                      <div className="p-4 rounded-2xl bg-blue-50/70 dark:bg-slate-800/70 border border-blue-200/70 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <h4 className="text-sm font-bold text-slate-900 dark:text-white font-bengali">
                            {activeCategoryMeta.label} ({filteredLogs.length} টি)
                          </h4>
                          <p className="text-xs text-slate-500 dark:text-slate-400 font-bengali">
                            {activeCategoryMeta.desc} — অন্য কোনো লেনদেনের সাথে মিক্স করা হয়নি।
                          </p>
                        </div>
                        <div className="text-left sm:text-right">
                          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 font-bengali block">
                            এই লগের মোট পরিমাণ
                          </span>
                          <span className="text-base font-black text-blue-600 dark:text-blue-400 font-sans">
                            ৳{activeCategoryTotal.toLocaleString()}
                          </span>
                        </div>
                      </div>

                      {logsLoading ? (
                        <div className="p-12 text-center space-y-2">
                          <RefreshCw size={24} className="animate-spin text-blue-600 mx-auto" />
                          <p className="text-xs font-bold text-slate-500 font-bengali">লেনদেন লগ লোড হচ্ছে...</p>
                        </div>
                      ) : filteredLogs.length === 0 ? (
                        <div className="p-10 text-center bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-800">
                          <p className="text-sm font-bold text-slate-600 dark:text-slate-300 font-bengali">
                            &ldquo;{activeCategoryMeta.label}&rdquo; বিভাগে কোনো লেনদেন পাওয়া যায়নি
                          </p>
                          <p className="text-xs text-slate-400 font-bengali mt-1">
                            অন্য ইনভয়েস বা রিসিপ্ট নাম্বার দিয়ে চেষ্টা করুন অথবা উপরের অন্য লগ ট্যাব নির্বাচন করুন।
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-3 max-h-[540px] overflow-y-auto pr-1">
                          {filteredLogs.map((item) => (
                            <div
                              key={`${item.kind}-${item.id}`}
                              className="p-4 rounded-2xl bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 hover:border-blue-300 dark:hover:border-slate-600 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                            >
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="px-2.5 py-0.5 rounded-lg bg-slate-900 dark:bg-slate-700 text-white font-mono text-xs font-bold">
                                    #{item.refNo}
                                  </span>
                                  <span className={cn("px-2.5 py-0.5 rounded-lg text-[11px] font-bold font-bengali", item.badgeColor)}>
                                    {item.title}
                                  </span>
                                  <span className="text-[11px] text-slate-400 font-sans">
                                    {item.createdAt ? formatDhakaDateTime(item.createdAt) : ''}
                                  </span>
                                </div>

                                <div className="flex items-center gap-2 flex-wrap pt-0.5">
                                  <p className="text-sm font-bold text-slate-900 dark:text-white font-bengali">
                                    {item.partyName}
                                  </p>
                                  {item.partyPhone && (
                                    <span className="text-xs text-slate-500 font-sans">({item.partyPhone})</span>
                                  )}
                                </div>

                                <p className="text-xs text-slate-500 dark:text-slate-400 font-bengali">
                                  {item.subInfo}
                                </p>
                              </div>

                              <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-200/60 dark:border-slate-700/60">
                                <span className="text-base font-black text-slate-900 dark:text-white font-sans">
                                  ৳{item.amount.toLocaleString()}
                                </span>

                                <button
                                  type="button"
                                  onClick={() => handleReverseOrDeleteLog(item)}
                                  className="px-3 py-1.5 bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white dark:bg-rose-950/40 dark:hover:bg-rose-600 dark:text-rose-300 dark:hover:text-white border border-rose-200 dark:border-rose-800/60 rounded-xl text-xs font-bold font-bengali transition-all flex items-center gap-1.5"
                                >
                                  <Trash2 size={13} />
                                  <span>ভুল এন্ট্রি বাতিল / ডিলিট</span>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}

            {activeSubTab === 'backup' && (
              <div className="p-8 space-y-6">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl flex items-center justify-center text-emerald-600 dark:text-emerald-500">
                      <Database size={28} />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 font-bengali">ব্যাকআপ ও রিস্টোর ({business.name})</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-bengali">সক্রিয় শপের ক্লাউড ও ম্যানুয়াল ব্যাকআপ ফাইল ব্যবস্থাপনা</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Left Column: Google Drive Cloud Backup */}
                  <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 space-y-5 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center">
                          <Cloud size={22} />
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-900 dark:text-slate-100 font-bengali text-base">
                            গুগল ড্রাইভ ক্লাউড ব্যাকআপ
                          </h4>
                          <p className="text-xs text-slate-500 dark:text-slate-400 font-bengali">
                            স্বয়ংক্রিয় ব্যাকআপ: প্রতিদিন দুপুর ১২:০০ ও রাত ১২:০০
                          </p>
                        </div>
                      </div>

                      {driveUser ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 rounded-full text-xs font-medium font-sans">
                          <CheckCircle size={14} />
                          {driveUser.email || "Connected"}
                        </span>
                      ) : (
                        <span className="text-xs text-amber-600 dark:text-amber-400 font-bengali bg-amber-50 dark:bg-amber-950/40 px-3 py-1 rounded-full border border-amber-200 dark:border-amber-800">
                          কানেক্ট করা নেই
                        </span>
                      )}
                    </div>

                    <div className="p-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 flex items-center gap-3.5">
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                        lastBackupAt ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600" : "bg-slate-100 dark:bg-slate-700 text-slate-400"
                      )}>
                        <Save size={18} />
                      </div>
                      <div>
                        <p className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider font-bengali">
                          সর্বশেষ সফল ড্রাইভ ব্যাকআপ
                        </p>
                        <p className={cn(
                          "text-xs font-bold font-sans",
                          lastBackupAt ? "text-slate-900 dark:text-slate-100" : "text-slate-500"
                        )}>
                          {lastBackupAt ? formatDhakaDateTime(lastBackupAt) : "এখনও কোন ব্যাকআপ সংরক্ষণ করা হয়নি"}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {driveUser ? (
                        <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-2xl flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <CheckCircle size={16} className="text-emerald-600" />
                            <span className="text-xs font-bold text-slate-900 dark:text-slate-100 font-sans">{driveUser.email}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmDialog({
                                show: true,
                                title: "গুগল অ্যাকাউন্ট পরিবর্তন করুন",
                                message: "আপনি কি বর্তমান গুগল ড্রাইভ ও শিট অ্যাকাউন্ট সংযোগ বিচ্ছিন্ন করে নতুন অ্যাকাউন্ট যোগ করতে চান?",
                                confirmLabel: "হ্যাঁ, পরিবর্তন করুন",
                                variant: "danger",
                                onConfirm: async () => {
                                  await disconnectDriveAccount();
                                  setDriveUser(null);
                                  setHasGoogleToken(false);
                                  showNotify("গুগল অ্যাকাউন্ট সরানো হয়েছে। নতুন অ্যাকাউন্ট যোগ করুন।", "info");
                                }
                              });
                            }}
                            className="text-xs text-rose-600 dark:text-rose-400 hover:text-rose-700 font-bengali font-bold px-2.5 py-1 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700"
                          >
                            পরিবর্তন করুন
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={isConnectingDrive}
                          onClick={handleConnectDrive}
                          className="w-full py-3.5 px-4 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-2xl font-bold font-bengali hover:bg-slate-100 dark:hover:bg-slate-700 transition-all flex items-center justify-center gap-2.5 shadow-sm disabled:opacity-60"
                        >
                          {isConnectingDrive ? (
                            <>
                              <RefreshCw size={18} className="animate-spin text-blue-600" />
                              <span>গুগল ড্রাইভ উইন্ডো খুলছে...</span>
                            </>
                          ) : (
                            <span>Google দিয়ে একাউন্ট সংযুক্ত করুন</span>
                          )}
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={handleDriveBackup}
                        disabled={driveUploading}
                        className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold font-bengali transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 disabled:opacity-50 text-xs sm:text-sm"
                      >
                        {driveUploading ? (
                          <>
                            <RefreshCw size={18} className="animate-spin" />
                            <span>ড্রাইভে আপলোড হচ্ছে...</span>
                          </>
                        ) : (
                          <>
                            <Cloud size={18} />
                            <span>গুগল ড্রাইভে ব্যাকআপ সংরক্ষণ করুন</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Right Column: Local Export & Restore */}
                  <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 space-y-5 transition-colors">
                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-slate-100 font-bengali flex items-center gap-2 text-base">
                        <Download size={20} className="text-slate-400 dark:text-slate-500" />
                        ম্যানুয়াল এক্সপোর্ট ও রিস্টোর
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-bengali mt-1">
                        ডিভাইসে এক্সেল (.xlsx) বা এনক্রিপ্টেড (.bak) ফাইল ডাউনলোড ও রিস্টোর করুন
                      </p>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <button 
                        onClick={handleExportExcel}
                        disabled={backupAction}
                        className="flex flex-col items-center gap-2 p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl hover:border-emerald-500 transition-all group shadow-sm"
                      >
                        <FileSpreadsheet size={24} className="text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform" />
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 font-bengali">এক্সেল ডাউনলোড</span>
                        <span className="text-[10px] text-slate-400 font-bengali">.xlsx স্প্রেডশিট</span>
                      </button>

                      <button 
                        onClick={handleExportData}
                        disabled={backupAction}
                        className="flex flex-col items-center gap-2 p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl hover:border-primary transition-all group shadow-sm"
                      >
                        <Download size={24} className="text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform" />
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 font-bengali">এনক্রিপ্ট ডাউনলোড</span>
                        <span className="text-[10px] text-slate-400 font-bengali">.bak ব্যাকআপ</span>
                      </button>
                      
                      <div className="relative">
                        <input 
                          type="file"
                          onChange={handleImportData}
                          accept=".bak"
                          className="absolute inset-0 opacity-0 cursor-pointer z-10"
                        />
                        <div className="flex flex-col items-center gap-2 p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl hover:border-purple-500 transition-all group h-full justify-center shadow-sm">
                          <Upload size={24} className="text-purple-600 dark:text-purple-400 group-hover:scale-110 transition-transform" />
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-200 font-bengali">রিস্টোর করুন</span>
                          <span className="text-[10px] text-slate-400 font-bengali">.bak ফাইল আপলোড</span>
                        </div>
                      </div>
                    </div>

                    {importStatus.stage === 'reviewing' && importStatus.summary && (
                      <div className="p-4 bg-white dark:bg-slate-800 rounded-2xl border-2 border-emerald-500 space-y-4 animate-in fade-in slide-in-from-top-4">
                         <h5 className="font-bold text-emerald-700 dark:text-emerald-400 font-bengali text-xs">ব্যাকআপ ফাইল প্রস্তুত:</h5>
                         <div className="grid grid-cols-2 gap-2 text-[11px] font-sans text-slate-700 dark:text-slate-300">
                            <div>Shop: <span className="font-bold">{importStatus.summary.businessName}</span></div>
                            <div>Users: <span className="font-bold">{importStatus.summary.users}</span></div>
                            <div>Products: <span className="font-bold">{importStatus.summary.products}</span></div>
                            <div>Sales: <span className="font-bold">{importStatus.summary.sales}</span></div>
                         </div>
                         <button 
                          onClick={confirmAndRestore}
                          className="w-full py-2.5 bg-emerald-600 text-white rounded-xl font-bold font-bengali hover:bg-emerald-700 transition-all shadow-md shadow-emerald-600/20"
                         >
                          রিস্টোর কনফার্ম করুন
                         </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeSubTab === 'printer' && (
              <div className="p-8 space-y-6">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-16 h-16 bg-amber-50 dark:bg-amber-900/20 rounded-2xl flex items-center justify-center text-amber-600 dark:text-amber-500">
                    <Printer size={32} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 font-bengali">প্রিন্টার এবং ইনভয়েস</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 font-bengali">থার্মাল এবং এ-ফোর প্রিন্টিং সেটআপ</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div 
                    onClick={async () => { 
                      setSelectedPrinter('thermal'); 
                      const shopId = business?.id || user?.businessId || "main-business";
                      if (typeof window !== "undefined") {
                        localStorage.setItem(`smart_printer_${shopId}`, 'thermal');
                      }
                      if (business) {
                        const updatedBiz = { ...business, defaultPrinter: 'thermal' as const };
                        setBusiness(updatedBiz);
                        await api.updateBusiness(updatedBiz, shopId);
                        if (onBusinessUpdate) onBusinessUpdate(updatedBiz);
                      }
                      showNotify("ডিফল্ট প্রিন্টার: Thermal 80mm সেট করা হয়েছে");
                    }}
                    className={cn(
                      "p-6 rounded-3xl border transition-all cursor-pointer",
                      selectedPrinter === 'thermal' ? "bg-slate-50 dark:bg-slate-800 border-primary/20 dark:border-blue-500/30 ring-2 ring-primary/5" : "bg-white dark:bg-slate-800/30 border-slate-200 dark:border-slate-800"
                    )}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <Printer size={20} className={selectedPrinter === 'thermal' ? "text-primary dark:text-blue-400" : "text-slate-400 dark:text-slate-600"} />
                      {selectedPrinter === 'thermal' && <span className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse" />}
                    </div>
                    <p className="font-black text-slate-900 dark:text-slate-100">Thermal 80mm</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-bengali">
                      {selectedPrinter === 'thermal' ? "ডিফল্ট প্রিন্টার হিসেবে সেট করা আছে" : "কানেক্ট করতে ক্লিক করুন"}
                    </p>
                  </div>
                  <div 
                    onClick={async () => { 
                      setSelectedPrinter('a4'); 
                      const shopId = business?.id || user?.businessId || "main-business";
                      if (typeof window !== "undefined") {
                        localStorage.setItem(`smart_printer_${shopId}`, 'a4');
                      }
                      if (business) {
                        const updatedBiz = { ...business, defaultPrinter: 'a4' as const };
                        setBusiness(updatedBiz);
                        await api.updateBusiness(updatedBiz, shopId);
                        if (onBusinessUpdate) onBusinessUpdate(updatedBiz);
                      }
                      showNotify("ডিফল্ট প্রিন্টার: A4 Laser Desktop সেট করা হয়েছে");
                    }}
                    className={cn(
                      "p-6 rounded-3xl border transition-all cursor-pointer",
                      selectedPrinter === 'a4' ? "bg-slate-50 dark:bg-slate-800 border-primary/20 dark:border-blue-500/30 ring-2 ring-primary/5" : "bg-white dark:bg-slate-800/30 border-slate-200 dark:border-slate-800"
                    )}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <Globe size={20} className={selectedPrinter === 'a4' ? "text-primary dark:text-blue-400" : "text-slate-400 dark:text-slate-600"} />
                      {selectedPrinter === 'a4' && <span className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse" />}
                    </div>
                    <p className="font-bold text-slate-900 dark:text-slate-100">A4 Laser Desktop</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-bengali">
                      {selectedPrinter === 'a4' ? "ডিফল্ট প্রিন্টার হিসেবে সেট করা আছে" : "কানেক্ট করতে ক্লিক করুন"}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* GOOGLE SHEETS MASTER DATABASE TAB */}
            {activeSubTab === 'sheets' && (
              <div className="p-6 sm:p-8 space-y-6 animate-in fade-in">
                {/* Active Shop Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 rounded-3xl text-white shadow-xl shadow-emerald-900/20">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center shrink-0">
                      <FileSpreadsheet size={30} className="text-white" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-xl font-bold font-bengali">{business.name} - গুগল শিট ডাটাবেজ</h3>
                        <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-400/30 text-emerald-100 border border-emerald-300/30 font-bengali">
                          রিডিপ্লয়-সেফ অটো সিঙ্ক
                        </span>
                      </div>
                      <p className="text-xs text-emerald-100/90 font-bengali mt-1">
                        অ্যাপ রিডিপ্লয় হলেও নতুন ডুপ্লিকেট শিট তৈরি হবে না; নিজের পূর্বের শিট চিনে সকল তথ্য ফিরিয়ে আনবে।
                      </p>
                    </div>
                  </div>

                  {sheetsConfig.sheetUrl && (
                    <a
                      href={sheetsConfig.sheetUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="self-start sm:self-auto px-4 py-2.5 bg-white text-emerald-800 rounded-xl font-bold font-bengali text-xs hover:bg-emerald-50 transition-all flex items-center gap-2 shadow-lg shrink-0"
                    >
                      <ExternalLink size={15} />
                      <span>গুগল শিট খুলুন</span>
                    </a>
                  )}
                </div>

                {/* Connection Status & Counts Card */}
                <div className="p-6 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-800 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-3.5 h-3.5 rounded-full shrink-0",
                        sheetsConfig.spreadsheetId || sheetsConfig.sheetUrl
                          ? "bg-emerald-500 animate-pulse ring-4 ring-emerald-100 dark:ring-emerald-950"
                          : "bg-amber-500"
                      )} />
                      <div>
                        <h4 className="font-bold text-slate-900 dark:text-slate-100 font-bengali text-sm">
                          {sheetsConfig.spreadsheetId || sheetsConfig.sheetUrl
                            ? `সংযুক্ত গুগল শিট: ${sheetsConfig.sheetName || `${business.name} - হিসাবপাতি ডাটাবেজ`}`
                            : "গুগল শিট এখনও শনাক্ত বা সংযুক্ত করা হয়নি"}
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-bengali">
                          {sheetsConfig.lastSyncAt 
                            ? `সর্বশেষ সিঙ্ক: ${formatDhakaDateTime(sheetsConfig.lastSyncAt)}`
                            : "নিচের বাটন থেকে পূর্বের শিট শনাক্ত করুন অথবা সিঙ্ক করুন।"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700 dark:text-slate-300 font-bengali">
                        <input
                          type="checkbox"
                          checked={sheetsConfig.autoSync !== false}
                          onChange={async (e) => {
                            const updated = { ...sheetsConfig, autoSync: e.target.checked };
                            setSheetsConfig(updated);
                            await api.saveGoogleSheetsConfig(updated);
                            showNotify(e.target.checked ? "অটো রিয়েল-টাইম সিঙ্ক চালু হয়েছে" : "অটো সিঙ্ক বন্ধ করা হয়েছে", "info");
                          }}
                          className="rounded text-emerald-600 focus:ring-emerald-500"
                        />
                        <span>অটো রিয়েল-টাইম সিঙ্ক</span>
                      </label>
                    </div>
                  </div>

                  {sheetsConfig.lastSyncCount && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 pt-2 border-t border-slate-200 dark:border-slate-700/60 text-center">
                      <div className="p-2.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
                        <span className="text-[10px] text-slate-400 font-bengali block">পণ্য তালিকা</span>
                        <span className="text-sm font-bold text-slate-800 dark:text-slate-200 font-sans">{sheetsConfig.lastSyncCount.products ?? 0}</span>
                      </div>
                      <div className="p-2.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
                        <span className="text-[10px] text-slate-400 font-bengali block">বিক্রয় ও মেমো</span>
                        <span className="text-sm font-bold text-blue-600 dark:text-blue-400 font-sans">{sheetsConfig.lastSyncCount.sales ?? 0}</span>
                      </div>
                      <div className="p-2.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
                        <span className="text-[10px] text-amber-600 font-bengali block font-bold">বিক্রয় অর্ডার</span>
                        <span className="text-sm font-bold text-amber-600 dark:text-amber-400 font-sans">{sheetsConfig.lastSyncCount.approvals ?? 0}</span>
                      </div>
                      <div className="p-2.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
                        <span className="text-[10px] text-slate-400 font-bengali block">ক্রেতা তালিকা</span>
                        <span className="text-sm font-bold text-slate-800 dark:text-slate-200 font-sans">{sheetsConfig.lastSyncCount.customers ?? 0}</span>
                      </div>
                      <div className="p-2.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
                        <span className="text-[10px] text-rose-500 font-bengali block font-bold">বকেয়া খাতা</span>
                        <span className="text-sm font-bold text-rose-600 dark:text-rose-400 font-sans">{sheetsConfig.lastSyncCount.dues ?? 0}</span>
                      </div>
                      <div className="p-2.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
                        <span className="text-[10px] text-slate-400 font-bengali block">সরবরাহকারী</span>
                        <span className="text-sm font-bold text-slate-800 dark:text-slate-200 font-sans">{sheetsConfig.lastSyncCount.suppliers ?? 0}</span>
                      </div>
                      <div className="p-2.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
                        <span className="text-[10px] text-slate-400 font-bengali block">হিসাব ও খরচ</span>
                        <span className="text-sm font-bold text-slate-800 dark:text-slate-200 font-sans">{sheetsConfig.lastSyncCount.expenses ?? 0}</span>
                      </div>
                      <div className="p-2.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
                        <span className="text-[10px] text-slate-400 font-bengali block">এসএমএস লগ</span>
                        <span className="text-sm font-bold text-slate-800 dark:text-slate-200 font-sans">{sheetsConfig.lastSyncCount.smsLogs ?? 0}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Google Sign-In Status Card */}
                {!hasGoogleToken && (
                  <div className="p-5 rounded-3xl border bg-amber-50/80 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-slate-100 font-bengali text-sm">
                        Google Sheets API সংযোগ সক্রিয় করুন
                      </h4>
                      <p className="text-xs text-slate-600 dark:text-slate-400 font-bengali mt-0.5">
                        আপনার গুগল ড্রাইভ থেকে শপের পূর্বের গুগল শিট খুঁজে বের করতে বা সিঙ্ক করতে Google দিয়ে সাইন-ইন করুন।
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={isConnectingDrive}
                      onClick={handleConnectDrive}
                      className="inline-flex items-center gap-2.5 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl shadow-sm font-sans text-sm font-medium transition-all shrink-0 disabled:opacity-60"
                    >
                      {isConnectingDrive ? <RefreshCw size={18} className="animate-spin text-blue-600" /> : null}
                      <span>Sign in with Google</span>
                    </button>
                  </div>
                )}

                {/* Action Cards */}
                <div className={cn("grid grid-cols-1 gap-4", canManageShops ? "md:grid-cols-2" : "md:grid-cols-2")}>
                  {/* Smart Recognize Existing Sheet & Auto Setup */}
                  <div className="p-5 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-slate-900 dark:to-amber-950/20 border border-amber-200 dark:border-amber-800/60 rounded-3xl space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-amber-600 text-white flex items-center justify-center shadow-md shadow-amber-600/30">
                        <Search size={19} />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 dark:text-slate-100 font-bengali text-sm">নিজের শিট শনাক্ত ও অটো-সেটআপ</h4>
                        <p className="text-[11px] text-slate-500 font-bengali">পূর্বের শিট খুঁজে সংযুক্ত করবে, না পেলে আপনার কনফার্মেশন চাইবে</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleRecognizeOrSetupSheet}
                      disabled={recognizingSheet}
                      className="w-full py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-2xl font-bold font-bengali text-xs shadow-lg shadow-amber-600/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                    >
                      {recognizingSheet ? (
                        <>
                          <RefreshCw size={15} className="animate-spin" />
                          <span>পূর্বের শিট খোঁজা হচ্ছে...</span>
                        </>
                      ) : (
                        <>
                          <Search size={15} />
                          <span>পূর্বের শিট শনাক্ত ও ডাটা সেটআপ করুন</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Push Current Shop Data to Sheet */}
                  <div className="p-5 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-slate-900 dark:to-emerald-950/20 border border-emerald-200 dark:border-emerald-800/60 rounded-3xl space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-600/30">
                        <Cloud size={19} />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 dark:text-slate-100 font-bengali text-sm">এই শপের শিটে ডাটা আপডেট পাঠান</h4>
                        <p className="text-[11px] text-slate-500 font-bengali">সকল ১২টি বাংলা ট্যাব ও কলাম অনুযায়ী বর্তমান শপের ডাটা সিঙ্ক করুন</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleSyncAllSheets}
                      disabled={syncingSheets || (!sheetsConfig.webAppUrl && !hasGoogleToken)}
                      className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold font-bengali text-xs shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                    >
                      {syncingSheets ? (
                        <>
                          <RefreshCw size={15} className="animate-spin" />
                          <span>সিঙ্ক হচ্ছে...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle size={15} />
                          <span>এই শপের শিট সিঙ্ক করুন</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Restore Shop Data from Linked Sheet */}
                  <div className="p-5 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-slate-900 dark:to-blue-950/20 border border-blue-200 dark:border-blue-800/60 rounded-3xl space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-600/30">
                        <Download size={19} />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 dark:text-slate-100 font-bengali text-sm">গুগল শিট থেকে ডাটা রিস্টোর করুন</h4>
                        <p className="text-[11px] text-slate-500 font-bengali">এই শপের সংযুক্ত গুগল শিট থেকে পূর্বের সকল তথ্য শপে ফিরিয়ে আনুন</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleRestoreFromSheets}
                      disabled={restoringSheets || (!sheetsConfig.webAppUrl && !(hasGoogleToken && (sheetsConfig.spreadsheetId || sheetsConfig.sheetUrl)))}
                      className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold font-bengali text-xs shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                    >
                      {restoringSheets ? (
                        <>
                          <RefreshCw size={15} className="animate-spin" />
                          <span>ডাটা রিস্টোর হচ্ছে...</span>
                        </>
                      ) : (
                        <>
                          <Download size={15} />
                          <span>গুগল শিট থেকে রিস্টোর করুন</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Sync All Shops (Admin Only) */}
                  {canManageShops && (
                    <div className="p-5 bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-slate-900 dark:to-purple-950/20 border border-purple-200 dark:border-purple-800/60 rounded-3xl space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-purple-600 text-white flex items-center justify-center shadow-md shadow-purple-600/30">
                          <Building2 size={19} />
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-900 dark:text-slate-100 font-bengali text-sm">সকল দোকানের শিট যাচাই ও সিঙ্ক</h4>
                          <p className="text-[11px] text-slate-500 font-bengali">প্রতিটি শপের নিজস্ব শিট শনাক্ত ও সব কলাম আপডেট করুন</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleSyncAllShopsToSheets}
                        disabled={syncingAllShops}
                        className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-2xl font-bold font-bengali text-xs shadow-lg shadow-purple-600/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                      >
                        {syncingAllShops ? (
                          <>
                            <RefreshCw size={15} className="animate-spin" />
                            <span>সকল শপ সিঙ্ক হচ্ছে...</span>
                          </>
                        ) : (
                          <>
                            <RefreshCw size={15} />
                            <span>সকল শপের শিট সিঙ্ক করুন ({shopsList.length}টি)</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {/* Google Drive Connection & Alternative Download Modal */}
      {driveAuthHelp.show && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-slate-800 rounded-3xl p-6 sm:p-8 max-w-lg w-full border border-slate-200 dark:border-slate-700 shadow-2xl space-y-5"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-2xl flex items-center justify-center">
                  <Cloud size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 font-bengali">গুগল ড্রাইভ ব্যাকআপ সহায়তা</h3>
                  <p className="text-xs text-slate-500 font-sans">{driveAuthHelp.domain || "Cloudflare Domain"}</p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setDriveAuthHelp({ show: false, errorMsg: "", domain: "" })}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-600 dark:text-slate-300 flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-2xl text-xs text-amber-900 dark:text-amber-200 leading-relaxed font-bengali space-y-2">
              <p className="font-bold">⚠️ কেন গুগল ড্রাইভ কানেক্ট হচ্ছে না?</p>
              <p>ডোমেইনটি (<code className="bg-amber-200/50 dark:bg-amber-900/50 px-1 py-0.5 rounded font-mono">{driveAuthHelp.domain}</code>) Firebase Console-এর <strong>Authorized Domains</strong> তালিকায় যোগ করুন অথবা নিচের বাটন দিয়ে সরাসরি ফাইল ব্যাকআপ নিন।</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  handleExportExcel();
                  setDriveAuthHelp({ show: false, errorMsg: "", domain: "" });
                }}
                className="py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold font-bengali text-xs flex items-center justify-center gap-2 shadow-sm transition-all"
              >
                <FileSpreadsheet size={16} />
                এক্সেল (.xlsx) ডাউনলোড
              </button>

              <button
                type="button"
                onClick={() => {
                  handleExportData();
                  setDriveAuthHelp({ show: false, errorMsg: "", domain: "" });
                }}
                className="py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold font-bengali text-xs flex items-center justify-center gap-2 shadow-sm transition-all"
              >
                <Download size={16} />
                এনক্রিপ্ট (.bak) ব্যাকআপ
              </button>
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  if (driveAuthHelp.domain) {
                    navigator.clipboard?.writeText(driveAuthHelp.domain);
                    showNotify("ডোমেইন কপি হয়েছে: " + driveAuthHelp.domain, "success");
                  }
                }}
                className="text-xs text-blue-600 hover:underline font-bengali flex items-center gap-1"
              >
                📋 ডোমেইন নাম কপি করুন
              </button>

              <button
                type="button"
                onClick={() => setDriveAuthHelp({ show: false, errorMsg: "", domain: "" })}
                className="py-2 px-5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold font-bengali hover:bg-slate-200 transition-all"
              >
                ঠিক আছে
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Backup Encryption / Decryption Passphrase Modal */}
      {backupPassModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-7 max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4 font-bengali"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <Lock size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {backupPassModal.mode === 'import_bak'
                      ? 'ব্যাকআপ ফাইল ডিক্রিপ্ট পাসওয়ার্ড'
                      : 'ব্যাকআপ এনক্রিপশন পাসওয়ার্ড সেট করুন'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {backupPassModal.mode === 'import_bak'
                      ? 'ব্যাকআপ ফাইল তৈরি করার সময় ব্যবহৃত পাসওয়ার্ডটি লিখুন'
                      : 'ফাইলটি সুরক্ষিত রাখতে কমপক্ষে ৬ অক্ষরের পাসওয়ার্ড দিন (রিস্টোরের সময় এটি প্রয়োজন হবে)'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBackupPassModal(null)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>

            {backupPassError && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400">
                {backupPassError}
              </div>
            )}

            <form onSubmit={handleSubmitBackupPassphrase} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  ব্যাকআপ পাসওয়ার্ড
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={backupPassphrase}
                  onChange={e => setBackupPassphrase(e.target.value)}
                  placeholder="কমপক্ষে ৬ অক্ষরের পাসওয়ার্ড লিখুন"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {backupPassModal.mode !== 'import_bak' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    পাসওয়ার্ড নিশ্চিত করুন
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    autoComplete="new-password"
                    value={backupPassConfirm}
                    onChange={e => setBackupPassConfirm(e.target.value)}
                    placeholder="পুনরায় একই পাসওয়ার্ড লিখুন"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setBackupPassModal(null)}
                  className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/20"
                >
                  {backupPassModal.mode === 'import_bak' ? 'ডিক্রিপ্ট করুন' : 'এনক্রিপ্ট ও সংরক্ষণ করুন'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Add New Shop Modal */}
      {canManageShops && showAddShopModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl space-y-5 max-h-[92vh] overflow-y-auto custom-scrollbar"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <Building2 size={22} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white font-bengali">নতুন শপ যুক্ত করুন</h3>
                  <p className="text-xs text-slate-500 font-bengali">নতুন শপের জন্য সম্পূর্ণ আলাদা ডাটাবেজ ও গুগল শিট তৈরি হবে</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddShopModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-300 flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateNewShop} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 font-bengali mb-1.5">
                  নতুন শপের নাম <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newShopForm.name}
                  onChange={e => setNewShopForm({ ...newShopForm, name: e.target.value })}
                  placeholder="যেমন: হিসাব পাতি - শাখা ২ (উত্তরা)"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-bengali text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 font-bengali mb-1.5">
                    শপের মোবাইল নম্বর
                  </label>
                  <input
                    type="text"
                    value={newShopForm.phone}
                    onChange={e => setNewShopForm({ ...newShopForm, phone: e.target.value })}
                    placeholder="017XXXXXXXX"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-sans text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 font-bengali mb-1.5">
                    কারেন্সি (Currency)
                  </label>
                  <select
                    value={newShopForm.currency}
                    onChange={e => setNewShopForm({ ...newShopForm, currency: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-sans text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="BDT">BDT (৳)</option>
                    <option value="USD">USD ($)</option>
                    <option value="INR">INR (₹)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 font-bengali mb-1.5">
                  শপের ঠিকানা
                </label>
                <input
                  type="text"
                  value={newShopForm.address}
                  onChange={e => setNewShopForm({ ...newShopForm, address: e.target.value })}
                  placeholder="শপের ঠিকানা লিখুন"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-bengali text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="p-4 bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 rounded-2xl space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                    <Sparkles size={18} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-emerald-900 dark:text-emerald-200 font-bengali">
                      স্বয়ংক্রিয় গুগল শিট তৈরি ও লাইভ ডাটাবেজ সংযোগ
                    </p>
                    <p className="text-[11px] text-emerald-800/90 dark:text-emerald-300/80 font-bengali leading-relaxed mt-0.5">
                      নতুন শপ তৈরি করার সাথে সাথেই স্বয়ংক্রিয়ভাবে আপনার গুগলে <strong>"{newShopForm.name.trim() || "নতুন শপ"} - হিসাবপাতি ডাটাবেজ"</strong> নামে ১২ ট্যাবের গুগল শিট তৈরি হয়ে সরাসরি এই শপের ডাটাবেজ হিসেবে কাজ শুরু করবে!
                    </p>
                  </div>
                </div>
                {!hasGoogleToken && (
                  <div className="pt-2 border-t border-emerald-200/70 dark:border-emerald-800/50 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-amber-800 dark:text-amber-300 font-bengali">
                      গুগল শিট তৈরির জন্য সাইন-ইন প্রয়োজন:
                    </span>
                    <button
                      type="button"
                      disabled={isConnectingDrive}
                      onClick={handleConnectDrive}
                      className="inline-flex items-center gap-2 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg shadow-sm font-sans text-xs font-medium transition-all shrink-0"
                    >
                      <svg className="w-4 h-4 shrink-0" viewBox="0 0 48 48">
                        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                      </svg>
                      <span>Sign in with Google</span>
                    </button>
                  </div>
                )}
              </div>

              <label className="flex items-center gap-2.5 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={switchImmediately}
                  onChange={e => setSwitchImmediately(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                />
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 font-bengali">
                  শপ তৈরি করার সাথে সাথেই এই নতুন শপে প্রবেশ করুন
                </span>
              </label>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddShopModal(false)}
                  className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold font-bengali text-xs hover:bg-slate-200 transition-all"
                >
                  বাতিল করুন
                </button>
                <button
                  type="submit"
                  disabled={creatingShop}
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold font-bengali text-xs shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  {creatingShop ? (
                    <>
                      <RefreshCw size={15} className="animate-spin" />
                      <span>তৈরি হচ্ছে...</span>
                    </>
                  ) : (
                    <>
                      <Plus size={16} />
                      <span>নতুন শপ তৈরি করুন</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Admin Verification Modal for Deleting a Shop & its Google Sheet */}
      {canManageShops && shopToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 max-w-md w-full border border-rose-200 dark:border-rose-900/50 shadow-2xl space-y-5"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                  <Trash2 size={22} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white font-bengali">শপ ও গুগল শিট ডিলিট নিশ্চিতকরণ</h3>
                  <p className="text-xs text-rose-600 dark:text-rose-400 font-bengali font-bold">শুধুমাত্র অ্যাডমিন ইমেইল ও পাসওয়ার্ড দিয়ে ডিলিট করা যাবে</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShopToDelete(null)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-300 flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-4 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 rounded-2xl space-y-2 text-xs font-bengali">
              <p className="font-bold text-rose-900 dark:text-rose-200">
                ⚠️ আপনি কি নিশ্চিতভাবে <span className="underline">"{shopToDelete.name}"</span> শপটি ডিলিট করতে চান?
              </p>
              <p className="text-rose-700 dark:text-rose-300 leading-relaxed">
                এই শপটি ডিলিট করলে শপের সকল ডাটাবেজ তথ্যের পাশাপাশি এই শপের সংযুক্ত গুগল শিট (<strong>{shopSheetStatuses[shopToDelete.id]?.sheetName || `${shopToDelete.name} - হিসাবপাতি ডাটাবেজ`}</strong>)-ও স্বয়ংক্রিয়ভাবে ডিলিট হয়ে যাবে।
              </p>
            </div>

            <form onSubmit={handleConfirmDeleteShop} className="space-y-4">
              {deleteError && (
                <div className="p-3 bg-rose-100 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 rounded-xl text-xs font-bold text-rose-700 dark:text-rose-300 font-bengali flex items-center gap-2">
                  <AlertCircle size={15} className="shrink-0" />
                  <span>{deleteError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 font-bengali mb-1.5">
                  অ্যাডমিনের ইমেইল <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="email"
                    required
                    autoComplete="off"
                    value={deleteAuthForm.email}
                    onChange={e => setDeleteAuthForm({ ...deleteAuthForm, email: e.target.value })}
                    placeholder="অ্যাডমিনের ইমেইল লিখুন"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-3.5 py-2.5 text-sm font-sans text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 font-bengali mb-1.5">
                  অ্যাডমিনের পাসওয়ার্ড <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type={showDeletePass ? "text" : "password"}
                    required
                    autoComplete="new-password"
                    value={deleteAuthForm.password}
                    onChange={e => setDeleteAuthForm({ ...deleteAuthForm, password: e.target.value })}
                    placeholder="অ্যাডমিনের পাসওয়ার্ড লিখুন"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-10 py-2.5 text-sm font-sans text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowDeletePass(!showDeletePass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    {showDeletePass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  disabled={deletingShop}
                  onClick={() => setShopToDelete(null)}
                  className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold font-bengali text-xs hover:bg-slate-200 transition-all"
                >
                  বাতিল করুন
                </button>
                <button
                  type="submit"
                  disabled={deletingShop}
                  className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold font-bengali text-xs shadow-lg shadow-rose-600/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  {deletingShop ? (
                    <>
                      <RefreshCw size={15} className="animate-spin" />
                      <span>যাচাই ও ডিলিট হচ্ছে...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 size={15} />
                      <span>শপ ও গুগল শিট ডিলিট করুন</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Custom Confirmation Modal for Google Workspace / Database Mutations */}
      {confirmDialog?.show && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-7 max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl space-y-5"
          >
            <div className="flex items-start gap-3.5">
              <div className={cn(
                "w-11 h-11 rounded-2xl flex items-center justify-center shrink-0",
                confirmDialog.variant === "danger"
                  ? "bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400"
                  : "bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400"
              )}>
                <AlertCircle size={22} />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-900 dark:text-white font-bengali">
                  {confirmDialog.title}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 font-bengali leading-relaxed">
                  {confirmDialog.message}
                </p>
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                disabled={confirmBusy}
                onClick={() => setConfirmDialog(null)}
                className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold font-bengali text-xs hover:bg-slate-200 transition-all"
              >
                বাতিল করুন
              </button>
              <button
                type="button"
                disabled={confirmBusy}
                onClick={async () => {
                  setConfirmBusy(true);
                  try {
                    await confirmDialog.onConfirm();
                  } finally {
                    setConfirmBusy(false);
                    setConfirmDialog(null);
                  }
                }}
                className={cn(
                  "flex-1 py-2.5 text-white rounded-xl font-bold font-bengali text-xs shadow-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50",
                  confirmDialog.variant === "danger"
                    ? "bg-rose-600 hover:bg-rose-700 shadow-rose-600/20"
                    : "bg-blue-600 hover:bg-blue-700 shadow-blue-600/20"
                )}
              >
                {confirmBusy ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span>অপেক্ষা করুন...</span>
                  </>
                ) : (
                  <span>{confirmDialog.confirmLabel}</span>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {notification && (
        <motion.div 
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          className={`fixed bottom-8 left-1/2 -translate-x-1/2 px-6 py-3 rounded-2xl shadow-xl z-50 flex items-center gap-3 ${
            notification.type === 'success' ? 'bg-emerald-600 text-white' : 
            notification.type === 'info' ? 'bg-blue-600 text-white' : 'bg-rose-600 text-white'
          }`}
        >
          <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center font-bold">
            {notification.type === 'success' ? '✓' : '!'}
          </div>
          <span className="font-bold font-bengali">{notification.message}</span>
        </motion.div>
      )}
    </div>
  );
}
