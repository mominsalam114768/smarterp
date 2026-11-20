import React, { useState, useEffect, useMemo } from "react";
import { Customer, Business, Sale, User } from "../types";
import { api, isShopAdmin, getCurrentUser } from "../services/api";
import {
  Search,
  UserPlus,
  Phone,
  MapPin,
  DollarSign,
  History,
  CheckCircle2,
  AlertCircle,
  Printer,
  Edit2,
  Trash2,
  X,
  FileText,
  Receipt,
  Users,
  ArrowUpRight,
  Calendar,
  ShoppingBag,
  CreditCard,
} from "lucide-react";
import { printPaymentReceipt, printCustomerStatement, printInvoice } from "../lib/printUtils";
import { cn, formatDhakaDateTime } from "../lib/utils";

interface DueManagementProps {
  user?: User;
  business?: Business;
}

const getNowInputDateTime = () => {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 16);
};

export function DueManagement({ user }: DueManagementProps) {
  const activeUser = user || getCurrentUser();
  const isAdminUser = isShopAdmin(activeUser);
  const canDeleteCustomer = isAdminUser || Boolean(activeUser?.permissions?.includes("delete_customer"));

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [allPayments, setAllPayments] = useState<any[]>([]);
  const [allSales, setAllSales] = useState<Sale[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<"customers" | "payments">("customers");

  // Payment Collection Modal State
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentNote, setPaymentNote] = useState("");
  const [paymentDate, setPaymentDate] = useState(getNowInputDateTime());

  // Customer Payment & Due History Modal State
  const [historyCustomer, setHistoryCustomer] = useState<Customer | null>(null);
  const [historyTab, setHistoryTab] = useState<"payments" | "dues">("payments");
  const [customerSpecificPayments, setCustomerSpecificPayments] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Add / Edit Customer Modal States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [newCustomer, setNewCustomer] = useState({ name: "", phone: "", address: "", dueAmount: 0 });
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    fetchAllData();
    const unsubCust = api.subscribeCustomers((data) => {
      setCustomers(data);
    });
    const unsubSales = api.subscribeSales((data) => {
      setAllSales(data);
    });
    const handlePaymentsUpdated = () => {
      api.getAllCustomerPayments().then(setAllPayments).catch(() => {});
    };
    window.addEventListener("customer-payments-updated", handlePaymentsUpdated);
    window.addEventListener("sales-updated", handlePaymentsUpdated);
    return () => {
      unsubCust();
      unsubSales();
      window.removeEventListener("customer-payments-updated", handlePaymentsUpdated);
      window.removeEventListener("sales-updated", handlePaymentsUpdated);
    };
  }, []);

  const showNotification = (message: string, type: "success" | "error" = "success") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3500);
  };

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [custData, payData, salesData] = await Promise.all([
        api.getCustomers(),
        api.getAllCustomerPayments(),
        api.getSales(),
      ]);
      setCustomers(custData);
      setAllPayments(payData);
      setAllSales(salesData);
    } catch (err) {
      console.error("Failed to fetch due management data", err);
    } finally {
      setLoading(false);
    }
  };

  const openCustomerHistory = async (customer: Customer, defaultTab: "payments" | "dues" = "payments") => {
    setHistoryCustomer(customer);
    setHistoryTab(defaultTab);
    setHistoryLoading(true);
    try {
      const payments = await api.getCustomerPayments(customer.id);
      setCustomerSpecificPayments(payments);
    } catch (e) {
      console.error("Failed to load customer payment history", e);
      setCustomerSpecificPayments([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const matchesCustomer = (record: { customerId?: string; customerPhone?: string; customerName?: string }, customer: Customer) => {
    if (!record || !customer) return false;
    if (record.customerId && String(record.customerId) === String(customer.id)) return true;
    if (customer.phone && record.customerPhone && record.customerPhone.trim() === customer.phone.trim()) return true;
    if (customer.name && record.customerName && record.customerName.trim().toLowerCase() === customer.name.trim().toLowerCase()) return true;
    return false;
  };

  // All sales for the currently viewed historyCustomer
  const historyCustomerSales = useMemo(() => {
    if (!historyCustomer) return [];
    return allSales
      .filter((s) => matchesCustomer(s, historyCustomer))
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }, [allSales, historyCustomer]);

  // All payment records for the currently viewed historyCustomer
  const historyCustomerPaymentsList = useMemo(() => {
    if (!historyCustomer) return [];
    const map = new Map<string, any>();
    allPayments.forEach((p) => {
      if (matchesCustomer(p, historyCustomer)) {
        map.set(String(p.id), p);
      }
    });
    customerSpecificPayments.forEach((p) => {
      if (p && p.id) {
        map.set(String(p.id), p);
      }
    });
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.date || b.createdAt || 0).getTime() - new Date(a.date || a.createdAt || 0).getTime()
    );
  }, [allPayments, customerSpecificPayments, historyCustomer]);

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || !paymentAmount) return;

    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) return;

    try {
      const currentUser = user || getCurrentUser();
      if (!isShopAdmin(currentUser)) {
        const res = await api.createDuePaymentRequest({
          customerId: selectedCustomer.id,
          amount,
          method: paymentMethod,
          note: paymentNote,
        });
        if (res?.receiptData) {
          printPaymentReceipt(res.receiptData);
        }
        showNotification(
          "বকেয়া পেমেন্টের অনুরোধ অ্যাডমিনের অনুমোদনের জন্য 'বিক্রয় অর্ডার' ট্যাবে পাঠানো হয়েছে! অ্যাডমিন কনফার্ম করলে বকেয়া থেকে পেমেন্ট কর্তন হবে।",
          "success"
        );
      } else {
        const res = await api.recordPayment(
          selectedCustomer.id,
          amount,
          paymentMethod,
          paymentNote,
          paymentDate ? new Date(paymentDate).toISOString() : undefined
        );
        const receiptNo = res?.payment?.receiptNo;
        const remainingDue = (Number(selectedCustomer.dueAmount) || 0) - amount;
        const descParts = [
          receiptNo ? `রিসিপ্ট নং: #${receiptNo}` : "",
          `মাধ্যম: ${paymentMethod.toUpperCase()}`,
          paymentNote ? `নোট: ${paymentNote}` : "",
        ].filter(Boolean);

        printPaymentReceipt({
          name: selectedCustomer.name,
          phone: selectedCustomer.phone,
          amount,
          type: "customer",
          dueRemaining: remainingDue,
          description: descParts.join(" • "),
        });
        showNotification(`৳${amount.toLocaleString()} পেমেন্ট সফলভাবে জমা হয়েছে!`, "success");
      }

      const targetCustomer = selectedCustomer;
      setSelectedCustomer(null);
      setPaymentAmount("");
      setPaymentMethod("cash");
      setPaymentNote("");
      await fetchAllData();

      if (historyCustomer && String(historyCustomer.id) === String(targetCustomer.id)) {
        const updatedCust = (await api.getCustomers()).find((c) => String(c.id) === String(targetCustomer.id));
        if (updatedCust) setHistoryCustomer(updatedCust);
        const updatedPay = await api.getCustomerPayments(targetCustomer.id);
        setCustomerSpecificPayments(updatedPay);
      }
    } catch (err) {
      showNotification("পেমেন্ট রেকর্ড করতে সমস্যা হয়েছে", "error");
    }
  };

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createCustomer({
        ...newCustomer,
        createdBy: activeUser?.id,
      });
      setIsAddModalOpen(false);
      setNewCustomer({ name: "", phone: "", address: "", dueAmount: 0 });
      fetchAllData();
      showNotification("নতুন ক্রেতা সফলভাবে যোগ করা হয়েছে");
    } catch (err) {
      showNotification("ক্রেতা যোগ করতে সমস্যা হয়েছে", "error");
    }
  };

  const handleEditCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer) return;
    try {
      const payload: Partial<Customer> = isAdminUser
        ? editingCustomer
        : {
            name: editingCustomer.name,
            phone: editingCustomer.phone,
            address: editingCustomer.address,
          };
      await api.updateCustomer(editingCustomer.id, payload);
      setIsEditModalOpen(false);
      setEditingCustomer(null);
      fetchAllData();
      showNotification("ক্রেতার তথ্য আপডেট করা হয়েছে");
    } catch (err) {
      showNotification("ক্রেতার তথ্য আপডেট করতে সমস্যা হয়েছে", "error");
    }
  };

  const handleDeleteCustomer = async (id: string) => {
    if (!canDeleteCustomer) {
      showNotification("ক্রেতা মুছে ফেলার অনুমতি আপনার নেই", "error");
      setConfirmDeleteId(null);
      return;
    }
    try {
      await api.deleteCustomer(id);
      if (historyCustomer && String(historyCustomer.id) === String(id)) {
        setHistoryCustomer(null);
      }
      fetchAllData();
      showNotification("ক্রেতা মুছে ফেলা হয়েছে");
    } catch (err) {
      showNotification("ক্রেতা মুছে ফেলতে সমস্যা হয়েছে", "error");
    } finally {
      setConfirmDeleteId(null);
    }
  };

  const handlePrintLedger = async (customer: Customer, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const sales = await api.getSales();
      const customerSales = sales.filter((s) => matchesCustomer(s, customer));
      printCustomerStatement(customer, customerSales);
    } catch (err) {
      showNotification("লেজার প্রিন্ট করতে সমস্যা হয়েছে", "error");
    }
  };

  const handleReprintPaymentReceipt = (payment: any, fallbackCustomer?: Customer) => {
    const cust =
      fallbackCustomer ||
      customers.find((c) => matchesCustomer(payment, c)) || {
        id: payment.customerId || "cust",
        name: payment.customerName || "ক্রেতা",
        phone: payment.customerPhone || "",
        address: "",
        dueAmount: 0,
      };
    const methodStr = String(payment.method || payment.paymentMethod || "cash").toUpperCase();
    const descParts = [
      payment.receiptNo ? `রিসিপ্ট নং: #${payment.receiptNo}` : "",
      `মাধ্যম: ${methodStr}`,
      payment.note ? `নোট: ${payment.note}` : "",
    ].filter(Boolean);

    printPaymentReceipt({
      name: cust.name,
      phone: cust.phone,
      amount: Number(payment.amount) || 0,
      type: "customer",
      dueRemaining: Number(cust.dueAmount) || 0,
      description: descParts.join(" • "),
    });
  };

  const filteredCustomers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        (c.name || "").toLowerCase().includes(q) ||
        (c.phone || "").toLowerCase().includes(q) ||
        (c.address || "").toLowerCase().includes(q)
    );
  }, [customers, searchTerm]);

  const filteredPayments = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return allPayments;
    return allPayments.filter(
      (p) =>
        (p.customerName || "").toLowerCase().includes(q) ||
        (p.customerPhone || "").toLowerCase().includes(q) ||
        (p.receiptNo || "").toLowerCase().includes(q) ||
        (p.note || "").toLowerCase().includes(q) ||
        (p.method || "").toLowerCase().includes(q)
    );
  }, [allPayments, searchTerm]);

  const totalDue = customers.reduce((sum, c) => sum + (c.dueAmount > 0 ? c.dueAmount : 0), 0);
  const totalPayable = customers.reduce((sum, c) => sum + (c.dueAmount < 0 ? Math.abs(c.dueAmount) : 0), 0);
  const totalCollectedPayments = allPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {notification && (
        <div
          className={cn(
            "fixed top-20 right-6 z-[80] px-5 py-3.5 rounded-2xl shadow-xl border font-bold font-bengali text-sm flex items-center gap-2.5 animate-in fade-in slide-in-from-top-3",
            notification.type === "success"
              ? "bg-emerald-600 text-white border-emerald-500"
              : "bg-rose-600 text-white border-rose-500"
          )}
        >
          {notification.type === "success" ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Top Summary Banner & Controls */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 bg-rose-50 dark:bg-rose-950/30 rounded-2xl flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0">
              <AlertCircle size={24} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400 font-bengali">মোট বকেয়া (পাবো)</p>
              <h3 className="text-xl font-black text-rose-600 dark:text-rose-400 font-sans">৳{totalDue.toLocaleString()}</h3>
            </div>
          </div>

          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-950/30 rounded-2xl flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
              <Receipt size={24} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400 font-bengali">মোট আদায়কৃত পেমেন্ট ({allPayments.length} টি)</p>
              <h3 className="text-xl font-black text-emerald-600 dark:text-emerald-400 font-sans">
                ৳{totalCollectedPayments.toLocaleString()}
              </h3>
            </div>
          </div>

          {totalPayable > 0 && (
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 bg-blue-50 dark:bg-blue-950/30 rounded-2xl flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                <CheckCircle2 size={24} />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 font-bengali">মোট অগ্রিম জমা (ক্রেতা পাবে)</p>
                <h3 className="text-xl font-black text-blue-600 dark:text-blue-400 font-sans">৳{totalPayable.toLocaleString()}</h3>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1 sm:w-72">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={18} />
            <input
              type="text"
              placeholder={
                activeView === "customers"
                  ? "ক্রেতার নাম বা মোবাইল দিয়ে খুঁজুন..."
                  : "রিসিপ্ট নং (PAY-...), ক্রেতার নাম বা মোবাইল..."
              }
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl py-2.5 pl-11 pr-4 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-bengali"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 transition-all active:scale-95 font-bengali shrink-0"
          >
            <UserPlus size={18} />
            নতুন ক্রেতা
          </button>
        </div>
      </div>

      {/* Main View Switcher: Customer List vs Payment List */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setActiveView("customers")}
            className={cn(
              "px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm font-bengali flex items-center gap-2 transition-all",
              activeView === "customers"
                ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
            )}
          >
            <Users size={17} />
            <span>ক্রেতা ও বকেয়া তালিকা</span>
            <span
              className={cn(
                "px-2 py-0.5 rounded-lg text-xs font-sans",
                activeView === "customers"
                  ? "bg-white/20 text-white"
                  : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300"
              )}
            >
              {customers.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveView("payments")}
            className={cn(
              "px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm font-bengali flex items-center gap-2 transition-all",
              activeView === "payments"
                ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/20"
                : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
            )}
          >
            <Receipt size={17} />
            <span>পেমেন্ট এর লিস্ট (জমা হিস্টোরি)</span>
            <span
              className={cn(
                "px-2 py-0.5 rounded-lg text-xs font-sans",
                activeView === "payments"
                  ? "bg-white/20 text-white"
                  : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300"
              )}
            >
              {allPayments.length}
            </span>
          </button>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400 font-bengali px-2">
          💡 যেকোনো ক্রেতার উপর ক্লিক করলে তার সম্পূর্ণ <strong>পেমেন্ট ও বাকি হিস্টোরি</strong> দেখতে পাবেন।
        </p>
      </div>

      {/* VIEW 1: CUSTOMER CARDS */}
      {activeView === "customers" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCustomers.map((customer) => {
            const customerPayList = allPayments.filter((p) => matchesCustomer(p, customer));
            const customerSaleList = allSales.filter((s) => matchesCustomer(s, customer));
            const totalCustomerPaid = customerPayList.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);

            return (
              <div
                key={customer.id}
                onClick={() => openCustomerHistory(customer, "payments")}
                className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm hover:shadow-md hover:border-blue-400 dark:hover:border-blue-500 transition-all flex flex-col justify-between group cursor-pointer relative"
              >
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center text-slate-600 dark:text-slate-400 font-black text-lg group-hover:bg-blue-600 group-hover:text-white transition-colors shrink-0">
                      {(customer.name || "ক")[0]}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className="flex items-center gap-1 opacity-90 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingCustomer(customer);
                            setIsEditModalOpen(true);
                          }}
                          className="p-1.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20"
                          title="এডিট"
                        >
                          <Edit2 size={14} />
                        </button>
                        {canDeleteCustomer && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDeleteId(customer.id);
                            }}
                            className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/20"
                            title="ডিলিট"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                      <div
                        className={cn(
                          "px-3 py-1 rounded-full text-xs font-bold font-bengali",
                          customer.dueAmount > 0
                            ? "bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400"
                            : customer.dueAmount < 0
                            ? "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400"
                            : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400"
                        )}
                      >
                        {customer.dueAmount > 0
                          ? `বকেয়া: ৳${customer.dueAmount.toLocaleString()}`
                          : customer.dueAmount < 0
                          ? `ক্রেতা পাবে: ৳${Math.abs(customer.dueAmount).toLocaleString()}`
                          : "পরিশোধিত"}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center gap-1.5">
                      <h4 className="text-lg font-bold text-slate-900 dark:text-slate-100 font-bengali group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {customer.name}
                      </h4>
                      <ArrowUpRight size={15} className="text-slate-400 group-hover:text-blue-600 transition-colors" />
                    </div>
                    <div className="mt-2 space-y-1">
                      <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 font-sans">
                        <Phone size={14} className="text-slate-400 dark:text-slate-500" />
                        {customer.phone || "নম্বর নেই"}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 font-bengali">
                        <MapPin size={14} className="text-slate-400 dark:text-slate-500" />
                        {customer.address || "ঠিকানা নেই"}
                      </p>
                    </div>
                  </div>

                  {/* Mini Payment & Memo Stats badge inside card */}
                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <div className="bg-slate-50 dark:bg-slate-800/70 rounded-xl p-2.5 border border-slate-100 dark:border-slate-800">
                      <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 font-bengali">
                        পেমেন্ট রিসিপ্ট ({customerPayList.length})
                      </p>
                      <p className="text-xs font-black text-emerald-600 dark:text-emerald-400 font-sans mt-0.5">
                        ৳{totalCustomerPaid.toLocaleString()}
                      </p>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800/70 rounded-xl p-2.5 border border-slate-100 dark:border-slate-800">
                      <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 font-bengali">
                        মোট বিক্রয় মেমো ({customerSaleList.length})
                      </p>
                      <p className="text-xs font-black text-blue-600 dark:text-blue-400 font-bengali mt-0.5">
                        হিস্টোরি দেখুন →
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedCustomer(customer);
                      }}
                      className="flex-1 bg-slate-900 dark:bg-blue-600 hover:bg-blue-600 dark:hover:bg-blue-700 text-white py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all font-bengali"
                    >
                      <DollarSign size={14} />
                      পেমেন্ট / জমা গ্রহণ
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handlePrintLedger(customer, e)}
                      className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 rounded-xl transition-all"
                      title="লেজার প্রিন্ট"
                    >
                      <Printer size={16} />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openCustomerHistory(customer, "payments");
                    }}
                    className="w-full py-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-bold text-xs font-bengali flex items-center justify-center gap-1.5 transition-all"
                  >
                    <History size={14} />
                    <span>পেমেন্ট ও বাকি হিস্টোরি দেখুন</span>
                  </button>
                </div>
              </div>
            );
          })}

          {filteredCustomers.length === 0 && !loading && (
            <div className="col-span-full bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-12 text-center">
              <p className="text-sm font-bold text-slate-600 dark:text-slate-300 font-bengali">কোনো ক্রেতা খুঁজে পাওয়া যায়নি</p>
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: DEDICATED PAYMENT LIST (সকল পেমেন্ট ও জমা হিস্টোরি) */}
      {activeView === "payments" && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="p-5 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white font-bengali flex items-center gap-2">
                <Receipt size={20} className="text-emerald-600" />
                <span>ক্রেতার পেমেন্ট ও বকেয়া জমার তালিকা</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-bengali mt-0.5">
                সকল ক্রেতার জমা দেওয়া পেমেন্ট রিসিপ্ট ও বিস্তারিত হিসাব। ক্রেতার নামের উপর ক্লিক করলে তার সম্পূর্ণ খতিয়ান ও বাকি হিস্টোরি দেখা যাবে।
              </p>
            </div>
            <div className="px-4 py-2 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300 font-bold text-xs font-bengali">
              মোট প্রদর্শিত পেমেন্ট: ৳
              {filteredPayments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0).toLocaleString()} (
              {filteredPayments.length} টি)
            </div>
          </div>

          {filteredPayments.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <Receipt size={36} className="mx-auto text-slate-300 dark:text-slate-700" />
              <p className="text-sm font-bold text-slate-600 dark:text-slate-300 font-bengali">
                এখনো কোনো বকেয়া পেমেন্ট বা জমার এন্ট্রি পাওয়া যায়নি
              </p>
              <p className="text-xs text-slate-400 font-bengali">
                ক্রেতার কার্ড থেকে &ldquo;পেমেন্ট / জমা গ্রহণ&rdquo; বাটনে ক্লিক করে পেমেন্ট জমা নিলে এখানে তালিকা দেখা যাবে।
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 text-xs font-bold font-bengali border-b border-slate-100 dark:border-slate-800">
                    <th className="py-3.5 px-5">রিসিপ্ট নং</th>
                    <th className="py-3.5 px-5">ক্রেতার নাম ও মোবাইল</th>
                    <th className="py-3.5 px-5">তারিখ ও সময়</th>
                    <th className="py-3.5 px-5">মাধ্যম ও নোট</th>
                    <th className="py-3.5 px-5 text-right">জমার পরিমাণ</th>
                    <th className="py-3.5 px-5 text-center">অ্যাকশন</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                  {filteredPayments.map((pay) => {
                    const matchedCust = customers.find((c) => matchesCustomer(pay, c));
                    return (
                      <tr
                        key={pay.id}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-3.5 px-5">
                          <span className="px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-mono text-xs font-bold">
                            #{pay.receiptNo || `PAY-${String(pay.id).slice(-6).toUpperCase()}`}
                          </span>
                        </td>
                        <td className="py-3.5 px-5">
                          <button
                            type="button"
                            onClick={() => {
                              if (matchedCust) {
                                openCustomerHistory(matchedCust, "payments");
                              }
                            }}
                            className="text-left group"
                          >
                            <p className="font-bold text-slate-900 dark:text-white font-bengali group-hover:text-blue-600 dark:group-hover:text-blue-400 flex items-center gap-1">
                              <span>{pay.customerName || matchedCust?.name || "ক্রেতা"}</span>
                              {matchedCust && <ArrowUpRight size={13} className="text-slate-400 group-hover:text-blue-600" />}
                            </p>
                            {(pay.customerPhone || matchedCust?.phone) && (
                              <p className="text-xs text-slate-500 font-sans">{pay.customerPhone || matchedCust?.phone}</p>
                            )}
                          </button>
                        </td>
                        <td className="py-3.5 px-5 text-xs text-slate-600 dark:text-slate-300 font-sans">
                          {formatDhakaDateTime(pay.date || pay.createdAt)}
                        </td>
                        <td className="py-3.5 px-5">
                          <span className="inline-block px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold uppercase font-sans mr-1.5">
                            {pay.method || pay.paymentMethod || "Cash"}
                          </span>
                          {pay.note && (
                            <span className="text-xs text-slate-500 dark:text-slate-400 font-bengali">{pay.note}</span>
                          )}
                        </td>
                        <td className="py-3.5 px-5 text-right font-black text-emerald-600 dark:text-emerald-400 font-sans text-base">
                          ৳{(Number(pay.amount) || 0).toLocaleString()}
                        </td>
                        <td className="py-3.5 px-5">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleReprintPaymentReceipt(pay, matchedCust)}
                              className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-blue-600 hover:text-white text-slate-700 dark:text-slate-300 text-xs font-bold font-bengali flex items-center gap-1.5 transition-all"
                              title="মানি রিসিপ্ট প্রিন্ট"
                            >
                              <Printer size={13} />
                              <span>রিসিপ্ট</span>
                            </button>
                            {matchedCust && (
                              <button
                                type="button"
                                onClick={() => openCustomerHistory(matchedCust, "payments")}
                                className="px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-600 hover:text-white text-blue-700 dark:text-blue-300 text-xs font-bold font-bengali flex items-center gap-1.5 transition-all"
                                title="ক্রেতার সম্পূর্ণ হিস্টোরি"
                              >
                                <History size={13} />
                                <span>হিস্টোরি</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* CUSTOMER PAYMENT & DUE HISTORY MODAL (ক্রেতার উপর ক্লিক করলে পেমেন্ট ও বাকি হিস্টোরি) */}
      {historyCustomer && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-6">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col animate-in fade-in zoom-in duration-200">
            {/* Modal Header */}
            <div className="p-5 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/70 dark:bg-slate-800/40">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-black text-lg shrink-0">
                  {(historyCustomer.name || "ক")[0]}
                </div>
                <div>
                  <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white font-bengali">
                    {historyCustomer.name} — পেমেন্ট ও বাকি হিস্টোরি
                  </h3>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {historyCustomer.phone && (
                      <span className="flex items-center gap-1 font-sans">
                        <Phone size={12} /> {historyCustomer.phone}
                      </span>
                    )}
                    {historyCustomer.address && (
                      <span className="flex items-center gap-1 font-bengali">
                        <MapPin size={12} /> {historyCustomer.address}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center">
                <button
                  type="button"
                  onClick={() => setSelectedCustomer(historyCustomer)}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs font-bengali flex items-center gap-1.5 shadow-sm transition-all"
                >
                  <DollarSign size={14} />
                  <span>নতুন পেমেন্ট গ্রহণ</span>
                </button>
                <button
                  type="button"
                  onClick={() => handlePrintLedger(historyCustomer)}
                  className="px-3.5 py-2 rounded-xl bg-slate-200/80 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs font-bengali flex items-center gap-1.5 transition-all"
                >
                  <Printer size={14} />
                  <span>পূর্ণ খতিয়ান প্রিন্ট</span>
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryCustomer(null)}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Customer Financial Summary Cards */}
            {(() => {
              const totalBill = historyCustomerSales.reduce(
                (acc, s) => acc + (Number(s.payableAmount ?? s.totalAmount) || 0),
                0
              );
              const totalDirectPaid = historyCustomerPaymentsList.reduce(
                (acc, p) => acc + (Number(p.amount) || 0),
                0
              );
              return (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 sm:px-6 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800">
                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400 font-bengali">
                      মোট ক্রয় / মেমো বিল ({historyCustomerSales.length} টি মেমো)
                    </p>
                    <p className="text-lg font-black text-slate-900 dark:text-white font-sans mt-0.5">
                      ৳{totalBill.toLocaleString()}
                    </p>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-800/50">
                    <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400 font-bengali">
                      বকেয়া পেমেন্ট রিসিপ্ট জমা ({historyCustomerPaymentsList.length} টি)
                    </p>
                    <p className="text-lg font-black text-emerald-600 dark:text-emerald-400 font-sans mt-0.5">
                      ৳{totalDirectPaid.toLocaleString()}
                    </p>
                  </div>

                  <div
                    className={cn(
                      "p-3.5 rounded-2xl border",
                      historyCustomer.dueAmount > 0
                        ? "bg-rose-50/70 dark:bg-rose-950/30 border-rose-200/70 dark:border-rose-800/50"
                        : historyCustomer.dueAmount < 0
                        ? "bg-blue-50/70 dark:bg-blue-950/30 border-blue-200/70 dark:border-blue-800/50"
                        : "bg-slate-50 dark:bg-slate-800/60 border-slate-200/70 dark:border-slate-800"
                    )}
                  >
                    <p className="text-xs font-bold text-slate-600 dark:text-slate-300 font-bengali">
                      {historyCustomer.dueAmount > 0
                        ? "বর্তমান নিট বকেয়া (পাবো)"
                        : historyCustomer.dueAmount < 0
                        ? "বর্তমান অগ্রিম জমা (ক্রেতা পাবে)"
                        : "বর্তমান ব্যালেন্স"}
                    </p>
                    <p
                      className={cn(
                        "text-lg font-black font-sans mt-0.5",
                        historyCustomer.dueAmount > 0
                          ? "text-rose-600 dark:text-rose-400"
                          : historyCustomer.dueAmount < 0
                          ? "text-blue-600 dark:text-blue-400"
                          : "text-emerald-600 dark:text-emerald-400"
                      )}
                    >
                      ৳{Math.abs(historyCustomer.dueAmount).toLocaleString()}
                    </p>
                  </div>
                </div>
              );
            })()}

            {/* Separated Sub-Tabs Inside Customer History Modal */}
            <div className="px-5 sm:px-6 pt-3 pb-2 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2 bg-slate-50/40 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => setHistoryTab("payments")}
                className={cn(
                  "px-4 py-2 rounded-xl font-bold text-xs sm:text-sm font-bengali flex items-center gap-2 transition-all",
                  historyTab === "payments"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                )}
              >
                <CreditCard size={15} />
                <span>পেমেন্ট হিস্টোরি (জমা তালিকা)</span>
                <span className="px-1.5 py-0.5 rounded-md bg-black/15 text-[11px] font-sans">
                  {historyCustomerPaymentsList.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setHistoryTab("dues")}
                className={cn(
                  "px-4 py-2 rounded-xl font-bold text-xs sm:text-sm font-bengali flex items-center gap-2 transition-all",
                  historyTab === "dues"
                    ? "bg-blue-600 text-white shadow-sm"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                )}
              >
                <ShoppingBag size={15} />
                <span>বাকি ও বিক্রয় মেমো হিস্টোরি</span>
                <span className="px-1.5 py-0.5 rounded-md bg-black/15 text-[11px] font-sans">
                  {historyCustomerSales.length}
                </span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-3">
              {historyLoading ? (
                <div className="py-12 text-center text-sm font-bold text-slate-500 font-bengali">
                  ক্রেতার হিস্টোরি লোড হচ্ছে...
                </div>
              ) : historyTab === "payments" ? (
                historyCustomerPaymentsList.length === 0 ? (
                  <div className="p-10 text-center bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
                    <Receipt size={32} className="mx-auto text-slate-400" />
                    <p className="text-sm font-bold text-slate-600 dark:text-slate-300 font-bengali">
                      এই ক্রেতার কোনো আলাদা পেমেন্ট রিসিপ্ট এখনো জমা হয়নি
                    </p>
                    <p className="text-xs text-slate-400 font-bengali">
                      উপরে &ldquo;নতুন পেমেন্ট গ্রহণ&rdquo; বাটনে ক্লিক করে বকেয়া বা অগ্রিম পেমেন্ট জমা নিতে পারেন।
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {historyCustomerPaymentsList.map((pay) => (
                      <div
                        key={pay.id}
                        className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2.5 py-0.5 rounded-lg bg-emerald-600 text-white font-mono text-xs font-bold">
                              #{pay.receiptNo || `PAY-${String(pay.id).slice(-6).toUpperCase()}`}
                            </span>
                            <span className="px-2.5 py-0.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-xs font-bold font-bengali">
                              পেমেন্ট জমা
                            </span>
                            <span className="text-xs text-slate-500 dark:text-slate-400 font-sans flex items-center gap-1">
                              <Calendar size={12} />
                              {formatDhakaDateTime(pay.date || pay.createdAt)}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 dark:text-slate-300 font-bengali pt-1">
                            পেমেন্ট মাধ্যম:{" "}
                            <span className="font-bold uppercase font-sans">{pay.method || pay.paymentMethod || "Cash"}</span>
                            {pay.note ? ` • নোট: ${pay.note}` : ""}
                            {pay.userName ? ` • গ্রহণকারী: ${pay.userName}` : ""}
                          </p>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-3 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-200 dark:border-slate-700">
                          <span className="text-lg font-black text-emerald-600 dark:text-emerald-400 font-sans">
                            + ৳{(Number(pay.amount) || 0).toLocaleString()}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleReprintPaymentReceipt(pay, historyCustomer)}
                            className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-blue-600 hover:text-white text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-bold font-bengali flex items-center gap-1.5 transition-all"
                          >
                            <Printer size={13} />
                            <span>রিসিপ্ট প্রিন্ট</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : historyCustomerSales.length === 0 ? (
                <div className="p-10 text-center bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
                  <FileText size={32} className="mx-auto text-slate-400" />
                  <p className="text-sm font-bold text-slate-600 dark:text-slate-300 font-bengali">
                    এই ক্রেতার নামে কোনো বিক্রয় মেমো পাওয়া যায়নি
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {historyCustomerSales.map((sale) => {
                    const invNo = sale.invoiceNo || `INV-${String(sale.id).slice(-6).toUpperCase()}`;
                    const payable = Number(sale.payableAmount ?? sale.totalAmount) || 0;
                    const paid = Number(sale.paidAmount) || 0;
                    const due = Number(sale.dueAmount) || 0;

                    return (
                      <div
                        key={sale.id}
                        className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2.5 py-0.5 rounded-lg bg-slate-900 dark:bg-slate-700 text-white font-mono text-xs font-bold">
                              #{invNo}
                            </span>
                            <span
                              className={cn(
                                "px-2.5 py-0.5 rounded-lg text-xs font-bold font-bengali",
                                due > 0
                                  ? "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
                                  : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                              )}
                            >
                              {due > 0 ? `বাকি মেমো: ৳${due.toLocaleString()}` : "পরিশোধিত মেমো"}
                            </span>
                            <span className="text-xs text-slate-500 dark:text-slate-400 font-sans">
                              {formatDhakaDateTime(sale.createdAt)}
                            </span>
                          </div>

                          {Array.isArray(sale.items) && sale.items.length > 0 && (
                            <p className="text-xs text-slate-700 dark:text-slate-300 font-bengali">
                              পণ্য:{" "}
                              {sale.items
                                .map((it: any) => `${it.name || it.productName || "পণ্য"} (${it.quantity} টি)`)
                                .join(", ")}
                            </p>
                          )}

                          <div className="flex flex-wrap items-center gap-3 text-xs font-bengali pt-0.5">
                            <span className="text-slate-600 dark:text-slate-300">
                              মোট বিল: <strong className="font-sans">৳{payable.toLocaleString()}</strong>
                            </span>
                            <span className="text-emerald-600 dark:text-emerald-400">
                              জমা: <strong className="font-sans">৳{paid.toLocaleString()}</strong>
                            </span>
                            <span className={due > 0 ? "text-rose-600 dark:text-rose-400 font-bold" : "text-slate-400"}>
                              বাকি: <strong className="font-sans">৳{due.toLocaleString()}</strong>
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-3 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-200 dark:border-slate-700 shrink-0">
                          <button
                            type="button"
                            onClick={() => printInvoice(sale)}
                            className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-blue-600 hover:text-white text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-bold font-bengali flex items-center gap-1.5 transition-all"
                          >
                            <Printer size={13} />
                            <span>মেমো প্রিন্ট</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Payment Collection Modal */}
      {selectedCustomer && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 font-bengali">পেমেন্ট / জমা গ্রহণ</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-bengali">{selectedCustomer.name} - এর হিসাব</p>
              </div>
              <button
                onClick={() => setSelectedCustomer(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handlePayment} className="p-6 space-y-4">
              <div
                className={cn(
                  "p-4 rounded-2xl border flex justify-between items-center",
                  selectedCustomer.dueAmount > 0
                    ? "bg-rose-50 dark:bg-rose-950/30 border-rose-100 dark:border-rose-900/30"
                    : selectedCustomer.dueAmount < 0
                    ? "bg-blue-50 dark:bg-blue-950/30 border-blue-100 dark:border-blue-900/30"
                    : "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-100 dark:border-emerald-900/30"
                )}
              >
                <span
                  className={cn(
                    "text-xs font-bold font-bengali",
                    selectedCustomer.dueAmount > 0
                      ? "text-rose-600 dark:text-rose-400"
                      : selectedCustomer.dueAmount < 0
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-emerald-600 dark:text-emerald-400"
                  )}
                >
                  {selectedCustomer.dueAmount > 0
                    ? "বর্তমান বকেয়া (পাবো)"
                    : selectedCustomer.dueAmount < 0
                    ? "বর্তমান অগ্রিম (ক্রেতা পাবে)"
                    : "বর্তমান ব্যালেন্স"}
                </span>
                <span
                  className={cn(
                    "text-lg font-black font-sans",
                    selectedCustomer.dueAmount > 0
                      ? "text-rose-600 dark:text-rose-400"
                      : selectedCustomer.dueAmount < 0
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-emerald-600 dark:text-emerald-400"
                  )}
                >
                  ৳{Math.abs(selectedCustomer.dueAmount).toLocaleString()}
                </span>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 font-bengali">জমার পরিমাণ (৳)</label>
                <input
                  type="number"
                  required
                  min="1"
                  step="any"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-lg font-black text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-sans"
                  placeholder="0.00"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                />
                {paymentAmount && !isNaN(parseFloat(paymentAmount)) && (
                  <p className="text-[11px] font-bold font-bengali pt-1 text-slate-500 dark:text-slate-400">
                    জমার পর{" "}
                    {selectedCustomer.dueAmount - parseFloat(paymentAmount) >= 0 ? (
                      <span className="text-rose-600 dark:text-rose-400">
                        অবশিষ্ট বকেয়া থাকবে: ৳{(selectedCustomer.dueAmount - parseFloat(paymentAmount)).toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-blue-600 dark:text-blue-400">
                        ক্রেতা অগ্রিম পাবে: ৳{Math.abs(selectedCustomer.dueAmount - parseFloat(paymentAmount)).toLocaleString()}
                      </span>
                    )}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 font-bengali">পেমেন্ট মাধ্যম</label>
                <select
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-bengali"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                >
                  <option value="cash">নগদ (Cash)</option>
                  <option value="bkash">বিকাশ (bKash)</option>
                  <option value="nagad">নগদ অ্যাপ (Nagad)</option>
                  <option value="rocket">রকেট (Rocket)</option>
                  <option value="bank">ব্যাংক ট্রান্সফার (Bank)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 font-bengali">নোট / বিবরণ (ঐচ্ছিক)</label>
                <input
                  type="text"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-bengali"
                  placeholder="যেমন: চেক নম্বর বা রেফারেন্স..."
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 font-bengali">তারিখ ও সময় (ঢাকা টাইম)</label>
                <input
                  type="datetime-local"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-sans"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                />
              </div>

              {!isAdminUser && (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-800 dark:text-amber-300 font-bengali leading-relaxed">
                  <strong>নোট:</strong> এই বকেয়া পেমেন্টটি সরাসরি বকেয়া থেকে কাটা হবে না। এটি অ্যাডমিনের কাছে <strong>&ldquo;বিক্রয় অর্ডার&rdquo;</strong> ট্যাবে রিকুয়েস্ট হিসেবে যাবে এবং অ্যাডমিন কনফার্ম করলে বকেয়া থেকে পেমেন্ট সম্পন্ন হবে।
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setSelectedCustomer(null)}
                  className="flex-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 py-3 rounded-xl font-bold text-sm transition-all font-bengali"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold text-sm shadow-lg shadow-blue-500/20 transition-all active:scale-95 font-bengali"
                >
                  {isAdminUser ? "জমা নিশ্চিত করুন" : "পেমেন্ট রিকুয়েস্ট পাঠান"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Customer Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 font-bengali">নতুন ক্রেতা যোগ করুন</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-bengali">ক্রেতার সঠিক তথ্য প্রদান করুন</p>
            </div>
            <form onSubmit={handleAddCustomer} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 font-bengali">ক্রেতার নাম *</label>
                <input
                  type="text"
                  required
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-bengali"
                  value={newCustomer.name}
                  onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 font-bengali">মোবাইল নম্বর</label>
                <input
                  type="text"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-sans"
                  value={newCustomer.phone}
                  onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 font-bengali">ঠিকানা</label>
                <input
                  type="text"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-bengali"
                  value={newCustomer.address}
                  onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 font-bengali">পূর্বের বকেয়া (৳)</label>
                <input
                  type="number"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-sans"
                  value={newCustomer.dueAmount === 0 ? "" : newCustomer.dueAmount}
                  onChange={(e) => setNewCustomer({ ...newCustomer, dueAmount: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="flex-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 py-3 rounded-xl font-bold text-sm transition-all font-bengali"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold text-sm shadow-lg shadow-blue-500/20 transition-all active:scale-95 font-bengali"
                >
                  সংরক্ষণ করুন
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Customer Modal */}
      {isEditModalOpen && editingCustomer && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 font-bengali">ক্রেতার তথ্য পরিবর্তন</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-bengali">সঠিক তথ্য দিয়ে আপডেট করুন</p>
              </div>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleEditCustomer} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 font-bengali">ক্রেতার নাম *</label>
                <input
                  type="text"
                  required
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-bengali"
                  value={editingCustomer.name}
                  onChange={(e) => setEditingCustomer({ ...editingCustomer, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 font-bengali">মোবাইল নম্বর</label>
                <input
                  type="text"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-sans"
                  value={editingCustomer.phone}
                  onChange={(e) => setEditingCustomer({ ...editingCustomer, phone: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 font-bengali">ঠিকানা</label>
                <input
                  type="text"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-bengali"
                  value={editingCustomer.address}
                  onChange={(e) => setEditingCustomer({ ...editingCustomer, address: e.target.value })}
                />
              </div>
              {isAdminUser && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 font-bengali">বর্তমান বকেয়া (৳)</label>
                  <input
                    type="number"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-sans"
                    value={editingCustomer.dueAmount === 0 ? "" : editingCustomer.dueAmount}
                    onChange={(e) => setEditingCustomer({ ...editingCustomer, dueAmount: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              )}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="flex-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 py-3 rounded-xl font-bold text-sm transition-all font-bengali"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold text-sm shadow-lg shadow-blue-500/20 transition-all active:scale-95 font-bengali"
                >
                  আপডেট করুন
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Custom In-App Delete Confirmation Modal */}
      {confirmDeleteId && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-sm p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white font-bengali">ক্রেতা মুছে ফেলুন</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-bengali">
              আপনি কি নিশ্চিত যে এই ক্রেতাকে তালিকা থেকে মুছে ফেলতে চান?
            </p>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs font-bengali"
              >
                বাতিল
              </button>
              <button
                type="button"
                onClick={() => handleDeleteCustomer(confirmDeleteId)}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs font-bengali"
              >
                হ্যাঁ, মুছে ফেলুন
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DueManagement;
