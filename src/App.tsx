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
import { Printer, X, Download, FileText, Building2, Mail, Lock, ArrowRight, Loader2, User as UserIcon, Phone, ShieldCheck, Sparkles } from "lucide-react";
// @ts-ignore - html2pdf doesn't have built-in types
import html2pdf from 'html2pdf.js';
import { setApiBusinessId, api } from "./services/api";
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
import { auth, db, doc, getDoc, setDoc, collection, query, where, getDocs, limit } from "./lib/firebase";

// Lazy Load Components
const Dashboard = lazy(() => import("./components/Dashboard").then(m => ({ default: m.Dashboard })));
const POS = lazy(() => import("./components/POS").then(m => ({ default: m.POS })));
const ProductList = lazy(() => import("./components/ProductList").then(m => ({ default: m.ProductList })));
const CustomerList = lazy(() => import("./components/CustomerList").then(m => ({ default: m.CustomerList })));
const SalesList = lazy(() => import("./components/SalesList").then(m => ({ default: m.SalesList })));
const SupplierList = lazy(() => import("./components/SupplierList").then(m => ({ default: m.SupplierList })));
const Accounting = lazy(() => import("./components/Accounting").then(m => ({ default: m.Accounting })));
const Reports = lazy(() => import("./components/Reports").then(m => ({ default: m.Reports })));
const DueManagement = lazy(() => import("./components/DueManagement").then(m => ({ default: m.DueManagement })));
const SMSModule = lazy(() => import("./components/SMSModule").then(m => ({ default: m.SMSModule })));
const UserManagement = lazy(() => import("./components/UserManagement").then(m => ({ default: m.UserManagement })));
const Settings = lazy(() => import("./components/Settings").then(m => ({ default: m.Settings })));
const ApprovalManagement = lazy(() => import("./components/ApprovalManagement").then(m => ({ default: m.ApprovalManagement })));

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
  const [user, setUser] = useState<User | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [regName, setRegName] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regRole, setRegRole] = useState<'admin' | 'manager' | 'salesman'>('admin');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);
  
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
    // Initial Auth Check from persistent storage
    const checkAuth = async () => {
      const savedUser = sessionStorage.getItem("smart_business_user") || localStorage.getItem("smart_business_user");
      if (savedUser) {
        try {
          const userData = JSON.parse(savedUser);
          if (userData && userData.id && userData.email) {
            // Validate session with backend/firestore to prevent client-side bypass
            const verified = await api.verifySession(userData.id, userData.email);
            if (verified) {
              setUser(verified);
              setApiBusinessId(verified.businessId || "main-business");
            } else {
              // In case offline, keep local user
              setUser(userData);
              setApiBusinessId(userData.businessId || "main-business");
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
      }
      setIsInitializing(false);
    };

    checkAuth();

    const loadBusiness = async () => {
      try {
        const data = await api.getBusiness();
        setBusiness(data);
      } catch (err) {
        console.error("Failed to load business info:", err);
      }
    };
    loadBusiness();

    const handlePrint = (e: any) => {
      setPrintHtml(e.detail.html);
      setIsGeneratingPDF(false);
    };

    window.addEventListener('smart-print', handlePrint);
    return () => {
      window.removeEventListener('smart-print', handlePrint);
    };
  }, []);


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
      console.error("Login Fail:", err);
      setLoginError(err.message || "লগইন করা সম্ভব হয়নি।");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
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

    try {
      const newUser = await api.register({
        name: regName.trim(),
        email: email,
        password: password,
        phone: regPhone.trim(),
        role: regRole
      });
      handleLogin(newUser);
    } catch (err: any) {
      console.error("Register Fail:", err);
      setLoginError(err.message || "অ্যাকাউন্ট তৈরি করা সম্ভব হয়নি।");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleFillCredentials = (email: string, pass: string) => {
    setLoginEmail(email);
    setLoginPassword(pass);
    setLoginError(null);
  };

  const handleForgotPassword = async () => {
    if (!loginEmail.trim()) {
      setLoginError("পাসওয়ার্ড রিসেট করতে আগে ইমেইল এড্রেসটি লিখুন।");
      return;
    }
    
    setResetLoading(true);
    setLoginError(null);
    setResetSuccess(null);
    
    try {
      await sendPasswordResetEmail(auth, loginEmail.trim());
      setResetSuccess("আপনার ইমেইলে একটি পাসওয়ার্ড রিসেট লিংক পাঠানো হয়েছে। অনুগ্রহ করে ইমেইল চেক করুন।");
    } catch (err: any) {
      console.error("Reset Error:", err);
      setLoginError("পাসওয়ার্ড রিসেট লিংক পাঠানো যায়নি। ইমেইল কি সঠিক?");
    } finally {
      setResetLoading(false);
    }
  };

  const handleLogin = (userData: User) => {
    setUser(userData);
    setApiBusinessId(userData.businessId || "main-business");
    sessionStorage.setItem("smart_business_user", JSON.stringify(userData));
    localStorage.setItem("smart_business_user", JSON.stringify(userData));

    // If an activeTab was previously saved (e.g. before refresh), keep it if permitted
    const savedTab = localStorage.getItem("smart_business_active_tab");
    if (userData.role !== 'admin') {
      const allowed = ['dashboard', 'pos', 'sales', 'approvals', 'products', 'customers', 'suppliers', 'accounting', 'due', 'sms', 'reports'].filter(t => t === 'approvals' || userData.permissions?.includes(t));
      if (savedTab && allowed.includes(savedTab)) {
        setActiveTab(savedTab);
      } else if (allowed.length > 0 && !allowed.includes(activeTab)) {
        setActiveTab(allowed[0]);
      }
    } else if (savedTab) {
      setActiveTab(savedTab);
    }
  };

  const handleLogout = () => {
    setUser(null);
    setApiBusinessId(null);
    setLoginEmail("");
    setLoginPassword("");
    sessionStorage.removeItem("smart_business_user");
    localStorage.removeItem("smart_business_user");
    localStorage.removeItem("smart_business_active_tab");
  };

  const handleFinalPrint = () => {
    window.print();
  };

  const handleDownloadPDF = async () => {
    const element = document.querySelector('.preview-content-container > div');
    if (!element) return;
    setIsGeneratingPDF(true);
    
    try {
      const opt = {
        margin: [10, 10],
        filename: `smart-business-${new Date().getTime()}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { 
          scale: 3,
          useCORS: true, 
          letterRendering: true,
          scrollY: 0,
          onclone: (clonedDoc: Document) => {
            const target = clonedDoc.querySelector('.preview-content-container > div') as HTMLElement;
            if (target) {
              target.style.boxShadow = 'none';
              target.style.border = 'none';
              target.style.padding = '0';
              target.style.margin = '0';
            }
            clonedDoc.body.style.background = '#ffffff';
            clonedDoc.body.style.padding = '0';

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
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
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
    if (tabId === 'approvals') return false; // Strictly admin only
    
    // Explicitly check permissions array
    if (user.permissions && Array.isArray(user.permissions)) {
      return user.permissions.includes(tabId);
    }
    
    return false;
  };

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
              size: auto;
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
          <div className="bg-white w-full max-w-4xl max-h-[95vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in duration-300 text-slate-900">
            <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between bg-white">
              <div>
                <h3 className="text-xl font-black tracking-tight text-slate-900">প্রিন্ট প্রিভিউ</h3>
                <p className="hidden sm:block text-xs text-slate-500 font-medium">ডকুমেন্টটি প্রিন্ট করার আগে দেখে নিন</p>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={handleDownloadPDF}
                  disabled={isGeneratingPDF}
                  className="bg-blue-600 text-white px-4 sm:px-6 py-2 rounded-xl font-bold font-bengali shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all flex items-center gap-2 disabled:opacity-50 text-xs sm:text-sm"
                >
                  {isGeneratingPDF ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Download size={16} />
                  )}
                  <span>PDF</span>
                </button>
                <button 
                  onClick={handleFinalPrint}
                  className="bg-blue-600 text-white px-4 sm:px-6 py-2 rounded-xl font-bold font-bengali shadow-lg shadow-primary/20 hover:scale-105 transition-all flex items-center gap-2 text-xs sm:text-sm"
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
            <div className="flex-1 overflow-y-auto p-4 sm:p-12 bg-slate-100 text-slate-900 preview-content-container" ref={pdfContainerRef}>
              <div dangerouslySetInnerHTML={{ __html: printHtml }} className="mx-auto bg-white p-10" style={{ maxWidth: '800px', minHeight: '1000px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)', border: '1px solid #e2e8f0' }} />
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
                        type="password"
                        required
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        placeholder="আপনার পাসওয়ার্ড লিখুন"
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl py-3.5 pl-12 pr-4 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 focus:bg-white dark:focus:bg-slate-700 transition-all placeholder:text-slate-400"
                      />
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

                {/* Quick Fill / Demo Credentials Card */}
                <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800 text-left">
                  <div className="flex items-center gap-2 mb-3">
                    <ShieldCheck size={16} className="text-emerald-500" />
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 font-bengali">অ্যাডমিন লগইন তথ্য:</span>
                  </div>
                  
                  <div className="bg-slate-50 dark:bg-slate-800/80 p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-700 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 dark:text-slate-400 font-bengali">ইমেইল:</span>
                      <code className="bg-white dark:bg-slate-900 px-2 py-0.5 rounded text-blue-600 dark:text-blue-400 font-mono font-bold select-all">
                        mominkhan051220@gmail.com
                      </code>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 dark:text-slate-400 font-bengali">পাসওয়ার্ড:</span>
                      <code className="bg-white dark:bg-slate-900 px-2 py-0.5 rounded text-emerald-600 dark:text-emerald-400 font-mono font-bold select-all">
                        Momin1234@
                      </code>
                    </div>
                    <div className="pt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleFillCredentials("mominkhan051220@gmail.com", "Momin1234@")}
                        className="flex-1 py-1.5 px-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 rounded-xl font-bold font-bengali transition text-center"
                      >
                        ১-ক্লিকে ফিল করুন
                      </button>
                      <button
                        type="button"
                        onClick={() => handleFillCredentials("md.momin.khan7579@gmail.com", "Momin1234@")}
                        className="py-1.5 px-2.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 rounded-xl font-bold font-bengali transition text-center"
                        title="md.momin.khan7579@gmail.com"
                      >
                        বিকল্প ইমেইল
                      </button>
                    </div>
                  </div>
                </div>
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
              
              <main className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 transition-colors duration-300 custom-scrollbar pb-20 md:pb-0">
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
                  {activeTab === "settings" && canAccessTab("settings") && <Settings onBusinessUpdate={setBusiness} />}
                  
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
    </div>
  );
}
