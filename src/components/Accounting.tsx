/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, FormEvent } from "react";
import { api } from "../services/api";
import { Wallet, Calculator, ArrowUpCircle, ArrowDownCircle, Plus, Search, Filter, Trash2, Edit, X } from "lucide-react";
import { motion } from "motion/react";
import { Expense, User } from "../types";
import { getDhakaDateString, formatDhakaDate } from "../lib/utils";

interface AccountingProps {
  user: User | null;
}

export function Accounting({ user }: AccountingProps) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [formData, setFormData] = useState<Partial<Expense>>({
    category: "",
    amount: 0,
    note: "",
    date: getDhakaDateString()
  });
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);

  const showNotify = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    loadData();

    const unsubExp = api.subscribeExpenses((items) => {
      setExpenses(items);
      api.getDashboardStats(user).then(setStats);
    });

    return () => {
      unsubExp();
    };
  }, [isAdmin, user]);

  const loadData = async () => {
    try {
      const filterId = isAdmin ? undefined : user?.id;
      const [expList, dashboardStats] = await Promise.all([
        api.getExpenses(filterId),
        api.getDashboardStats(user)
      ]);
      setExpenses(expList);
      setStats(dashboardStats);
    } catch (err) {
      console.error("Load Error:", err);
    }
  };

  const handleCreateOrUpdate = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (editingExpense) {
        await api.updateExpense(editingExpense.id, formData);
        showNotify("ব্যয় বিবরণ আপডেট করা হয়েছে");
      } else {
        await api.createExpense({ ...formData, userId: user?.id || "1" });
        showNotify("নতুন ব্যয় যোগ করা হয়েছে");
      }
      setShowModal(false);
      resetForm();
      loadData();
    } catch (err) {
      showNotify("ব্যর্থ হয়েছে!", "error");
    }
  };

  const confirmDelete = (id: string) => {
    setDeleteId(id);
    setShowDeleteModal(true);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const success = await api.deleteExpense(deleteId);
      if (success) {
        showNotify("ব্যয় বিবরণ মুছে ফেলা হয়েছে");
        loadData();
      }
    } catch (err) {
      showNotify("মুছে ফেলা সম্ভব হয়নি", "error");
    } finally {
      setShowDeleteModal(false);
      setDeleteId(null);
    }
  };

  const resetForm = () => {
    setFormData({
      category: "",
      amount: 0,
      note: "",
      date: getDhakaDateString()
    });
    setEditingExpense(null);
  };

  const openAddModal = () => {
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (expense: Expense) => {
    setEditingExpense(expense);
    setFormData(expense);
    setShowModal(true);
  };

  const filtered = expenses.filter(e => 
    e.category.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (e.note && e.note.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const categories = ["দোকান ভাড়া", "বিদ্যুৎ বিল", "বেতন (স্টাফ)", "যাতায়াত খরচ", "মার্কেটিং", "অন্যান্য"];

  return (
    <div className="p-6 space-y-6 bg-slate-50 dark:bg-slate-950 transition-colors duration-300 min-h-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white font-bengali">হিসাব-নিকাশ</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm font-bengali">আপনার ব্যবসার আয় এবং ব্যয়ের পূর্ণাঙ্গ হিসাব</p>
        </div>
        <button 
          onClick={openAddModal}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20 font-bengali"
        >
          <Plus size={20} />
          <span>নতুন খরচ যোগ করুন</span>
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden group transition-colors">
          <div className="absolute top-0 right-0 p-4 opacity-5 dark:opacity-10 group-hover:scale-110 transition-transform">
            <ArrowUpCircle size={80} className="text-slate-900 dark:text-slate-100" />
          </div>
          <div className="flex items-center gap-4 mb-4 relative z-10">
            <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center justify-center">
              <ArrowUpCircle size={24} />
            </div>
            <div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest font-bengali">মোট আয় (চলতি মাস)</p>
              <h3 className="text-2xl font-black text-slate-900 dark:text-slate-100 font-sans tracking-tight">৳ {stats?.monthlySales || 0}</h3>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden group transition-colors">
          <div className="absolute top-0 right-0 p-4 opacity-5 dark:opacity-10 group-hover:scale-110 transition-transform">
            <ArrowDownCircle size={80} className="text-slate-900 dark:text-slate-100" />
          </div>
          <div className="flex items-center gap-4 mb-4 relative z-10">
            <div className="w-12 h-12 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 rounded-xl flex items-center justify-center">
              <ArrowDownCircle size={24} />
            </div>
            <div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest font-bengali">মোট ব্যয় (চলতি মাস)</p>
              <h3 className="text-2xl font-black text-slate-900 dark:text-slate-100 font-sans tracking-tight">৳ {stats?.totalExpense || 0}</h3>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden group transition-colors">
          <div className="absolute top-0 right-0 p-4 opacity-5 dark:opacity-10 group-hover:scale-110 transition-transform">
            <Wallet size={80} className="text-slate-900 dark:text-slate-100" />
          </div>
          <div className="flex items-center gap-4 mb-4 relative z-10">
            <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center">
              <Wallet size={24} />
            </div>
            <div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest font-bengali">নিট ব্যালেন্স</p>
              <h3 className="text-2xl font-black text-slate-900 dark:text-slate-100 font-sans tracking-tight">৳ {(stats?.monthlySales || 0) - (stats?.totalExpense || 0)}</h3>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-colors">
        <div className="p-6 border-b border-slate-50 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 sticky top-0 z-10 font-bengali transition-colors">
          <h3 className="font-bold text-slate-900 dark:text-white">খরচের বিবরণ</h3>
          <div className="flex gap-2">
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors" size={14} />
              <input 
                type="text" 
                placeholder="অনুসন্ধান..." 
                className="pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-primary/20 transition-all w-48 focus:w-64 font-bengali"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-widest transition-colors">
                <th className="px-6 py-4 font-bengali">তারিখ</th>
                <th className="px-6 py-4 font-bengali">ক্যাটাগরি</th>
                <th className="px-6 py-4 font-bengali">নোট/বিবরণ</th>
                <th className="px-6 py-4 font-bengali">টাকার পরিমাণ</th>
                <th className="px-6 py-4 font-bengali text-right">অ্যাকশন</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 transition-colors">
              {filtered.map((expense) => (
                <tr key={expense.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors group">
                  <td className="px-6 py-4 text-sm font-medium text-slate-600 dark:text-slate-300 font-sans">{formatDhakaDate(expense.date, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                  <td className="px-6 py-4">
                    <span className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-[10px] font-bold font-sans uppercase tracking-widest">{expense.category}</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400 font-bengali max-w-md truncate" title={expense.note}>{expense.note || '-'}</td>
                  <td className="px-6 py-4 font-bold text-rose-500 dark:text-rose-400 font-sans">৳ {expense.amount}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => openEditModal(expense)}
                        className="p-2 text-slate-400 dark:text-slate-500 hover:text-primary dark:hover:text-blue-400 hover:bg-primary/5 dark:hover:bg-slate-800 rounded-lg transition-colors"
                      >
                        <Edit size={16} />
                      </button>
                      <button 
                        onClick={() => confirmDelete(expense.id)}
                        className="p-2 text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-20 text-center text-slate-400 font-bengali">
                    কোনো তথ্য পাওয়া যায়নি
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 transition-colors">
            <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 transition-colors">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white font-bengali">
                {editingExpense ? "ব্যয় এডিট করুন" : "নতুন ব্যয় যোগ করুন"}
              </h2>
              <button 
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-slate-400 dark:text-slate-500"
              >
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleCreateOrUpdate} className="p-8 space-y-6 font-bengali">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700 dark:text-slate-300">তারিখ</label>
                    <input 
                      required 
                      type="date" 
                      className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-lg py-1.5 px-3 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/20 outline-none transition-all font-sans text-sm"
                      value={formData.date}
                      onChange={e => setFormData({ ...formData, date: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700 dark:text-slate-300">টাকার পরিমাণ</label>
                    <input 
                      required 
                      type="text" 
                      inputMode="decimal"
                      className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-lg py-1.5 px-3 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/20 outline-none transition-all font-sans font-bold text-sm"
                      value={formData.amount ?? ""}
                      onChange={e => {
                        const val = e.target.value;
                        if (val === "" || /^\d*\.?\d*$/.test(val)) {
                          setFormData({ ...formData, amount: val as any });
                        }
                      }}
                      onBlur={() => setFormData({ ...formData, amount: Number(formData.amount || 0) })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300">ক্যাটাগরি</label>
                  <select 
                    required
                    className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-lg py-1.5 px-3 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/20 outline-none transition-all font-sans text-sm"
                    value={formData.category}
                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                  >
                    <option value="">সিলেক্ট করুন</option>
                    {categories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300">বিস্তারিত নোট (ঐচ্ছিক)</label>
                  <textarea 
                    className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-lg py-1.5 px-3 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/20 outline-none transition-all resize-none text-sm"
                    rows={2}
                    placeholder="খরচ সম্পর্কে বিস্তারিত লিখুন..."
                    value={formData.note}
                    onChange={e => setFormData({ ...formData, note: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-4 pt-4">
                <button 
                  type="button" 
                  onClick={() => setShowModal(false)}
                  className="px-6 py-2 rounded-xl text-slate-500 dark:text-slate-400 font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  বাতিল
                </button>
                <button 
                  type="submit" 
                  className="px-8 py-2 bg-primary dark:bg-blue-600 text-white rounded-xl font-bold hover:opacity-90 shadow-lg shadow-primary/20 dark:shadow-blue-900/20 transition-all transform active:scale-95"
                >
                  নিশ্চিত করুন
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md p-8 shadow-2xl animate-in zoom-in-95 duration-200 border dark:border-slate-800 transition-colors">
            <div className="w-16 h-16 bg-rose-50 dark:bg-rose-900/20 text-rose-500 rounded-2xl flex items-center justify-center mb-6 mx-auto">
              <Trash2 size={32} />
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 text-center mb-2 font-bengali">মুছে ফেলতে চান?</h3>
            <p className="text-slate-500 dark:text-slate-400 text-center mb-8 font-bengali">এই খরচ বিবরণটি চিরতরের জন্য মুছে যাবে। আপনি কি নিশ্চিত?</p>
            <div className="flex gap-4">
              <button 
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-600 dark:text-slate-300 font-bold font-bengali hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                বাতিল করুন
              </button>
              <button 
                onClick={handleDelete}
                className="flex-1 px-4 py-3 bg-rose-500 text-white rounded-xl font-bold font-bengali hover:bg-rose-600 transition-colors shadow-lg shadow-rose-200 dark:shadow-rose-900/20"
              >
                হ্যাঁ, মুছে ফেলুন
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {notification && (
        <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 px-6 py-3 rounded-2xl shadow-xl z-[100] animate-in slide-in-from-bottom duration-300 flex items-center gap-3 ${
          notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
        }`}>
          <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center font-bold">
            {notification.type === 'success' ? '✓' : '!'}
          </div>
          <span className="font-bold font-bengali">{notification.message}</span>
        </div>
      )}
    </div>
  );
}
