/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, FormEvent, MouseEvent, useRef, ChangeEvent } from "react";
import { api } from "../services/api";
import { Supplier, SupplierTransaction, User } from "../types";
import { Truck, Plus, Search, Phone, MapPin, Calculator, History, Edit, Trash2, X, FileText, IndianRupee, FileSpreadsheet, Download, ShoppingCart } from "lucide-react";
import { printPaymentReceipt } from "../lib/printUtils";
import * as XLSX from 'xlsx';

interface SupplierListProps {
  user: User | null;
}

export function SupplierList({ user }: SupplierListProps) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [formData, setFormData] = useState<Partial<Supplier>>({
    name: "",
    phone: "",
    address: "",
    dueAmount: 0
  });
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showPurchaseModal, setShowPurchaseModal] = useState<Supplier | null>(null);
  const [purchaseAmount, setPurchaseAmount] = useState<string>("");
  const [purchaseDescription, setPurchaseDescription] = useState("");

  // History & Payment States
  const [viewingHistory, setViewingHistory] = useState<Supplier | null>(null);
  const [supplierTransactions, setSupplierTransactions] = useState<SupplierTransaction[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState<Supplier | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<string>("");
  const [paymentDescription, setPaymentDescription] = useState("");

  const showNotify = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  useEffect(() => {
    loadData();

    const unsubSuppliers = api.subscribeSuppliers((items) => {
      setSuppliers(items);
    });

    return () => {
      unsubSuppliers();
    };
  }, []);

  const loadData = async () => {
    try {
      const items = await api.getSuppliers();
      setSuppliers(items);
    } catch (err) {
      console.error("Load Error:", err);
    }
  };

  const openHistory = async (supplier: Supplier) => {
    setViewingHistory(supplier);
    setLoadingHistory(true);
    try {
      const data = await api.getSupplierTransactions(supplier.id);
      setSupplierTransactions(data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    } catch (err) {
      showNotify("হিস্টরি লোড করতে ব্যর্থ!", "error");
    } finally {
      setLoadingHistory(false);
    }
  };

  const handlePaymentSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const amount = Number(paymentAmount);
    if (!showPaymentModal || amount <= 0) return;
    
    try {
      await api.recordSupplierPayment(showPaymentModal.id, amount, paymentDescription);
      showNotify("পেমেন্ট সফলভাবে সম্পন্ন হয়েছে");
      
      // Generate Receipt
      await printPaymentReceipt({
        name: showPaymentModal.name,
        phone: showPaymentModal.phone,
        amount: amount,
        type: 'supplier',
        dueRemaining: showPaymentModal.dueAmount - amount,
        description: paymentDescription
      });

      // Auto SMS logic
      try {
        const smsConfig = await api.getSMSConfig();
        if (smsConfig.autoSMS && showPaymentModal.phone) {
          const message = `প্রিয় ${showPaymentModal.name}, আপনাকে ৳${amount} পেমেন্ট করা হয়েছে। অবশিষ্ট বকেয়া: ৳${showPaymentModal.dueAmount - amount}। ধন্যবাদ।`;
          await api.sendSMS(showPaymentModal.phone, message);
          console.log("[Auto SMS] Sent supplier payment confirmation to:", showPaymentModal.phone);
        }
      } catch (err) {
        console.error("[Auto SMS] Error:", err);
      }

      setShowPaymentModal(null);
      setPaymentAmount("");
      setPaymentDescription("");
      loadData();
    } catch (err) {
      showNotify("পেমেন্ট রেকর্ড করা সম্ভব হয়নি", "error");
    }
  };

  const handlePurchaseSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const amount = Number(purchaseAmount);
    if (!showPurchaseModal || amount <= 0) return;
    
    try {
      await api.recordSupplierPurchase(showPurchaseModal.id, amount, purchaseDescription);
      showNotify("পণ্য ক্রয় রেকর্ড করা হয়েছে (বকেয়া বৃদ্ধি পেয়েছে)");
      setShowPurchaseModal(null);
      setPurchaseAmount("");
      setPurchaseDescription("");
      loadData();
    } catch (err) {
      showNotify("পারচেস রেকর্ড করা সম্ভব হয়নি", "error");
    }
  };

  const handleCreateOrUpdate = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (editingSupplier) {
        await api.updateSupplier(editingSupplier.id, formData);
        showNotify("সাপ্লাইয়ার তথ্য আপডেট করা হয়েছে");
      } else {
        await api.createSupplier(formData);
        showNotify("নতুন সাপ্লাইয়ার যোগ করা হয়েছে");
      }
      setShowModal(false);
      resetForm();
      loadData();
    } catch (err) {
      showNotify("ব্যর্থ হয়েছে!", "error");
    }
  };

  const confirmDelete = (e: MouseEvent, id: string) => {
    e.stopPropagation();
    setDeleteId(id);
    setShowDeleteModal(true);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const success = await api.deleteSupplier(deleteId);
      if (success) {
        showNotify("সাপ্লাইয়ার মুছে ফেলা হয়েছে");
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
      name: "",
      phone: "",
      address: "",
      dueAmount: 0
    });
    setEditingSupplier(null);
  };

  const openAddModal = () => {
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (e: MouseEvent, supplier: Supplier) => {
    e.stopPropagation();
    setEditingSupplier(supplier);
    setFormData(supplier);
    setShowModal(true);
  };

  const downloadSampleExcel = () => {
    const headers = [
      ["Supplier Name", "Phone", "Address", "Initial Due"]
    ];
    const ws = XLSX.utils.aoa_to_sheet(headers);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Suppliers");
    XLSX.writeFile(wb, "suppliers_sample.xlsx");
  };

  const handleExcelImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as any[];

        if (data.length === 0) {
          showNotify("এক্সেল ফাইলে কোনো তথ্য নেই", "error");
          return;
        }

        const suppliersToCreate: Partial<Supplier>[] = data.map(row => ({
          name: String(row["Supplier Name"] || ""),
          phone: String(row["Phone"] || ""),
          address: String(row["Address"] || ""),
          dueAmount: Number(row["Initial Due"] || 0),
        }));

        await api.createSuppliersBatch(suppliersToCreate);
        showNotify(`${suppliersToCreate.length} জন সাপ্লাইয়ার সফলভাবে ইমপোর্ট করা হয়েছে`);
        loadData();
      } catch (err) {
        console.error("Import Error:", err);
        showNotify("ইমপোর্ট করা সম্ভব হয়নি। ফাইলের ফরম্যাট চেক করুন।", "error");
      }
    };
    reader.readAsBinaryString(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const filtered = suppliers.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    s.phone.includes(searchTerm)
  );

  return (
    <div className="p-6 space-y-6 bg-slate-50 dark:bg-slate-950 transition-colors duration-300 min-h-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white font-bengali">সরবরাহকারী তালিকা</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm font-bengali">আপনার সব সাপ্লায়ারদের তালিকা এবং বকেয়া হিসাব</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept=".xlsx, .xls" 
            onChange={handleExcelImport}
          />
          <button 
            type="button"
            onClick={downloadSampleExcel}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors font-bengali text-sm"
            title="নমুনা এক্সেল ডাউনলোড করুন"
          >
            <Download size={18} />
            <span>নমুনা ফাইল</span>
          </button>
          <button 
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800 rounded-xl hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors font-bengali text-sm"
          >
            <FileSpreadsheet size={18} />
            <span>ইমপোর্ট (Excel)</span>
          </button>
          <button 
            type="button"
            onClick={openAddModal}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20 font-bengali text-sm"
          >
            <Plus size={20} />
            <span>নতুন সাপ্লাইয়ার</span>
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row gap-4 transition-colors">
        <div className="relative flex-1 group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors" size={18} />
          <input 
            type="text" 
            placeholder="সাপ্লায়ার খুঁজুন (নাম বা ফোন)..." 
            className="w-full pl-10 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border-transparent dark:border-slate-700 focus:bg-white dark:focus:bg-slate-900 focus:border-primary rounded-lg text-slate-900 dark:text-slate-100 transition-all font-bengali outline-none text-sm"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map(supplier => (
          <div key={supplier.id} className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm hover:border-primary/20 dark:hover:border-blue-500/20 transition-all group flex flex-col">
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 bg-amber-50 dark:bg-amber-900/20 rounded-xl flex items-center justify-center text-amber-600 dark:text-amber-400 group-hover:bg-amber-600 dark:group-hover:bg-amber-500 group-hover:text-white transition-colors">
                <Truck size={24} />
              </div>
              <div className="flex items-center gap-1">
                <button 
                  onClick={(e) => openEditModal(e, supplier)}
                  className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-primary dark:hover:text-blue-400 hover:bg-primary/5 dark:hover:bg-slate-800 rounded-lg transition-colors"
                  title="এডিট"
                >
                  <Edit size={16} />
                </button>
                <button 
                  onClick={(e) => confirmDelete(e, supplier.id)}
                  className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors"
                  title="মুছুন"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            
            <div className="space-y-4 flex-1">
              <div>
                <h4 className="font-bold text-slate-900 dark:text-slate-100 text-lg font-bengali">{supplier.name}</h4>
                <div className="space-y-1 mt-2">
                  <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs">
                    <Phone size={12} />
                    <span>{supplier.phone}</span>
                  </div>
                  {supplier.address && (
                    <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs">
                      <MapPin size={12} />
                      <span className="truncate font-bengali">{supplier.address}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="py-4 border-y border-slate-50 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider mb-1">মোট বকেয়া</p>
                  <p className={`font-bold text-lg ${supplier.dueAmount > 0 ? 'text-rose-500' : 'text-emerald-500 dark:text-emerald-400'}`}>৳ {supplier.dueAmount}</p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${supplier.dueAmount > 0 ? 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400' : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'}`}>
                  {supplier.dueAmount > 0 ? 'বকেয়া আছে' : 'পরিশোধিত'}
                </span>
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <button 
                  onClick={() => openHistory(supplier)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-xs font-bold font-bengali"
                >
                  <History size={16} />
                  লেনদেন হিস্টরি
                </button>
                <div className="flex gap-2">
                  <button 
                    onClick={() => {
                      setShowPurchaseModal(supplier);
                      setPurchaseAmount("");
                    }}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-orange-50 dark:bg-orange-900/10 text-orange-600 dark:text-orange-400 rounded-xl hover:bg-orange-100 dark:hover:bg-orange-900/20 transition-colors text-xs font-bold font-bengali"
                  >
                    <ShoppingCart size={16} />
                    পণ্য ক্রয়
                  </button>
                  <button 
                    onClick={() => {
                      setShowPaymentModal(supplier);
                      setPaymentAmount(String(supplier.dueAmount || ""));
                    }}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-50 dark:bg-emerald-900/10 text-emerald-600 dark:text-emerald-400 rounded-xl hover:bg-emerald-100 dark:hover:bg-emerald-900/20 transition-colors text-xs font-bold font-bengali"
                  >
                    <Calculator size={16} />
                    পেমেন্ট
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full py-12 text-center text-slate-400 font-bengali">
            <p>কোনো সাপ্লাইয়ার পাওয়া যায়নি</p>
          </div>
        )}
      </div>

      {/* History Modal */}
      {viewingHistory && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh] transition-colors">
            <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-amber-50 dark:bg-amber-900/20 rounded-full flex items-center justify-center text-amber-600 dark:text-amber-400">
                  <History size={20} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-bengali">{viewingHistory.name}</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-bengali">সাপ্লাইয়ার লেনদেন ইতিহাস</p>
                </div>
              </div>
              <button 
                onClick={() => setViewingHistory(null)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-slate-400 dark:text-slate-500"
              >
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8">
              {loadingHistory ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400 animate-pulse">
                  <Truck className="animate-bounce mb-4 text-amber-500" />
                  <p className="font-bengali">হিস্টরি লোড হচ্ছে...</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {supplierTransactions.length === 0 ? (
                    <div className="text-center py-20 bg-slate-50 dark:bg-slate-800/30 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800 transition-colors">
                      <Calculator size={48} className="mx-auto text-slate-200 dark:text-slate-700 mb-4" />
                      <p className="text-slate-400 dark:text-slate-500 font-bengali">এই সাপ্লাইয়ারের সাথে এখনো কোনো লেনদেন হয়নি</p>
                    </div>
                  ) : (
                    supplierTransactions.map(t => (
                      <div key={t.id} className="flex items-center justify-between p-5 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl hover:border-primary/20 dark:hover:border-blue-500/20 hover:shadow-md transition-all group transition-colors">
                        <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${
                            t.type === 'payment' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' : 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400'
                          }`}>
                            {t.type === 'payment' ? <Calculator size={20} /> : <Truck size={20} />}
                          </div>
                          <div>
                            <p className="font-bold text-slate-800 dark:text-slate-200 font-bengali">{t.description}</p>
                            <p className="text-xs text-slate-400 dark:text-slate-500 font-sans">
                              {new Date(t.date).toLocaleDateString('bn-BD', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                timeZone: 'Asia/Dhaka'
                              })}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`font-bold text-lg ${t.type === 'payment' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                            {t.type === 'payment' ? '-' : '+'} ৳ {t.amount}
                          </p>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            t.type === 'payment' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' : 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400'
                          }`}>
                            {t.type === 'payment' ? 'পেমেন্ট' : 'পারচেস'}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="p-6 bg-slate-50 dark:bg-slate-800 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between font-bengali transition-colors">
              <div className="text-sm text-slate-500 dark:text-slate-400">
                মোট ট্রানজ্যাকশন: <span className="font-bold text-slate-900 dark:text-slate-100 font-sans">{supplierTransactions.length}</span> টি
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400">
                বর্তমান বকেয়া: <span className="font-bold text-rose-500 dark:text-rose-400 font-sans">৳ {viewingHistory.dueAmount}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 transition-colors">
            <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 sticky top-0 z-10 transition-colors">
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-bengali">বকেয়া পরিশোধ (Payment)</h2>
              <button 
                onClick={() => setShowPaymentModal(null)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-slate-400 dark:text-slate-500"
              >
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handlePaymentSubmit} className="p-8 space-y-6">
              <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl border border-emerald-100 dark:border-emerald-900/30">
                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-bold uppercase mb-1 font-sans">বর্তমান পাওনা</p>
                <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">৳ {showPaymentModal.dueAmount}</p>
                <p className="text-xs text-emerald-500 dark:text-emerald-400 mt-1 font-bengali">পেমেন্ট করার পর বকেয়া কমে যাবে।</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300 font-bengali">পেমেন্ট পরিমাণ (৳)</label>
                  <div className="relative">
                    <input 
                      required 
                      type="text" 
                      inputMode="decimal"
                      className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-lg py-2 px-3 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/20 outline-none transition-all font-bold text-base"
                      value={paymentAmount}
                      onChange={e => {
                        const val = e.target.value;
                        if (val === "" || /^\d*\.?\d*$/.test(val)) {
                          setPaymentAmount(val);
                        }
                      }}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300 font-bengali">বিস্তারিত (ঐচ্ছিক)</label>
                  <textarea 
                    className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-lg py-2 px-3 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/20 outline-none transition-all font-bengali resize-none text-sm"
                    rows={2}
                    placeholder="পেমেন্ট সম্পর্কে কোনো তথ্য লিখুন..."
                    value={paymentDescription || ""}
                    onChange={e => setPaymentDescription(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  type="button" 
                  onClick={() => setShowPaymentModal(null)}
                  className="flex-1 py-3 rounded-xl text-slate-500 dark:text-slate-400 font-bold font-bengali hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  বাতিল
                </button>
                <button 
                  type="submit" 
                  className="flex-1 py-3 bg-emerald-600 dark:bg-emerald-500 text-white rounded-xl font-bold font-bengali hover:bg-emerald-700 dark:hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-200 dark:shadow-emerald-900/20"
                >
                  পেমেন্ট সম্পন্ন করুন
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Purchase Modal */}
      {showPurchaseModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 transition-colors">
            <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 sticky top-0 z-10 transition-colors">
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-bengali">পণ্য ক্রয় (Purchase)</h2>
              <button 
                onClick={() => setShowPurchaseModal(null)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-slate-400 dark:text-slate-500"
              >
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handlePurchaseSubmit} className="p-8 space-y-6">
              <div className="p-4 bg-rose-50 dark:bg-rose-900/20 rounded-2xl border border-rose-100 dark:border-rose-900/30">
                <p className="text-xs text-rose-600 dark:text-rose-400 font-bold uppercase mb-1 font-sans">বর্তমান বকেয়া</p>
                <p className="text-2xl font-bold text-rose-700 dark:text-rose-300">৳ {showPurchaseModal.dueAmount}</p>
                <p className="text-xs text-rose-50 mt-1 font-bengali bg-rose-500/10 px-2 py-1 rounded inline-block">ক্রয় করার পর বকেয়া বৃদ্ধি পাবে।</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300 font-bengali">ক্রয়কৃত পণ্যের মূল্য/বাকী (৳)</label>
                  <div className="relative">
                    <input 
                      required 
                      type="text" 
                      inputMode="decimal"
                      className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-lg py-2 px-3 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/20 outline-none transition-all font-bold text-base"
                      value={purchaseAmount}
                      onChange={e => {
                        const val = e.target.value;
                        if (val === "" || /^\d*\.?\d*$/.test(val)) {
                          setPurchaseAmount(val);
                        }
                      }}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300 font-bengali">বিস্তারিত/চালান নং</label>
                  <textarea 
                    className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-lg py-2 px-3 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/20 outline-none transition-all font-bengali resize-none text-sm"
                    rows={2}
                    placeholder="পারচেস বা চালান নম্বর সম্পর্কে লিখুন..."
                    value={purchaseDescription || ""}
                    onChange={e => setPurchaseDescription(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  type="button" 
                  onClick={() => setShowPurchaseModal(null)}
                  className="flex-1 py-3 rounded-xl text-slate-500 dark:text-slate-400 font-bold font-bengali hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  বাতিল
                </button>
                <button 
                  type="submit" 
                  className="flex-1 py-3 bg-rose-600 dark:bg-rose-500 text-white rounded-xl font-bold font-bengali hover:bg-rose-700 dark:hover:bg-rose-600 transition-colors shadow-lg shadow-rose-200 dark:shadow-rose-900/20"
                >
                  ক্রয় সম্পন্ন করুন
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 transition-colors">
            <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 transition-colors">
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-bengali">
                {editingSupplier ? "সাপ্লাইয়ার এডিট করুন" : "নতুন সাপ্লাইয়ার যোগ করুন"}
              </h2>
              <button 
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-slate-400 dark:text-slate-500"
              >
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleCreateOrUpdate} className="p-8 space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300 font-bengali">সাপ্লাইয়ারের নাম</label>
                  <input 
                    required 
                    type="text" 
                    className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-lg py-1.5 px-3 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/20 outline-none transition-all font-bengali text-sm"
                    value={formData.name || ""}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300 font-bengali">ফোন নম্বর</label>
                  <input 
                    required 
                    type="tel" 
                    className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-lg py-1.5 px-3 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm"
                    value={formData.phone || ""}
                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300 font-bengali">ঠিকানা (ঐচ্ছিক)</label>
                  <textarea 
                    className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-lg py-1.5 px-3 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/20 outline-none transition-all font-bengali resize-none text-sm"
                    rows={2}
                    value={formData.address || ""}
                    onChange={e => setFormData({ ...formData, address: e.target.value })}
                  />
                </div>
                {!editingSupplier && (
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700 dark:text-slate-300 font-bengali">আগের বকেয়া (যদি থাকে)</label>
                    <input 
                      type="text" 
                      inputMode="decimal"
                      className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-lg py-1.5 px-3 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm"
                      value={formData.dueAmount ?? ""}
                      onChange={e => {
                        const val = e.target.value;
                        if (val === "" || /^\d*\.?\d*$/.test(val)) {
                          setFormData({ ...formData, dueAmount: val as any });
                        }
                      }}
                      onBlur={() => setFormData({ ...formData, dueAmount: Number(formData.dueAmount || 0) })}
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-4 pt-4">
                <button 
                  type="button" 
                  onClick={() => setShowModal(false)}
                  className="px-6 py-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 font-bold font-bengali hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  বাতিল করুন
                </button>
                <button 
                  type="submit" 
                  className="px-8 py-2 bg-primary dark:bg-blue-600 text-white rounded-xl font-bold font-bengali hover:opacity-90 shadow-lg shadow-primary/20 dark:shadow-blue-900/20"
                >
                  নিশ্চিত করুন
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md p-8 shadow-2xl animate-in zoom-in fade-in duration-200 border dark:border-slate-800 transition-colors">
            <div className="w-16 h-16 bg-rose-50 dark:bg-rose-900/20 text-rose-500 rounded-2xl flex items-center justify-center mb-6 mx-auto">
              <Trash2 size={32} />
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 text-center mb-2 font-bengali">সাপ্লাইয়ার মুছে ফেলতে চান?</h3>
            <p className="text-slate-500 dark:text-slate-400 text-center mb-8 font-bengali">এই সাপ্লাইয়ারের সব তথ্য চিরস্থায়ীভাবে মুছে যাবে।</p>
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
                হ্যাঁ, ডিলিট করুন
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
