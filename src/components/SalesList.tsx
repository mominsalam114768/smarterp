/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, MouseEvent } from "react";
import { api, isShopAdmin } from "../services/api";
import { Sale, User, ApprovalRequest } from "../types";
import { FileText, Search, Filter, Printer, Eye, Trash2 } from "lucide-react";
import { printInvoice, printReport } from "../lib/printUtils";
import { formatDhakaDate, formatDhakaTime, formatDhakaDateTime } from "../lib/utils";

interface SalesListProps {
  user: User | null;
}

export function SalesList({ user }: SalesListProps) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [approvalRequests, setApprovalRequests] = useState<ApprovalRequest[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "paid" | "due" | "advance" | "approved" | "pending">("all");
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  const isAdmin = isShopAdmin(user);
  const canDelete = isAdmin || user?.permissions?.includes('delete_sale');

  const getSaleApprovalState = (s: Sale): 'approved' | 'pending' | 'rejected' => {
    if (s.approvalStatus === 'rejected') return 'rejected';
    if (
      s.isTemporary ||
      s.approvalStatus === 'pending' ||
      String(s.invoiceNo || '').startsWith('TMP-')
    ) {
      return 'pending';
    }
    return 'approved';
  };

  const fetchSales = () => {
    api.getSales(undefined, true).then(items => {
      setSales(items || []);
    });
    api.getApprovalRequests().then(reqs => {
      setApprovalRequests(reqs || []);
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
      setSales(items || []);
    }, undefined, true);

    const unsubUsers = isAdmin ? api.subscribeUsers(setUsers) : () => {};
    const unsubReqs = api.subscribeApprovalRequests((reqs) => {
      setApprovalRequests(reqs || []);
    });

    return () => {
      unsubSales();
      unsubUsers();
      unsubReqs();
    };
  }, [isAdmin, user?.id, user?.businessId]);

  const combinedSales = useMemo(() => {
    const map = new Map<string, Sale>();
    const approvedReqIds = new Set<string>();
    const approvedInvoices = new Set<string>();
    const requestIds = new Set<string>((approvalRequests || []).map(r => r.id));
    const requestTempInvoices = new Set<string>(
      (approvalRequests || []).map(r => r.temporaryInvoiceNo || "").filter(Boolean)
    );

    (sales || []).forEach(s => {
      if (!s || !s.id) return;
      const state = getSaleApprovalState(s);
      // Skip legacy temporary draft docs in `sales` if tracked in `approvalRequests`
      if (
        state !== 'approved' &&
        (requestIds.has(s.id) ||
          (s.approvalRequestId && requestIds.has(s.approvalRequestId)) ||
          (s.invoiceNo && requestTempInvoices.has(s.invoiceNo)))
      ) {
        return;
      }
      map.set(s.id, s);
      if (state === 'approved') {
        if (s.approvalRequestId) approvedReqIds.add(s.approvalRequestId);
        if (s.invoiceNo) approvedInvoices.add(s.invoiceNo);
      }
    });

    (approvalRequests || []).forEach(r => {
      if (!r || r.type !== 'sale') return;
      // If this request was already approved and its confirmed Sale record is in `sales`, avoid duplicating it
      if (
        r.status === 'approved' &&
        (approvedReqIds.has(r.id) || (r.finalInvoiceNo && approvedInvoices.has(r.finalInvoiceNo)))
      ) {
        return;
      }

      const sd = (r.saleData || {}) as Partial<Sale>;
      const payable = Number(sd.payableAmount ?? sd.totalAmount) || 0;
      const paid = Number(sd.paidAmount) || 0;
      const due =
        sd.dueAmount !== undefined && !Number.isNaN(Number(sd.dueAmount))
          ? Number(sd.dueAmount)
          : payable - paid;

      const orderSale: Sale = {
        ...sd,
        id: r.id,
        invoiceNo:
          r.status === 'approved'
            ? r.finalInvoiceNo || sd.invoiceNo || r.temporaryInvoiceNo || `INV-${r.id.slice(-6)}`
            : r.temporaryInvoiceNo || sd.invoiceNo || `TMP-${r.id.slice(-6)}`,
        customerId: sd.customerId || "walking",
        customerName: sd.customerName || "Walking Customer",
        customerPhone: sd.customerPhone || "",
        customerAddress: sd.customerAddress || "",
        userId: r.userId || sd.userId || "",
        createdBy: r.userId || sd.createdBy || "",
        totalAmount: Number(sd.totalAmount) || payable,
        discount: Number(sd.discount) || 0,
        vat: Number(sd.vat) || 0,
        payableAmount: payable,
        paidAmount: paid,
        dueAmount: due,
        paymentMethod: (sd.paymentMethod as any) || "cash",
        items: Array.isArray(sd.items) ? sd.items : [],
        createdAt: r.createdAt || sd.createdAt || new Date().toISOString(),
        isTemporary: r.status !== 'approved',
        approvalStatus: r.status,
        approvalRequestId: r.id
      };
      (orderSale as any).userName = r.userName || (sd as any).userName || "সেলসম্যান";

      map.set(r.id, orderSale);
    });

    const all = Array.from(map.values());
    all.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

    if (!isAdmin && user) {
      const myName = (user.name || "").trim().toLowerCase();
      return all.filter(s => {
        if (s.userId === user.id || s.createdBy === user.id) return true;
        const sName = String((s as any).userName || "").trim().toLowerCase();
        if (myName && sName && sName === myName) return true;
        return false;
      });
    }

    return all;
  }, [sales, approvalRequests, isAdmin, user]);

  const handleDeleteSale = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget;
    const targetItem = combinedSales.find(s => s.id === id);
    const isPendingOrTempOrder =
      targetItem &&
      (getSaleApprovalState(targetItem) !== 'approved' || String(targetItem.id).startsWith('req_sale_'));

    try {
      const success = isPendingOrTempOrder
        ? await api.deleteApprovalRequest(targetItem?.approvalRequestId || id)
        : await api.deleteSale(id);
      if (success) {
        setSales(prev => prev.filter(s => s.id !== id));
        setApprovalRequests(prev => prev.filter(r => r.id !== id && r.id !== targetItem?.approvalRequestId));
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

  const filterableUsers = useMemo(() => {
    const map = new Map<string, { id: string; name: string; role: string }>();
    users.forEach(u => {
      if (u && u.id) {
        map.set(u.id, { id: u.id, name: u.name || "ব্যবহারকারী", role: u.role || "salesman" });
      }
    });
    approvalRequests.forEach(r => {
      if (r.userId && !map.has(r.userId)) {
        map.set(r.userId, { id: r.userId, name: r.userName || r.userId, role: r.userRole || "salesman" });
      }
    });
    return Array.from(map.values());
  }, [users, approvalRequests]);

  const matchesSaleUser = (s: Sale, targetUserId: string) => {
    if (!targetUserId || targetUserId === "all") return true;
    if (s.userId === targetUserId || s.createdBy === targetUserId) return true;
    const selectedUserObj = filterableUsers.find(u => u.id === targetUserId);
    const sUserName = String((s as any).userName || "").trim().toLowerCase();
    if (sUserName && sUserName === targetUserId.trim().toLowerCase()) return true;
    if (selectedUserObj && sUserName && sUserName === selectedUserObj.name.trim().toLowerCase()) return true;
    if (s.approvalRequestId) {
      const req = approvalRequests.find(r => r.id === s.approvalRequestId);
      if (req) {
        if (req.userId === targetUserId) return true;
        if (selectedUserObj && req.userName && req.userName.trim().toLowerCase() === selectedUserObj.name.trim().toLowerCase()) return true;
      }
    }
    return false;
  };

  const filtered = combinedSales.filter(s => {
    const q = searchTerm.trim().toLowerCase();
    const matchesSearch = !q ||
      (s.invoiceNo || "").toLowerCase().includes(q) ||
      (s.customerName && s.customerName.toLowerCase().includes(q)) ||
      (s.customerPhone && s.customerPhone.toLowerCase().includes(q));
    const matchesUser = matchesSaleUser(s, selectedUserId);
    const due = Number(s.dueAmount) || 0;
    const approvalState = getSaleApprovalState(s);
    const matchesStatus =
      statusFilter === "all"
        ? true
        : statusFilter === "approved"
        ? approvalState === "approved"
        : statusFilter === "pending"
        ? approvalState !== "approved"
        : statusFilter === "paid"
        ? due === 0
        : statusFilter === "due"
        ? due > 0
        : due < 0;
    return matchesSearch && matchesUser && matchesStatus;
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
    const totalDue = filtered.reduce((acc, sale) => {
      const d = Number(sale.dueAmount) || 0;
      return d > 0 ? acc + d : acc;
    }, 0);
    const totalAdvance = filtered.reduce((acc, sale) => {
      const d = Number(sale.dueAmount) || 0;
      return d < 0 ? acc + Math.abs(d) : acc;
    }, 0);

    const data = [
      { label: "মোট চালানের সংখ্যা", value: `${filtered.length} টি` },
      { label: "মোট পণ্যের মূল্য", value: `৳ ${totalAmount}` },
      { label: "ভ্যাট সহ মোট দেয়", value: `৳ ${totalPayable}` },
      { label: "মোট সংগৃহীত টাকা", value: `৳ ${totalPaid}` },
      { label: "মোট বকেয়া", value: `৳ ${totalDue}` },
      ...(totalAdvance > 0 ? [{ label: "মোট ক্রেতা পাবে (অতিরিক্ত জমা)", value: `৳ ${totalAdvance}` }] : []),
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
              {filterableUsers.map(u => (
                <option key={u.id} value={u.id}>{u.name} ({u.role === 'admin' ? 'অ্যাডমিন' : 'সেলসম্যান'})</option>
              ))}
            </select>
          </div>
        )}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowFilterMenu(prev => !prev)}
            className={`flex items-center gap-2 px-4 py-2 border rounded-xl transition-colors font-bengali ${
              statusFilter !== 'all'
                ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-500 text-blue-600 dark:text-blue-400 font-bold'
                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
            }`}
          >
            <Filter size={18} />
            <span>
              {statusFilter === 'all'
                ? 'ফিল্টার'
                : statusFilter === 'approved'
                ? 'এক্সেপ্ট হয়েছে'
                : statusFilter === 'pending'
                ? 'এক্সেপ্ট হয়নি'
                : statusFilter === 'paid'
                ? 'পেইড (Paid)'
                : statusFilter === 'due'
                ? 'বকেয়া (Due)'
                : 'ক্রেতা পাবে'}
            </span>
          </button>
          {showFilterMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowFilterMenu(false)} />
              <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl z-20 p-2 space-y-1 font-bengali text-sm">
                {[
                  { id: 'all', label: 'সকল চালান (All)' },
                  { id: 'approved', label: '✓ এক্সেপ্ট হয়েছে' },
                  { id: 'pending', label: '⏳ এক্সেপ্ট হয়নি' },
                  { id: 'paid', label: 'পেইড (Paid)' },
                  { id: 'due', label: 'বকেয়া (Due)' },
                  { id: 'advance', label: 'ক্রেতা পাবে (Advance)' },
                ].map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setStatusFilter(opt.id as any);
                      setShowFilterMenu(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-xl transition-colors ${
                      statusFilter === opt.id
                        ? 'bg-blue-600 text-white font-bold'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
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
              {filtered.map((sale) => {
                const approvalState = getSaleApprovalState(sale);
                return (
                <tr key={sale.id} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold ${
                        approvalState === 'approved'
                          ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                          : approvalState === 'rejected'
                          ? 'bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400'
                          : 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
                      }`}>
                        {approvalState === 'approved' ? 'INV' : 'ORD'}
                      </div>
                      <div>
                        <span className="font-bold text-slate-900 dark:text-slate-100 block">{sale.invoiceNo}</span>
                        {approvalState === 'approved' ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 mt-0.5 rounded text-[10px] font-bold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200/70 dark:border-emerald-500/20 font-bengali">
                            ✓ এক্সেপ্ট হয়েছে
                          </span>
                        ) : approvalState === 'rejected' ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 mt-0.5 rounded text-[10px] font-bold bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-200/70 dark:border-rose-500/20 font-bengali">
                            ✕ বাতিল (এক্সেপ্ট হয়নি)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 mt-0.5 rounded text-[10px] font-bold bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-200/70 dark:border-amber-500/20 font-bengali">
                            ⏳ এক্সেপ্ট হয়নি
                          </span>
                        )}
                      </div>
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
                    {sale.dueAmount < 0 && <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold font-bengali">ক্রেতা পাবে: ৳ {Math.abs(sale.dueAmount)}</p>}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col items-start gap-1">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider font-bengali ${
                        sale.dueAmount < 0
                          ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : sale.dueAmount === 0
                            ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400'
                            : 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-500'
                      }`}>
                        {sale.dueAmount < 0 ? 'ক্রেতা পাবে' : sale.dueAmount === 0 ? 'PAID' : 'DUE'}
                      </span>
                      {approvalState === 'approved' ? (
                        <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 font-bengali">
                          • এক্সেপ্ট হয়েছে
                        </span>
                      ) : approvalState === 'rejected' ? (
                        <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 font-bengali">
                          • বাতিল করা হয়েছে
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 font-bengali">
                          • এক্সেপ্ট হয়নি
                        </span>
                      )}
                    </div>
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
              );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-20 text-center text-slate-400 dark:text-slate-600 font-bengali">কোনো বিক্রয় তথ্য পাওয়া যায়নি</td>
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
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white font-bengali">বিক্রয় বিস্তারিত: #{selectedSale.invoiceNo}</h3>
                  {getSaleApprovalState(selectedSale) === 'approved' ? (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 font-bengali">
                      ✓ এক্সেপ্ট হয়েছে
                    </span>
                  ) : getSaleApprovalState(selectedSale) === 'rejected' ? (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20 font-bengali">
                      ✕ বাতিল (এক্সেপ্ট হয়নি)
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20 font-bengali">
                      ⏳ এক্সেপ্ট হয়নি
                    </span>
                  )}
                </div>
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
                {selectedSale.dueAmount < 0 && (
                  <div className="flex justify-between items-center text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-1 rounded-lg">
                    <span className="font-bold font-bengali">ক্রেতা পাবে (অতিরিক্ত জমা):</span>
                    <span className="font-bold font-sans">৳ {Math.abs(selectedSale.dueAmount)}</span>
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
