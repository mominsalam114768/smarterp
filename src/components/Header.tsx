/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Search, Bell, User, Plus, LogOut, Sun, Moon } from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Business } from "../types";

interface HeaderProps {
  onLogout: () => void;
  onNewSale: () => void;
  user: { email: string; name: string; role?: string };
  theme: "light" | "dark";
  toggleTheme: () => void;
  business?: Business | null;
  onOpenSettings?: () => void;
}

export function Header({ onLogout, onNewSale, user, theme, toggleTheme, business, onOpenSettings }: HeaderProps) {
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const roleName = user.role === 'admin' ? 'অ্যাডমিন' : (user.role === 'manager' ? 'ম্যানেজার' : (user.role === 'salesman' ? 'সেলসম্যান' : 'স্টাফ'));

  return (
    <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-3 md:px-8 flex items-center justify-between sticky top-0 z-10 transition-colors duration-300">
      <div className="flex items-center gap-2 md:gap-4 flex-1">
        <div className="relative w-full max-w-[120px] xs:max-w-[160px] sm:max-w-md group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors h-4 w-4 sm:h-[16px] sm:w-[16px]" />
          <input 
            type="text" 
            placeholder="খুঁজুন..." 
            className="w-full bg-slate-100 dark:bg-slate-800 border-none rounded-lg py-2 pl-9 pr-2 sm:pl-10 sm:pr-4 focus:bg-white dark:focus:bg-slate-700 focus:ring-4 focus:ring-blue-50 dark:focus:ring-blue-900/20 transition-all font-bengali text-[12px] sm:text-sm outline-none text-slate-800 dark:text-slate-200"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-3">
        <button 
          onClick={onNewSale}
          className="flex items-center justify-center gap-2 px-3 md:px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-all shadow-lg shadow-blue-200 text-sm font-semibold"
          title="নতুন বিক্রি"
        >
          <Plus size={18} />
          <span className="hidden sm:inline font-sans">নতুন বিক্রি</span>
        </button>

        <button
          onClick={toggleTheme}
          className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-primary dark:hover:text-blue-400 transition-all active:scale-95"
          title={theme === "light" ? "ডার্ক মোড" : "লাইট মোড"}
        >
          {theme === "light" ? <Moon size={20} /> : <Sun size={20} />}
        </button>

        <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-primary transition-colors cursor-pointer relative">
          <Bell size={20} />
          <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white dark:border-slate-800" />
        </div>

        <div className="relative">
          <button 
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="flex items-center gap-2 p-1 pl-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-colors"
          >
            <div className="text-right hidden sm:block">
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200 leading-none">{user.name}</p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mt-1 font-bengali">{roleName}</p>
            </div>
            <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-700 dark:text-blue-400">
              <User size={18} />
            </div>
          </button>
 
          <AnimatePresence>
            {showProfileMenu && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl shadow-slate-200/50 dark:shadow-none p-2 overflow-hidden"
              >
                <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 mb-2">
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{user.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{user.email}</p>
                </div>
                <button 
                  onClick={onLogout}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-all"
                >
                  <LogOut size={16} />
                  লগ আউট (Logout)
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
