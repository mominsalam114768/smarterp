/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, FormEvent, ChangeEvent, useRef } from "react";
import { api } from "../services/api";
import { Customer, Sale, User } from "../types";
import { Users, UserPlus, Phone, MapPin, Calculator, History, Search, Plus, Trash2, Edit, X, FileText, MessageSquare, Printer, FileSpreadsheet, Download } from "lucide-react";
import { printCustomerStatement } from "../lib/printUtils";
import * as XLSX from 'xlsx';

interface CustomerListProps {
  user: User | null;
}

export function CustomerList({ user }: CustomerListProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [formData, setFormData] = useState<Partial<Customer>>({
    name: "",
    phone: "",
    address: "",
    email: "",
    image: "",
    dueAmount: 0,
    totalSpent: 0
  });
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("all");
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [showSMSModal, setShowSMSModal] = useState<Customer | null>(null);
  const [smsMessage, setSmsMessage] = useState("");
  const [isSendingSms, setIsSendingSms] = useState(false);

  const handleSendQuickSMS = async (e: FormEvent) => {
    e.preventDefault();
    if (!showSMSModal || !smsMessage) return;
    setIsSendingSms(true);
    try {
      await api.sendSMS(showSMSModal.phone, smsMessage);
      showNotify("এসএমএস সফলভাবে পাঠানো হয়েছে");
      setShowSMSModal(null);
      setSmsMessage("");
    } catch (err) {
      showNotify("এসএমএস পাঠানো সম্ভব হয়নি", "error");
    } finally {
      setIsSendingSms(false);
    }
  };

  const showNotify = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const isAdmin = user?.role === 'admin';
  const canAdd = isAdmin || user?.permissions?.includes('add_customer');
  const canDelete = isAdmin || user?.permissions?.includes('delete_customer');

  useEffect(() => {
    loadData();
    if (isAdmin) {
      api.getUsers().then(setUsers);
    }

    const unsubCust = api.subscribeCustomers((items) => {
      const filtered = isAdmin ? items : items.filter(c => c.createdBy === user?.id);
      setCustomers(filtered);
    });

    return () => {
      unsubCust();
    };
  }, [isAdmin, user?.id]);

  const [viewingHistory, setViewingHistory] = useState<Customer | null>(null);
  const [customerSales, setCustomerSales] = useState<Sale[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const openHistory = async (customer: Customer) => {
    setViewingHistory(customer);
    setLoadingHistory(true);
    try {
      const allSales = await api.getSales();
      const filtered = allSales.filter(s => 
        (s.customerId && s.customerId === customer.id) ||
        (customer.phone && s.customerPhone && s.customerPhone.trim() === customer.phone.trim()) ||
        (customer.name && s.customerName && s.customerName.trim().toLowerCase() === customer.name.trim().toLowerCase())
      );
      setCustomerSales(filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    } catch (err) {
      showNotify("হিস্টরি লোড করা সম্ভব হয়নি", "error");
    } finally {
      setLoadingHistory(false);
    }
  };

  const loadData = async () => {
    try {
      const items = await api.getCustomers();
      // Data Isolation: Filter customers by creator if not admin
      const filteredItems = isAdmin ? items : items.filter(c => c.createdBy === user?.id);
      setCustomers(filteredItems);
    } catch (err) {
      console.error("Load Error:", err);
    }
  };

  const handleImageChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData({ ...formData, image: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCreateOrUpdate = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (editingCustomer) {
        await api.updateCustomer(editingCustomer.id, formData);
        showNotify("কাস্টমার তথ্য আপডেট করা হয়েছে");
      } else {
        await api.createCustomer({
          ...formData,
          createdBy: user?.id
        });
        showNotify("নতুন কাস্টমার যোগ করা হয়েছে");
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
      const success = await api.deleteCustomer(deleteId);
      if (success) {
        showNotify("কাস্টমার মুছে ফেলা হয়েছে");
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
      email: "",
      image: "",
      dueAmount: 0,
      totalSpent: 0
    });
    setEditingCustomer(null);
  };

  const downloadSampleExcel = () => {
    const headers = [
      ["Name", "Phone", "Address", "Email", "Due Amount"]
    ];
    const ws = XLSX.utils.aoa_to_sheet(headers);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Customers");
    XLSX.writeFile(wb, "customers_sample.xlsx");
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

        const customersToCreate: Partial<Customer>[] = data.map(row => ({
          name: String(row["Name"] || ""),
          phone: String(row["Phone"] || ""),
          address: String(row["Address"] || ""),
          email: String(row["Email"] || ""),
          dueAmount: Number(row["Due Amount"] || 0),
          totalSpent: 0,
          createdBy: user?.id
        }));

        await api.createCustomersBatch(customersToCreate);
        showNotify(`${customersToCreate.length} জন কাস্টমার সফলভাবে ইমপোর্ট করা হয়েছে`);
        loadData();
      } catch (err) {
        console.error("Import Error:", err);
        showNotify("ইমপোর্ট করা সম্ভব হয়নি। ফাইলের ফরম্যাট চেক করুন।", "error");
      }
    };
    reader.readAsBinaryString(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const openAddModal = () => {
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormData(customer);
    setShowModal(true);
  };

  const filtered = customers.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         c.phone.includes(searchTerm);
    const matchesUser = selectedUserId === "all" ? true : c.createdBy === selectedUserId;
    return matchesSearch && matchesUser;
  });

  return (
    <div className="p-6 space-y-6 bg-slate-50 dark:bg-slate-950 transition-colors duration-300 min-h-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white font-bengali">কাস্টমার তালিকা</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm font-bengali">সব কাস্টমারের তালিকা এবং তাদের বকেয়া হিসাব</p>
        </div>
        {canAdd && (
          <div className="flex flex-wrap items-center gap-3">
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept=".xlsx, .xls" 
              onChange={handleExcelImport}
            />
            <button 
              onClick={downloadSampleExcel}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors font-bengali text-sm"
              title="নমুনা এক্সেল ডাউনলোড করুন"
            >
              <Download size={18} />
              <span>নমুনা ফাইল</span>
            </button>
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800 rounded-xl hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors font-bengali text-sm"
            >
              <FileSpreadsheet size={18} />
              <span>ইমপোর্ট (Excel)</span>
            </button>
            <button 
              onClick={openAddModal}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20 font-bengali text-sm"
            >
              <UserPlus size={20} />
              <span>নতুন কাস্টমার</span>
            </button>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row gap-4 transition-colors">
        <div className="relative flex-1 group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors" size={18} />
          <input 
            type="text" 
            placeholder="কাস্টমার খুঁজুন (নাম বা ফোন)..." 
            className="w-full pl-10 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border-transparent dark:border-slate-700 focus:bg-white dark:focus:bg-slate-900 focus:border-primary dark:focus:border-blue-500 rounded-lg text-slate-900 dark:text-slate-100 transition-all font-bengali outline-none text-sm"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        
        {isAdmin && (
          <div className="md:w-64">
            <select 
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-lg py-1.5 px-3 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/20 outline-none font-bengali transition-all text-sm"
            >
              <option value="all">সকল ইউজার</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name} ({u.role === 'admin' ? 'অ্যাডমিন' : 'সেলসম্যান'})</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map(customer => (
          <div key={customer.id} className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm hover:border-primary/20 dark:hover:border-blue-500/20 transition-all group flex flex-col">
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 bg-primary/10 dark:bg-blue-900/20 rounded-xl flex items-center justify-center text-primary dark:text-blue-400 group-hover:bg-primary dark:group-hover:bg-blue-600 group-hover:text-white transition-colors overflow-hidden border border-slate-100 dark:border-slate-800">
                {customer.image ? (
                  <img src={customer.image} alt={customer.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <Users size={24} />
                )}
              </div>
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => openEditModal(customer)}
                  className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-primary dark:hover:text-blue-400 hover:bg-primary/5 dark:hover:bg-slate-800 rounded-lg transition-colors"
                  title="এডিট"
                >
                  <Edit size={16} />
                </button>
                <button 
                  onClick={() => setShowSMSModal(customer)}
                  className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
                  title="এসএমএস পাঠান"
                >
                  <MessageSquare size={16} />
                </button>
                {canDelete && (
                  <button 
                    onClick={() => confirmDelete(customer.id)}
                    className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-rose-500 rounded-lg rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                    title="মুছুন"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
            
            <div className="space-y-4 flex-1">
              <div>
                <h4 className="font-bold text-slate-900 dark:text-slate-100 text-lg font-bengali">{customer.name}</h4>
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm mt-1">
                  <Phone size={14} />
                  <span>{customer.phone}</span>
                </div>
                {customer.address && (
                  <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500 text-xs mt-1">
                    <MapPin size={12} />
                    <span className="font-bengali">{customer.address}</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 py-4 border-y border-slate-50 dark:border-slate-800">
                <div>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider mb-1">বকেয়া</p>
                    <p className={`font-bold ${customer.dueAmount > 0 ? 'text-rose-500' : 'text-emerald-500 dark:text-emerald-400'}`}>৳ {customer.dueAmount}</p>
                </div>
                <div>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider mb-1">মোট কেনাকাটা</p>
                    <p className="font-bold text-slate-900 dark:text-slate-100 transition-colors">৳ {customer.totalSpent}</p>
                </div>
              </div>

              <div className="flex gap-2">
                <button 
                  onClick={() => openHistory(customer)}
                  className="flex-1 flex items-center justify-center gap-2 py-2 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-sm font-medium font-bengali"
                >
                  <History size={16} />
                  হিস্টরি
                </button>
                <button 
                  disabled={loadingHistory}
                  onClick={async () => {
                    const allSales = await api.getSales();
                    const filtered = allSales.filter(s => 
                      (s.customerId && s.customerId === customer.id) ||
                      (customer.phone && s.customerPhone && s.customerPhone.trim() === customer.phone.trim()) ||
                      (customer.name && s.customerName && s.customerName.trim().toLowerCase() === customer.name.trim().toLowerCase())
                    );
                    printCustomerStatement(customer, filtered);
                  }}
                  className="flex-1 flex items-center justify-center gap-2 py-2 bg-primary/5 dark:bg-blue-900/10 text-primary dark:text-blue-400 rounded-lg hover:bg-primary/10 dark:hover:bg-blue-900/20 transition-colors text-sm font-medium font-bengali"
                >
                  <Printer size={16} />
                  প্রিন্ট
                </button>
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full py-12 text-center text-slate-400 font-bengali">
            <p>কোনো কাস্টমার পাওয়া যায়নি</p>
          </div>
        )}
      </div>

      {/* History Modal */}
      {viewingHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh] transition-colors">
            <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-primary/10 dark:bg-blue-900/20 rounded-full flex items-center justify-center text-primary dark:text-blue-400">
                  <History size={20} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-bengali">{viewingHistory.name}</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-bengali">বিক্রয় ইতিহাস ও লেনদেন</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => printCustomerStatement(viewingHistory, customerSales)}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-primary dark:text-blue-400 flex items-center gap-2 px-4 shadow-sm border border-slate-100 dark:border-slate-800"
                >
                  <Printer size={20} />
                  <span className="text-sm font-bold font-bengali">প্রিন্ট</span>
                </button>
                <button 
                  onClick={() => setViewingHistory(null)}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-slate-400 dark:text-slate-500"
                >
                  <X size={24} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8">
              {loadingHistory ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400 animate-pulse">
                  <Calculator className="animate-bounce mb-4" />
                  <p className="font-bengali">হিস্টরি লোড হচ্ছে...</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {customerSales.length === 0 ? (
                    <div className="text-center py-20 bg-slate-50 dark:bg-slate-800/30 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800">
                      <Calculator size={48} className="mx-auto text-slate-200 dark:text-slate-700 mb-4" />
                      <p className="text-slate-400 dark:text-slate-500 font-bengali">এই কাস্টমার এখনো কোনো কেনাকাটা করেননি</p>
                    </div>
                  ) : (
                    customerSales.map(sale => (
                      <div key={sale.id} className="flex items-center justify-between p-5 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl hover:border-primary/20 dark:hover:border-blue-500/20 hover:shadow-md transition-all group">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-slate-50 dark:bg-slate-900 rounded-xl flex items-center justify-center text-slate-400 dark:text-slate-500 group-hover:bg-primary/5 dark:group-hover:bg-blue-900/20 group-hover:text-primary dark:group-hover:text-blue-400 transition-colors">
                            <FileText size={20} />
                          </div>
                          <div>
                            <p className="font-bold text-slate-800 dark:text-slate-200 font-sans tracking-wide">#{sale.id.slice(-6).toUpperCase()}</p>
                            <p className="text-xs text-slate-400 dark:text-slate-500 font-sans">
                              {new Date(sale.createdAt).toLocaleDateString('bn-BD', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                timeZone: 'Asia/Dhaka'
                              })}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-slate-900 dark:text-slate-100">৳ {sale.totalAmount}</p>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            sale.paymentStatus === 'PAID' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' : 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400'
                          }`}>
                            {sale.paymentStatus === 'PAID' ? 'পেইড' : 'বকেয়া'}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="p-6 bg-slate-50 dark:bg-slate-800 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between font-bengali">
              <div className="text-sm text-slate-500 dark:text-slate-400">
                মোট লেনদেন: <span className="font-bold text-slate-900 dark:text-slate-100 font-sans">{customerSales.length}</span> টি
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400">
                মোট ব্যয়: <span className="font-bold text-primary dark:text-blue-400 font-sans">৳ {customerSales.reduce((acc, s) => acc + s.totalAmount, 0)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-white">
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-bengali">
                {editingCustomer ? "কাস্টমার এডিট করুন" : "নতুন কাস্টমার যোগ করুন"}
              </h2>
              <button 
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-slate-400 dark:text-slate-500"
              >
                <Plus className="rotate-45" size={24} />
              </button>
            </div>
            
            <form onSubmit={handleCreateOrUpdate} className="p-8 space-y-6 max-h-[70vh] overflow-y-auto">
              <div className="flex flex-col items-center gap-4 mb-6">
                <div className="relative group">
                  <div className="w-24 h-24 bg-slate-50 dark:bg-slate-800 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 flex items-center justify-center overflow-hidden">
                    {formData.image ? (
                      <img src={formData.image} alt="Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <Users size={32} className="text-slate-300 dark:text-slate-600" />
                    )}
                  </div>
                  <label className="absolute inset-0 flex items-center justify-center bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer rounded-2xl">
                    <Plus size={20} />
                    <input type="file" className="hidden" accept="image/*" onChange={handleImageChange} />
                  </label>
                </div>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bengali">ছবি আপলোড করুন (ঐচ্ছিক)</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300 font-bengali">কাস্টমারের নাম</label>
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
                {!editingCustomer && (
                  <div className="grid grid-cols-2 gap-4 pt-2">
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
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md p-8 shadow-2xl animate-in zoom-in fade-in duration-200 transition-colors border dark:border-slate-800">
            <div className="w-16 h-16 bg-rose-50 dark:bg-rose-900/20 text-rose-500 rounded-2xl flex items-center justify-center mb-6 mx-auto">
              <Trash2 size={32} />
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 text-center mb-2 font-bengali">কাস্টমার মুছে ফেলতে চান?</h3>
            <p className="text-slate-500 dark:text-slate-400 text-center mb-8 font-bengali">এই কাস্টমারের সব তথ্য চিরস্থায়ীভাবে মুছে যাবে।</p>
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

      {/* Quick SMS Modal */}
      {showSMSModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 transition-colors">
            <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 sticky top-0 z-10 transition-colors">
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-bengali">এসএমএস পাঠান</h2>
              <button 
                onClick={() => setShowSMSModal(null)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-slate-400 dark:text-slate-500"
              >
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleSendQuickSMS} className="p-8 space-y-6">
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-2xl border border-blue-100 dark:border-blue-900/30">
                <p className="text-xs text-blue-600 dark:text-blue-400 font-bold uppercase mb-1 font-sans">প্রাপক</p>
                <p className="text-lg font-bold text-blue-700 dark:text-blue-300 font-bengali">{showSMSModal.name}</p>
                <p className="text-xs text-blue-500 dark:text-blue-400 font-sans">{showSMSModal.phone}</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300 font-bengali">আপনার মেসেজ</label>
                <textarea 
                  required
                  autoFocus
                  className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-lg py-2 px-3 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/20 outline-none transition-all font-bengali resize-none text-sm"
                  rows={3}
                  placeholder="এখানে মেসেজ লিখুন..."
                  value={smsMessage}
                  onChange={e => setSmsMessage(e.target.value)}
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  type="button" 
                  onClick={() => setShowSMSModal(null)}
                  className="flex-1 py-3 rounded-xl text-slate-500 dark:text-slate-400 font-bold font-bengali hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  বাতিল
                </button>
                <button 
                  type="submit" 
                  disabled={isSendingSms}
                  className="flex-1 py-3 bg-blue-600 dark:bg-blue-500 text-white rounded-xl font-bold font-bengali hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors shadow-lg shadow-blue-200 dark:shadow-blue-900/20 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSendingSms ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <MessageSquare size={18} />}
                  পাঠান
                </button>
              </div>
            </form>
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
