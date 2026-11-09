/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Search, 
  Filter, 
  Eye, 
  Printer, 
  ShoppingCart, 
  Wallet, 
  User as UserIcon, 
  Calendar, 
  Phone, 
  AlertTriangle, 
  Check, 
  X, 
  RefreshCw,
  FileText,
  BadgeAlert
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { api } from "../services/api";
import { ApprovalRequest, User, Product } from "../types";
import { formatDhakaDateTime } from "../lib/utils";
import { printInvoice, printPaymentReceipt } from "../lib/printUtils";

interface ApprovalManagementProps {
  user: User | null;
}

export function ApprovalManagement({ user }: ApprovalManagementProps) {
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [typeFilter, setTypeFilter] = useState<'all' | 'sale' | 'due_payment'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [selectedUserId, setSelectedUserId] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState("");

  // Modals & Action States
  const [selectedRequest, setSelectedRequest] = useState<ApprovalRequest | null>(null);
  const [rejectingRequestId, setRejectingRequestId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showNotify = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3500);
  };

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    loadData();

    // Subscribe to approval requests in real time
    const unsubReq = api.subscribeApprovalRequests((data) => {
      setRequests(data);
      setLoading(false);
    }, isAdmin ? undefined : user?.id);

    // Subscribe to products to have live stock availability
    const unsubProd = api.subscribeProducts((prods) => {
      setProducts(prods);
    });

    return () => {
      unsubReq();
      unsubProd();
    };
  }, [isAdmin, user?.id]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [reqs, uList, prods] = await Promise.all([
        api.getApprovalRequests(isAdmin ? undefined : user?.id),
        api.getUsers(),
        api.getProducts()
      ]);
      setRequests(reqs);
      setUsers(uList);
      setProducts(prods);
    } catch (err) {
      console.error("Failed to load approval requests:", err);
    } finally {
      setLoading(false);
    }
  };

  // Filtered requests list
  const filteredRequests = requests.filter(req => {
    // Type Filter
    if (typeFilter !== 'all' && req.type !== typeFilter) return false;
    // Status Filter
    if (statusFilter !== 'all' && req.status !== statusFilter) return false;
    // User Filter (For Admin)
    if (selectedUserId !== 'all' && req.userId !== selectedUserId) return false;

    // Search Query
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const matchInvoice = (req.temporaryInvoiceNo || "").toLowerCase().includes(q) ||
                           (req.finalInvoiceNo || "").toLowerCase().includes(q);
      const matchUser = (req.userName || "").toLowerCase().includes(q);
      const matchCustomer = req.type === 'sale' 
        ? ((req.saleData?.customerName || "").toLowerCase().includes(q) || (req.saleData?.customerPhone || "").includes(q))
        : ((req.paymentData?.customerName || "").toLowerCase().includes(q) || (req.paymentData?.customerPhone || "").includes(q));
      
      return matchInvoice || matchUser || matchCustomer;
    }
    return true;
  });

  // Stock check helper for a sale request
  const checkStockAvailability = (req: ApprovalRequest) => {
    if (req.type !== 'sale' || !req.saleData?.items) return { ok: true, shortages: [] };
    const shortages: string[] = [];
    for (const item of req.saleData.items) {
      const prod = products.find(p => p.id === item.productId || p.id === (item as any).id);
      const currentStock = prod ? Number(prod.stock) || 0 : 0;
      if (currentStock < Number(item.quantity)) {
        shortages.push(`${item.name} (প্রয়োজন: ${item.quantity}, স্টক: ${currentStock})`);
      }
    }
    return { ok: shortages.length === 0, shortages };
  };

  // Action: Approve
  const handleApprove = async (req: ApprovalRequest) => {
    if (!isAdmin) {
      showNotify("শুধুমাত্র এডমিন অনুমোদন করতে পারেন।", "error");
      return;
    }

    // Check stock for sales
    if (req.type === 'sale') {
      const stockCheck = checkStockAvailability(req);
      if (!stockCheck.ok) {
        if (!confirm(`সতর্কতা: স্টকে ঘাটতি রয়েছে!\n${stockCheck.shortages.join('\n')}\n\nতবুও কি অনুমোদন করতে চান?`)) {
          return;
        }
      }
    }

    try {
      setIsProcessing(true);
      const res = await api.approveRequest(req.id);
      showNotify("রিকুয়েস্ট সফলভাবে অনুমোদিত হয়েছে! স্টক ও হিসাব আপডেট হয়েছে।", "success");

      // Auto print official voucher
      if (res.type === 'sale' && res.sale) {
        await printInvoice(res.sale, false);
      } else if (res.type === 'due_payment') {
        await printPaymentReceipt({
          name: req.paymentData?.customerName || "ক্রেতা",
          phone: req.paymentData?.customerPhone || "",
          amount: req.paymentData?.amount || 0,
          type: 'customer',
          dueRemaining: Math.max(0, (req.paymentData?.currentDueBefore || 0) - (req.paymentData?.amount || 0)),
          isTemporary: false,
          description: `অনুমোদিত বকেয়া আদায় (#${req.temporaryInvoiceNo})`
        });
      }

      await loadData();
      if (selectedRequest?.id === req.id) {
        setSelectedRequest(null);
      }
    } catch (err: any) {
      console.error(err);
      showNotify(err.message || "অনুমোদন ব্যর্থ হয়েছে!", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  // Action: Reject
  const handleRejectConfirm = async () => {
    if (!rejectingRequestId) return;
    try {
      setIsProcessing(true);
      await api.rejectRequest(rejectingRequestId, rejectReason);
      showNotify("রিকুয়েস্টটি বাতিল করা হয়েছে। স্টক বা বকেয়ায় কোনো প্রভাব পরেনি।", "success");
      setRejectingRequestId(null);
      setRejectReason("");
      await loadData();
      if (selectedRequest?.id === rejectingRequestId) {
        setSelectedRequest(null);
      }
    } catch (err: any) {
      console.error(err);
      showNotify(err.message || "বাতিল করা সম্ভব হয়নি!", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  // Action: Print Request slip
  const handlePrintRequest = async (req: ApprovalRequest) => {
    if (req.type === 'sale' && req.saleData) {
      await printInvoice(req.saleData as any, req.status === 'pending');
    } else if (req.type === 'due_payment' && req.paymentData) {
      await printPaymentReceipt({
        name: req.paymentData.customerName,
        phone: req.paymentData.customerPhone || "",
        amount: req.paymentData.amount,
        type: 'customer',
        dueRemaining: req.paymentData.currentDueBefore,
        isTemporary: req.status === 'pending',
        description: `বকেয়া আদায় রিকুয়েস্ট (#${req.temporaryInvoiceNo})`
      });
    }
  };

  // Quick Stats
  const pendingCount = requests.filter(r => r.status === 'pending').length;
  const approvedCount = requests.filter(r => r.status === 'approved').length;
  const rejectedCount = requests.filter(r => r.status === 'rejected').length;
  const pendingSalesTotal = requests
    .filter(r => r.status === 'pending' && r.type === 'sale')
    .reduce((sum, r) => sum + (Number(r.saleData?.payableAmount) || 0), 0);
  const pendingDueTotal = requests
    .filter(r => r.status === 'pending' && r.type === 'due_payment')
    .reduce((sum, r) => sum + (Number(r.paymentData?.amount) || 0), 0);

  return (
    <div className="p-4 sm:p-6 space-y-6 bg-slate-50 dark:bg-slate-950 min-h-full transition-colors duration-300">
      {/* Top Banner / Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-500/20">
              <BadgeAlert size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 dark:text-white font-bengali tracking-tight">
                অনুমোদন রিকুয়েস্ট ব্যবস্থাপনা (Approval Requests)
              </h1>
              <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm font-bengali">
                সেলসম্যানদের বিক্রয় ও বকেয়া আদায়ের খসড়া রিকুয়েস্ট পর্যালোচনা ও অনুমোদন করুন
              </p>
            </div>
          </div>
        </div>

        <button 
          onClick={loadData}
          disabled={loading}
          className="self-start md:self-auto px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 font-bold font-bengali text-xs flex items-center gap-2 shadow-sm transition-all"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          <span>রিফ্রেশ করুন</span>
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-gradient-to-br from-amber-500 to-amber-600 text-white p-4 rounded-2xl shadow-lg shadow-amber-500/10">
          <div className="flex items-center justify-between opacity-80 mb-1">
            <span className="text-[11px] font-bold font-bengali uppercase">অপেক্ষারত রিকুয়েস্ট</span>
            <Clock size={16} />
          </div>
          <div className="text-2xl font-black">{pendingCount} টি</div>
          <div className="text-[10px] font-bengali opacity-90 mt-1">
            বিক্রয়: ৳{Math.round(pendingSalesTotal).toLocaleString()} | বকেয়া: ৳{Math.round(pendingDueTotal).toLocaleString()}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between text-blue-600 dark:text-blue-400 mb-1">
            <span className="text-[11px] font-bold font-bengali uppercase">বিক্রয় রিকুয়েস্ট (POS)</span>
            <ShoppingCart size={16} />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">
            {requests.filter(r => r.type === 'sale').length} টি
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-bengali mt-1">
            টেম্পোরারি ইনভয়েস
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 mb-1">
            <span className="text-[11px] font-bold font-bengali uppercase">বকেয়া আদায় রিকুয়েস্ট</span>
            <Wallet size={16} />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">
            {requests.filter(r => r.type === 'due_payment').length} টি
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-bengali mt-1">
            খসড়া কালেকশন রসিদ
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-[11px] font-bold font-bengali uppercase">অনুমোদিত / বাতিল</span>
            <CheckCircle2 size={16} className="text-emerald-500" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <span className="text-emerald-600 dark:text-emerald-400">{approvedCount}</span>
            <span className="text-slate-300 dark:text-slate-700">/</span>
            <span className="text-rose-600 dark:text-rose-400">{rejectedCount}</span>
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-bengali mt-1">
            ইতিহাস সংরক্ষণ
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
        <div className="flex flex-col lg:flex-row gap-3">
          {/* Search Box */}
          <div className="relative flex-1 group">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors" size={18} />
            <input 
              type="text" 
              placeholder="ইনভয়েস নং, ক্রেতার নাম, মোবাইল নং বা সেলসম্যান খুঁজুন..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 pl-11 pr-4 text-slate-900 dark:text-slate-100 text-sm font-bengali outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          {/* User / Salesman Filter (Admin only) */}
          {isAdmin && (
            <div className="w-full lg:w-64">
              <select
                value={selectedUserId}
                onChange={e => setSelectedUserId(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 px-3 text-slate-900 dark:text-slate-100 text-sm font-bengali outline-none"
              >
                <option value="all">সকল ইউজার / সেলসম্যান</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role === 'admin' ? 'এডমিন' : 'সেলসম্যান'})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Type Filter */}
          <div className="flex gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl overflow-x-auto no-scrollbar">
            <button
              onClick={() => setTypeFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold font-bengali whitespace-nowrap transition-all ${
                typeFilter === 'all' 
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm' 
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              সকল টাইপ
            </button>
            <button
              onClick={() => setTypeFilter('sale')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold font-bengali whitespace-nowrap transition-all ${
                typeFilter === 'sale' 
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm' 
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              🛒 বিক্রয় (POS)
            </button>
            <button
              onClick={() => setTypeFilter('due_payment')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold font-bengali whitespace-nowrap transition-all ${
                typeFilter === 'due_payment' 
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm' 
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              💰 বকেয়া আদায়
            </button>
          </div>
        </div>

        {/* Status Tab Filter */}
        <div className="flex gap-2 border-t border-slate-100 dark:border-slate-800 pt-3 overflow-x-auto no-scrollbar">
          {[
            { id: 'pending', label: 'অপেক্ষারত (Pending)', badge: pendingCount, color: 'bg-amber-500' },
            { id: 'approved', label: 'অনুমোদিত (Approved)', badge: approvedCount, color: 'bg-emerald-500' },
            { id: 'rejected', label: 'বাতিলকৃত (Rejected)', badge: rejectedCount, color: 'bg-rose-500' },
            { id: 'all', label: 'সকল স্ট্যাটাস', badge: requests.length, color: 'bg-slate-500' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold font-bengali whitespace-nowrap transition-all ${
                statusFilter === tab.id
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <span>{tab.label}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                statusFilter === tab.id ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
              }`}>
                {tab.badge}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Requests List */}
      {filteredRequests.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 p-12 rounded-3xl border border-slate-200 dark:border-slate-800 text-center space-y-3">
          <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 size={32} />
          </div>
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200 font-bengali">
            কোনো রিকুয়েস্ট পাওয়া যায়নি
          </h3>
          <p className="text-slate-400 text-xs font-bengali max-w-sm mx-auto">
            বর্তমান ফিল্টারে প্রদর্শনের মতো কোনো পেন্ডিং বা হিস্ট্রি রিকুয়েস্ট নেই।
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRequests.map(req => {
            const isSale = req.type === 'sale';
            const isPending = req.status === 'pending';
            const isApproved = req.status === 'approved';
            const isRejected = req.status === 'rejected';
            const stockCheck = isSale ? checkStockAvailability(req) : { ok: true, shortages: [] };

            const customerName = isSale 
              ? (req.saleData?.customerName || "সাধারণ ক্রেতা")
              : (req.paymentData?.customerName || "ক্রেতা");
            const customerPhone = isSale 
              ? req.saleData?.customerPhone 
              : req.paymentData?.customerPhone;
            const amount = isSale
              ? (Number(req.saleData?.payableAmount) || 0)
              : (Number(req.paymentData?.amount) || 0);

            return (
              <motion.div
                key={req.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`bg-white dark:bg-slate-900 rounded-2xl border transition-all p-4 sm:p-5 shadow-sm hover:shadow-md ${
                  isPending 
                    ? 'border-amber-200 dark:border-amber-900/50 hover:border-amber-300' 
                    : isApproved
                    ? 'border-emerald-200 dark:border-emerald-900/40'
                    : 'border-rose-200 dark:border-rose-900/40 opacity-80'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Left: Details */}
                  <div className="flex items-start gap-3.5">
                    <div className={`p-3 rounded-2xl flex-shrink-0 ${
                      isSale 
                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' 
                        : 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                    }`}>
                      {isSale ? <ShoppingCart size={22} /> : <Wallet size={22} />}
                    </div>

                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          isSale ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
                        }`}>
                          {isSale ? '🛒 বিক্রয় (POS)' : '💰 বকেয়া আদায়'}
                        </span>

                        <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 ${
                          isPending 
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 animate-pulse' 
                            : isApproved
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300'
                            : 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300'
                        }`}>
                          {isPending && <Clock size={11} />}
                          {isApproved && <Check size={11} />}
                          {isRejected && <X size={11} />}
                          {isPending ? 'অপেক্ষারত (Pending)' : isApproved ? 'অনুমোদিত (Approved)' : 'বাতিলকৃত (Cancelled)'}
                        </span>

                        <span className="text-xs font-mono font-bold text-slate-500 dark:text-slate-400">
                          #{req.temporaryInvoiceNo}
                        </span>

                        {req.finalInvoiceNo && (
                          <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            → ফাইনাল: #{req.finalInvoiceNo}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm pt-0.5 font-bengali">
                        <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <span>ক্রেতা: {customerName}</span>
                          {customerPhone && <span className="text-xs font-sans text-slate-400">({customerPhone})</span>}
                        </div>

                        <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                          <UserIcon size={12} className="text-blue-500" />
                          <span>সেলসম্যান: <strong>{req.userName}</strong></span>
                        </div>

                        <div className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1">
                          <Calendar size={12} />
                          <span>{formatDhakaDateTime(req.createdAt)}</span>
                        </div>
                      </div>

                      {/* Line Items preview for sales */}
                      {isSale && req.saleData?.items && (
                        <div className="text-xs text-slate-500 dark:text-slate-400 font-bengali pt-1">
                          পণ্য: {req.saleData.items.map(it => `${it.name} (${it.quantity}টি)`).join(', ')}
                        </div>
                      )}

                      {/* Stock warning if pending sale */}
                      {isPending && isSale && !stockCheck.ok && (
                        <div className="text-xs font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1 font-bengali pt-1">
                          <AlertTriangle size={13} />
                          <span>স্টক ঘাটতি: {stockCheck.shortages.join(' | ')}</span>
                        </div>
                      )}

                      {/* Rejection reason */}
                      {isRejected && req.rejectReason && (
                        <div className="text-xs text-rose-600 dark:text-rose-400 font-bengali pt-1">
                          বাতিলের কারণ: {req.rejectReason} (দ্বারা: {req.reviewedBy})
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Amount & Actions */}
                  <div className="flex flex-wrap sm:flex-nowrap items-center justify-between lg:justify-end gap-3 pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-100 dark:border-slate-800">
                    <div className="text-left lg:text-right pr-2">
                      <p className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500">
                        {isSale ? 'মোট প্রদেয়' : 'গৃহীত বকেয়া'}
                      </p>
                      <p className="text-xl font-black text-slate-900 dark:text-white leading-none">
                        ৳ {amount.toLocaleString()}
                      </p>
                      {isSale && Number(req.saleData?.dueAmount) > 0 && (
                        <p className="text-[11px] font-bold text-rose-500 dark:text-rose-400 font-bengali mt-0.5">
                          বাকি: ৳{req.saleData?.dueAmount}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      {/* View Details */}
                      <button
                        onClick={() => setSelectedRequest(req)}
                        className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl transition-all"
                        title="বিস্তারিত দেখুন"
                      >
                        <Eye size={16} />
                      </button>

                      {/* Print Voucher */}
                      <button
                        onClick={() => handlePrintRequest(req)}
                        className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl transition-all"
                        title="রসিদ প্রিন্ট করুন"
                      >
                        <Printer size={16} />
                      </button>

                      {/* Admin Decision Actions */}
                      {isAdmin && isPending && (
                        <>
                          <button
                            onClick={() => {
                              setRejectingRequestId(req.id);
                              setRejectReason("");
                            }}
                            disabled={isProcessing}
                            className="px-3 py-2 bg-rose-50 dark:bg-rose-900/30 hover:bg-rose-100 text-rose-600 dark:text-rose-400 font-bold font-bengali text-xs rounded-xl flex items-center gap-1.5 transition-all"
                          >
                            <X size={15} />
                            <span>বাতিল</span>
                          </button>

                          <button
                            onClick={() => handleApprove(req)}
                            disabled={isProcessing}
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold font-bengali text-xs rounded-xl shadow-md shadow-emerald-500/20 flex items-center gap-1.5 transition-all"
                          >
                            <Check size={15} />
                            <span>অনুমোদন করুন</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Details Modal */}
      <AnimatePresence>
        {selectedRequest && (
          <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800"
            >
              <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{selectedRequest.type === 'sale' ? '🛒' : '💰'}</span>
                  <div>
                    <h3 className="font-bold text-lg text-slate-900 dark:text-white font-bengali">
                      {selectedRequest.type === 'sale' ? 'বিক্রয় রিকুয়েস্ট বিবরণ' : 'বকেয়া আদায় রিকুয়েস্ট বিবরণ'}
                    </h3>
                    <p className="text-xs text-slate-400 font-mono">
                      #{selectedRequest.temporaryInvoiceNo}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedRequest(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-xl"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto custom-scrollbar font-bengali">
                {/* Meta details */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl text-xs">
                  <div>
                    <span className="text-slate-400">সাবমিট করেছেন:</span>
                    <p className="font-bold text-slate-800 dark:text-slate-200">{selectedRequest.userName}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">তারিখ ও সময়:</span>
                    <p className="font-bold text-slate-800 dark:text-slate-200">{formatDhakaDateTime(selectedRequest.createdAt)}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">বর্তমান স্ট্যাটাস:</span>
                    <p className="font-bold capitalize">{selectedRequest.status}</p>
                  </div>
                </div>

                {/* If Sale Request */}
                {selectedRequest.type === 'sale' && selectedRequest.saleData && (
                  <div className="space-y-4">
                    <div className="border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                          <tr>
                            <th className="p-3">পণ্য</th>
                            <th className="p-3 text-center">পরিমাণ</th>
                            <th className="p-3 text-right">দর</th>
                            <th className="p-3 text-right">মোট</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
                          {selectedRequest.saleData.items?.map((it, idx) => (
                            <tr key={idx}>
                              <td className="p-3 font-bold">{it.name}</td>
                              <td className="p-3 text-center">{it.quantity}</td>
                              <td className="p-3 text-right">৳{it.unitPrice}</td>
                              <td className="p-3 text-right font-black">৳{it.subtotal}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-500">মোট টাকা:</span>
                        <span className="font-bold">৳{selectedRequest.saleData.totalAmount}</span>
                      </div>
                      <div className="flex justify-between text-rose-500">
                        <span>ছাড়:</span>
                        <span>-৳{selectedRequest.saleData.discount}</span>
                      </div>
                      <div className="flex justify-between font-black text-sm pt-2 border-t border-slate-200 dark:border-slate-700">
                        <span>নিট প্রদেয়:</span>
                        <span className="text-blue-600 dark:text-blue-400">৳{selectedRequest.saleData.payableAmount}</span>
                      </div>
                      <div className="flex justify-between text-emerald-600 font-bold">
                        <span>পেইড অ্যামাউন্ট:</span>
                        <span>৳{selectedRequest.saleData.paidAmount}</span>
                      </div>
                      <div className="flex justify-between text-rose-600 font-bold">
                        <span>বকেয়া:</span>
                        <span>৳{selectedRequest.saleData.dueAmount}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* If Due Payment Request */}
                {selectedRequest.type === 'due_payment' && selectedRequest.paymentData && (
                  <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl space-y-3">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500">ক্রেতার নাম:</span>
                      <span className="font-bold">{selectedRequest.paymentData.customerName}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500">ক্রেতার ফোন:</span>
                      <span className="font-bold">{selectedRequest.paymentData.customerPhone || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500">পূর্বে মোট বকেয়া:</span>
                      <span className="font-bold text-rose-600">৳{selectedRequest.paymentData.currentDueBefore}</span>
                    </div>
                    <div className="flex justify-between items-center text-base font-black pt-3 border-t border-slate-200 dark:border-slate-700">
                      <span className="text-emerald-600">গৃহীত পেমেন্ট পরিমাণ:</span>
                      <span className="text-emerald-600 text-xl">৳{selectedRequest.paymentData.amount}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer Actions */}
              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2 font-bengali">
                <button
                  onClick={() => handlePrintRequest(selectedRequest)}
                  className="px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold flex items-center gap-2"
                >
                  <Printer size={16} />
                  <span>রসিদ প্রিন্ট করুন</span>
                </button>

                {isAdmin && selectedRequest.status === 'pending' && (
                  <>
                    <button
                      onClick={() => {
                        setRejectingRequestId(selectedRequest.id);
                        setRejectReason("");
                      }}
                      className="px-4 py-2 bg-rose-50 text-rose-600 rounded-xl text-xs font-bold hover:bg-rose-100"
                    >
                      বাতিল করুন
                    </button>
                    <button
                      onClick={() => handleApprove(selectedRequest)}
                      className="px-5 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 shadow-md shadow-emerald-500/20"
                    >
                      অনুমোদন ও ফাইনাল করুন
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Rejection Note Prompt Modal */}
      <AnimatePresence>
        {rejectingRequestId && (
          <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 font-bengali"
            >
              <div className="flex items-center gap-3 text-rose-600">
                <XCircle size={28} />
                <h3 className="font-bold text-lg text-slate-900 dark:text-white">
                  রিকুয়েস্ট বাতিল নিশ্চিত করুন
                </h3>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400">
                বাতিল করলে পণ্যের স্টক বা কাস্টমারের বকেয়া থেকে কোনো পরিবর্তন হবে না।
              </p>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 block">
                  বাতিলের কারণ (ঐচ্ছিক):
                </label>
                <input
                  type="text"
                  placeholder="যেমন: পণ্য স্টকে নেই / কাস্টমার বাতিল করেছে"
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 px-3 text-sm outline-none focus:ring-2 focus:ring-rose-500/20"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setRejectingRequestId(null)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl text-xs font-bold"
                >
                  ফিরে যান
                </button>
                <button
                  onClick={handleRejectConfirm}
                  disabled={isProcessing}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-md shadow-rose-500/20"
                >
                  হ্যাঁ, বাতিল করুন
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast Notification */}
      {notification && (
        <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 px-6 py-3 rounded-2xl shadow-2xl z-[100] animate-in slide-in-from-bottom duration-300 flex items-center gap-3 ${
          notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
        }`}>
          <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center font-bold">
            {notification.type === 'success' ? '✓' : '!'}
          </div>
          <span className="font-bold font-bengali text-sm">{notification.message}</span>
        </div>
      )}
    </div>
  );
}
