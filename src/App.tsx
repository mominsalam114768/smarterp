/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, lazy, Suspense } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Sidebar } from "./components/Sidebar";
import { MobileNav } from "./components/MobileNav";
import { Header } from "./components/Header";
import { Product, Customer, Sale, User, Business } from "./types";
import { Printer, X, Download, FileText, Building2, Mail, Lock, ArrowRight, Loader2, User as UserIcon, Phone, ShieldCheck, Sparkles, Eye, EyeOff } from "lucide-react";
// @ts-ignore - html2pdf doesn't have built-in types
import html2pdf from 'html2pdf.js';
import { setApiBusinessId, api, isGlobalSuperAdmin, isShopAdmin, getApiBusinessId } from "./services/api";
import { subscribeGoogleTokenChange, hasActiveGoogleToken } from "./lib/drive";
import { buildPrintDocumentHtml, resolvePrinterType } from "./lib/printUtils";
import { cn } from "./lib/utils";
import { 
  signInWithEmailAndPassword, 
  onAuthStateChanged,
  signOut,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  setPersistence,
  browserSessionPersistence
} from "firebase/auth";
import { auth, db, doc, getDoc, setDoc, collection, query, where, getDocs, limit, isAuthorizedDomain } from "./lib/firebase";

import { Dashboard } from "./components/Dashboard";
import { POS } from "./components/POS";
import { ProductList } from "./components/ProductList";
import { CustomerList } from "./components/CustomerList";
import { SalesList } from "./components/SalesList";
import { SupplierList } from "./components/SupplierList";
import { Accounting } from "./components/Accounting";
import { Reports } from "./components/Reports";
import { DueManagement } from "./components/DueManagement";
import { SMSModule } from "./components/SMSModule";
import { UserManagement } from "./components/UserManagement";
import { Settings } from "./components/Settings";
import { ApprovalManagement } from "./components/ApprovalManagement";

const LoadingFallback = () => (
  <div className="flex-1 flex items-center justify-center bg-slate-50 dark:bg-slate-950 transition-colors">
    <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
  </div>
);

