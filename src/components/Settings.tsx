/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, FormEvent, ChangeEvent } from "react";
import { api } from "../services/api";
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
  EyeOff
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
  fetchCloudDriveAccount
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
import { GOOGLE_APPS_SCRIPT_CODE } from "../lib/gasScriptCode";

const BACKUP_SECRET = "smart-erp-secure-backup-key-@2024";

const defaultBusiness: Business = {
  id: "main-business",
  name: "Smart Business",
  address: "ঢাকা, বাংলাদেশ",
  phone: "01700000000",
  currency: "BDT",
  backupEmail: "nahid521610@gmail.com",
  smtpConfig: {
    user: "",
    pass: "",
    senderName: "Smart Business Backup"
  }
};

export function Settings({ 
  onBusinessUpdate,
  onShopSwitch
}: { 
  onBusinessUpdate?: (b: Business) => void;
  onShopSwitch?: (b: Business) => void;
}) {
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
  const [activeSubTab, setActiveSubTab] = useState<'shops' | 'profile' | 'sheets' | 'printer' | 'backup'>('shops');
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error' | 'info'} | null>(null);
  
  // Google Sheets Master Database States (Isolated per Shop)
  const [sheetsConfig, setSheetsConfig] = useState<GoogleSheetsConfig>(getLocalSheetsConfig());
  const [testingSheets, setTestingSheets] = useState(false);
  const [syncingSheets, setSyncingSheets] = useState(false);
  const [restoringSheets, setRestoringSheets] = useState(false);
  const [savingSheets, setSavingSheets] = useState(false);
  const [showGasModal, setShowGasModal] = useState(false);
  const [gasCodeCopied, setGasCodeCopied] = useState(false);

  // States for Security tab
  const [passwords, setPasswords] = useState({ current: "", new: "", confirm: "" });
  
  // State for Printer tab
  const [selectedPrinter, setSelectedPrinter] = useState('thermal');

  // Backup loading state
  const [backupAction, setBackupAction] = useState(false);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [lastImportedData, setLastImportedData] = useState<any>(null);
  const [driveUser, setDriveUser] = useState<any>(null);
  const [driveUploading, setDriveUploading] = useState(false);
  const [isConnectingDrive, setIsConnectingDrive] = useState(false);
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

  useEffect(() => {
    // 1. Immediately read locally saved Drive account
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
      (u) => setDriveUser(u),
      () => {
        const stillSaved = getSavedDriveAccount();
        if (stillSaved && stillSaved.email) {
          setDriveUser(stillSaved);
        } else {
          setDriveUser(null);
        }
      }
    );
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, []);

  const loadAllShopsAndConfig = async () => {
    setLoading(true);
    try {
      const [bizData, allShops, users, backupStatus] = await Promise.all([
        api.getBusiness(),
        api.getBusinesses(),
        api.getUsers(),
        api.getBackupStatus()
      ]);
      const activeShopId = bizData?.id || "main-business";
      if (bizData) {
        setBusiness(prev => ({
          ...prev,
          ...bizData,
          smtpConfig: {
            ...(prev.smtpConfig || {}),
            ...(bizData.smtpConfig || {})
          }
        }));
        if (bizData.defaultPrinter) {
          setSelectedPrinter(bizData.defaultPrinter);
        }
      }
      setShopsList(allShops);
      setLastBackupAt(backupStatus.lastBackupAt || null);

      const admin = users.find(u => u.role === 'admin');
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

      // Load permanently bound Google Sheets status for all shops
      const statusMap: Record<string, GoogleSheetsConfig> = {};
      for (const s of allShops) {
        statusMap[s.id] = getLocalSheetsConfig(s.id);
      }
      setShopSheetStatuses(statusMap);
      Promise.all(
        allShops.map(async (s) => {
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

  useEffect(() => {
    loadAllShopsAndConfig();
  }, []);

  const showNotify = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3500);
  };

  const handleSwitchShop = async (targetShop: Business) => {
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

      // Ensure either Master Web App URL or Google Drive token is available so a real Google Sheet is auto-created
      const masterUrl = newShopForm.webAppUrl.trim() || (await findMasterWebAppUrl());
      if (!masterUrl && !getDriveAccessToken()) {
        try {
          const driveAuth = await googleDriveSignIn();
          if (driveAuth?.user) {
            setDriveUser(driveAuth.user);
          }
        } catch {
          // Continue even if popup was skipped; Master Web App URL may still be configured later
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
        showNotify(`নতুন শপ "${createdShop.name}" এবং এর গুগল শিট (${createdShop.name} - হিসাবপাতি ডাটাবেজ) স্বয়ংক্রিয়ভাবে তৈরি ও যুক্ত হয়েছে!`, "success");
      } else {
        showNotify(
          `নতুন শপ "${createdShop.name}" এবং এর গুগল শিট (${createdShop.name} - হিসাবপাতি ডাটাবেজ) স্বয়ংক্রিয়ভাবে তৈরি ও যুক্ত হয়েছে!`,
          "success"
        );
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
    if (!sheetsConfig.webAppUrl) {
      showNotify("গুগল অ্যাপস স্ক্রিপ্ট Web App URL লিখুন", "error");
      return;
    }
    setTestingSheets(true);
    try {
      showNotify("গুগল শিটে সংযোগ পরীক্ষা করা হচ্ছে...", "info");
      const res = await testGoogleSheetsConnection(sheetsConfig.webAppUrl);
      setSheetsConfig(prev => ({
        ...prev,
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

  const handleSyncAllSheets = async () => {
    if (!sheetsConfig.webAppUrl) {
      showNotify("প্রথমে গুগল অ্যাপস স্ক্রিপ্ট Web App URL সেট করুন", "error");
      return;
    }
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

  const handleRestoreFromSheets = async () => {
    if (!sheetsConfig.webAppUrl) {
      showNotify("প্রথমে গুগল অ্যাপস স্ক্রিপ্ট Web App URL সেট করুন", "error");
      return;
    }
    if (!window.confirm(`সতর্কতা: গুগল শিটের তথ্য দিয়ে "${business.name}" শপের ডাটাবেজ রিস্টোর করা হবে। আপনি কি এগিয়ে যেতে চান?`)) {
      return;
    }
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

  const handleCopyGasCode = () => {
    try {
      navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_CODE);
      setGasCodeCopied(true);
      showNotify("গুগল অ্যাপস স্ক্রিপ্ট কোড কপি হয়েছে! Google Sheets এ পেস্ট করুন।", "success");
      setTimeout(() => setGasCodeCopied(false), 3000);
    } catch (e) {
      showNotify("কোড কপি করা যায়নি, অনুগ্রহ করে ম্যানুয়ালি কপি করুন", "error");
    }
  };

  const handleExportData = async () => {
    setBackupAction(true);
    try {
      const allData = await api.getAllData();
      const jsonData = JSON.stringify(allData);
      
      // Encrypt data
      const encrypted = CryptoJS.AES.encrypt(jsonData, BACKUP_SECRET).toString();
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
      
      showNotify("ড্যাটা সফলভাবে এক্সপোর্ট এবং ইনক্রিপ্ট করা হয়েছে");
    } catch (err) {
      showNotify("এক্সপোর্ট করতে সমস্যা হয়েছে", "error");
    } finally {
      setBackupAction(false);
    }
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
      showNotify("গুগল ড্রাইভ উইন্ডো খোলা হচ্ছে...", "info");
      const res = await googleDriveSignIn();
      if (res) {
        setDriveUser(res.user);
        showNotify(`গুগল ড্রাইভে কানেক্ট হয়েছে (${res.user.email})`, "success");
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

  const handleDriveBackup = async () => {
    let token = getDriveAccessToken();

    // If not connected yet, trigger sign-in first
    if (!token) {
      showNotify("গুগল ড্রাইভে কানেক্ট করা হচ্ছে, অনুগ্রহ করে সাইন-ইন সম্পন্ন করুন...", "info");
      setIsConnectingDrive(true);
      try {
        const res = await googleDriveSignIn();
        if (res) {
          setDriveUser(res.user);
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

      // 2. Generate & Upload Encrypted .bak
      showNotify("গুগল ড্রাইভে এনক্রিপ্ট ফাইল (.bak) আপলোড হচ্ছে...", "info");
      const encrypted = CryptoJS.AES.encrypt(JSON.stringify(fullData), BACKUP_SECRET).toString();
      const bakPayload = `HISHAB_BAK_V2:${encrypted}`;
      const bakBlob = new Blob([bakPayload], { type: "application/octet-stream" });
      const bakFileName = `smart_erp_backup_${todayStr}.bak`;
      await uploadFileToDrive(bakFileName, "application/octet-stream", bakBlob);

      const now = new Date().toISOString();
      setLastBackupAt(now);
      try {
        await fetch("/api/backup/record", { method: "POST" });
      } catch (recErr) {}
      showNotify("গুগল ড্রাইভে এক্সেল ও এনক্রিপ্ট ফাইল সফলভাবে সংরক্ষিত হয়েছে!", "success");
    } catch (err: any) {
      console.error("Drive upload error:", err);
      showNotify(err.message || "গুগল ড্রাইভে ব্যাকআপ সংরক্ষণে সমস্যা হয়েছে", "error");
    } finally {
      setDriveUploading(false);
    }
  };

  const handleImportData = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBackupAction(true);
    setImportStatus({ stage: 'reading', message: "ফাইল পড়া হচ্ছে..." });
    
    try {
      const content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = (e) => reject(new Error("File reading failed"));
        reader.readAsText(file);
      });

      setImportStatus({ stage: 'decrypting', message: "ডিক্রিপ্ট এবং প্রসেস হচ্ছে..." });
      
      // Artificial delay so user can see what's happening
      await new Promise(r => setTimeout(r, 800));

      let encryptedContent = content;
      if (content.startsWith('HISHAB_BAK_V2:')) {
        encryptedContent = content.replace('HISHAB_BAK_V2:', '');
      }

      // Decrypt data
      const bytes = CryptoJS.AES.decrypt(encryptedContent, BACKUP_SECRET);
      const decryptedData = bytes.toString(CryptoJS.enc.Utf8);
      
      if (!decryptedData) {
        throw new Error("ভুল পাসওয়ার্ড অথবা নষ্ট ফাইল (Decryption Failed)");
      }
      
      let parsedData;
      try {
        parsedData = JSON.parse(decryptedData);
      } catch (e) {
        console.error("JSON Parse Error on Decrypted Data:", e);
        throw new Error("ডিক্রিপ্ট করা তথ্য সঠিক নয় (Invalid JSON format)");
      }
      
      setLastImportedData(parsedData);
      
      const summary = {
        users: parsedData.users?.length || 0,
        products: parsedData.products?.length || 0,
        sales: parsedData.sales?.length || 0,
        businessName: parsedData.business?.name || "Unknown"
      };

      // Move to reviewing stage
      setImportStatus({ 
        stage: 'reviewing', 
        message: "ব্যাকআপ ফাইল চেক করা হয়েছে। নিচের তথ্যগুলো আপনার বর্তমান টাটাবেজকে পরিবর্তন করবে।",
        summary
      });

      // We wait for the user to click "Confirm" in the UI section
      // The actual API call will be moved to a separate function or handled via state

    } catch (err: any) {
      console.error("Import Error:", err);
      setImportStatus({ 
        stage: 'error', 
        message: err.message || "ইমপোর্ট ব্যর্থ হয়েছে। ফাইলটি সঠিক নয়।" 
      });
      showNotify(err.message || "ইমপোর্ট ব্যর্থ হয়েছে।", "error");
    } finally {
      setBackupAction(false);
      e.target.value = '';
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
    } catch (err) {
      showNotify("পাসওয়ার্ড পরিবর্তন ব্যর্থ হয়েছে", "error");
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
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white font-bengali">সিস্টেম ও মাল্টি-শপ সেটিংস</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm font-bengali">আপনার সকল শপ, আলাদা ডাটাবেজ এবং গুগল শিট কনফিগারেশন (শুধুমাত্র অ্যাডমিন)</p>
        </div>

        <div className="flex items-center gap-3 bg-white dark:bg-slate-900 px-4 py-2.5 rounded-2xl border border-blue-200 dark:border-blue-900/50 shadow-sm">
          <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
            <Store size={18} />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 font-bengali">বর্তমান সক্রিয় শপ</p>
            <p className="text-sm font-black text-slate-900 dark:text-white font-bengali">{business.name}</p>
          </div>
          <button
            type="button"
            onClick={() => setActiveSubTab('shops')}
            className="ml-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 text-blue-700 dark:text-blue-300 rounded-xl text-xs font-bold font-bengali transition-all flex items-center gap-1.5"
          >
            <ArrowRightLeft size={13} />
            <span>শপ পরিবর্তন</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Sidebar Tabs */}
        <div className="lg:col-span-1 space-y-2">
          {[
            { id: 'shops', label: 'শপ লিস্ট ও নতুন শপ', icon: Building2, badge: `${shopsList.length || 1}টি শপ` },
            { id: 'profile', label: 'শপ প্রোফাইল', icon: Store, badge: null },
            { id: 'sheets', label: 'গুগল শিট ডাটাবেজ', icon: FileSpreadsheet, badge: 'আলাদা শিট' },
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
            {/* MULTI-SHOP MANAGEMENT TAB */}
            {activeSubTab === 'shops' && (
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
                      <p className="text-xs text-blue-100/90 font-bengali mt-1 leading-relaxed">
                        প্রতিটি শপের পণ্য, কাস্টমার, বকেয়া, বিক্রয়, স্টাফ এবং গুগল শিট সম্পূর্ণ আলাদা। কোনো শপের তথ্যের সাথে অন্য শপের তথ্য কখনোই মিক্স হবে না।
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

                {/* Shops List */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-base font-bold text-slate-900 dark:text-white font-bengali flex items-center gap-2">
                      <Store size={18} className="text-blue-600" />
                      <span>আপনার সকল শপের তালিকা ({shopsList.length}টি)</span>
                    </h4>
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-bengali">
                      যে শপে কাজ করতে চান সেটিতে "এই শপে প্রবেশ করুন" বাটনে ক্লিক করুন
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {shopsList.map((shop, idx) => {
                      const isActive = shop.id === business.id;
                      const shopSheet = shopSheetStatuses[shop.id];
                      const hasSheet = Boolean(shopSheet && (shopSheet.sheetUrl || shopSheet.webAppUrl));

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
                                <span>গুগল শিট সংযুক্ত ({shopSheet?.sheetName || `${shop.name} - হিসাবপাতি ডাটাবেজ`})</span>
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

                {/* Info Box explaining Multi-Shop Rules */}
                <div className="p-5 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-800 space-y-2.5">
                  <h5 className="text-xs font-bold text-slate-800 dark:text-slate-200 font-bengali flex items-center gap-2">
                    <ShieldCheck size={16} className="text-emerald-600" />
                    মাল্টি-শপ সিস্টেম যেভাবে কাজ করে:
                  </h5>
                  <ul className="text-xs text-slate-600 dark:text-slate-400 font-bengali space-y-1.5 leading-relaxed">
                    <li>• <strong>সুপার অ্যাডমিন অ্যাক্সেস:</strong> সকল শপের জন্য আপনার সুপার অ্যাডমিন ইমেইল ও পাসওয়ার্ড একই থাকবে। আপনি এখান থেকে যেকোনো সময় শপ পরিবর্তন করে সেই শপের সকল হিসাব দেখতে ও পরিচালনা করতে পারবেন।</li>
                    <li>• <strong>শপভিত্তিক আলাদা ইউজার/স্টাফ:</strong> আপনি যে শপে থাকা অবস্থায় <strong>"ইউজার"</strong> ট্যাব থেকে সেলসম্যান বা স্টাফ তৈরি করবেন, সেই স্টাফ শুধুমাত্র ওই শপের ইউজার হিসেবে গণ্য হবে। লগইন পেজে সেই স্টাফ তার ইমেইল ও পাসওয়ার্ড দিয়ে লগইন করলে সে সরাসরি তার নিজস্ব শপেই প্রবেশ করবে।</li>
                    <li>• <strong>নিরাপত্তা ও সীমাবদ্ধতা:</strong> অ্যাডমিন ছাড়া অন্য কোনো ইউজার (সেলসম্যান/ম্যানেজার/স্টাফ) সেটিংস দেখতে পাবে না এবং শপ পরিবর্তনও করতে পারবে না।</li>
                    <li>• <strong>স্বয়ংক্রিয় আলাদা গুগল শিট:</strong> নতুন শপ তৈরি করার সাথে সাথেই অ্যাপ নিজে থেকেই ওই শপের নামে নতুন একটি গুগল শিট তৈরি করে শপটির সাথে সংযুক্ত করে দেয়।</li>
                  </ul>
                </div>
              </div>
            )}

            {activeSubTab === 'profile' && business && (
              <form onSubmit={handleUpdateBusiness} className="p-8 space-y-6">
                <div className="p-4 bg-blue-50/70 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 rounded-2xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Store size={20} className="text-blue-600" />
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 font-bengali">
                      আপনি বর্তমানে <strong className="text-blue-600 dark:text-blue-400">"{business.name}"</strong> শপের প্রোফাইল সম্পাদনা করছেন
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveSubTab('shops')}
                    className="text-xs font-bold text-blue-600 hover:underline font-bengali"
                  >
                    অন্য শপ সিলেক্ট করুন →
                  </button>
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

                <div className="flex items-center gap-4 mb-4">
                  <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center text-slate-400 dark:text-slate-500">
                    <Store size={32} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 font-bengali">শপ ইনফরমেশন</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 font-bengali">ইনভয়েস এবং রিপোর্টে এই শপের তথ্যগুলো দেখা যাবে</p>
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

            {activeSubTab === 'backup' && (
              <div className="p-8 space-y-8">
                <div className="flex items-center justify-between gap-4 mb-4">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl flex items-center justify-center text-emerald-600 dark:text-emerald-500">
                      <Database size={32} />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 font-bengali">ব্যাকআপ অ্যান্ড রিস্টোর ({business.name})</h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400 font-bengali">বর্তমানে সক্রিয় শপের সকল তথ্য সুরক্ষিত রাখুন</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Left Column: Google Drive Cloud Backup */}
                  <div className="space-y-6">
                    <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 space-y-6 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center">
                            <Cloud size={24} />
                          </div>
                          <div>
                            <h4 className="font-bold text-slate-900 dark:text-slate-100 font-bengali text-base">
                              গুগল ড্রাইভ ক্লাউড ব্যাকআপ
                            </h4>
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-bengali">
                              Google Drive Integration
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

                      {/* Status of last drive backup */}
                      <div className="p-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 flex items-center gap-4">
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                          lastBackupAt ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600" : "bg-slate-100 dark:bg-slate-700 text-slate-400"
                        )}>
                          <Save size={20} />
                        </div>
                        <div>
                          <p className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider font-sans">
                            সর্বশেষ সফল গুগল ড্রাইভ ব্যাকআপ (ঢাকা সময়)
                          </p>
                          <p className={cn(
                            "text-sm font-bold font-sans",
                            lastBackupAt ? "text-slate-900 dark:text-slate-100" : "text-slate-500"
                          )}>
                            {lastBackupAt 
                              ? `${formatDhakaDateTime(lastBackupAt)}`
                              : "এখনও কোন ব্যাকআপ সংরক্ষণ করা হয়নি"}
                          </p>
                        </div>
                      </div>

                      <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl flex items-center justify-between text-xs text-blue-800 dark:text-blue-300">
                        <span className="font-bengali font-bold">⏰ স্বয়ংক্রিয় ব্যাকআপ সময়সূচী:</span>
                        <span className="font-sans font-bold">প্রতিদিন দুপুর ১২:০০ এবং রাত ১২:০০ (ঢাকা জোন)</span>
                      </div>

                      <p className="text-xs text-slate-600 dark:text-slate-400 font-bengali leading-relaxed">
                        আপনার সমস্ত ব্যবসার পণ্য, কাস্টমার, সেলস, <strong>বকেয়া হিসাব (Due List)</strong>, বাকি বিক্রি ও খরচের <strong>এক্সেল শিট (.xlsx)</strong> এবং <strong>এনক্রিপ্টেড ব্যাকআপ (.bak)</strong> ফাইল সরাসরি আপনার গুগল ড্রাইভে সুরক্ষিতভাবে সংরক্ষণ করুন।
                      </p>

                      <div className="space-y-3">
                        {driveUser ? (
                          <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-2xl flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center text-emerald-600">
                                <CheckCircle size={16} />
                              </div>
                              <div>
                                <p className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold font-bengali">সংযুক্ত গুগল একাউন্ট:</p>
                                <p className="text-xs font-bold text-slate-900 dark:text-slate-100 font-sans">{driveUser.email}</p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={async () => {
                                if (window.confirm("আপনি কি গুগল ড্রাইভ অ্যাকাউন্ট পরিবর্তন করতে চান?")) {
                                  await disconnectDriveAccount();
                                  setDriveUser(null);
                                  showNotify("গুগল ড্রাইভ অ্যাকাউন্ট সরানো হয়েছে। নতুন অ্যাকাউন্ট যোগ করুন।", "info");
                                }
                              }}
                              className="text-xs text-rose-600 dark:text-rose-400 hover:text-rose-700 font-bengali font-bold px-2 py-1 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm"
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
                              <>
                                <svg className="w-4 h-4" viewBox="0 0 24 24">
                                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                                </svg>
                                <span>Google দিয়ে একাউন্ট সংযুক্ত করুন</span>
                              </>
                            )}
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={handleDriveBackup}
                          disabled={driveUploading}
                          className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold font-bengali transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 disabled:opacity-50"
                        >
                          {driveUploading ? (
                            <>
                              <RefreshCw size={20} className="animate-spin" />
                              ড্রাইভে ফাইল তৈরি ও আপলোড হচ্ছে...
                            </>
                          ) : (
                            <>
                              <Cloud size={20} />
                              গুগল ড্রাইভে ব্যাকআপ সংরক্ষণ করুন
                            </>
                          )}
                        </button>
                      </div>

                      <div className="p-4 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 rounded-2xl">
                        <h5 className="text-xs font-bold text-blue-900 dark:text-blue-300 font-bengali mb-2">গুগল ড্রাইভে কী কী থাকবে:</h5>
                        <ul className="text-[11px] text-blue-800 dark:text-blue-400 font-bengali space-y-1.5 leading-relaxed">
                          <li>• <strong>এক্সেল স্প্রেডশিট (.xlsx):</strong> পণ্য, বিক্রি, কাস্টমার, <strong>বকেয়া গ্রাহক তালিকা</strong>, <strong>বাকি বিক্রির মেমো</strong>, খরচ ও সারসংক্ষেপের আলাদা আলাদা শিট।</li>
                          <li>• <strong>এনক্রিপ্টেড ব্যাকআপ (.bak):</strong> হিসাবপাতি অ্যাপে যেকোনো সময় ডাটা পুনরায় রিস্টোর করার ফাইল।</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Local Export & Restore + Danger Zone */}
                  <div className="space-y-6">
                    <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 space-y-6 transition-colors">
                      <div>
                        <h4 className="font-bold text-slate-900 dark:text-slate-100 font-bengali flex items-center gap-2 text-base">
                          <Download size={20} className="text-slate-400 dark:text-slate-500" />
                          ম্যানুয়াল এক্সপোর্ট ও রিস্টোর
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-bengali mt-1">
                          আপনার কম্পিউটার বা ডিভাইসে ফাইল সংরক্ষণ ও রিস্টোর করুন
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

                    {/* Danger Zone: Clear Data */}
                    <div className="p-6 bg-rose-50 dark:bg-rose-900/10 rounded-3xl border border-rose-200 dark:border-rose-900/30 space-y-4">
                      <div className="flex items-center gap-3">
                        <Trash2 className="text-rose-600" size={20} />
                        <h4 className="text-sm font-bold text-rose-900 dark:text-rose-100 font-bengali">ডাটা রিসেট (ডেঞ্জার জোন)</h4>
                      </div>
                      <p className="text-xs text-rose-700 dark:text-rose-400 font-bengali leading-relaxed">
                        রিস্টোর ফিচারটি পরীক্ষা করার জন্য এখান থেকে পরীক্ষামূলকভাবে সকল পণ্য, কাস্টমার এবং বিক্রয় তথ্য মুছে ফেলতে পারেন।
                      </p>
                      <button 
                        onClick={async () => {
                          if (window.confirm("আপনি কি নিশ্চিত? পরীক্ষামূলক সকল পণ্য, বিক্রয় ও কাস্টমার ডাটা মুছে যাবে!")) {
                            try {
                              showNotify("সকল ডাটা মোছা হচ্ছে...", "info");
                              await api.clearAllData();
                              showNotify("সকল পরীক্ষামূলক ডাটা সফলভাবে মুছে ফেলা হয়েছে!", "success");
                              setTimeout(() => {
                                window.location.reload(); 
                              }, 1000);
                            } catch (e: any) {
                              console.error("Clear error:", e);
                              showNotify(e.message || "ডাটা মুছতে সমস্যা হয়েছে", "error");
                            }
                          }
                        }}
                        className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-2.5 px-4 rounded-xl shadow-lg shadow-rose-900/20 transition-all font-bengali text-sm"
                      >
                        সকল তথ্য মুছে ফেলুন
                      </button>
                    </div>
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
                      if (business) {
                        const updatedBiz = { ...business, defaultPrinter: 'thermal' as const };
                        setBusiness(updatedBiz);
                        await api.updateBusiness(updatedBiz);
                        if (onBusinessUpdate) onBusinessUpdate(updatedBiz);
                      }
                      showNotify("ডিফল্ট প্রিন্টার: Thermal");
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
                      if (business) {
                        const updatedBiz = { ...business, defaultPrinter: 'a4' as const };
                        setBusiness(updatedBiz);
                        await api.updateBusiness(updatedBiz);
                        if (onBusinessUpdate) onBusinessUpdate(updatedBiz);
                      }
                      showNotify("ডিফল্ট প্রিন্টার: A4 Laser");
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
                {/* Active Shop Banner */}
                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 rounded-2xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Store size={18} className="text-emerald-600" />
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 font-bengali">
                      সক্রিয় শপ: <strong className="text-emerald-700 dark:text-emerald-400">"{business.name}"</strong> — এই শপের জন্য আলাদা গুগল শিট ডাটাবেজ কনফিগারেশন
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveSubTab('shops')}
                    className="text-xs font-bold text-emerald-700 dark:text-emerald-400 hover:underline font-bengali"
                  >
                    শপ পরিবর্তন →
                  </button>
                </div>

                {/* Banner Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 rounded-3xl text-white shadow-xl shadow-emerald-900/20">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center shrink-0 shadow-inner">
                      <FileSpreadsheet size={32} className="text-white" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-xl font-bold font-bengali">{business.name} - গুগল শিট ডাটাবেজ</h3>
                        <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-400/30 text-emerald-100 border border-emerald-300/30">
                          শপভিত্তিক আলাদা শিট
                        </span>
                      </div>
                      <p className="text-xs text-emerald-100/90 font-bengali mt-1 leading-relaxed">
                        এই শপের পণ্য, ক্রেতা, মেমো ও হিসাব শুধুমাত্র এই শপের গুগল শিটের ৯টি ট্যাবে স্বয়ংক্রিয়ভাবে সংরক্ষিত ও আপডেট থাকবে।
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowGasModal(true)}
                    className="self-start sm:self-auto px-4 py-2.5 bg-white text-emerald-800 rounded-xl font-bold font-bengali text-xs hover:bg-emerald-50 transition-all flex items-center gap-2 shadow-lg shadow-black/10 shrink-0"
                  >
                    <FileCode size={16} />
                    <span>অ্যাপস স্ক্রিপ্ট কোড দেখুন</span>
                  </button>
                </div>

                {/* Connection Status Card */}
                <div className="p-6 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-800 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-4 h-4 rounded-full flex items-center justify-center bg-emerald-500 animate-pulse ring-4 ring-emerald-100 dark:ring-emerald-950" />
                      <div>
                        <h4 className="font-bold text-slate-900 dark:text-slate-100 font-bengali text-sm flex items-center gap-2">
                          গুগল শিট ডাটাবেজ সংযুক্ত রয়েছে
                          <span className="text-xs font-normal text-slate-500 dark:text-slate-400 font-bengali">
                            ({sheetsConfig.sheetName || `${business.name} - হিসাবপাতি ডাটাবেজ`})
                          </span>
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-bengali">
                          {sheetsConfig.lastSyncAt 
                            ? `সর্বশেষ পূর্ণাঙ্গ সিঙ্ক: ${formatDhakaDateTime(sheetsConfig.lastSyncAt)}`
                            : "শপের সাথে স্বয়ংক্রিয়ভাবে গুগল শিট সংযুক্ত রয়েছে।"}
                        </p>
                      </div>
                    </div>

                    {sheetsConfig.sheetUrl && (
                      <a
                        href={sheetsConfig.sheetUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3.5 py-2 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300 rounded-xl font-bold font-bengali text-xs hover:bg-emerald-100 transition-all flex items-center gap-1.5 self-start sm:self-auto"
                      >
                        <ExternalLink size={14} />
                        <span>গুগল শিট খুলুন</span>
                      </a>
                    )}
                  </div>

                  {sheetsConfig.lastSyncCount && (
                    <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 pt-2 border-t border-slate-200 dark:border-slate-700/60 text-center">
                      <div className="p-2.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
                        <span className="text-[10px] text-slate-400 font-bengali block">পণ্য তালিকা</span>
                        <span className="text-sm font-bold text-slate-800 dark:text-slate-200 font-sans">{sheetsConfig.lastSyncCount.products ?? 0}</span>
                      </div>
                      <div className="p-2.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
                        <span className="text-[10px] text-slate-400 font-bengali block">বিক্রয় ও মেমো</span>
                        <span className="text-sm font-bold text-blue-600 dark:text-blue-400 font-sans">{sheetsConfig.lastSyncCount.sales ?? 0}</span>
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
                    </div>
                  )}
                </div>

                {/* Configuration Form */}
                <div className="p-6 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 space-y-5">
                  <h4 className="font-bold text-slate-900 dark:text-slate-100 font-bengali text-sm flex items-center gap-2">
                    <SettingsIcon size={18} className="text-emerald-600" />
                    গুগল অ্যাপস স্ক্রিপ্ট (Web App URL) কনফিগারেশন
                  </h4>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 font-bengali mb-1.5">
                        গুগল অ্যাপস স্ক্রিপ্ট Web App URL <span className="text-rose-500">*</span>
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="url"
                          value={sheetsConfig.webAppUrl || ""}
                          onChange={(e) => setSheetsConfig({ ...sheetsConfig, webAppUrl: e.target.value.trim() })}
                          placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                          className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <button
                          type="button"
                          onClick={handleTestSheets}
                          disabled={testingSheets || !sheetsConfig.webAppUrl}
                          className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-bold font-bengali transition-all flex items-center gap-1.5 disabled:opacity-50 shrink-0"
                        >
                          {testingSheets ? <RefreshCw size={14} className="animate-spin text-emerald-600" /> : <Play size={14} className="text-emerald-600" />}
                          <span>সংযোগ টেস্ট</span>
                        </button>
                      </div>
                      <p className="text-[11px] text-slate-400 font-bengali mt-1">
                        গুগল শিটে Extensions → Apps Script এ কোড পেস্ট করে Deploy → Web App হিসেবে পাবলিশ করলে এই লিংক পাবেন।
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 font-bengali mb-1.5">
                        গুগল স্প্রেডশিটের লিংক (Google Sheet Link) <span className="text-slate-400 font-normal">(ঐচ্ছিক, এক ক্লিকে শিট খোলার জন্য)</span>
                      </label>
                      <input
                        type="url"
                        value={sheetsConfig.sheetUrl || ""}
                        onChange={(e) => setSheetsConfig({ ...sheetsConfig, sheetUrl: e.target.value.trim() })}
                        placeholder="https://docs.google.com/spreadsheets/d/1-xkdlFhf.../edit"
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>

                    <div className="flex items-center justify-between p-4 bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40 rounded-2xl">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center text-emerald-600">
                          <RefreshCw size={18} />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-200 font-bengali">স্বয়ংক্রিয় রিয়েল-টাইম সিঙ্ক (Auto Real-Time Sync)</p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-bengali">
                            অ্যাপে নতুন মেমো, বিক্রি, কাস্টমার, বাকি বা খরচ এন্ট্রি করলেই ব্যাকগ্রাউন্ডে গুগল শিটে স্বয়ংক্রিয়ভাবে আপডেট হবে।
                          </p>
                        </div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer shrink-0">
                        <input
                          type="checkbox"
                          checked={sheetsConfig.autoSync !== false}
                          onChange={(e) => setSheetsConfig({ ...sheetsConfig, autoSync: e.target.checked })}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                      </label>
                    </div>

                    <div className="flex justify-end pt-2">
                      <button
                        type="button"
                        onClick={handleSaveSheets}
                        disabled={savingSheets}
                        className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold font-bengali text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all disabled:opacity-50"
                      >
                        {savingSheets ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                        <span>কনফিগারেশন সেভ করুন</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* 1-Click Action Buttons */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-6 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-slate-900 dark:to-emerald-950/20 border border-emerald-200 dark:border-emerald-800/60 rounded-3xl space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-600/30">
                        <Cloud size={20} />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 dark:text-slate-100 font-bengali text-sm">গুগল শিটে সম্পূর্ণ ডাটা পাঠান</h4>
                        <p className="text-[11px] text-slate-500 font-bengali">অ্যাপের সকল পণ্য, কাস্টমার, বিক্রি ও হিসাব শিটের ৯টি ট্যাবে পাঠান</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleSyncAllSheets}
                      disabled={syncingSheets || !sheetsConfig.webAppUrl}
                      className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold font-bengali text-xs shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                    >
                      {syncingSheets ? (
                        <>
                          <RefreshCw size={16} className="animate-spin" />
                          <span>গুগল শিটে সম্পূর্ণ ডাটা সিঙ্ক হচ্ছে...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle size={16} />
                          <span>এখনই সম্পূর্ণ ডাটা সিঙ্ক করুন</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="p-6 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-slate-900 dark:to-blue-950/20 border border-blue-200 dark:border-blue-800/60 rounded-3xl space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-600/30">
                        <Download size={20} />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 dark:text-slate-100 font-bengali text-sm">গুগল শিট থেকে ডাটা রিস্টোর করুন</h4>
                        <p className="text-[11px] text-slate-500 font-bengali">অ্যাপ নতুন ফোনে নিলে বা ডাটা হারালে গুগল শিট থেকে ফিরিয়ে আনুন</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleRestoreFromSheets}
                      disabled={restoringSheets || !sheetsConfig.webAppUrl}
                      className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold font-bengali text-xs shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                    >
                      {restoringSheets ? (
                        <>
                          <RefreshCw size={16} className="animate-spin" />
                          <span>গুগল শিট থেকে ডাটা রিস্টোর হচ্ছে...</span>
                        </>
                      ) : (
                        <>
                          <Download size={16} />
                          <span>গুগল শিট থেকে রিস্টোর করুন</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Standalone Google Sheet Features Breakdown */}
                <div className="p-6 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-800 space-y-4">
                  <div className="flex items-center gap-2.5">
                    <Sparkles className="text-amber-500" size={20} />
                    <h4 className="font-bold text-slate-900 dark:text-slate-100 font-bengali text-sm">
                      অ্যাপ নষ্ট বা বন্ধ থাকলেও গুগল শিট যেভাবে স্বয়ংক্রিয়ভাবে কাজ করবে:
                    </h4>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 font-bengali leading-relaxed">
                    আপনার হিসাবপাতি অ্যাপের মতোই গুগল স্প্রেডশিটে <strong>হুবহু ৯টি বাংলা ট্যাবে</strong> সব রেকর্ড ক্যাটাগরি অনুসারে থাকবে। এমনকি এই অ্যাপ নষ্ট হলেও গুগল শিট স্বাধীনভাবে চলবে:
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-3 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs">
                      <p className="font-bold text-emerald-700 dark:text-emerald-400 font-bengali mb-1">1. ড্যাশবোর্ড (Dashboard)</p>
                      <p className="text-[11px] text-slate-500 font-bengali">মোট বিক্রি, নগদ আদায়, মোট বকেয়া ও কম স্টকের হিসাব লাইভ গুগল শিট ফর্মুলা দিয়ে বের হবে।</p>
                    </div>
                    <div className="p-3 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs">
                      <p className="font-bold text-blue-700 dark:text-blue-400 font-bengali mb-1">2. পণ্য তালিকা (Products)</p>
                      <p className="text-[11px] text-slate-500 font-bengali">আইডি, নাম, SKU, বারকোড, ক্রয়মূল্য, বিক্রয়মূল্য, বর্তমান স্টক ও স্টক অ্যালার্ট থাকবে।</p>
                    </div>
                    <div className="p-3 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs">
                      <p className="font-bold text-purple-700 dark:text-purple-400 font-bengali mb-1">3. বিক্রয় ও মেমো (Sales)</p>
                      <p className="text-[11px] text-slate-500 font-bengali">ইনভয়েস নং, তারিখ-সময়, কাস্টমার, পণ্যের বিবরণ, মোট বিল, জমা ও বাকি টাকা হিসাব থাকবে।</p>
                    </div>
                    <div className="p-3 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs">
                      <p className="font-bold text-indigo-700 dark:text-indigo-400 font-bengali mb-1">4. ক্রেতা তালিকা (Customers)</p>
                      <p className="text-[11px] text-slate-500 font-bengali">কাস্টমারের নাম, মোবাইল, ঠিকানা, মোট বকেয়া এবং আজ পর্যন্ত সর্বমোট ক্রয়ের হিসাব।</p>
                    </div>
                    <div className="p-3 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs">
                      <p className="font-bold text-rose-700 dark:text-rose-400 font-bengali mb-1">5. বকেয়া খাতা (Due Management)</p>
                      <p className="text-[11px] text-slate-500 font-bengali">শুধুমাত্র যেসব গ্রাহকের বকেয়া আছে তাদের আলাদা লাল রঙের জরুরি তাগাদা তালিকা।</p>
                    </div>
                    <div className="p-3 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs">
                      <p className="font-bold text-amber-700 dark:text-amber-400 font-bengali mb-1">6. হিসাব ও খরচ (Expenses)</p>
                      <p className="text-[11px] text-slate-500 font-bengali">দোকানের বাড়ি ভাড়া, কারেন্ট বিল, নাস্তা সহ প্রতিদিনের যাবতীয় খরচের রেজিস্টার।</p>
                    </div>
                  </div>

                  <div className="p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 rounded-2xl">
                    <h5 className="font-bold text-blue-900 dark:text-blue-300 font-bengali text-xs mb-1.5 flex items-center gap-2">
                      <CheckCircle size={15} />
                      গুগল শিটের বিশেষ মেনু ("📊 হিসাবপাতি ERP মেনু")
                    </h5>
                    <p className="text-[11px] text-blue-800 dark:text-blue-400 font-bengali leading-relaxed">
                      গুগল শিট খুললে উপরে একটি মেনু দেখতে পাবেন। সেখান থেকে সরাসরি ডায়ালগ বক্সের মাধ্যমে নতুন পণ্য যোগ, বিক্রয় মেমো কাটা এবং কাস্টমারের বাকি টাকা জমার হিসাব অ্যাপ ছাড়াই গুগল শিটের ভেতরেই করা যাবে!
                    </p>
                  </div>
                </div>

                {/* 4-Step Visual Setup Guide */}
                <div className="p-6 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 space-y-4">
                  <h4 className="font-bold text-slate-900 dark:text-slate-100 font-bengali text-sm flex items-center gap-2">
                    <HelpCircle size={18} className="text-emerald-600" />
                    মাত্র ২ মিনিটে গুগল শিট ডাটাবেজ চালু করার সহজ ৪টি ধাপ:
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                    <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700 space-y-1.5">
                      <span className="w-6 h-6 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-xs">১</span>
                      <p className="font-bold font-bengali text-slate-800 dark:text-slate-200">নতুন গুগল শিট খুলুন</p>
                      <p className="text-[11px] text-slate-500 font-bengali">sheets.new তে গিয়ে আপনার জিমেইল দিয়ে একটি খালি স্প্রেডশিট খুলুন।</p>
                    </div>

                    <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700 space-y-1.5">
                      <span className="w-6 h-6 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-xs">২</span>
                      <p className="font-bold font-bengali text-slate-800 dark:text-slate-200">Apps Script খুলুন</p>
                      <p className="text-[11px] text-slate-500 font-bengali">মেনু থেকে <strong>Extensions → Apps Script</strong> এ ক্লিক করুন।</p>
                    </div>

                    <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700 space-y-1.5">
                      <span className="w-6 h-6 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-xs">৩</span>
                      <p className="font-bold font-bengali text-slate-800 dark:text-slate-200">কোড পেস্ট করুন</p>
                      <p className="text-[11px] text-slate-500 font-bengali">নিচের "কোড কপি করুন" বাটনে চাপ দিয়ে স্ক্রিপ্ট এডিটরে পেস্ট করে সেভ করুন।</p>
                    </div>

                    <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700 space-y-1.5">
                      <span className="w-6 h-6 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-xs">৪</span>
                      <p className="font-bold font-bengali text-slate-800 dark:text-slate-200">Web App Deploy দিন</p>
                      <p className="text-[11px] text-slate-500 font-bengali">Deploy → New Deployment → Web App সিলেক্ট করে <strong>Who has access: Anyone</strong> দিয়ে লিংকটি এখানে সেভ করুন!</p>
                    </div>
                  </div>

                  <div className="flex justify-center pt-2">
                    <button
                      type="button"
                      onClick={() => setShowGasModal(true)}
                      className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold font-bengali text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all"
                    >
                      <Copy size={16} />
                      <span>গুগল অ্যাপস স্ক্রিপ্ট কোডটি কপি করতে এখানে ক্লিক করুন</span>
                    </button>
                  </div>
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
              <p>গুগল সিকিউরিটির নিয়মানুযায়ী, যেকোনো নতুন সাইট (যেমন: <code className="bg-amber-200/50 dark:bg-amber-900/50 px-1 py-0.5 rounded font-mono">{driveAuthHelp.domain}</code>) থেকে ব্যবহারকারীর গুগলে প্রবেশ করতে হলে ডোমেইনটি Firebase/Google Cloud Console-এর <strong>Authorized Domains</strong> তালিকায় একবার যোগ করতে হয়।</p>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300 font-bengali">
                💡 কোনো গুগল সেটিংস ছাড়াই সহজে মোবাইলে ব্যাকআপ নেয়ার উপায়:
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-bengali leading-relaxed">
                আপনার সমস্ত দোকানের স্টক, বাকি হিসাব, খাতা ও সেলসের তথ্য সরাসরি নিচের বাটন দিয়ে এক্সেল বা ব্যাকআপ ফাইলে ডাউনলোড করে রাখতে পারেন:
              </p>
              
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
                ঠিক আছে, বুঝেছি
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Google Apps Script Code Modal */}
      {showGasModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 max-w-2xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4 max-h-[90vh] flex flex-col"
          >
            <div className="flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <FileCode size={22} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 font-bengali">Google Apps Script কোড</h3>
                  <p className="text-xs text-slate-500 font-bengali">Google Sheets এর Extensions → Apps Script এ পেস্ট করার জন্য</p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setShowGasModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-300 flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 rounded-2xl text-xs text-emerald-900 dark:text-emerald-200 font-bengali leading-relaxed shrink-0">
              💡 <strong>সহজ নিয়ম:</strong> কোডটি কপি করে আপনার Google Sheet এর <strong>Extensions → Apps Script</strong> এ গিয়ে পেস্ট করুন এবং <strong>Deploy → New Deployment → Web App</strong> সিলেক্ট করে <strong>Who has access: Anyone</strong> দিয়ে Deploy দিন।
            </div>

            <div className="flex-1 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-950 p-4 relative group">
              <pre className="text-emerald-400 font-mono text-[11px] leading-relaxed overflow-auto h-full max-h-[360px] custom-scrollbar select-all">
                {GOOGLE_APPS_SCRIPT_CODE}
              </pre>
            </div>

            <div className="flex items-center justify-between pt-2 shrink-0">
              <span className="text-xs text-slate-500 font-bengali">
                {gasCodeCopied ? "✓ কোডটি ক্লিপবোর্ডে কপি হয়েছে!" : "এক ক্লিকে সম্পূর্ণ কোড কপি করুন"}
              </span>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCopyGasCode}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold font-bengali flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all"
                >
                  {gasCodeCopied ? <Check size={16} /> : <Copy size={16} />}
                  <span>{gasCodeCopied ? "কপি সম্পন্ন হয়েছে!" : "কোড কপি করুন"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowGasModal(false)}
                  className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold font-bengali hover:bg-slate-200 transition-all"
                >
                  বন্ধ করুন
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Add New Shop Modal */}
      {showAddShopModal && (
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

              <div className="p-4 bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 rounded-2xl space-y-2.5">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                    <Sparkles size={18} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-emerald-900 dark:text-emerald-200 font-bengali">
                      স্বয়ংক্রিয় গুগল শিট তৈরি ও সংযোগ (Auto Google Sheet Creation)
                    </p>
                    <p className="text-[11px] text-emerald-800/90 dark:text-emerald-300/80 font-bengali leading-relaxed mt-0.5">
                      নতুন শপ তৈরি করার সাথে সাথেই স্বয়ংক্রিয়ভাবে আপনার গুগল ড্রাইভে <strong>"{newShopForm.name.trim() || "নতুন শপ"} - হিসাবপাতি ডাটাবেজ"</strong> নামে সম্পূর্ণ নতুন একটি গুগল শিট তৈরি হয়ে এই শপের সাথে যুক্ত হয়ে যাবে! আপনাকে ম্যানুয়ালি শিট তৈরি করতে হবে না।
                    </p>
                  </div>
                </div>
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
      {shopToDelete && (
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
