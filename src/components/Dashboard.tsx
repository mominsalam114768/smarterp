/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { TrendingUp, Users, Package, CreditCard, ArrowUpRight, ArrowDownRight, AlertCircle, Printer, FileText } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../services/api";
import { DashboardStats, User } from "../types";
import { printInvoice, printReport } from "../lib/printUtils";
import { formatDhakaDate } from "../lib/utils";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell
} from 'recharts';
import { motion } from "motion/react";

const chartData = [
  { name: 'Sat', sales: 4000, profit: 2400 },
  { name: 'Sun', sales: 3000, profit: 1398 },
  { name: 'Mon', sales: 2000, profit: 9800 },
  { name: 'Tue', sales: 2780, profit: 3908 },
  { name: 'Wed', sales: 1890, profit: 4800 },
  { name: 'Thu', sales: 2390, profit: 3800 },
  { name: 'Fri', sales: 3490, profit: 4300 },
];

export function Dashboard({ user }: { user: User | null }) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const refreshStats = () => {
      api.getDashboardStats(user)
        .then(setStats)
        .catch(err => {
          setError(typeof err === 'string' ? err : err.message || JSON.stringify(err));
        });
    };

    refreshStats();

    const unsubProd = api.subscribeProducts(() => refreshStats());
    const unsubSales = api.subscribeSales(() => refreshStats());
    const unsubCust = api.subscribeCustomers(() => refreshStats());
    const unsubExp = api.subscribeExpenses(() => refreshStats());

    return () => {
      unsubProd();
      unsubSales();
      unsubCust();
      unsubExp();
    };
  }, [user]);

  const handlePrintDashboard = () => {
    if (!stats) return;
    const data = [
      { label: "আজকের মোট বিক্রি", value: `৳ ${stats.todaySales}` },
      { label: "চলতি মাসের বিক্রি", value: `৳ ${stats.monthlySales}` },
      { label: "মোট বকেয়া", value: `৳ ${stats.totalDue}` },
      { label: "স্টক অ্যালার্ট", value: `${stats.lowStockCount} টি পণ্য` },
      { label: "মোট পণ্যের সংখ্যা", value: `${stats.totalProducts} টি` },
      { label: "মোট খরচ", value: `৳ ${stats.totalExpense}` },
    ];
    printReport("ড্যাশবোর্ড সারসংক্ষেপ (Dashboard Summary)", data);
  };

  if (error) {
    return (
      <div className="p-4 sm:p-8 m-2 sm:m-6 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 font-bengali">
        <div className="flex items-center gap-3 mb-2 font-bold text-lg">
          <AlertCircle size={24} className="text-rose-600" />
          তথ্য লোড করতে সমস্যা হয়েছে
        </div>
        <p className="mb-4 text-sm opacity-80">সার্ভার থেকে তথ্য পাওয়া যায়নি। দয়া করে আপনার ইন্টারনেট সংযোগ বা লগইন চেক করুন।</p>
        <div className="text-xs bg-rose-100/50 p-4 rounded-xl font-mono overflow-auto max-h-[300px] border border-rose-200/50">
          <div className="font-bold mb-2 uppercase text-[10px] tracking-wider text-rose-900/50">Detailed Error Logs:</div>
          {error}
        </div>
        <div className="flex flex-wrap gap-2 sm:gap-3 mt-6">
          <button 
            onClick={() => window.location.reload()}
            className="flex-1 sm:flex-none px-6 py-2.5 bg-rose-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-rose-200 hover:bg-rose-700 transition-all flex items-center justify-center gap-2"
          >
            আবার চেষ্টা করুন
          </button>
          <button 
            onClick={() => {
              sessionStorage.clear();
              window.location.href = "/";
            }}
            className="flex-1 sm:flex-none px-6 py-2.5 bg-white border border-rose-200 text-rose-700 rounded-xl text-sm font-bold shadow-sm hover:bg-rose-50 transition-all text-center"
          >
            লগআউট করুন
          </button>
        </div>
      </div>
    );
  }

  if (!stats) return <div className="p-8 text-center animate-pulse font-bengali">লোড হচ্ছে...</div>;

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 bg-slate-50 dark:bg-slate-950 transition-colors duration-300 min-h-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white font-bengali">ব্যবসায়িক পর্যালোচনা</h1>
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm font-bengali">স্বাগতম, আপনার ব্যবসার আজকের অবস্থা দেখুন</p>
        </div>
        <div className="flex gap-2">
          <button className="flex-1 sm:flex-none px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm font-bengali">গত ৭ দিন</button>
          <button 
            onClick={(e) => { e.stopPropagation(); handlePrintDashboard(); }}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-xl text-xs sm:text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm font-bengali cursor-pointer"
          >
            <Printer size={16} className="pointer-events-none" />
            রিপোর্ট প্রিন্ট
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard title="আজকের বিক্রি" value={stats.todaySales} trend="+১২%" icon={TrendingUp} color="bg-blue-500" currency="৳" />
        <StatCard title="চলতি মাসের বিক্রি" value={stats.monthlySales} trend="+৮%" icon={CreditCard} color="bg-emerald-500" currency="৳" />
        <StatCard title="মোট বকেয়া" value={stats.totalDue} trend="-৫%" icon={Users} color="bg-amber-500" currency="৳" negativeTrend />
        <StatCard title="স্টক অ্যালার্ট" value={stats.lowStockCount} trend="৩টি পণ্য" icon={AlertCircle} color="bg-rose-500" isCount />
      </div>

      {(stats.expiredProductCount > 0 || stats.aboutToExpireCount > 0) && (
        <div className="flex flex-col sm:flex-row gap-4">
          {stats.expiredProductCount > 0 && (
            <div className="flex-1 bg-rose-50 dark:bg-rose-900/10 border border-rose-200 dark:border-rose-800 rounded-2xl p-4 flex items-center gap-4 animate-pulse">
              <div className="w-12 h-12 bg-rose-500/10 rounded-full flex items-center justify-center text-rose-600 dark:text-rose-400">
                <AlertCircle size={24} />
              </div>
              <div>
                <h5 className="font-bold text-rose-700 dark:text-rose-400 font-bengali">মেয়াদ উত্তীর্ণ পণ্য!</h5>
                <p className="text-xs text-rose-600/80 dark:text-rose-400/80 font-bengali">{stats.expiredProductCount} টি পণ্যের মেয়াদ শেষ হয়েছে, যা বিক্রয় তালিকা থেকে ব্লক করা হয়েছে।</p>
              </div>
            </div>
          )}
          {stats.aboutToExpireCount > 0 && (
            <div className="flex-1 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 flex items-center gap-4">
              <div className="w-12 h-12 bg-amber-500/10 rounded-full flex items-center justify-center text-amber-600 dark:text-amber-400">
                <AlertCircle size={24} />
              </div>
              <div>
                <h5 className="font-bold text-amber-700 dark:text-amber-400 font-bengali">মেয়াদ শেষ হতে যাচ্ছে</h5>
                <p className="text-xs text-amber-600/80 dark:text-amber-400/80 font-bengali">{stats.aboutToExpireCount} টি পণ্যের মেয়াদ আগামী ৫ দিনের মধ্যে শেষ হবে।</p>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-6">
        {/* Sales Chart */}
        <div className="lg:col-span-3 bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm transition-colors duration-300">
          <div className="flex items-center justify-between mb-6">
            <h4 className="font-bold text-slate-800 dark:text-slate-100 font-sans text-sm sm:text-base">সাপ্তাহিক রিপোর্ট (Weekly Sales)</h4>
            <div className="text-[9px] sm:text-[10px] text-slate-400 font-bold uppercase tracking-widest">Last 7 Days</div>
          </div>
          <div className="h-[200px] sm:h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" strokeOpacity={0.2} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 10, fontWeight: 700}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 10, fontWeight: 700}} />
                <Tooltip 
                  contentStyle={{ 
                    borderRadius: '12px', 
                    border: 'none', 
                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                    backgroundColor: 'var(--tw-colors-slate-900)',
                    color: 'white',
                    fontSize: '12px'
                  }}
                  itemStyle={{ color: '#60a5fa' }}
                  labelStyle={{ fontWeight: 700, color: '#f8fafc', marginBottom: '4px' }}
                />
                <Area type="monotone" dataKey="sales" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorSales)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
 
        {/* Recent Activity */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col transition-colors duration-300">
          <h4 className="font-bold text-slate-800 dark:text-slate-100 mb-6 font-sans text-sm sm:text-base">সাম্প্রতিক লেনদেন</h4>
          <div className="space-y-3 sm:space-y-4 flex-1">
            {stats.recentSales.map((sale, i) => (
              <div key={sale.id} className="flex items-center justify-between p-2 sm:p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-transparent hover:border-slate-100 dark:hover:border-slate-700 transition-all">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg flex items-center justify-center text-[8px] sm:text-[10px] font-bold text-slate-400">INV</div>
                  <div>
                    <p className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 font-sans truncate max-w-[100px] sm:max-w-[120px]">{sale.customerName || "Walk-in Customer"}</p>
                    <p className="text-[8px] sm:text-[10px] text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider">{sale.invoiceNo}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs sm:text-sm font-bold text-emerald-600 dark:text-emerald-500">+ ৳{sale.totalAmount}</p>
                  <p className="text-[8px] sm:text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">Paid</p>
                </div>
              </div>
            ))}
            {stats.recentSales.length === 0 && (
              <div className="text-center py-12 text-slate-300 dark:text-slate-700 font-sans text-sm">No recent transactions</div>
            )}
          </div>
          <button className="w-full mt-6 py-2 text-primary dark:text-blue-400 font-bold text-[9px] sm:text-[10px] uppercase tracking-widest hover:underline transition-all">
            View All Activity
          </button>
        </div>
      </div>
 
      {/* Recent Sales Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden transition-colors duration-300">
        <div className="p-4 sm:p-6 border-b border-slate-50 dark:border-slate-800 flex items-center justify-between">
          <h3 className="font-bold text-slate-900 dark:text-slate-100 font-bengali text-sm sm:text-base">সাম্প্রতিক বিক্রয়</h3>
          <button className="text-primary dark:text-blue-400 text-xs sm:text-sm font-semibold hover:underline font-bengali">সবগুলো দেখুন</button>
        </div>
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left min-w-[600px]">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider font-bengali">
                <th className="px-6 py-4">চালান নং</th>
                <th className="px-6 py-4">ক্রেতা</th>
                <th className="px-6 py-4">তারিখ</th>
                <th className="px-6 py-4">মোট টাকা</th>
                <th className="px-6 py-4">অবস্থা</th>
                <th className="px-6 py-4">অ্যাকশন</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {stats.recentSales.map((sale) => (
                <tr key={sale.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-6 py-4 font-medium text-primary dark:text-blue-400">{sale.invoiceNo}</td>
                  <td className="px-6 py-4 font-bengali dark:text-slate-300">{sale.customerName || "Walking Customer"}</td>
                  <td className="px-6 py-4 text-slate-500 dark:text-slate-400 text-sm font-sans">{formatDhakaDate(sale.createdAt, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                  <td className="px-6 py-4 font-bold text-slate-900 dark:text-slate-100">৳ {sale.totalAmount}</td>
                  <td className="px-6 py-4">
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-500 uppercase">পেইড</span>
                  </td>
                  <td className="px-6 py-4">
                    <button 
                      onClick={() => printInvoice(sale)}
                      className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors text-primary dark:text-blue-400"
                    >
                      <Printer size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {stats.recentSales.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-slate-400 dark:text-slate-600 font-bengali">কোনো বিক্রয় তথ্য পাওয়া যায়নি</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, trend, icon: Icon, color, negativeTrend, currency, isCount }: any) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-all duration-300 group"
    >
      <p className="text-slate-500 dark:text-slate-400 text-sm font-medium font-sans mb-1">{title}</p>
      <div className="flex items-end justify-between mt-2">
        <div className="flex items-baseline gap-1">
          {currency && <span className="text-xl font-bold text-slate-300 dark:text-slate-700">{currency}</span>}
          <h3 className={`text-2xl font-bold ${negativeTrend ? 'text-red-600 dark:text-red-500' : 'text-slate-800 dark:text-slate-100'}`}>
            {typeof value === 'number' ? value.toLocaleString() : value}
          </h3>
        </div>
        <span className={`text-[10px] font-bold px-2 py-1 rounded ${negativeTrend ? 'bg-red-50 dark:bg-red-500/10 text-red-500' : 'bg-green-50 dark:bg-green-500/10 text-green-600'}`}>
          {trend}
        </span>
      </div>
    </motion.div>
  );
}