export default function App() {
  const [activeTab, setActiveTab] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("smart_business_active_tab") || "dashboard";
    }
    return "dashboard";
  });
  const [printHtml, setPrintHtml] = useState<string | null>(null);
  const [printRawBody, setPrintRawBody] = useState<string | null>(null);
  const [printMode, setPrintMode] = useState<'thermal' | 'a4'>('thermal');
  const [user, setUser] = useState<User | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [needsInitialSetup, setNeedsInitialSetup] = useState(false);
  const [regName, setRegName] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [confirmRegPassword, setConfirmRegPassword] = useState("");
  const [pwaUpdateApply, setPwaUpdateApply] = useState<(() => void) | null>(null);
  
  const [business, setBusiness] = useState<Business | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("smart_business_theme");
    return (saved as "light" | "dark") || "light";
  });

  // Persist current active tab so on page refresh the user stays on the exact same tab
  useEffect(() => {
    if (activeTab) {
      localStorage.setItem("smart_business_active_tab", activeTab);
    }
  }, [activeTab]);

  const INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 minutes of inactivity before auto-logout
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);

  const resetIdleTimer = () => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (user) {
      idleTimerRef.current = setTimeout(() => {
        handleLogout();
        setLoginError("টানা ১৫ মিনিট কোনো কার্যক্রম না থাকায় নিরাপত্তার স্বার্থে আপনাকে স্বয়ংক্রিয়ভাবে লগআউট করা হয়েছে। পুনরায় লগইন করুন।");
      }, INACTIVITY_TIMEOUT);
    }
  };

  useEffect(() => {
    if (user) {
      const events = ['mousedown', 'mousemove', 'keypress', 'keydown', 'scroll', 'touchstart', 'click'];
      const handleActivity = () => resetIdleTimer();

      events.forEach(event => window.addEventListener(event, handleActivity, { passive: true }));
      resetIdleTimer();

      return () => {
        events.forEach(event => window.removeEventListener(event, handleActivity));
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      };
    }
  }, [user]);

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem("smart_business_theme", theme);
  }, [theme]);
  
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  useEffect(() => {
    const loadBusiness = async (targetShopId?: string) => {
      try {
        const data = await api.getBusiness(targetShopId);
        setBusiness(data);
      } catch (err) {
        console.error("Failed to load business info:", err);
      }
    };

    // Initial Auth Check from persistent storage
    const checkAuth = async () => {
      let resolvedShopId = "main-business";
      const savedUser = sessionStorage.getItem("smart_business_user") || localStorage.getItem("smart_business_user");
      if (savedUser) {
        try {
          const userData = JSON.parse(savedUser);
          if (userData && userData.id && userData.email) {
            const verified = await api.verifySession(userData.id, userData.email);
            if (verified) {
              resolvedShopId = verified.businessId || "main-business";
              if (!isGlobalSuperAdmin(verified)) {
                localStorage.removeItem("smart_active_shop_id");
              }
              setApiBusinessId(resolvedShopId);
              setUser(verified);
              sessionStorage.setItem("smart_business_user", JSON.stringify(verified));
              localStorage.setItem("smart_business_user", JSON.stringify(verified));
            } else if (typeof navigator !== "undefined" && !navigator.onLine) {
              // Offline-only session continuity strictly locked to assigned businessId
              resolvedShopId = userData.businessId || "main-business";
              if (!isGlobalSuperAdmin(userData)) {
                localStorage.removeItem("smart_active_shop_id");
              }
              setApiBusinessId(resolvedShopId);
              setUser(userData);
            } else {
              sessionStorage.removeItem("smart_business_user");
              localStorage.removeItem("smart_business_user");
              localStorage.removeItem("smart_active_shop_id");
              setUser(null);
            }
          } else {
            sessionStorage.removeItem("smart_business_user");
            localStorage.removeItem("smart_business_user");
            setUser(null);
          }
        } catch (e) {
          console.error("Session parse error", e);
          sessionStorage.removeItem("smart_business_user");
          localStorage.removeItem("smart_business_user");
          setUser(null);
        }
      } else {
        setUser(null);
        const anyUsers = await api.hasAnyUser();
        setNeedsInitialSetup(!anyUsers);
      }
      await loadBusiness(resolvedShopId);
      setIsInitializing(false);
    };

    checkAuth();

    const handlePrint = (e: any) => {
      const mode: 'thermal' | 'a4' = e?.detail?.printerType || resolvePrinterType(business);
      const rawBody: string | null = e?.detail?.rawBodyHtml || null;
      setPrintMode(mode);
      setPrintRawBody(rawBody);
      setPrintHtml(rawBody ? buildPrintDocumentHtml(rawBody, mode) : e.detail.html);
      setIsGeneratingPDF(false);
    };

    const handleBusinessUpdated = (e: any) => {
      if (e?.detail) {
        setBusiness(e.detail);
      }
    };

    const handlePwaUpdate = (e: any) => {
      if (e?.detail?.apply) {
        setPwaUpdateApply(() => e.detail.apply);
      }
    };

    const handleNeedsSetup = () => {
      setNeedsInitialSetup(true);
    };

    window.addEventListener('smart-print', handlePrint);
    window.addEventListener('business-updated', handleBusinessUpdated);
    window.addEventListener('app-update-available', handlePwaUpdate);
    window.addEventListener('needs-initial-setup', handleNeedsSetup);
    return () => {
      window.removeEventListener('smart-print', handlePrint);
      window.removeEventListener('business-updated', handleBusinessUpdated);
      window.removeEventListener('app-update-available', handlePwaUpdate);
      window.removeEventListener('needs-initial-setup', handleNeedsSetup);
    };
  }, []);

  // Automatically bind & verify dedicated Google Sheet for the active shop (including default main-business) when an admin has an active Google OAuth token
  useEffect(() => {
    if (!user || !isShopAdmin(user)) return;
    const shopId = user.businessId || "main-business";
    if (business?.id && business.id !== shopId) {
      return; // Wait until business state matches user.businessId after a shop switch
    }
    if (hasActiveGoogleToken()) {
      api.ensureShopGoogleSheet(shopId).catch(() => {});
    }
    const unsubToken = subscribeGoogleTokenChange((active) => {
      if (active) {
        const currentShopId = getApiBusinessId() || shopId;
        api.ensureShopGoogleSheet(currentShopId).catch(() => {});
      }
    });
    return () => unsubToken();
  }, [user?.id, user?.businessId, business?.id]);

  const [missingSheetConfirm, setMissingSheetConfirm] = useState<{ shopId: string; shopName: string } | null>(null);
  const [isCreatingConfirmedSheet, setIsCreatingConfirmedSheet] = useState(false);
  const [sheetRestoreNotice, setSheetRestoreNotice] = useState<string | null>(null);
  const [viewRefreshKey, setViewRefreshKey] = useState(0);

  useEffect(() => {
    const onMissingConfirm = (e: Event) => {
      const custom = e as CustomEvent<{ shopId: string; shopName: string }>;
      if (custom.detail?.shopId) {
        setMissingSheetConfirm({
          shopId: custom.detail.shopId,
          shopName: custom.detail.shopName || business?.name || "এই শপ"
        });
      }
    };
    const onSheetRestored = (e: Event) => {
      const custom = e as CustomEvent<{ shopId: string; shopName: string; sheetName: string }>;
      if (custom.detail) {
        setSheetRestoreNotice(`"${custom.detail.shopName}" এর পূর্বের গুগল শিট (${custom.detail.sheetName}) শনাক্ত করে সকল তথ্য স্বয়ংক্রিয়ভাবে রিস্টোর করা হয়েছে!`);
        setViewRefreshKey((k) => k + 1);
        setTimeout(() => setSheetRestoreNotice(null), 6000);
      }
    };
    window.addEventListener("shop-sheet-missing-confirm", onMissingConfirm);
    window.addEventListener("shop-sheet-restored", onSheetRestored);
    return () => {
      window.removeEventListener("shop-sheet-missing-confirm", onMissingConfirm);
      window.removeEventListener("shop-sheet-restored", onSheetRestored);
    };
  }, [business?.name]);

  const handleConfirmCreateMissingSheet = async () => {
    if (!missingSheetConfirm) return;
    setIsCreatingConfirmedSheet(true);
    try {
      const targetId = missingSheetConfirm.shopId;
      const targetName = missingSheetConfirm.shopName;
      await api.ensureShopGoogleSheet(targetId, { allowCreateIfMissing: true });
      setMissingSheetConfirm(null);
      setSheetRestoreNotice(`"${targetName}" এর জন্য নতুন গুগল শিট তৈরি ও ডাটাবেজ সেটআপ সম্পন্ন হয়েছে!`);
      setViewRefreshKey((k) => k + 1);
      setTimeout(() => setSheetRestoreNotice(null), 5000);
    } catch (err) {
      console.error("Failed to create confirmed sheet:", err);
    } finally {
      setIsCreatingConfirmedSheet(false);
    }
  };


  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError(null);

    const email = loginEmail.trim().toLowerCase();
    const password = loginPassword.trim();

    try {
      const userData = await api.login(email, password);
      handleLogin(userData);
    } catch (err: any) {
      setLoginError(err.message || "লগইন করা সম্ভব হয়নি।");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleInitialSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError(null);

    const email = loginEmail.trim().toLowerCase();
    const password = loginPassword.trim();

    if (!regName.trim()) {
      setLoginError("অনুগ্রহ করে আপনার পুরো নাম লিখুন।");
      setLoginLoading(false);
      return;
    }
    if (password.length < 6) {
      setLoginError("পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।");
      setLoginLoading(false);
      return;
    }
    if (password !== confirmRegPassword.trim()) {
      setLoginError("উভয় পাসওয়ার্ড মিলছে না।");
      setLoginLoading(false);
      return;
    }

    try {
      const adminUser = await api.bootstrapInitialAdmin({
        name: regName.trim(),
        email,
        phone: regPhone.trim(),
        password
      });
      setNeedsInitialSetup(false);
      setConfirmRegPassword("");
      await handleLogin(adminUser);
    } catch (err: any) {
      console.error("Initial setup fail:", err);
      setLoginError(err.message || "অ্যাকাউন্ট তৈরি করা সম্ভব হয়নি।");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogin = async (userData: User) => {
    const shopId = userData.businessId || "main-business";
    if (!isGlobalSuperAdmin(userData)) {
      localStorage.removeItem("smart_active_shop_id");
    }
    setApiBusinessId(shopId);
    setUser(userData);
    sessionStorage.setItem("smart_business_user", JSON.stringify(userData));
    localStorage.setItem("smart_business_user", JSON.stringify(userData));

    api.getBusiness(shopId).then((bizData) => {
      if (bizData) setBusiness(bizData);
    }).catch(() => {});

    // If this shop admin already has Google OAuth active, auto-ensure dedicated Google Sheet for this shop
    if (isShopAdmin(userData) && hasActiveGoogleToken()) {
      api.ensureShopGoogleSheet(shopId).catch(() => {});
    }

    // If an activeTab was previously saved (e.g. before refresh), keep it if permitted
    const savedTab = localStorage.getItem("smart_business_active_tab");
    if (userData.role !== 'admin') {
      const allowed = ['dashboard', 'pos', 'sales', 'products', 'customers', 'suppliers', 'accounting', 'due', 'sms', 'reports'].filter(t => userData.permissions?.includes(t));
      if (savedTab && allowed.includes(savedTab)) {
        setActiveTab(savedTab);
      } else if (allowed.length > 0 && !allowed.includes(activeTab)) {
        setActiveTab(allowed[0]);
      } else if (allowed.length === 0) {
        setActiveTab("pos");
      }
    } else if (savedTab) {
      setActiveTab(savedTab);
    }
  };

  const handleShopSwitch = (newBusiness: Business) => {
    if (!isGlobalSuperAdmin(user)) return;
    setMissingSheetConfirm(null);
    setApiBusinessId(newBusiness.id);
    setBusiness(newBusiness);
    setUser(prev => {
      if (!prev) return null;
      const updated = { ...prev, businessId: newBusiness.id };
      sessionStorage.setItem("smart_business_user", JSON.stringify(updated));
      localStorage.setItem("smart_business_user", JSON.stringify(updated));
      return updated;
    });
  };

  const handleLogout = () => {
    setUser(null);
    setApiBusinessId("main-business");
    setLoginEmail("");
    setLoginPassword("");
    sessionStorage.removeItem("smart_business_user");
    localStorage.removeItem("smart_business_user");
    localStorage.removeItem("smart_business_active_tab");
    api.getBusiness("main-business").then(setBusiness).catch(() => {});
  };

  const handleFinalPrint = () => {
    window.print();
  };

  const handleSwitchPrintMode = (nextMode: 'thermal' | 'a4') => {
    setPrintMode(nextMode);
    if (printRawBody) {
      setPrintHtml(buildPrintDocumentHtml(printRawBody, nextMode));
    }
    const shopId = business?.id || user?.businessId || getApiBusinessId() || "main-business";
    if (typeof window !== "undefined") {
      localStorage.setItem(`smart_printer_${shopId}`, nextMode);
    }
    if (business) {
      const updatedBiz = { ...business, defaultPrinter: nextMode };
      setBusiness(updatedBiz);
      api.updateBusiness(updatedBiz, shopId).catch(() => {});
    }
  };

  const handleDownloadPDF = async () => {
    const element = document.querySelector('.preview-content-container .print-content-wrapper') as HTMLElement | null;
    if (!element) return;
    setIsGeneratingPDF(true);
    
    const isThermal = printMode === 'thermal';
    const targetPxWidth = isThermal ? 302 : 794;

    try {
      const opt = {
        margin: isThermal ? [2, 0, 2, 0] : [0, 0, 0, 0],
        filename: `smart-business-${isThermal ? 'thermal-80mm' : 'A4'}-${new Date().getTime()}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { 
          scale: 2,
          useCORS: true, 
          letterRendering: true,
          scrollY: 0,
          scrollX: 0,
          width: targetPxWidth,
          windowWidth: targetPxWidth,
          onclone: (clonedDoc: Document) => {
            const target = clonedDoc.querySelector('.preview-content-container .print-content-wrapper') as HTMLElement;
            if (target) {
              target.style.boxShadow = 'none';
              target.style.border = 'none';
              target.style.margin = '0';
              target.style.width = `${targetPxWidth}px`;
              target.style.minWidth = `${targetPxWidth}px`;
              target.style.maxWidth = `${targetPxWidth}px`;
            }
            const wrapper = clonedDoc.querySelector('.preview-sheet-frame') as HTMLElement;
            if (wrapper) {
              wrapper.style.boxShadow = 'none';
              wrapper.style.border = 'none';
              wrapper.style.margin = '0';
              wrapper.style.padding = '0';
              wrapper.style.width = `${targetPxWidth}px`;
            }
            clonedDoc.body.style.background = '#ffffff';
            clonedDoc.body.style.padding = '0';
            clonedDoc.body.style.margin = '0';

            const root = clonedDoc.documentElement;
            root.classList.remove('dark');

            const styles = clonedDoc.getElementsByTagName('style');
            for (let i = 0; i < styles.length; i++) {
              styles[i].innerHTML = styles[i].innerHTML.replace(/oklch\(([^)]+)\)/g, (match, p1) => {
                if (p1.includes('0.627 0.265 256') || p1.includes(' 277')) return '#2563eb';
                if (p1.includes('0.6 0.118 184') || p1.includes(' 145')) return '#059669';
                if (p1.includes('0.577 0.245 27') || p1.includes(' 40')) return '#e11d48';
                return '#1e293b'; 
              });
            }
          }
        },
        jsPDF: isThermal
          ? { unit: 'mm', format: [80, 297], orientation: 'portrait' }
          : { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };

      // @ts-ignore
      await html2pdf().set(opt).from(element).save();
    } catch (err) {
      console.error("PDF generation failed:", err);
      handleFinalPrint();
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const toggleTheme = () => {
    setTheme(prev => prev === "light" ? "dark" : "light");
  };

  const canAccessTab = (tabId: string) => {
    if (!user) return false;
    if (user.role === 'admin') return true; 
    if (tabId === 'approvals' || tabId === 'settings') return false; // Strictly admin only
    
    // Explicitly check permissions array
    if (user.permissions && Array.isArray(user.permissions)) {
      return user.permissions.includes(tabId);
    }
    
    return false;
  };

  if (!isAuthorizedDomain()) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md w-full bg-slate-900 border border-rose-500/30 rounded-3xl p-8 shadow-2xl">
          <div className="w-16 h-16 bg-rose-500/10 text-rose-500 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <Lock className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-black text-white mb-2">অননুমোদিত ডোমেইন অ্যাক্সেস</h1>
          <p className="text-slate-400 text-sm leading-relaxed">
            নিরাপত্তার স্বার্থে এই অ্যাপ্লিকেশনটি শুধুমাত্র অনুমোদিত ডোমেইনে চলার জন্য সুরক্ষিত করা হয়েছে। এই ডোমেইন থেকে অ্যাপ্লিকেশনটি ব্যবহারের অনুমতি নেই।
          </p>
        </div>
      </div>
    );
  }

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="flex flex-col items-center"
        >
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-6" />
          <h1 className="text-3xl font-black text-white mb-2 tracking-tight">Smart Business</h1>
          <p className="text-slate-400 font-medium font-bengali">সিস্টেম লোড হচ্ছে, অনুগ্রহ করে অপেক্ষা করুন...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className={cn("min-h-screen transition-colors duration-300", theme === "dark" && "dark")}>
      <style>
        {`
          @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@400;700&display=swap');
          
          .custom-scrollbar::-webkit-scrollbar {
            width: 6px;
          }
          .custom-scrollbar::-webkit-scrollbar-track {
            background: transparent;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb {
            background: #e2e8f0;
            border-radius: 10px;
          }
          .dark .custom-scrollbar::-webkit-scrollbar-thumb {
            background: #1e293b;
          }

          @media print {
            .no-print-global {
              display: none !important;
              height: 0 !important;
              overflow: hidden !important;
            }
            #printable-area {
              display: block !important;
              visibility: visible !important;
              position: absolute !important;
              left: 0 !important;
              top: 0 !important;
              width: 100% !important;
              background: white !important;
            }
            body {
              background: white !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            @page {
              margin: 0;
              size: ${printMode === 'a4' ? 'A4 portrait' : '80mm auto'};
            }
          }
        `}
      </style>

      {/* Printable Area (Only visible during print) */}
      <div id="printable-area" className="hidden print:block text-slate-900 bg-white">
        <div dangerouslySetInnerHTML={{ __html: printHtml || "" }} />
      </div>

      {printHtml && (
        <div className="no-print-global fixed inset-0 z-[9999] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4">
          <div className="bg-white w-full max-w-5xl max-h-[95vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in duration-300 text-slate-900">
            <div className="p-3 sm:p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 bg-white">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg sm:text-xl font-black tracking-tight text-slate-900 font-bengali">প্রিন্ট প্রিভিউ</h3>
                  <span className={cn(
                    "px-2.5 py-0.5 rounded-lg text-[11px] font-bold font-sans",
                    printMode === 'a4' ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-800"
                  )}>
                    {printMode === 'a4' ? 'A4 (210mm × 297mm)' : 'Thermal 80mm'}
                  </span>
                </div>
                <p className="hidden sm:block text-xs text-slate-500 font-medium font-bengali">ডকুমেন্টটি প্রিন্ট বা ডাউনলোড করার আগে সাইজ দেখে নিন</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => handleSwitchPrintMode('a4')}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-xs font-bold transition-all",
                      printMode === 'a4' ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
                    )}
                  >
                    A4 সাইজ
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSwitchPrintMode('thermal')}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-xs font-bold transition-all",
                      printMode === 'thermal' ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
                    )}
                  >
                    Thermal 80mm
                  </button>
                </div>

                <button 
                  onClick={handleDownloadPDF}
                  disabled={isGeneratingPDF}
                  className="bg-blue-600 text-white px-3.5 sm:px-5 py-2 rounded-xl font-bold font-bengali shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all flex items-center gap-1.5 disabled:opacity-50 text-xs sm:text-sm"
                >
                  {isGeneratingPDF ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Download size={16} />
                  )}
                  <span>PDF ({printMode === 'a4' ? 'A4' : '80mm'})</span>
                </button>
                <button 
                  onClick={handleFinalPrint}
                  className="bg-emerald-600 text-white px-3.5 sm:px-5 py-2 rounded-xl font-bold font-bengali shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-all flex items-center gap-1.5 text-xs sm:text-sm"
                >
                  <Printer size={16} />
                  <span>প্রিন্ট</span>
                </button>
                <button 
                  onClick={() => setPrintHtml(null)}
                  className="bg-slate-100 text-slate-600 p-2 rounded-xl hover:bg-slate-200 transition-all"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-3 sm:p-8 bg-slate-200/80 text-slate-900 preview-content-container" ref={pdfContainerRef}>
              <div
                dangerouslySetInnerHTML={{ __html: printHtml }}
                className="preview-sheet-frame mx-auto bg-white"
                style={{
                  width: printMode === 'a4' ? '794px' : '302px',
                  minWidth: printMode === 'a4' ? '794px' : '302px',
                  minHeight: printMode === 'a4' ? '1123px' : 'auto',
                  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15)',
                  border: '1px solid #cbd5e1'
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Auth Content */}
      <AnimatePresence mode="wait">
        {!user ? (
          <motion.div
            key="login"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={cn("no-print-global min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300 flex items-center justify-center p-4 overflow-hidden relative", theme === "dark" && "dark")}
          >
            <div className="absolute top-0 -left-4 w-96 h-96 bg-blue-400 rounded-full mix-blend-multiply filter blur-[128px] opacity-10 animate-pulse" />
            <div className="absolute bottom-0 -right-4 w-96 h-96 bg-indigo-400 rounded-full mix-blend-multiply filter blur-[128px] opacity-10 animate-pulse delay-700" />
            
            <div className="w-full max-w-md relative z-10">
              <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-white dark:border-slate-800 rounded-[2.5rem] p-8 shadow-2xl shadow-blue-900/5">
                <div className="text-center mb-10">
                  <div className="mb-6 flex justify-center group">
                    {business?.logo ? (
                      <img src={business.logo} alt="Logo" className="h-20 w-auto object-contain group-hover:scale-105 transition-transform duration-500" />
                    ) : (
                      <div className="h-20 flex items-center justify-center text-blue-600">
                        <Building2 size={48} />
                      </div>
                    )}
                  </div>
                  <h1 className="text-3xl font-black text-slate-900 dark:text-white mb-2 tracking-tight font-bengali">
                    {business?.name || "হিসাব পাতি"}
                  </h1>
                  <p className="text-slate-500 dark:text-slate-400 font-medium font-bengali text-sm">
                    সুব্যবস্থাপনার মাধ্যমে ব্যবসা পরিচালনা করুন
                  </p>
                </div>

                {loginError && (
                  <motion.div 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 p-3.5 rounded-2xl text-center text-sm font-bold font-bengali mb-5"
                  >
                    <span>{loginError}</span>
                  </motion.div>
                )}

                {needsInitialSetup ? (
                  <form onSubmit={handleInitialSetup} className="space-y-4">
                    <div className="p-3.5 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-2xl text-xs text-blue-800 dark:text-blue-200 font-bengali leading-relaxed">
                      <strong>প্রথমবার সেটআপ:</strong> সিস্টেম সুরক্ষিত রাখতে আপনার সুপার অ্যাডমিন অ্যাকাউন্ট তৈরি করুন। এই অ্যাকাউন্ট দিয়ে আপনি সকল শপ পরিচালনা করতে পারবেন।
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 ml-1 font-bengali">আপনার নাম</label>
                      <div className="relative group">
                        <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                          type="text"
                          required
                          value={regName}
                          onChange={(e) => setRegName(e.target.value)}
                          placeholder="সম্পূর্ণ নাম লিখুন"
                          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl py-3 pl-11 pr-4 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 font-bengali"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 ml-1 font-bengali">ইমেইল ঠিকানা</label>
                      <div className="relative group">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                          type="email"
                          required
                          value={loginEmail}
                          onChange={(e) => setLoginEmail(e.target.value)}
                          placeholder="admin@example.com"
                          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl py-3 pl-11 pr-4 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 ml-1 font-bengali">মোবাইল নম্বর (ঐচ্ছিক)</label>
                      <div className="relative group">
                        <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                          type="tel"
                          value={regPhone}
                          onChange={(e) => setRegPhone(e.target.value)}
                          placeholder="017XXXXXXXX"
                          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl py-3 pl-11 pr-4 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 ml-1 font-bengali">নতুন পাসওয়ার্ড (কমপক্ষে ৬ অক্ষর)</label>
                      <div className="relative group">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                          type={showPassword ? "text" : "password"}
                          required
                          minLength={6}
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          placeholder="নিরাপদ পাসওয়ার্ড দিন"
                          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl py-3 pl-11 pr-11 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                        >
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 ml-1 font-bengali">পাসওয়ার্ড নিশ্চিত করুন</label>
                      <div className="relative group">
                        <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                          type={showPassword ? "text" : "password"}
                          required
                          minLength={6}
                          value={confirmRegPassword}
                          onChange={(e) => setConfirmRegPassword(e.target.value)}
                          placeholder="পুনরায় পাসওয়ার্ড লিখুন"
                          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl py-3 pl-11 pr-4 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={loginLoading}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-2xl shadow-xl shadow-blue-200 dark:shadow-none flex items-center justify-center gap-2 transition-all disabled:opacity-70 mt-2"
                    >
                      {loginLoading ? (
                        <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          <span className="font-bengali">সুপার অ্যাডমিন অ্যাকাউন্ট তৈরি করুন</span>
                          <ArrowRight size={18} />
                        </>
                      )}
                    </button>
                  </form>
                ) : (
                <form onSubmit={handleSignIn} className="space-y-5">
                  <div className="space-y-1.5">
                    <label className="text-sm font-bold text-slate-700 dark:text-slate-300 ml-1 font-bengali">ইমেইল ঠিকানা</label>
                    <div className="relative group">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors" size={18} />
                      <input
                        type="email"
                        required
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        placeholder="আপনার ইমেইল ঠিকানা লিখুন"
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl py-3.5 pl-12 pr-4 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 focus:bg-white dark:focus:bg-slate-700 transition-all placeholder:text-slate-400 font-bengali"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between ml-1">
                      <label className="text-sm font-bold text-slate-700 dark:text-slate-300 font-bengali">পাসওয়ার্ড</label>
                      <span className="text-xs text-slate-400 font-bengali">ভুলে গেলে এডমিনের সাথে যোগাযোগ করুন</span>
                    </div>
                    <div className="relative group">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors" size={18} />
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        placeholder="আপনার পাসওয়ার্ড লিখুন"
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl py-3.5 pl-12 pr-12 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 focus:bg-white dark:focus:bg-slate-700 transition-all placeholder:text-slate-400"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg transition-colors focus:outline-none"
                        title={showPassword ? "পাসওয়ার্ড লুকান" : "পাসওয়ার্ড দেখুন"}
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loginLoading}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-2xl shadow-xl shadow-blue-200 dark:shadow-none flex items-center justify-center gap-2 group transition-all relative overflow-hidden disabled:opacity-70 mt-2"
                  >
                    {loginLoading ? (
                      <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <span className="font-bengali">লগইন করুন</span>
                        <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                      </>
                    )}
                  </button>
                </form>
                )}
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="app"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={cn("no-print-global flex bg-slate-50 dark:bg-slate-950 h-screen overflow-hidden transition-colors duration-300", theme === "dark" && "dark")}
          >
            <div className="hidden md:flex flex-shrink-0">
              <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} user={user} business={business} />
            </div>
            
            <div className="flex-1 flex flex-col h-screen overflow-hidden relative">
              <Header 
                onLogout={handleLogout} 
                onNewSale={() => setActiveTab("pos")} 
                onOpenSettings={() => setActiveTab("settings")}
                user={user} 
                theme={theme}
                toggleTheme={toggleTheme}
                business={business}
              />
              
              <main key={`${user.businessId || business?.id || "main-business"}-${viewRefreshKey}`} className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 transition-colors duration-300 custom-scrollbar pb-20 md:pb-0">
                <Suspense fallback={<LoadingFallback />}>
                  {activeTab === "dashboard" && canAccessTab("dashboard") && <Dashboard user={user} />}
                  {activeTab === "pos" && canAccessTab("pos") && <POS user={user} />}
                  {activeTab === "sales" && canAccessTab("sales") && <SalesList user={user} />}
                  {activeTab === "approvals" && canAccessTab("approvals") && <ApprovalManagement user={user} />}
                  {activeTab === "products" && canAccessTab("products") && <ProductList user={user} />}
                  {activeTab === "customers" && canAccessTab("customers") && <CustomerList user={user} />}
                  {activeTab === "suppliers" && canAccessTab("suppliers") && <SupplierList user={user} />}
                  {activeTab === "accounting" && canAccessTab("accounting") && <Accounting user={user} />}
                  {activeTab === "reports" && canAccessTab("reports") && <Reports user={user} />}
                  {activeTab === "due" && canAccessTab("due") && <DueManagement user={user} />}
                  {activeTab === "sms" && canAccessTab("sms") && <SMSModule />}
                  {activeTab === "users" && canAccessTab("users") && <UserManagement user={user} />}
                  {activeTab === "settings" && canAccessTab("settings") && <Settings user={user} onBusinessUpdate={setBusiness} onShopSwitch={handleShopSwitch} />}
                  
                  {/* Access Denied View */}
                  {user && !canAccessTab(activeTab) && (
                    <div className="flex flex-col items-center justify-center p-20 text-center space-y-4">
                      <div className="w-20 h-20 bg-rose-50 dark:bg-rose-900/20 text-rose-500 rounded-full flex items-center justify-center">
                         <Lock size={40} />
                      </div>
                      <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 font-bengali">এক্সেস সীমিত (Access Denied)</h2>
                      <p className="text-slate-500 dark:text-slate-400 font-bengali max-w-sm">আপনার এই মডিউলে প্রবেশের অনুমতি নেই। বিস্তারিত জানতে এডমিনের সাথে যোগাযোগ করুন।</p>
                      <button 
                        onClick={() => setActiveTab("dashboard")}
                        className="px-6 py-2 bg-primary text-white rounded-xl font-bold font-bengali"
                      >
                        ড্যাশবোর্ডে ফিরে যান
                      </button>
                    </div>
                  )}
                </Suspense>
              </main>

              <MobileNav activeTab={activeTab} setActiveTab={setActiveTab} user={user} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Missing Google Sheet Confirmation Modal */}
      {missingSheetConfirm && (
        <div className="no-print-global fixed inset-0 z-[130] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4 font-bengali">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <FileText size={22} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">পূর্বের গুগল শিট খুঁজে পাওয়া যায়নি</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">নতুন শিট তৈরির পূর্বে আপনার কনফার্মেশন প্রয়োজন</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800">
              <strong>"{missingSheetConfirm.shopName}"</strong> শপের আগের গুগল শিটটি আপনার গুগল ড্রাইভে খুঁজে পাওয়া যায়নি। আপনি কি এই শপের জন্য নতুন একটি গুগল শিট তৈরি করে ডাটাবেজ সেটআপ করতে চান?
            </p>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                disabled={isCreatingConfirmedSheet}
                onClick={() => setMissingSheetConfirm(null)}
                className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-xs hover:bg-slate-200 transition-all"
              >
                পরে করব
              </button>
              <button
                type="button"
                disabled={isCreatingConfirmedSheet}
                onClick={handleConfirmCreateMissingSheet}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-600/20 transition-all disabled:opacity-50"
              >
                {isCreatingConfirmedSheet ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    তৈরি হচ্ছে...
                  </>
                ) : (
                  "হ্যাঁ, নতুন শিট তৈরি করুন"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auto-restored Sheet Toast */}
      {sheetRestoreNotice && (
        <div className="no-print-global fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[125] bg-emerald-600 text-white px-5 py-3 rounded-2xl shadow-xl font-bengali text-xs font-bold flex items-center gap-2.5">
          <span>✓</span>
          <span>{sheetRestoreNotice}</span>
        </div>
      )}

      {pwaUpdateApply && (
        <div className="no-print-global fixed bottom-20 md:bottom-6 right-4 left-4 md:left-auto md:max-w-sm z-[120] bg-slate-900 dark:bg-slate-800 text-white px-4 py-3.5 rounded-2xl shadow-2xl border border-slate-700 flex items-center justify-between gap-3">
          <div className="font-bengali text-xs">
            <p className="font-bold">অ্যাপের নতুন ভার্সন পাওয়া গেছে</p>
            <p className="text-slate-300 text-[11px]">আপডেট করতে রিফ্রেশ বাটনে ক্লিক করুন</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setPwaUpdateApply(null)}
              className="px-2.5 py-1.5 text-xs text-slate-300 hover:text-white rounded-lg font-bengali"
            >
              পরে
            </button>
            <button
              type="button"
              onClick={() => pwaUpdateApply()}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl font-bengali"
            >
              আপডেট করুন
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
