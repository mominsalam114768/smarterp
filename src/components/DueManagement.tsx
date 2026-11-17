/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import { api } from "../services/api";
import { Customer, User } from "../types";
import { Search, DollarSign, User as UserIcon, Phone, CheckCircle2, X, MessageSquare } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { printPaymentReceipt } from "../lib/printUtils";

interface DueManagementProps {
  user: User | null;
}

export function DueManagement({ user }: DueManagementProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("all");
  const [balanceFilter, setBalanceFilter] = useState<'all_non_zero' | 'due_only' | 'advance_only' | 'all_customers'>('all_non_zero');

  const showNotify = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    loadDues();
    if (isAdmin) {
      api.getUsers().then(setUsers);
    }

    const unsubCust = api.subscribeCustomers((data) => {
      const filtered = isAdmin ? data : data.filter(c => c.createdBy === user?.id);
      setCustomers(filtered);
    });

    return () => {
      unsubCust();
    };
  }, [isAdmin, user?.id]);

  const loadDues = async () => {
    const data = await api.getCustomers();
    // Isolation: Only show dues for customers owned by the user
    const filtered = isAdmin ? data : data.filter(c => c.createdBy === user?.id);
    setCustomers(filtered);
  };

  const handleSendReminder = async (customer: Customer) => {
    try {
      const bal = Number(customer.dueAmount) || 0;
      const message = bal < 0
        ? `আসসালামু আলাইকুম ${customer.name}, আমাদের কাছে আপনার অতিরিক্ত অ্যাডভান্স জমা (ক্রেতা পাবে) রয়েছে ৳${Math.abs(bal)}। ধন্যবাদ।`
        : `আসসালামু আলাইকুম ${customer.name}, আপনার বর্তমান বকেয়া ৳${bal} পরিশোধ করার জন্য বিশেষভাবে অনুরোধ করা হলো। ধন্যবাদ।`;
      await api.sendSMS(customer.phone, message);
      showNotify("SMS পাঠানো হয়েছে");
    } catch (err) {
      showNotify("SMS পাঠানো সম্ভব হয়নি", "error");
    }
  };

  const userFilteredCustomers = customers.filter(c => selectedUserId === "all" ? true : c.createdBy === selectedUserId);

  const filtered = userFilteredCustomers.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         c.phone.includes(searchTerm);
    if (!matchesSearch) return false;
    const bal = Number(c.dueAmount) || 0;
    if (searchTerm.trim() !== "") return true; // Show matching customer regardless of balance when searching
    if (balanceFilter === 'due_only') return bal > 0;
    if (balanceFilter === 'advance_only') return bal < 0;
    if (balanceFilter === 'all_customers') return true;
    return bal !== 0;
  });

  const totalDues = userFilteredCustomers.reduce((acc, c) => {
    const d = Number(c.dueAmount) || 0;
    return d > 0 ? acc + d : acc;
  }, 0);

  const totalAdvance = userFilteredCustomers.reduce((acc, c) => {
    const d = Number(c.dueAmount) || 0;
    return d < 0 ? acc + Math.abs(d) : acc;
  }, 0);

  const handlePayment = async () => {
    if (!selectedCustomer || !paymentAmount) return;
    
    setIsProcessing(true);
    try {
      const amount = parseFloat(paymentAmount);

      if (!isAdmin) {
        // Salesman mode: Create Temporary Due Payment Request
        const { receiptData } = await api.createDuePaymentRequest({
          customerId: selectedCustomer.id,
          amount,
          method: "cash",
          note: `সেলসম্যান কর্তৃক বকেয়া আদায় (${user?.name || 'সেলসম্যান'})`
        });
        showNotify("বকেয়া আদায়ের খসড়া রিকুয়েস্ট সফলভাবে জমা হয়েছে! এডমিন অনুমোদন করলে বকেয়া কর্তন হবে।", "success");
        
        await printPaymentReceipt({
          ...receiptData,
          isTemporary: true
        });

        setSelectedCustomer(null);
        setPaymentAmount("");
      } else {
        // Admin mode: Instant confirmed payment
        await api.recordPayment(selectedCustomer.id, amount, "cash");
        showNotify("পেমেন্ট সফলভাবে গ্রহণ করা হয়েছে");
        
        // Generate Official Receipt
        await printPaymentReceipt({
          name: selectedCustomer.name,
          phone: selectedCustomer.phone,
          amount: amount,
          type: 'customer',
          dueRemaining: selectedCustomer.dueAmount - amount,
          isTemporary: false
        });

        // Auto SMS logic
        try {
          const smsConfig = await api.getSMSConfig();
          if (smsConfig.autoSMS && selectedCustomer.phone) {
            const newBal = (Number(selectedCustomer.dueAmount) || 0) - amount;
            const balText = newBal < 0
              ? `ক্রেতা পাবে (অতিরিক্ত জমা): ৳${Math.abs(newBal)}`
              : `অবশিষ্ট বকেয়া: ৳${newBal}`;
            const message = `প্রিয় ${selectedCustomer.name}, আপনার নিকট হতে ৳${amount} পেমেন্ট গ্রহণ করা হয়েছে। ${balText}। ধন্যবাদ।`;
            await api.sendSMS(selectedCustomer.phone, message);
            console.log("[Auto SMS] Sent payment confirmation to:", selectedCustomer.phone);
          }
        } catch (err) {
          console.error("[Auto SMS] Error:", err);
        }

        await loadDues();
        setSelectedCustomer(null);
        setPaymentAmount("");
      }
    } catch (e: any) {
      console.error(e);
      showNotify(e.message || "পেমেন্ট সম্পন্ন করা যায়নি", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="p-6 space-y-6 bg-slate-50 dark:bg-slate-950 transition-colors duration-300 min-h-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white font-bengali">বকেয়া ও অ্যাডভান্স ব্যবস্থাপনা</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm font-bengali">সব কাস্টমারের বকেয়া, অতিরিক্ত জমা (ক্রেতা পাবে) এবং পেমেন্ট গ্রহণ করুন</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-rose-50 dark:bg-rose-900/20 px-5 py-3 rounded-2xl border border-rose-100 dark:border-rose-900/30 transition-colors">
             <p className="text-[10px] text-rose-500 dark:text-rose-400 font-bold uppercase tracking-widest mb-1 font-bengali">মোট পাওনা বকেয়া</p>
             <h3 className="text-2xl font-black text-rose-600 dark:text-rose-400">৳ {totalDues.toLocaleString()}</h3>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-900/20 px-5 py-3 rounded-2xl border border-emerald-100 dark:border-emerald-900/30 transition-colors">
             <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-widest mb-1 font-bengali">মোট ক্রেতা পাবে (অ্যাডভান্স)</p>
             <h3 className="text-2xl font-black text-emerald-600 dark:text-emerald-400">৳ {totalAdvance.toLocaleString()}</h3>
          </div>
        </div>
      </div>

      {!isAdmin && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 p-3.5 rounded-2xl flex items-center gap-3 text-sm text-amber-800 dark:text-amber-300 font-bengali">
          <span className="text-2xl">⏳</span>
          <div>
            <span className="font-bold">সেলসম্যান মোড:</span> ক্রেতার কাছ থেকে বকেয়া আদায় গ্রহণ করলে <strong>খসড়া/টেম্পোরারি রসিদ</strong> তৈরি হবে। এডমিন অনুমোদন করার পর মূল বকেয়া থেকে কর্তন হবে।
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row gap-4 transition-colors">
        <div className="relative flex-1 group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors" size={18} />
          <input 
            type="text" 
            placeholder="কাস্টমার নাম বা মোবাইল নং খুঁজুন..." 
            className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl py-2.5 pl-10 pr-4 focus:ring-4 focus:ring-primary/5 transition-all outline-none font-bengali"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>

        {isAdmin && (
          <div className="md:w-64">
            <select 
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-xl py-2.5 px-4 text-slate-900 dark:text-slate-100 focus:ring-4 focus:ring-primary/5 outline-none font-bengali transition-all"
            >
              <option value="all">সকল ইউজার</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name} ({u.role === 'admin' ? 'অ্যাডমিন' : 'সেলসম্যান'})</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Balance Type Filter Tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'all_non_zero', label: 'বকেয়া ও ক্রেতা পাবে (সক্রিয়)' },
          { id: 'due_only', label: 'শুধু বকেয়া তালিকা' },
          { id: 'advance_only', label: 'ক্রেতা পাবে (অ্যাডভান্স জমা)' },
          { id: 'all_customers', label: 'সকল কাস্টমার' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setBalanceFilter(tab.id as any)}
            className={`px-4 py-2 rounded-xl text-xs font-bold font-bengali transition-all ${
              balanceFilter === tab.id
                ? 'bg-primary text-white shadow-md shadow-primary/20'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map(customer => {
          const bal = Number(customer.dueAmount) || 0;
          const isAdvance = bal < 0;
          const isDue = bal > 0;
          return (
          <motion.div 
            layout
            key={customer.id} 
            className={`bg-white dark:bg-slate-900 rounded-2xl border shadow-sm transition-all group overflow-hidden ${
              isAdvance
                ? 'border-emerald-200 dark:border-emerald-900/50 hover:border-emerald-400'
                : isDue
                  ? 'border-slate-200 dark:border-slate-800 hover:border-rose-200 dark:hover:border-rose-900/50'
                  : 'border-slate-200 dark:border-slate-800'
            }`}
          >
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                  isAdvance
                    ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'
                    : isDue
                      ? 'bg-rose-50 dark:bg-rose-900/20 text-rose-500 dark:text-rose-400'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                }`}>
                  <UserIcon size={24} />
                </div>
                <div className="text-right">
                  <p className={`font-black text-xl font-sans ${
                    isAdvance
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : isDue
                        ? 'text-rose-600 dark:text-rose-500'
                        : 'text-slate-500 dark:text-slate-400'
                  }`}>
                    ৳ {Math.abs(bal).toLocaleString()}
                  </p>
                  <p className={`text-[11px] font-bold uppercase tracking-wider font-bengali px-2 py-0.5 rounded-full inline-block mt-0.5 ${
                    isAdvance
                      ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                      : isDue
                        ? 'bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                  }`}>
                    {isAdvance ? 'ক্রেতা পাবে' : isDue ? 'বকেয়া পরিমাণ' : 'পরিশোধিত'}
                  </p>
                </div>
              </div>
              
              <div className="space-y-4">
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-slate-100 text-lg font-bengali">{customer.name}</h4>
                  <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm mt-1 font-sans">
                    <Phone size={14} />
                    <span>{customer.phone}</span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button 
                    onClick={() => setSelectedCustomer(customer)}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary dark:bg-blue-600 text-white rounded-xl hover:bg-primary/90 dark:hover:bg-blue-700 transition-colors text-xs font-bold font-bengali active:scale-95 transform"
                  >
                    <DollarSign size={16} />
                    পেমেন্ট / জমা গ্রহণ
                  </button>
                  <button 
                    onClick={() => handleSendReminder(customer)}
                    className="flex items-center justify-center gap-2 w-12 py-2.5 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 rounded-xl hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-colors active:scale-95 transform"
                    title="SMS রিমাইন্ডার"
                  >
                    <MessageSquare size={18} />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-full py-20 text-center text-slate-300 font-bengali">
             কোনো বকেয়া বা অ্যাডভান্স তথ্য পাওয়া যায়নি
          </div>
        )}
      </div>

      {/* Payment Modal */}
      <AnimatePresence>
        {selectedCustomer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedCustomer(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-8 shadow-2xl overflow-hidden transition-colors"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-bengali">বকেয়া সংগ্রহ করুন</h3>
                <button 
                  onClick={() => setSelectedCustomer(null)}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-400 dark:text-slate-500 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-6">
                <div className="p-5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 transition-colors">
                   <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest mb-2 font-sans">CUSTOMER INFO</p>
                   <p className="font-bold text-slate-900 dark:text-slate-100 font-bengali text-lg">{selectedCustomer.name}</p>
                   <p className="text-sm text-slate-500 dark:text-slate-400 font-sans">{selectedCustomer.phone}</p>
                   <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center transition-colors">
                      <p className={`text-xs font-bold font-bengali ${(Number(selectedCustomer.dueAmount) || 0) < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
                        {(Number(selectedCustomer.dueAmount) || 0) < 0 ? 'বর্তমানে ক্রেতা পাবে (অ্যাডভান্স):' : 'বর্তমানে মোট বকেয়া:'}
                      </p>
                      <p className={`font-black text-lg font-sans ${(Number(selectedCustomer.dueAmount) || 0) < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-500'}`}>
                        ৳ {Math.abs(Number(selectedCustomer.dueAmount) || 0).toLocaleString()}
                      </p>
                   </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300 font-bengali">পেমেন্ট / জমার পরিমাণ (৳)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 font-bold">৳</span>
                    <input 
                      autoFocus
                      type="number" 
                      min="1"
                      step="any"
                      className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-800 rounded-2xl py-4 pl-12 pr-4 text-slate-900 dark:text-slate-100 focus:border-primary/20 dark:focus:border-blue-500/20 focus:ring-4 focus:ring-primary/5 dark:focus:ring-blue-500/5 outline-none font-bold text-2xl transition-all font-sans"
                      placeholder="0.00"
                      value={paymentAmount}
                      onChange={e => setPaymentAmount(e.target.value)}
                    />
                  </div>
                  {paymentAmount && !Number.isNaN(parseFloat(paymentAmount)) && (
                    (() => {
                      const payVal = parseFloat(paymentAmount) || 0;
                      const newBalance = (Number(selectedCustomer.dueAmount) || 0) - payVal;
                      return (
                        <div className={`mt-2 p-3 rounded-xl border text-xs font-bold font-bengali flex items-center justify-between ${
                          newBalance < 0
                            ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300'
                            : newBalance > 0
                              ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/60 text-rose-600 dark:text-rose-400'
                              : 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800/60 text-blue-600 dark:text-blue-400'
                        }`}>
                          <span>
                            {newBalance < 0
                              ? 'পেমেন্ট পর ক্রেতা পাবে (অতিরিক্ত জমা):'
                              : newBalance > 0
                                ? 'পেমেন্ট পর অবশিষ্ট বকেয়া থাকবে:'
                                : 'পেমেন্ট পর হিসাব সম্পূর্ণ পরিশোধ হবে:'}
                          </span>
                          <span className="text-sm font-black font-sans">৳ {Math.abs(newBalance).toLocaleString()}</span>
                        </div>
                      );
                    })()
                  )}
                </div>

                <button 
                  onClick={handlePayment}
                  disabled={isProcessing || !paymentAmount}
                  className="w-full h-14 flex items-center justify-center gap-3 bg-primary dark:bg-blue-600 text-white rounded-2xl hover:bg-primary/90 dark:hover:bg-blue-700 transition-all shadow-xl shadow-primary/20 dark:shadow-blue-900/20 font-bold font-bengali disabled:opacity-50 active:scale-[0.98] transform"
                >
                  {isProcessing ? (
                    <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <CheckCircle2 size={24} />
                      {!isAdmin ? "টেম্পোরারি বকেয়া আদায় রিকুয়েস্ট জমা দিন" : "পেমেন্ট কনফার্ম করুন"}
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
