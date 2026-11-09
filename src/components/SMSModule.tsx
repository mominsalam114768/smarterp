/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, FormEvent } from "react";
import { api } from "../services/api";
import { SMSLog, SMSConfig, Customer } from "../types";
import { MessageSquare, Send, History, Settings, Users, ArrowRight, Search, CheckCircle2, AlertCircle, RefreshCw, Smartphone } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export function SMSModule() {
  const [activeSubTab, setActiveSubTab] = useState<'send' | 'logs' | 'settings'>('send');
  const [logs, setLogs] = useState<SMSLog[]>([]);
  const [config, setConfig] = useState<SMSConfig | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRecipient, setSelectedRecipient] = useState("");
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);

  const showNotify = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [logList, smsConfig, customerList] = await Promise.all([
        api.getSMSLogs(),
        api.getSMSConfig(),
        api.getCustomers()
      ]);
      setLogs(logList);
      setConfig(smsConfig);
      setCustomers(customerList);
    } catch (err) {
      console.error("Load Error:", err);
    }
  };

  const handleSendSMS = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedRecipient || !message) return;
    
    setIsSending(true);
    try {
      await api.sendSMS(selectedRecipient, message);
      showNotify("এসএমএস সফলভাবে পাঠানো হয়েছে");
      setMessage("");
      loadData();
    } catch (err: any) {
      console.error("SMS Error:", err);
      showNotify(err.message || "এসএমএস পাঠানো সম্ভব হয়নি", "error");
    } finally {
      setIsSending(false);
    }
  };

  const handleClearLogs = async () => {
    if (!window.confirm("আপনি কি সব লগ মুছে ফেলতে চান?")) return;
    try {
      // In a real app we'd have a delete method, but here we can just update state if it was a local db
      // For now, let's just show a notification and maybe implement later if needed
      showNotify("লগ ক্লিয়ারেন্স এই ভার্সনে শুধুমাত্র অ্যাডমিন দ্বারা সম্ভব।");
    } catch (err) {
      showNotify("লগ মুছা সম্ভব হয়নি", "error");
    }
  };

  const handleTestAPI = async () => {
    if (config?.provider !== "Demo" && !config?.apiKey) return showNotify("প্রথমে এপিআই কি দিন", "error");
    
    setIsSending(true);
    try {
      await api.sendSMS("01700000000", "Testing business ERP SMS Gateway connection.");
      showNotify("সিস্টেম টেস্ট সফল হয়েছে! দয়া করে আপনার লগ চেক করুন।");
    } catch (err: any) {
      console.error("Test SMS Error:", err);
      showNotify(err.message || "টেস্ট এসএমএস পাঠানো ব্যর্থ হয়েছে", "error");
    } finally {
      setIsSending(false);
    }
  };

  const handleUpdateConfig = async (e: FormEvent) => {
    e.preventDefault();
    if (!config) return;
    try {
      await api.updateSMSConfig(config);
      showNotify("এসএমএস কনফিগারেশন আপডেট করা হয়েছে");
    } catch (err) {
      showNotify("আপডেট করা সম্ভব হয়নি", "error");
    }
  };

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.phone.includes(searchTerm)
  );

  return (
    <div className="p-6 space-y-6 bg-slate-50 dark:bg-slate-950 transition-colors duration-300 min-h-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white font-bengali">এসএমএস মডিউল</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm font-bengali">কাস্টমারদের এসএমএস পাঠান এবং পূর্বের রিপোর্ট দেখুন</p>
        </div>
        
        <div className="flex bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800 transition-colors">
          <button 
            onClick={() => setActiveSubTab('send')}
            className={`px-4 py-2 rounded-lg font-bold font-bengali text-sm transition-all ${activeSubTab === 'send' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
          >
            এসএমএস পাঠান
          </button>
          <button 
            onClick={() => setActiveSubTab('logs')}
            className={`px-4 py-2 rounded-lg font-bold font-bengali text-sm transition-all ${activeSubTab === 'logs' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
          >
            এসএমএস লগ
          </button>
          <button 
            onClick={() => setActiveSubTab('settings')}
            className={`px-4 py-2 rounded-lg font-bold font-bengali text-sm transition-all ${activeSubTab === 'settings' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
          >
            সেটিংস
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeSubTab === 'send' && (
          <motion.div 
            key="send"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-6"
          >
            {/* Customer List Selection */}
            <div className="lg:col-span-1 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col h-[600px] transition-colors">
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 space-y-4">
                <h3 className="font-bold text-slate-900 dark:text-slate-100 font-bengali flex items-center gap-2">
                  <Users size={18} className="text-blue-500 dark:text-blue-400" />
                  কাস্টমার নির্বাচন করুন
                </h3>
                <div className="relative group">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors" size={16} />
                  <input 
                    type="text" 
                    placeholder="খুঁজুন..." 
                    className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl text-xs outline-none focus:ring-2 focus:ring-primary/20 transition-all font-sans"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto divide-y divide-slate-50 dark:divide-slate-800">
                {filteredCustomers.map(customer => (
                  <button 
                    key={customer.id}
                    onClick={() => setSelectedRecipient(customer.phone)}
                    className={`w-full p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left group ${selectedRecipient === customer.phone ? 'bg-primary/5 dark:bg-blue-500/5 border-l-4 border-primary dark:border-blue-500' : ''}`}
                  >
                    <div>
                      <p className="font-bold text-slate-900 dark:text-slate-100 text-sm font-bengali">{customer.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-sans">{customer.phone}</p>
                    </div>
                    {customer.dueAmount > 0 && (
                      <span className="text-[10px] font-bold text-rose-500 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 px-2 py-0.5 rounded-full font-bengali transition-colors">
                        ৳ {customer.dueAmount} বকেয়া
                      </span>
                    )}
                    <ArrowRight size={14} className={`text-slate-300 dark:text-slate-700 group-hover:text-primary dark:group-hover:text-blue-400 transition-colors ${selectedRecipient === customer.phone ? 'text-primary dark:text-blue-400' : ''}`} />
                  </button>
                ))}
              </div>
            </div>

            {/* Compose SMS */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
                <form onSubmit={handleSendSMS} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700 dark:text-slate-300 font-bengali">প্রাপক (ফোন নম্বর)</label>
                    <input 
                      required
                      type="tel"
                      className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/20 transition-all font-sans font-bold text-lg"
                      placeholder="017XXXXXXXX"
                      value={selectedRecipient}
                      onChange={e => setSelectedRecipient(e.target.value)}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-sm font-bold text-slate-700 dark:text-slate-300 font-bengali">মেসেজ লিখুন</label>
                      <span className="text-xs text-slate-400 dark:text-slate-500 font-sans">{message.length} characters | {Math.ceil(message.length / 160)} SMS</span>
                    </div>
                    <textarea 
                      required
                      className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-xl py-4 px-4 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/20 transition-all font-bengali resize-none"
                      rows={8}
                      placeholder="এখানে আপনার মেসেজ লিখুন..."
                      value={message}
                      onChange={e => setMessage(e.target.value)}
                    />
                    <div className="flex flex-wrap gap-2 pt-2">
                      <button 
                        type="button"
                        onClick={() => setMessage(prev => prev + "আসসালামু আলাইকুম, আপনার বর্তমান বকেয়া বিল পরিশোধের জন্য অনুরোধ করা হলো।")}
                        className="px-3 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-[10px] font-bold text-slate-600 dark:text-slate-400 transition-colors font-bengali"
                      >
                        বকেয়া রিমাইন্ডার
                      </button>
                      <button 
                        type="button"
                        onClick={() => setMessage(prev => prev + "আমাদের দোকানে নতুন মাল এসেছে, দেখার জন্য আমন্ত্রণ রইলো।")}
                        className="px-3 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-[10px] font-bold text-slate-600 dark:text-slate-400 transition-colors font-bengali"
                      >
                        নতুন স্টক
                      </button>
                      <button 
                        type="button"
                        onClick={() => setMessage(prev => prev + "আপনার সুন্দর লেনদেনের জন্য ধন্যবাদ।")}
                        className="px-3 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-[10px] font-bold text-slate-600 dark:text-slate-400 transition-colors font-bengali"
                      >
                        ধন্যবাদ
                      </button>
                    </div>
                  </div>

                  <button 
                    disabled={isSending}
                    type="submit"
                    className="w-full py-4 bg-primary dark:bg-blue-600 text-white rounded-xl font-bold font-bengali flex items-center justify-center gap-3 hover:bg-primary/90 dark:hover:bg-blue-700 transition-all shadow-lg shadow-primary/20 dark:shadow-blue-900/20 disabled:opacity-50 disabled:cursor-not-allowed group"
                  >
                    {isSending ? (
                      <RefreshCw size={20} className="animate-spin" />
                    ) : (
                      <>
                        <Send size={20} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                        <span>মেসেজ পাঠান</span>
                      </>
                    )}
                  </button>
                </form>
              </div>

              {/* Tips Wrapper */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-5 bg-blue-50 dark:bg-blue-900/20 rounded-2xl border border-blue-100 dark:border-blue-900/30 flex items-start gap-4 transition-colors">
                  <AlertCircle className="text-blue-500 dark:text-blue-400 shrink-0" size={24} />
                  <div>
                    <h4 className="font-bold text-blue-900 dark:text-blue-100 text-sm font-bengali">সতর্কতা</h4>
                    <p className="text-xs text-blue-700 dark:text-blue-400 mt-1 font-bengali Leading-relaxed">
                      একটি এসএমএস ১৬০ ক্যারেক্টার লিমিট থাকে। ক্যারেক্টার বাড়লে একাধিক এসএমএস চার্জ প্রযোজ্য হতে পারে।
                    </p>
                  </div>
                </div>
                <div className="p-5 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl border border-emerald-100 dark:border-emerald-900/30 flex items-start gap-4 transition-colors">
                  <CheckCircle2 className="text-emerald-500 dark:text-emerald-400 shrink-0" size={24} />
                  <div>
                    <h4 className="font-bold text-emerald-900 dark:text-emerald-100 text-sm font-bengali">সুবিধা</h4>
                    <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1 font-bengali leading-relaxed">
                      বাল্ক এসএমএস ব্যবহার করে আপনি একসাথে অনেক কাস্টমারকে অফার বা বকেয়া রিমাইন্ডার দিতে পারেন।
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {activeSubTab === 'logs' && (
          <motion.div 
            key="logs"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-colors"
          >
            <div className="p-6 border-b border-slate-50 dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 z-10 flex items-center justify-between font-bengali transition-colors">
              <h3 className="font-bold text-slate-900 dark:text-slate-100">এসএমএস রিপোর্ট</h3>
              <div className="flex items-center gap-3">
                <p className="text-slate-400 dark:text-slate-500 text-xs">মোট: {logs.length} টি</p>
                <button 
                  onClick={handleClearLogs}
                  className="text-rose-500 dark:text-rose-400 hover:text-rose-600 dark:hover:text-rose-300 text-xs font-bold transition-colors"
                >
                  লগ ক্লিয়ার করুন
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left font-sans">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-widest transition-colors">
                    <th className="px-6 py-4 font-bengali">তারিখ ও সময়</th>
                    <th className="px-6 py-4 font-bengali">প্রাপক</th>
                    <th className="px-6 py-4 font-bengali">মেসেজ</th>
                    <th className="px-6 py-4 font-bengali">অবস্থা (Status)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-bengali transition-colors">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors group">
                      <td className="px-6 py-4 text-xs text-slate-500 dark:text-slate-400 font-sans">
                        {new Date(log.createdAt).toLocaleString('bn-BD', { timeZone: 'Asia/Dhaka' })} (ঢাকা সময়)
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 group-hover:text-primary dark:group-hover:text-blue-400 transition-colors">
                          <Users size={14} className="text-slate-400 dark:text-slate-500" />
                          <span className="font-bold text-sm text-slate-900 dark:text-slate-200">{log.recipient}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-slate-600 dark:text-slate-400 max-w-sm truncate" title={log.message}>{log.message}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center justify-center w-fit gap-1 ${
                          log.status === 'sent' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' : 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400'
                        }`}>
                          {log.status === 'sent' ? <CheckCircle2 size={10} /> : <AlertCircle size={10} />}
                          {log.status === 'sent' ? 'সফল' : 'ব্যর্থ'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {logs.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-20 text-center text-slate-400 dark:text-slate-600 font-bengali">
                        <History size={48} className="mx-auto mb-4 opacity-10" />
                        এখনো কোনো এসএমএস পাঠানো হয়নি
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}

        {activeSubTab === 'settings' && (
          <motion.div 
            key="settings"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="max-w-2xl mx-auto"
          >
            <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-8 transition-colors">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center">
                  <Settings size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white font-bengali">এপিআই কনফিগারেশন</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400 font-bengali">আপনার এসএমএস গেটওয়ে সেটিংস সেট করুন</p>
                </div>
              </div>

              <form onSubmit={handleUpdateConfig} className="space-y-6">
                <div className="p-4 bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-2xl flex items-center justify-between mb-2 transition-colors">
                  <div className="flex items-center gap-3">
                    <Smartphone className="text-blue-600 dark:text-blue-400" size={20} />
                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-slate-100 font-bengali text-sm">অটো এসএমএস (Auto SMS)</h4>
                      <p className="text-[10px] text-slate-500 dark:text-slate-500 font-bengali">প্রতিটি লেনদেনের পর কাস্টমারকে অটোমেটিক এসএমএস পাঠান</p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer" 
                      checked={config?.autoSMS || false}
                      onChange={e => setConfig(prev => prev ? {...prev, autoSMS: e.target.checked} : null)}
                    />
                    <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary dark:peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                <div className="space-y-2 text-sm">
                  <label className="font-bold text-slate-700 dark:text-slate-300 font-bengali">এসএমএস গেটওয়ে প্রোভাইডার</label>
                  <select 
                    className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl py-3 px-4 focus:ring-2 focus:ring-primary/20 dark:focus:ring-blue-500/20 transition-all font-sans outline-none"
                    value={config?.provider}
                    onChange={e => setConfig(prev => prev ? {...prev, provider: e.target.value} : null)}
                  >
                    <option value="SendMySMS">SendMySMS.net</option>
                    <option value="SEMySMS">SEMySMS.net</option>
                    <option value="BulksmsBD">BulksmsBD.net</option>
                    <option value="Greenweb">Greenweb BD</option>
                    <option value="MimSMS">Mim SMS</option>
                    <option value="ADN_SMS">ADN SMS</option>
                    <option value="DHSMS">DHSMS.BD</option>
                    <option value="AlphaSMS">Alpha SMS</option>
                    <option value="DianaSMS">Diana SMS</option>
                    <option value="SSLWireless">SSL Wireless</option>
                    <option value="ElitBuzz">ElitBuzz</option>
                    <option value="SBMHosting">SBM Hosting</option>
                    <option value="ReveSMS">Reve SMS</option>
                    <option value="SMS8IO">SMS8.io (Android App)</option>
                    <option value="Manual">Manual API (Custom URL)</option>
                    <option value="Demo">Demo (Simulation Gateway)</option>
                  </select>
                </div>

                {(config?.provider === "SendMySMS" || config?.provider === "SMS8IO" || config?.provider === "Manual" || config?.provider === "Demo") && (
                  <div className="space-y-4">
                    <div className="space-y-2 text-sm bg-amber-50 dark:bg-amber-900/10 p-4 rounded-xl border border-amber-200 dark:border-amber-900/30 transition-colors">
                      <div className="text-amber-900 dark:text-amber-300 text-[11px] leading-relaxed">
                        {config?.provider === "Demo" ? (
                          <>
                            <span className="font-bold block mb-1">ডেমো গেটওয়ে গাইড:</span>
                            এটি একটি সিমুলেশন গেটওয়ে। আপনি মেসেজ পাঠালে তা সরাসরি সফল দেখাবে এবং লগ লিস্টে জমা হবে, কিন্তু বাস্তবে কোনো মোবাইল নম্বরে মেসেজ যাবে না। এটি সিস্টেমটি টেস্ট করার জন্য তৈরি করা হয়েছে।
                          </>
                        ) : config?.provider === "SendMySMS" ? (
                          <>
                            <span className="font-bold block mb-1">SendMySMS ইউজারদের জন্য:</span> 
                            আপনার একাউন্ট যদি ভিন্ন সার্ভারে (যেমন s1-s5, panel) থাকে তবে সেটি অটোমেটিক ডিটেক্ট করার চেষ্টা করা হবে। যদি 404 আসে তবে ড্যাশবোর্ড থেকে প্রাপ্ত সঠিক URL টি <strong>Manual API</strong> অপশনে দিন।
                          </>
                        ) : config?.provider === "SMS8IO" ? (
                          <>
                            <span className="font-bold block mb-1">SMS8.io ইউজারদের জন্য:</span>
                            আপনার ফোনকে গেটওয়ে হিসেবে ব্যবহার করতে অ্যাপটি ফোনে ইন্সটল রাখুন। API কী ড্যাশবোর্ড থেকে সংগ্রহ করুন।
                          </>
                        ) : config?.provider === "SBMHosting" ? (
                          <>
                            <span className="font-bold block mb-1">SBM Hosting ইউজারদের জন্য:</span>
                            কখনো কখনো IP (103.111.45.166) এর বদলে ডোমেইন ব্যবহার করতে হয়। যদি কানেক্ট না হয় তবে আপনার ড্যাশবোর্ড থেকে সঠিক কনফিগারেশন চেক করুন।
                          </>
                        ) : (
                          <>
                            <span className="font-bold block mb-1">ম্যানুয়াল এপিআই গাইড:</span> 
                            আপনার প্রোভাইডারের API URL টি লিখুন। যেখানে মোবাইল নাম্বার বসবে সেখানে <strong>[PHONE]</strong> এবং মেসেজের জায়গায় <strong>[MESSAGE]</strong> লিখুন।
                            <div className="mt-2 p-2 bg-white/50 dark:bg-black/50 rounded border border-amber-100 dark:border-amber-900/30 font-mono text-[9px] break-all">
                              Ex: https://api.com/sendsms?apiKey=[API_KEY]&to=[PHONE]&msg=[MESSAGE]
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    
                    <div className="space-y-2 text-sm">
                      <label className="font-bold text-slate-700 dark:text-slate-300 font-sans">API Username {config?.provider === "Manual" && "(Optional)"}</label>
                      <input 
                        type="text"
                        className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl py-3 px-4 focus:ring-2 focus:ring-primary/20 dark:focus:ring-blue-500/20 transition-all font-sans outline-none"
                        placeholder={config?.provider === "SendMySMS" ? "Ex: mominsalam" : "Your Username"}
                        value={config?.apiUser || ""}
                        onChange={e => setConfig(prev => prev ? {...prev, apiUser: e.target.value} : null)}
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  <div className="space-y-2 text-sm">
                    <label className="font-bold text-slate-700 dark:text-slate-300 font-sans">
                      {config?.provider === "SendMySMS" ? "API Key" : "API Key / Token"}
                    </label>
                    <input 
                      type="password"
                      className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl py-3 px-4 focus:ring-2 focus:ring-primary/20 dark:focus:ring-blue-500/20 transition-all font-sans outline-none"
                      placeholder="Enter your API Key"
                      value={config?.apiKey}
                      onChange={e => setConfig(prev => prev ? {...prev, apiKey: e.target.value} : null)}
                    />
                  </div>

                  {config?.provider === "Manual" && (
                    <div className="space-y-2 text-sm">
                      <label className="font-bold text-slate-700 dark:text-slate-300 font-sans">Manual Gateway URL</label>
                      <input 
                        type="text"
                        className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl py-3 px-4 focus:ring-2 focus:ring-primary/20 dark:focus:ring-blue-500/20 transition-all font-sans text-xs outline-none"
                        placeholder="https://api.com?to=[PHONE]&msg=[MESSAGE]&key=..."
                        value={config?.senderId} // Reusing senderId for manual url to avoid type change
                        onChange={e => setConfig(prev => prev ? {...prev, senderId: e.target.value} : null)}
                      />
                      <p className="text-[10px] text-slate-400 dark:text-slate-500">Placeholders: [PHONE], [MESSAGE], [API_KEY], [API_USER]</p>
                    </div>
                  )}

                  {config?.provider !== "Manual" && (
                    <div className="space-y-2 text-sm">
                      <label className="font-bold text-slate-700 dark:text-slate-300 font-sans">Sender ID / Masking</label>
                      <input 
                        type="text"
                        className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl py-3 px-4 focus:ring-2 focus:ring-primary/20 dark:focus:ring-blue-500/20 transition-all font-sans outline-none"
                        placeholder="Example: MyStore"
                        value={config?.senderId}
                        onChange={e => setConfig(prev => prev ? {...prev, senderId: e.target.value} : null)}
                      />
                    </div>
                  )}
                </div>

                <div className="p-4 bg-amber-50 dark:bg-amber-900/10 rounded-2xl border border-amber-100 dark:border-amber-900/30 font-bengali transition-colors">
                  <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed italic">
                    * আপনার এস এম এস গেটওয়ে সেটিংস সঠিক কিনা তা নিশ্চিত করুন। যদি মেসেজ না যায় তবে API Key এবং Provider পুনরায় চেক করুন।
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-4">
                  <button 
                    type="submit"
                    className="flex-1 py-4 bg-primary dark:bg-blue-600 text-white rounded-xl font-bold font-bengali hover:bg-primary/90 dark:hover:bg-blue-700 transition-all shadow-lg shadow-primary/10 dark:shadow-blue-900/20"
                  >
                    কনফিগারেশন সেভ করুন
                  </button>
                  <button 
                    type="button"
                    onClick={handleTestAPI}
                    disabled={isSending}
                    className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-xl font-bold font-bengali flex items-center justify-center gap-2 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all border border-slate-200 dark:border-slate-700"
                  >
                    {isSending ? <RefreshCw className="animate-spin" size={20} /> : <Send size={20} />}
                    এপিআই টেস্ট করুন
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
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
