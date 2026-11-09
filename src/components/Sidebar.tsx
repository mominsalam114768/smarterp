/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  LayoutDashboard, 
  ShoppingCart, 
  Package, 
  Users, 
  Truck, 
  FileText, 
  Settings as SettingsIcon, 
  ChevronLeft, 
  ChevronRight,
  Calculator,
  MessageSquare,
  Activity,
  UserCheck,
  Building2,
  Wallet,
  ClipboardCheck
} from "lucide-react";
import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { cn } from "../lib/utils";
import { api } from "../services/api";
import { User, Business } from "../types";

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  user: User | null;
  business: Business | null;
}

const menuItems = [
  { id: "dashboard", label: "ড্যাশবোর্ড", icon: LayoutDashboard },
  { id: "pos", label: "পিওএস (POS)", icon: ShoppingCart },
  { id: "sales", label: "বিক্রয়", icon: FileText },
  { id: "approvals", label: "অনুমোদন রিকুয়েস্ট", icon: ClipboardCheck },
  { id: "products", label: "পণ্য তালিকা", icon: Package },
  { id: "customers", label: "ক্রেতা", icon: Users },
  { id: "suppliers", label: "সরবরাহকারী", icon: Truck },
  { id: "accounting", label: "হিসাব", icon: Calculator },
  { id: "due", label: "বকেয়া", icon: Wallet },
  { id: "sms", label: "এসএমএস", icon: MessageSquare },
  { id: "reports", label: "রিপোর্ট", icon: Activity },
  { id: "users", label: "ইউজার", icon: UserCheck },
  { id: "settings", label: "সেটিংস", icon: SettingsIcon },
];

export function Sidebar({ activeTab, setActiveTab, user, business }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);

  useEffect(() => {
    const unsub = api.subscribeApprovalRequests((reqs) => {
      const pending = reqs.filter(r => r.status === 'pending');
      setPendingApprovalsCount(pending.length);
    }, user?.role === 'admin' ? undefined : user?.id);
    return () => unsub();
  }, [user]);

  const filteredMenuItems = menuItems.filter(item => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    if (item.id === 'approvals') return false; // Strictly admin only
    return user.permissions?.includes(item.id);
  });

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1280) {
        setIsCollapsed(true);
      } else {
        setIsCollapsed(false);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <motion.div 
      initial={false}
      animate={{ width: isCollapsed ? 80 : 280 }}
      className="h-screen bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col sticky top-0 overflow-hidden transition-colors duration-300"
    >
      <div className="shrink-0 p-5 flex items-center justify-between border-b border-slate-100 dark:border-slate-800 bg-gradient-to-br from-white to-slate-50 dark:from-slate-900 dark:to-slate-800/50">
        {!isCollapsed && (
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="shrink-0 flex items-center justify-center">
              {business?.logo ? (
                <div className="relative">
                  <div className="absolute -inset-1 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-lg blur-[2px] opacity-20"></div>
                  <img src={business.logo} alt="Logo" className="h-10 w-auto max-w-[50px] object-contain relative bg-white dark:bg-slate-900 p-0.5 rounded-lg border border-slate-100 dark:border-slate-700 shadow-sm" />
                </div>
              ) : (
                <div className="w-10 h-10 flex items-center justify-center text-white bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl shadow-lg shadow-blue-500/20">
                  <Building2 size={24} />
                </div>
              )}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-black tracking-tight text-slate-800 dark:text-slate-100 font-bengali truncate leading-tight group-hover:text-blue-600 transition-colors">
                {business?.name || "হিসাব পাতি"}
              </span>
              <span className="text-[9px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest leading-none mt-1">Smart Business</span>
            </div>
          </div>
        )}
        {isCollapsed && (
          <div className="mx-auto mb-2">
             {business?.logo ? (
                <img src={business.logo} alt="Logo" className="h-8 w-8 object-contain rounded-lg shadow-sm bg-white dark:bg-slate-800 p-0.5" />
             ) : (
                <div className="w-8 h-8 flex items-center justify-center text-white bg-blue-600 rounded-lg">
                  <Building2 size={18} />
                </div>
             )}
          </div>
        )}
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          className={cn(
            "p-2 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 rounded-xl text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-all active:scale-90",
            isCollapsed && "mt-2"
          )}
        >
          {isCollapsed ? <ChevronRight size={20} strokeWidth={3} /> : <ChevronLeft size={20} strokeWidth={3} />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-6 px-4 space-y-1 min-h-0 [scrollbar-width:thin] [scrollbar-color:theme(colors.slate.200)_transparent] dark:[scrollbar-color:theme(colors.slate.800)_transparent]">
        {filteredMenuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all group relative duration-200",
              activeTab === item.id 
                ? "bg-blue-600 text-white shadow-lg shadow-blue-200 dark:shadow-blue-900/40 font-bold" 
                : "text-slate-500 dark:text-slate-400 hover:bg-slate-100/70 dark:hover:bg-slate-800/70"
            )}
          >
            <item.icon size={20} className={activeTab === item.id ? "text-white" : "text-slate-400 dark:text-slate-500 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors"} />
            {!isCollapsed && (
              <span className="font-bengali text-sm flex-1 text-left flex items-center justify-between">
                <span>{item.label}</span>
                {item.id === "approvals" && pendingApprovalsCount > 0 && (
                  <span className="bg-amber-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full animate-pulse shadow-sm">
                    {pendingApprovalsCount}
                  </span>
                )}
              </span>
            )}
            {isCollapsed && item.id === "approvals" && pendingApprovalsCount > 0 && (
              <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-amber-500 rounded-full animate-ping" />
            )}
            {activeTab === item.id && !isCollapsed && (
              <motion.div 
                layoutId="active-nav"
                className="ml-auto w-1.5 h-1.5 bg-white rounded-full" 
              />
            )}
          </button>
        ))}
      </div>

      <div className="shrink-0 p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900 transition-colors duration-300">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold shadow-inner">
            M
          </div>
          {!isCollapsed && (
            <div className="overflow-hidden">
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold leading-none mb-1">Powerd by Momin</p>
              <p className="text-xs font-black text-slate-800 dark:text-slate-200 truncate">01741456838</p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
