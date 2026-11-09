import React from "react";
import { 
  LayoutDashboard, 
  ShoppingCart, 
  FileText, 
  Package, 
  Users,
  Send,
  MoreHorizontal,
  CreditCard,
  Target,
  BarChart3,
  Settings as SettingsIcon,
  Truck,
  ClipboardCheck
} from "lucide-react";
import { cn } from "../lib/utils";
import { User } from "../types";
import { motion } from "motion/react";

interface MobileNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  user: User | null;
}

export function MobileNav({ activeTab, setActiveTab, user }: MobileNavProps) {
  const navItems = [
    { id: "dashboard", label: "হোম", icon: LayoutDashboard },
    { id: "pos", label: "পিওএস", icon: ShoppingCart },
    { id: "sales", label: "বিক্রয়", icon: FileText },
    { id: "approvals", label: "অনুমোদন", icon: ClipboardCheck },
    { id: "products", label: "পণ্য", icon: Package },
    { id: "customers", label: "ক্রেতা", icon: Users },
    { id: "suppliers", label: "সরবরাহকারী", icon: Truck },
    { id: "accounting", label: "হিসাব", icon: CreditCard },
    { id: "due", label: "বকেয়া", icon: Target },
    { id: "reports", label: "রিপোর্ট", icon: BarChart3 },
    { id: "sms", label: "এসএমএস", icon: Send },
    { id: "users", label: "ইউজার", icon: Users },
    { id: "settings", label: "সেটিংস", icon: SettingsIcon },
  ];

  const filteredItems = navItems.filter(item => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    if (item.id === 'approvals') return false; // Strictly admin only
    return user.permissions?.includes(item.id);
  });

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 z-50 px-1 pb-safe-area-inset-bottom shadow-[0_-4px_15px_-3px_rgba(0,0,0,0.05)]">
      <div className="flex items-center gap-1 h-16 overflow-x-auto no-scrollbar scroll-smooth px-2">
        {filteredItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={cn(
              "flex flex-col items-center justify-center min-w-[64px] h-full gap-0.5 transition-all relative",
              activeTab === item.id 
                ? "text-blue-600 dark:text-blue-400" 
                : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
            )}
          >
            <div className={cn(
              "p-1.5 rounded-xl transition-all duration-300",
              activeTab === item.id ? "bg-blue-50 dark:bg-blue-900/20 scale-105" : ""
            )}>
              <item.icon size={20} strokeWidth={activeTab === item.id ? 2.5 : 2} />
            </div>
            <span className={cn(
              "text-[9px] font-bold font-bengali tracking-tighter whitespace-nowrap",
              activeTab === item.id ? "opacity-100" : "opacity-80"
            )}>
              {item.label}
            </span>
            {activeTab === item.id && (
              <motion.span 
                layoutId="activeTab"
                className="absolute bottom-0 w-8 h-1 bg-blue-600 dark:bg-blue-400 rounded-t-full" 
              />
            )}
          </button>
        ))}
      </div>
    </nav>
  );
}
