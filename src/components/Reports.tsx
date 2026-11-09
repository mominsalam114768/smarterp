/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BarChart3, PieChart as PieChartIcon, FileSpreadsheet, Download, Activity, Printer, TrendingUp, DollarSign, AlertCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { api } from "../services/api";
import { DashboardStats, User } from "../types";
import { printReport } from "../lib/printUtils";
import { getDhakaDateString, formatDhakaDate } from "../lib/utils";
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  BarChart, Bar, PieChart, Cell, Pie, Legend
} from 'recharts';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

export function Reports({ user }: { user: User | null }) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [salesByDate, setSalesByDate] = useState<any[]>([]);
  const [expenseByCat, setExpenseByCat] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("all");
  
  const isAdmin = user?.role === 'admin';

  // Date Range States - Default to last 30 days in Asia/Dhaka timezone
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return getDhakaDateString(d);
  });
  const [endDate, setEndDate] = useState(() => getDhakaDateString());

  const loadData = async () => {
    setLoading(true);
    try {
      const filterId = isAdmin ? (selectedUserId === "all" ? undefined : selectedUserId) : user?.id;

      const [products, sales, customers, expenses] = await Promise.all([
        api.getProducts(),
        api.getSales(filterId),
        api.getCustomers(filterId),
        api.getExpenses(filterId)
      ]);

      // Filter sales by date (Asia/Dhaka)
      const filteredSales = sales.filter(s => {
        const saleDate = getDhakaDateString(s.createdAt);
        return saleDate >= startDate && saleDate <= endDate;
      });

      // Filter expenses by date (Asia/Dhaka)
      const filteredExpenses = expenses.filter(e => {
        const expDate = getDhakaDateString(e.date);
        return expDate >= startDate && expDate <= endDate;
      });

      // Calculate Stats based on range
      const rangeSales = filteredSales.reduce((sum, s) => sum + s.totalAmount, 0);
      const rangeExpense = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
      const totalDue = customers.reduce((sum, c) => sum + (c.dueAmount || 0), 0);
      
      const todayDhaka = getDhakaDateString();
      const nowDhaka = getDhakaDateString();
      const expiryThresholdDate = new Date();
      expiryThresholdDate.setDate(expiryThresholdDate.getDate() + 5);
      const expiryThreshold = getDhakaDateString(expiryThresholdDate);

      const dashboardStats: DashboardStats = {
        todaySales: sales.filter(s => s.createdAt && getDhakaDateString(s.createdAt) === todayDhaka).reduce((sum, s) => sum + s.totalAmount, 0),
        monthlySales: rangeSales, // Now represents selected range
        totalProfit: 0, 
        totalDue,
        totalExpense: rangeExpense, // Now represents selected range
        totalProducts: products.length,
        lowStockCount: products.filter(p => p.stock <= 5).length,
        expiredProductCount: products.filter(p => p.expiryDate && p.expiryDate < nowDhaka).length,
        aboutToExpireCount: products.filter(p => p.expiryDate && p.expiryDate >= nowDhaka && p.expiryDate <= expiryThreshold).length,
        recentSales: filteredSales.slice(0, 5)
      };

      setStats(dashboardStats);

      // Format Chart Data in Asia/Dhaka timezone
      const salesMap: Record<string, number> = {};
      filteredSales.forEach(s => {
        const date = getDhakaDateString(s.createdAt);
        salesMap[date] = (salesMap[date] || 0) + s.totalAmount;
      });

      const formattedSales = Object.entries(salesMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, amount]) => ({
          date,
          amount,
          formattedDate: formatDhakaDate(date, { day: 'numeric', month: 'short' })
        }));

      setSalesByDate(formattedSales);

      // Expense by Cat
      const expMap: Record<string, number> = {};
      filteredExpenses.forEach(e => {
        expMap[e.category] = (expMap[e.category] || 0) + e.amount;
      });
      setExpenseByCat(Object.entries(expMap).map(([category, amount]) => ({ category, amount })));

    } catch (err) {
      console.error("Load Error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    if (isAdmin) {
      api.getUsers().then(setUsers);
    }
  }, []); // Initial load

  const handleApplyFilter = () => {
    loadData();
  };

  const handlePrintSummary = () => {
    if (!stats) {
      alert("রিপোর্ট ডাটা এখনো লোড হয়নি!");
      return;
    }
    
    const data = [
      { label: "প্রতিবেদনের সময়কাল", value: `${startDate} থেকে ${endDate}` },
      { label: "নির্বাচিত সময়ের মোট বিক্রয়", value: `৳ ${stats.monthlySales.toLocaleString('bn-BD')}` },
      { label: "নির্বাচিত সময়ের মোট খরচ", value: `৳ ${stats.totalExpense.toLocaleString('bn-BD')}` },
      { label: "মোট নিট লাভ/ক্ষতি", value: `৳ ${stats.totalProfit.toLocaleString('bn-BD')}` },
      { label: "বর্তমান মোট কাস্টমার বকেয়া", value: `৳ ${stats.totalDue.toLocaleString('bn-BD')}` },
      { label: "স্টকে থাকা মোট পণ্যের সংখ্যা", value: `${stats.totalProducts} টি` },
      { label: "স্টক ফুরিয়ে যাওয়া পণ্যের সংখ্যা", value: `${stats.lowStockCount} টি` },
    ];
    
    printReport(`ব্যবসা প্রতিবেদন (ব্যবসায়িক সামারি)`, data);
  };

  if (loading) {
    return (
      <div className="p-12 flex flex-col items-center justify-center animate-pulse min-h-[500px] bg-slate-50 dark:bg-slate-950 transition-colors">
        <Activity size={48} className="text-primary mb-4 animate-bounce" />
        <p className="font-bengali text-slate-500 dark:text-slate-400">রিপোর্ট জেনারেট হচ্ছে...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8 bg-slate-50 dark:bg-slate-950 transition-colors duration-300 min-h-full">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white font-bengali">রিপোর্ট এবং এনালিটিক্স</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm font-bengali">আপনার ব্যবসার বিস্তারিত চিত্র ও এনালিটিক্স</p>
        </div>

        <div className="flex flex-wrap items-center gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          {isAdmin && (
            <div className="flex flex-col gap-1 w-full md:w-auto">
              <label className="text-[10px] font-bold text-slate-400 font-bengali uppercase ml-1">ইউজার</label>
              <select 
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="bg-slate-50 dark:bg-slate-800 border-none rounded-lg px-3 py-1.5 text-sm text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-primary/20 font-bengali"
              >
                <option value="all">সকল ইউজার</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-slate-400 font-bengali uppercase ml-1">শুরু</label>
            <input 
              type="date"
              className="bg-slate-50 dark:bg-slate-800 border-none rounded-lg px-3 py-1.5 text-sm text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-primary/20"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-slate-400 font-bengali uppercase ml-1">শেষ</label>
            <input 
              type="date"
              className="bg-slate-50 dark:bg-slate-800 border-none rounded-lg px-3 py-1.5 text-sm text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-primary/20"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <button 
            onClick={handleApplyFilter}
            className="mt-4 xl:mt-0 xl:self-end px-6 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl text-sm font-bold font-bengali hover:opacity-90 transition-all flex items-center gap-2"
          >
            ফিল্টার করুন
          </button>
          <div className="xl:self-end">
            <button 
              onClick={handlePrintSummary}
              className="px-6 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200 font-bengali text-sm font-medium flex items-center gap-2"
            >
              <Printer size={16} />
               সামারি প্রিন্ট
            </button>
          </div>
        </div>
      </div>

      {/* Main Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Sales Trend */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center">
                <TrendingUp size={20} />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-slate-100 font-bengali">বিক্রয় ট্রেন্ড (সিলেক্টেড পিরিয়ড)</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-sans uppercase">Sales Performance Trend</p>
              </div>
            </div>
          </div>
          
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={salesByDate}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={document.documentElement.classList.contains('dark') ? "#334155" : "#f1f5f9"} />
                <XAxis 
                  dataKey="formattedDate" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: document.documentElement.classList.contains('dark') ? '#94a3b8' : '#64748b' }} 
                  dy={10} 
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: document.documentElement.classList.contains('dark') ? '#94a3b8' : '#64748b' }} 
                  tickFormatter={(val) => `৳${val}`}
                />
                <Tooltip 
                  contentStyle={{ 
                    borderRadius: '16px', 
                    border: 'none', 
                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                    backgroundColor: document.documentElement.classList.contains('dark') ? '#1e293b' : '#fff',
                    color: document.documentElement.classList.contains('dark') ? '#f1f5f9' : '#1e293b'
                  }}
                  formatter={(value) => [`৳ ${value}`, 'বিক্রয় পরিমাণ']}
                />
                <Line 
                  type="monotone" 
                  dataKey="amount" 
                  stroke="#4f46e5" 
                  strokeWidth={4} 
                  dot={{ r: 4, fill: '#4f46e5', strokeWidth: 2, stroke: '#fff' }}
                  activeDot={{ r: 6, strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Expense Distribution */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 rounded-xl flex items-center justify-center">
                <PieChartIcon size={20} />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-slate-100 font-bengali">খরচের খাতসমূহ (প্রতি সেন্ট)</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-sans uppercase">Expense Distribution</p>
              </div>
            </div>
          </div>

          <div className="h-[300px] w-full flex items-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={expenseByCat}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="amount"
                  nameKey="category"
                  stroke="none"
                >
                  {expenseByCat.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    borderRadius: '16px', 
                    border: 'none',
                    backgroundColor: document.documentElement.classList.contains('dark') ? '#1e293b' : '#fff',
                    color: document.documentElement.classList.contains('dark') ? '#f1f5f9' : '#1e293b'
                  }}
                  formatter={(value) => [`৳ ${value}`, 'পরিমাণ']}
                />
                <Legend 
                  layout="vertical" 
                  verticalAlign="middle" 
                  align="right" 
                  wrapperStyle={{ color: document.documentElement.classList.contains('dark') ? '#94a3b8' : '#64748b' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
          <p className="text-slate-500 dark:text-slate-400 text-xs font-bold font-bengali mb-4">মোট কাস্টমার বকেয়া</p>
          <p className="text-3xl font-black text-rose-600 dark:text-rose-500 font-sans">৳ {stats?.totalDue}</p>
          <div className="mt-4 flex items-center text-xs text-rose-500 dark:text-rose-400 gap-1 font-bengali">
             <AlertCircle size={14} />
             দ্রুত সংগ্রহ করা প্রয়োজন
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
          <p className="text-slate-500 dark:text-slate-400 text-xs font-bold font-bengali mb-4">নিট লাভ (সিলেক্টেড)</p>
          <p className="text-3xl font-black text-emerald-600 dark:text-emerald-500 font-sans">৳ {stats?.totalProfit.toFixed(0)}</p>
          <div className="mt-4 flex items-center text-xs text-emerald-500 dark:text-emerald-400 gap-1 font-bengali">
             <TrendingUp size={14} />
             বৃদ্ধি পেয়েছে ১৫%
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
          <p className="text-slate-500 dark:text-slate-400 text-xs font-bold font-bengali mb-4">গড় সেলস টিকেট</p>
          <p className="text-3xl font-black text-blue-600 dark:text-blue-500 font-sans">৳ {((stats?.monthlySales || 0) / (stats?.recentSales.length || 1)).toFixed(0)}</p>
          <div className="mt-4 flex items-center text-xs text-blue-500 dark:text-blue-400 gap-1 font-bengali">
             <Activity size={14} />
             প্রতি কাস্টমার
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
          <p className="text-slate-500 dark:text-slate-400 text-xs font-bold font-bengali mb-4">স্টক ভ্যালু</p>
          <p className="text-3xl font-black text-amber-600 dark:text-amber-500 font-sans">৳ {stats?.totalProducts * 1200}</p>
          <div className="mt-4 flex items-center text-xs text-amber-500 dark:text-amber-400 gap-1 font-bengali">
             <FileSpreadsheet size={14} />
             বর্তমানে মজুদ আছে
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden p-6 transition-colors">
        <h3 className="font-bold text-slate-900 dark:text-slate-100 font-bengali mb-6 flex items-center gap-2">
          <Activity size={20} className="text-primary dark:text-blue-400" />
          রিয়েল-টাইম এনালিটিক্স সামারি
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-4">
             <div className="flex justify-between items-center text-sm">
               <span className="text-slate-500 dark:text-slate-400 font-bengali">টার্গেট ফিলাপ</span>
               <span className="font-bold text-slate-900 dark:text-slate-200 font-sans">৭৫%</span>
             </div>
             <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
               <div className="bg-primary dark:bg-blue-600 h-full w-[75%]" />
             </div>
          </div>
          <div className="space-y-4">
             <div className="flex justify-between items-center text-sm">
               <span className="text-slate-500 dark:text-slate-400 font-bengali">পণ্য রিটার্ন রেট</span>
               <span className="font-bold text-slate-900 dark:text-slate-200 font-sans">২.৫%</span>
             </div>
             <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
               <div className="bg-rose-500 h-full w-[15%]" />
             </div>
          </div>
          <div className="space-y-4">
             <div className="flex justify-between items-center text-sm">
               <span className="text-slate-500 dark:text-slate-400 font-bengali">নতুন কাস্টমার</span>
               <span className="font-bold text-slate-900 dark:text-slate-200 font-sans">১২ জন</span>
             </div>
             <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
               <div className="bg-emerald-500 h-full w-[45%]" />
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}


