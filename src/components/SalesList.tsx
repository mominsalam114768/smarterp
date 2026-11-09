/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, MouseEvent } from "react";
import { api } from "../services/api";
import { Sale, User } from "../types";
import { FileText, Search, Filter, Printer, Eye, Trash2 } from "lucide-react";
import { printInvoice, printReport } from "../lib/printUtils";
import { formatDhakaDate, formatDhakaTime, formatDhakaDateTime } from "../lib/utils";

interface SalesListProps {
  user: User | null;
}

export function SalesList({ user }: SalesListProps) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("all");

  const isAdmin = user?.role === 'admin';
  const canDelete = isAdmin || user?.permissions?.includes('delete_sale');

  const fetchSales = () => {
    api.getSales().then(items => {
      // Data Isolation: Filter sales by userId if not admin
      const filtered = isAdmin ? items : items.filter(s => s.userId === user?.id);
      setSales(filtered);
    });
  };

  const showNotify = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  useEffect(() => {
    fetchSales();
    if (isAdmin) {
      api.getUsers().then(setUsers);
    }

    const unsubSales = api.subscribeSales((items) => {
      const filtered = isAdmin ? items : items.filter(s => s.userId === user?.id);
      setSales(filtered);
    });

    return () => {
      unsubSales();
    };
  }, [isAdmin, user?.id]);

  const handleDeleteSale = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget;
    
    try {
      const success = await api.deleteSale(id);
      if (success) {
        setSales(prev => prev.filter(s => s.id !== id));
        showNotify("বিক্রয়টি সফলভাবে ডিলিট হয়েছে।");
        fetchSales();
      } else {
        showNotify("ডিলিট করতে সমস্যা হয়েছে!", "error");
      }
    } catch (error) {
      console.error("Delete error:", error);
      showNotify("একটি ত্রুটি ঘটেছে!", "error");
    } finally {
      setDeleteTarget(null);
    }
  };

  const filtered = sales.filter(s => {
    const matchesSearch = s.invoiceNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (s.customerName && s.customerName.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesUser = selectedUserId === "all" ? true : (s.userId === selectedUserId || s.createdBy === selectedUserId);
    return matchesSearch && matchesUser;
  });

  const handlePrintListReport = async (e: MouseEvent) => {
    e.stopPropagation();
    if (filtered.length === 0) {
      showNotify("প্রিন্ট করার জন্য কোনো ডাটা নেই!", "error");
      return;
    }
    const totalAmount = filtered.reduce((acc, sale) => acc + (Number(sale.totalAmount) || 0), 0);
    const totalPayable = filtered.reduce((acc, sale) => acc + (Number(sale.payableAmount) || 0), 0);
    const totalPaid = filtered.reduce((acc, sale) => acc + (Number(sale.paidAmount) || 0), 0);
    const totalDue = filtered.reduce((acc, sale) => acc + (Number(sale.dueAmount) || 0), 0);

    const data = [
      { label: "মোট চালানের সংখ্যা", value: `${filtered.length} টি` },
      { label: "মোট পণ্যের মূল্য", value: `৳ ${totalAmount}` },
      { label: "ভ্যাট সহ মোট দেয়", value: `৳ ${totalPayable}` },
      { label: "মোট সংগৃহীত টাকা", value: `৳ ${totalPaid}` },
      { label: "মোট বকেয়া", value: `৳ ${totalDue}` },
    ];

    showNotify("রিপোর্ট প্রিন্ট লেআউট তৈরি হচ্ছে...");
    await printReport("বিক্রয় তালিকা রিপোর্ট (Sales List Report)", data);
  };

  return (
    <div className="p-6 space-y-6 bg-slate-50 dark:bg-slate-950 transition-colors duration-300 min-h-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white font-bengali">বিক্রয় তালিকা</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm font-bengali">আপনার আউটলেটের সব বিক্রয়ের ইতিহাস এখানে দেখুন</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={(e) => handlePrintListReport(e)}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm font-bengali text-sm font-medium cursor-pointer"
          >
            <Printer size={18} className="pointer-events-none" />
            <span>রিপোর্ট প্রিন্ট</span>
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row gap-4 transition-colors">
        <div className="relative flex-1 group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors" size={18} />
          <input 
            type="text" 
            placeholder="চালান নং বা কাস্টমার খুঁজুন..." 
            className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-xl py-2 pl-10 pr-4 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/20 transition-all font-bengali outline-none"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        
        {isAdmin && (
          <div className="md:w-64">
            <select 
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-xl py-2 px-4 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/20 outline-none font-bengali transition-all"
            >
              <option value="all">সকল ইউজার</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name} ({u.role === 'admin' ? 'অ্যাডমিন' : 'সেলসম্যান'})</option>
              ))}
            </select>
          </div>
        )}
        <button className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors font-bengali">
          <Filter size={18} />
          <span>ফিল্টার</span>
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-colors">
        <div className="overflow-x-auto">
          <table className="w-full text-left font-sans">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-widest font-sans">
                <th className="px-6 py-4">চালান নং</th>
                <th className="px-6 py-4">কাস্টমার</th>
                <th className="px-6 py-4">তারিখ ও সময়</th>
                <th className="px-6 py-4">মোট টাকা</th>
                <th className="px-6 py-4">পেইড</th>
                <th className="px-6 py-4">অবস্থা</th>
                <th className="px-6 py-4 text-right">অ্যাকশন</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((sale) => (
                <tr key={sale.id} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg flex items-center justify-center text-[10px] font-bold">INV</div>
                      <span className="font-bold text-slate-900 dark:text-slate-100">{sale.invoiceNo}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 font-bold text-slate-700 dark:text-slate-300 font-bengali">
                    {sale.customerName || "Walking Customer"}
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-slate-600 dark:text-slate-400 font-medium font-sans">{formatDhakaDate(sale.createdAt, { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold font-sans">{formatDhakaTime(sale.createdAt, { hour: '2-digit', minute:'2-digit', hour12: true })} (ঢাকা সময়)</p>
                  </td>
                  <td className="px-6 py-4 font-bold text-slate-900 dark:text-slate-100">৳ {sale.payableAmount}</td>
                  <td className="px-6 py-4">
                    <p className="font-bold text-emerald-600 dark:text-emerald-500">৳ {sale.paidAmount}</p>
                    {sale.dueAmount > 0 && <p className="text-[10px] text-rose-500 font-bold">Due: ৳ {sale.dueAmount}</p>}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${sale.dueAmount === 0 ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-500' : 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-500'}`}>
                      {sale.dueAmount === 0 ? 'PAID' : 'DUE'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2 text-slate-400 dark:text-slate-500">
                      <button 
                        onClick={(e) => { e.stopPropagation(); setSelectedSale(sale); }}
                        className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg transition-colors cursor-pointer group/btn"
                        title=" বিস্তারিত দেখুন"
                      >
                        <Eye size={16} className="pointer-events-none" />
                      </button>
                      <button 
                        onClick={async (e) => { 
                          e.stopPropagation(); 
                          showNotify("ইনভয়েস প্রিন্ট লেআউট তৈরি হচ্ছে...");
                          await printInvoice(sale); 
                        }}
                        className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 rounded-lg transition-colors cursor-pointer group/btn"
                        title="প্রিন্ট ইনভয়েস"
                      >
                        <Printer size={16} className="pointer-events-none" />
                      </button>
                      {canDelete && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); setDeleteTarget(sale.id); }}
                          className="p-2 hover:bg-rose-50 dark:hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg transition-colors cursor-pointer group/btn"
                          title="ডিলিট করুন"
                        >
                          <Trash2 size={16} className="pointer-events-none" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center text-slate-400 dark:text-slate-600 font-bengali">কোনো বিক্রয় তথ্য পাওয়া যায়নি</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sale Detail Modal */}
      {selectedSale && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-in fade-in zoom-in duration-200 transition-colors">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 transition-colors">
              <div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white font-bengali">বিক্রয় বিস্তারিত: #{selectedSale.invoiceNo}</h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm font-bengali">{formatDhakaDateTime(selectedSale.createdAt)} (ঢাকা সময়)</p>
              </div>
              <button 
                onClick={() => setSelectedSale(null)}
                className="p-2 hover:bg-white dark:hover:bg-slate-700 rounded-xl text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors shadow-sm"
              >
                <Search className="rotate-45" size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 space-y-6 custom-scrollbar">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1 font-sans">কাস্টমার</p>
                  <p className="font-bold text-slate-900 dark:text-slate-100 font-bengali text-lg">{selectedSale.customerName || "Walking Customer"}</p>
                  <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1 mt-1">
                    {selectedSale.customerPhone && <p className="font-sans">ফোন: {selectedSale.customerPhone}</p>}
                    {selectedSale.customerAddress && <p className="font-bengali">ঠিকানা: {selectedSale.customerAddress}</p>}
                    <p>ID: {selectedSale.customerId}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1 font-sans">পেমেন্ট মেথড</p>
                  <span className="px-3 py-1 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-full text-xs font-bold uppercase">{selectedSale.paymentMethod}</span>
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl overflow-hidden border border-slate-100 dark:border-slate-800 transition-colors">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase font-sans">
                      <th className="px-4 py-3">পণ্য</th>
                      <th className="px-4 py-3 text-center">পরিমাণ</th>
                      <th className="px-4 py-3 text-right">মূল্য</th>
                      <th className="px-4 py-3 text-right">মোট</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 italic">
                    {selectedSale.items.map((item, idx) => (
                      <tr key={idx} className="text-sm text-slate-700 dark:text-slate-300">
                        <td className="px-4 py-3 font-medium">{item.name}</td>
                        <td className="px-4 py-3 text-center font-bold font-sans">{item.quantity}</td>
                        <td className="px-4 py-3 text-right font-sans">৳ {item.unitPrice}</td>
                        <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-white font-sans">৳ {item.subtotal}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-4 max-w-xs ml-auto transition-colors">
                <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                  <span className="font-bengali">মোট বিল:</span>
                  <span className="font-bold font-sans">৳ {selectedSale.totalAmount}</span>
                </div>
                <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                  <span className="font-bengali">ছাড়:</span>
                  <span className="font-bold text-rose-500 font-sans">- ৳ {selectedSale.discount}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-t border-slate-200 dark:border-slate-700 transition-colors">
                  <span className="text-lg font-bold text-slate-900 dark:text-white font-bengali">সর্বমোট:</span>
                  <span className="text-2xl font-bold text-primary dark:text-blue-400 font-sans">৳ {selectedSale.payableAmount}</span>
                </div>
                <div className="flex justify-between items-center text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-1 rounded-lg">
                  <span className="font-bold font-bengali">পরিশোধিত:</span>
                  <span className="font-bold font-sans">৳ {selectedSale.paidAmount}</span>
                </div>
                {selectedSale.dueAmount > 0 && (
                  <div className="flex justify-between items-center text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 px-3 py-1 rounded-lg">
                    <span className="font-bold font-bengali">বকেয়া:</span>
                    <span className="font-bold font-sans">৳ {selectedSale.dueAmount}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex gap-4 transition-colors">
              <button 
                onClick={() => setSelectedSale(null)}
                className="flex-1 px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-600 dark:text-slate-300 font-bold font-bengali hover:bg-white dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                বন্ধ করুন
              </button>
              <button 
                onClick={async (e) => {
                  e.stopPropagation();
                  showNotify("ইনভয়েস প্রিন্ট লেআউট তৈরি হচ্ছে...");
                  await printInvoice(selectedSale);
                  setSelectedSale(null);
                }}
                className="flex-[2] px-4 py-3 bg-primary dark:bg-blue-600 text-white rounded-xl font-bold font-bengali hover:opacity-90 transition-opacity shadow-lg shadow-primary/20 dark:shadow-blue-900/20 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Printer size={20} className="pointer-events-none" />
                প্রিন্ট করুন
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md p-8 shadow-2xl animate-in zoom-in fade-in duration-200 transition-colors">
            <div className="w-16 h-16 bg-rose-50 dark:bg-rose-900/20 text-rose-500 rounded-2xl flex items-center justify-center mb-6 mx-auto">
              <Trash2 size={32} />
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 text-center mb-2 font-bengali">বিক্রয়টি ডিলিট করতে চান?</h3>
            <p className="text-slate-500 dark:text-slate-400 text-center mb-8 font-bengali">এটি ডিলিট করলে আইটেমগুলো পুনরায় স্টকে যোগ হয়ে যাবে। এই অ্যাকশনটি রিভার্স করা যাবে না।</p>
            <div className="flex gap-4">
              <button 
                onClick={() => setDeleteTarget(null)}
                className="flex-1 px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-600 dark:text-slate-300 font-bold font-bengali hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                বাতিল করুন
              </button>
              <button 
                onClick={handleDeleteSale}
                className="flex-1 px-4 py-3 bg-rose-500 text-white rounded-xl font-bold font-bengali hover:bg-rose-600 transition-colors shadow-lg shadow-rose-200 dark:shadow-rose-900/20"
              >
                হ্যাঁ, ডিলিট করুন
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notification Toast */}
      {notification && (
        <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 px-6 py-3 rounded-2xl shadow-xl z-[100] animate-in slide-in-from-bottom duration-300 flex items-center gap-3 ${
          notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
        }`}>
          <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
            {notification.type === 'success' ? '✓' : '!'}
          </div>
          <span className="font-bold font-bengali">{notification.message}</span>
        </div>
      )}
    </div>
  );
}
