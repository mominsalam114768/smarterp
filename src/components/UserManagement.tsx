/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, FormEvent, ChangeEvent } from "react";
import { api } from "../services/api";
import { User } from "../types";
import { Users, UserPlus, Phone, Mail, Shield, Edit, Trash2, X, CheckCircle2, Search, Key, Plus, RefreshCw, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface UserManagementProps {
  user: User;
}

export function UserManagement({ user }: UserManagementProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState<Partial<User>>({
    name: "",
    email: "",
    phone: "",
    role: "salesman",
    password: "",
    businessId: user.businessId,
    permissions: ["dashboard", "pos"] // Default permissions
  });
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);
  const [resetUser, setResetUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  const handleOpenResetPassword = (u: User) => {
    setResetUser(u);
    setNewPassword("");
    setConfirmPassword("");
  };

  const handleAdminResetPassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!resetUser) return;
    if (!newPassword || newPassword.trim().length < 4) {
      showNotify("নতুন পাসওয়ার্ড কমপক্ষে ৪ অক্ষরের হতে হবে", "error");
      return;
    }
    if (newPassword !== confirmPassword) {
      showNotify("উভয় পাসওয়ার্ড মিলছে না!", "error");
      return;
    }

    setResetLoading(true);
    try {
      await api.adminResetPassword(resetUser.id, newPassword);
      showNotify(`"${resetUser.name}" এর পাসওয়ার্ড সফলভাবে পরিবর্তন করা হয়েছে!`);
      setResetUser(null);
      loadUsers();
    } catch (err: any) {
      showNotify(err.message || "পাসওয়ার্ড পরিবর্তন করা যায়নি", "error");
    } finally {
      setResetLoading(false);
    }
  };

  const modules = [
    { id: "dashboard", label: "ড্যাশবোর্ড" },
    { id: "pos", label: "পিওএস (POS)" },
    { id: "sales", label: "বিক্রয় তালিকা" },
    { id: "add_sale", label: "নতুন বিক্রয় (+)" },
    { id: "delete_sale", label: "বিক্রয় ডিলেট (x)" },
    { id: "products", label: "পণ্য তালিকা" },
    { id: "add_product", label: "পণ্য যোগ (+)" },
    { id: "delete_product", label: "পণ্য ডিলেট (x)" },
    { id: "customers", label: "ক্রেতা তালিকা" },
    { id: "add_customer", label: "ক্রেতা যোগ (+)" },
    { id: "delete_customer", label: "ক্রেতা ডিলেট (x)" },
    { id: "suppliers", label: "সরবরাহকারী" },
    { id: "accounting", label: "হিসাব" },
    { id: "due", label: "বকেয়া" },
    { id: "sms", label: "এসএমএস" },
    { id: "reports", label: "রিপোর্ট" },
    { id: "users", label: "ইউজার ম্যানেজমেন্ট" },
    { id: "settings", label: "সেটিংস" },
  ];

  const handlePermissionChange = (moduleId: string) => {
    const currentPermissions = formData.permissions || [];
    if (currentPermissions.includes(moduleId)) {
      setFormData({
        ...formData,
        permissions: currentPermissions.filter(id => id !== moduleId)
      });
    } else {
      setFormData({
        ...formData,
        permissions: [...currentPermissions, moduleId]
      });
    }
  };

  const showNotify = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  useEffect(() => {
    loadUsers();

    const unsubUsers = api.subscribeUsers((items) => {
      setUsers(items);
      setLoading(false);
    });

    return () => {
      unsubUsers();
    };
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await api.getUsers();
      setUsers(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncAuth = async (targetUser: User) => {
    // Disabled as requested - Auth is now internal
    showNotify("এই ভার্সনে অটো-সিঙ্ক প্রয়োজন নেই। একাউন্টটি সক্রিয় আছে।");
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    try {
      const emailNorm = formData.email?.toLowerCase().trim();
      const updatedFormData = { ...formData, email: emailNorm };

      if (editingUser) {
        // If password is empty, don't include it in the update to avoid overwriting with empty
        const updateData = { ...updatedFormData };
        if (!updateData.password) {
          delete updateData.password;
        }
        await api.updateUser(editingUser.id, updateData);
        showNotify("ইউজার তথ্য আপডেট করা হয়েছে");
      } else {
        if (!updatedFormData.password || !updatedFormData.email) {
            showNotify("ইমেইল ও পাসওয়ার্ড প্রদান করা আবশ্যক", "error");
            return;
        }

        // Check for duplicate email locally first
        const isDuplicate = users.some(u => u.email.toLowerCase() === emailNorm);
        if (isDuplicate) {
          showNotify("এই ইমেইল দিয়ে ইতঃমধ্যেই ইউজার আছে", "error");
          return;
        }

        // Just create in Firestore directly
        await api.createUser(updatedFormData);
        showNotify("নতুন ইউজার যোগ করা হয়েছে");
      }
      setShowModal(false);
      setEditingUser(null);
      setFormData({ name: "", email: "", phone: "", role: "salesman", image: "", password: "", businessId: user.businessId, permissions: ["dashboard", "pos"] });
      loadUsers();
    } catch (err: any) {
      console.error("Save User Error:", err);
      showNotify(err.message || "অপারেশন সম্পন্ন করা যায়নি", "error");
    }
  };

  const handleEdit = (u: User) => {
    setEditingUser(u);
    setFormData({
      name: u.name,
      email: u.email,
      phone: u.phone,
      role: u.role,
      businessId: u.businessId,
      image: u.image || "",
      password: "", // Don't show password but allow update
      permissions: u.permissions || ["dashboard", "pos"]
    });
    setShowModal(true);
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

  const handleDelete = async (id: string) => {
    if (id === user.id) {
        showNotify("নিজেকে মোছা সম্ভব নয়", "error");
        return;
    }
    
    try {
      await api.deleteUser(id);
      showNotify("ইউজার মোছা হয়েছে");
      setShowDeleteConfirm(null);
      loadUsers();
    } catch (err) {
      showNotify("ইউজার মুছতে সমস্যা হয়েছে", "error");
    }
  };

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (u.phone && u.phone.includes(searchTerm))
  );

  const getRoleBadge = (role: string) => {
    const roles: Record<string, { label: string, color: string }> = {
      admin: { label: "এডমিন", color: "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-800" },
      manager: { label: "ম্যানেজার", color: "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-800" },
      salesman: { label: "সেলসম্যান", color: "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-800" },
      accountant: { label: "একাউন্ট্যান্ট", color: "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-800" }
    };
    const r = roles[role] || roles.salesman;
    return (
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${r.color} font-bengali`}>
        {r.label}
      </span>
    );
  };

  return (
    <div className="p-6 space-y-6 bg-slate-50 dark:bg-slate-950 transition-colors duration-300 min-h-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white font-bengali">ইউজার এবং স্টাফ ম্যানেজমেন্ট</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm font-bengali">আপনার শপ ম্যানেজ করার জন্য স্টাফ একাউন্ট তৈরি করুন</p>
        </div>
        <button 
          onClick={() => {
            setEditingUser(null);
            setFormData({ 
              name: "", 
              email: "", 
              phone: "", 
              role: "salesman",
              password: "",
              image: "",
              businessId: user.businessId,
              permissions: ["dashboard", "pos"]
            });
            setShowModal(true);
          }}
          className="flex items-center gap-2 px-6 py-3 bg-primary dark:bg-blue-600 text-white rounded-xl hover:bg-primary/90 dark:hover:bg-blue-700 transition-all shadow-lg shadow-primary/20 dark:shadow-blue-900/20 font-bengali font-bold"
        >
          <UserPlus size={20} />
          নতুন স্টাফ যোগ করুন
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-colors">
        <div className="p-4 border-b border-slate-50 dark:border-slate-800 flex items-center gap-4 transition-colors">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text"
              placeholder="নাম, ইমেইল অথবা ফোন দিয়ে খুঁজুন..."
              className="w-full pl-10 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border-slate-100 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg outline-none focus:ring-2 focus:ring-primary/20 transition-all font-bengali text-sm"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left font-sans">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-widest font-bengali transition-colors">
              <tr>
                <th className="px-6 py-4">নাম ও স্টাফ তথ্য</th>
                <th className="px-6 py-4">রোল (Role)</th>
                <th className="px-6 py-4">কন্টাক্ট</th>
                <th className="px-6 py-4 text-right">অ্যাকশন</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800 transition-colors">
              {loading ? (
                <tr>
                  <td colSpan={4} className="p-20 text-center">
                    <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4" />
                    <p className="font-bengali text-slate-400 dark:text-slate-500">লোড হচ্ছে...</p>
                  </td>
                </tr>
              ) : filteredUsers.map(u => (
                <tr key={u.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 rounded-full flex items-center justify-center font-bold text-lg overflow-hidden border border-slate-200 dark:border-slate-700 transition-colors">
                        {u.image ? (
                          <img src={u.image} alt={u.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          u.name[0]
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-slate-900 dark:text-slate-100 font-bengali">{u.name}</p>
                          {u.id === user.id && <span className="text-[10px] bg-slate-100 dark:bg-slate-800 px-1.5 rounded text-slate-500 font-bengali">আপনি</span>}
                        </div>
                        <p className="text-xs text-slate-400 dark:text-slate-500 font-sans">ID: {u.id}</p>
                        {user.role === 'admin' && (
                          <div className="flex items-center gap-1 mt-1">
                             <Key size={10} className="text-slate-300" />
                             <p className="text-[10px] text-slate-400 font-mono tracking-tight bg-slate-50 dark:bg-slate-900/50 px-1 rounded">
                               Pass: {u.password}
                             </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {getRoleBadge(u.role)}
                  </td>
                  <td className="px-6 py-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 font-sans">
                        <Mail size={12} className="text-slate-400 dark:text-slate-500" />
                        {u.email}
                      </div>
                      {u.phone && (
                        <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 font-sans">
                          <Phone size={12} className="text-slate-400 dark:text-slate-500" />
                          {u.phone}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2 transition-all">
                      <button 
                        onClick={() => handleOpenResetPassword(u)}
                        className="p-2 text-slate-400 dark:text-slate-500 hover:text-amber-500 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-all"
                        title="পাসওয়ার্ড পরিবর্তন / রিসেট"
                      >
                        <Key size={16} />
                      </button>
                      <button 
                        onClick={() => handleEdit(u)}
                        className="p-2 text-slate-400 dark:text-slate-500 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-all"
                        title="সম্পাদনা"
                      >
                        <Edit size={16} />
                      </button>
                      {u.id !== user.id && (
                        <button 
                          onClick={() => setShowDeleteConfirm(u.id)}
                          className="p-2 text-slate-400 dark:text-slate-500 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-all"
                          title="সরিয়ে ফেলুন"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-20 text-center font-bengali text-slate-400 dark:text-slate-600">
                    <Users size={48} className="mx-auto mb-4 opacity-10" />
                    কোনো ইউজার পাওয়া যায়নি
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-slate-900 rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center"
            >
              <div className="w-16 h-16 bg-rose-50 dark:bg-rose-900/20 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 size={32} />
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white font-bengali mb-2">আপনি কি নিশ্চিত?</h3>
              <p className="text-slate-500 dark:text-slate-400 font-bengali mb-6">
                আপনি কি নিশ্চিতভাবে এই ইউজারকে মুছে ফেলতে চান? এই কাজটি আর ফিরিয়ে আনা সম্ভব নয়।
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowDeleteConfirm(null)}
                  className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl font-bold font-bengali hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                >
                  না, থাক
                </button>
                <button 
                  onClick={() => handleDelete(showDeleteConfirm)}
                  className="flex-1 py-3 bg-rose-600 text-white rounded-xl font-bold font-bengali hover:bg-rose-700 shadow-lg shadow-rose-900/20 transition-all"
                >
                  হ্যাঁ, মুছুন
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Admin Reset Password Modal */}
      <AnimatePresence>
        {resetUser && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-slate-900 rounded-3xl p-8 max-w-md w-full shadow-2xl"
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-50 dark:bg-amber-900/20 text-amber-500 rounded-xl flex items-center justify-center">
                    <Key size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white font-bengali">পাসওয়ার্ড পরিবর্তন</h3>
                    <p className="text-xs text-slate-400 font-sans">{resetUser.email}</p>
                  </div>
                </div>
                <button onClick={() => setResetUser(null)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-400">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleAdminResetPassword} className="space-y-4">
                <div className="bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 rounded-xl p-3 text-xs text-blue-700 dark:text-blue-300 font-bengali">
                  এডমিন হিসেবে আপনি <strong className="font-bold">{resetUser.name}</strong> এর জন্য একটি নতুন পাসওয়ার্ড সেট করছেন।
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300 font-bengali">নতুন পাসওয়ার্ড</label>
                  <input 
                    required
                    type="password"
                    minLength={4}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 px-3.5 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-amber-500/20"
                    placeholder="কমপক্ষে ৪ অক্ষরের পাসওয়ার্ড"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300 font-bengali">নতুন পাসওয়ার্ড নিশ্চিত করুন</label>
                  <input 
                    required
                    type="password"
                    minLength={4}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 px-3.5 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-amber-500/20"
                    placeholder="পুনরায় পাসওয়ার্ড লিখুন"
                  />
                </div>
                <div className="flex gap-3 pt-4">
                  <button 
                    type="button"
                    onClick={() => setResetUser(null)}
                    className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl font-bold font-bengali hover:bg-slate-200 dark:hover:bg-slate-700"
                  >
                    বাতিল
                  </button>
                  <button 
                    type="submit"
                    disabled={resetLoading}
                    className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold font-bengali shadow-lg shadow-amber-500/20 disabled:opacity-50"
                  >
                    {resetLoading ? "সংরক্ষণ হচ্ছে..." : "পাসওয়ার্ড সেট করুন"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/60 backdrop-blur-sm transition-colors">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col transition-colors"
            >
              <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 transition-colors">
                <h3 className="text-xl font-bold text-slate-900 dark:text-white font-bengali">
                  {editingUser ? "স্টাফ তথ্য সংশোধন" : "নতুন স্টাফ যোগ করুন"}
                </h3>
                <button onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-xl transition-colors">
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-8 space-y-6 overflow-y-auto custom-scrollbar">
                <div className="flex flex-col items-center gap-2 mb-2">
                  <div className="relative group">
                    <div className="w-20 h-20 bg-slate-50 dark:bg-slate-800 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 flex items-center justify-center overflow-hidden transition-colors">
                      {formData.image ? (
                        <img src={formData.image} alt="Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <UserPlus size={24} className="text-slate-300 dark:text-slate-600" />
                      )}
                    </div>
                    <label className="absolute inset-0 flex items-center justify-center bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer rounded-2xl">
                      <Plus size={16} />
                      <input type="file" className="hidden" accept="image/*" onChange={handleImageChange} />
                    </label>
                  </div>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bengali">প্রোফাইল ছবি</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700 dark:text-slate-300 font-bengali">সম্পূর্ণ নাম</label>
                    <input 
                      required
                      type="text"
                      className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg py-2 px-3 focus:ring-2 focus:ring-primary/20 dark:focus:ring-blue-500/20 transition-all font-bengali outline-none text-sm"
                      placeholder="নাম লিখুন"
                      value={formData.name || ""}
                      onChange={e => setFormData({...formData, name: e.target.value})}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700 dark:text-slate-300 font-bengali">ফোন নম্বর</label>
                    <input 
                      required
                      type="tel"
                      className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg py-2 px-3 focus:ring-2 focus:ring-primary/20 dark:focus:ring-blue-500/20 transition-all font-sans outline-none text-sm"
                      placeholder="017XXXXXXXX"
                      value={formData.phone || ""}
                      onChange={e => setFormData({...formData, phone: e.target.value})}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700 dark:text-slate-300 font-bengali">ইমেইল এড্রেস</label>
                    <input 
                      required
                      type="email"
                      className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg py-2 px-3 focus:ring-2 focus:ring-primary/20 dark:focus:ring-blue-500/20 transition-all font-sans outline-none text-sm"
                      placeholder="example@mail.com"
                      value={formData.email || ""}
                      onChange={e => setFormData({...formData, email: e.target.value})}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700 dark:text-slate-300 font-bengali">পাসওয়ার্ড</label>
                    <input 
                      required={!editingUser}
                      type="password"
                      className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg py-2 px-3 focus:ring-2 focus:ring-primary/20 dark:focus:ring-blue-500/20 transition-all font-sans outline-none text-sm"
                      placeholder={editingUser ? "পরিবর্তন করতে চাইলে লিখুন" : "পাসওয়ার্ড দিন"}
                      value={formData.password || ""}
                      onChange={e => setFormData({...formData, password: e.target.value})}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700 dark:text-slate-300 font-bengali">রোল/পদবী</label>
                    <select 
                      className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg py-2 px-3 focus:ring-2 focus:ring-primary/20 dark:focus:ring-blue-500/20 transition-all font-bengali outline-none text-sm"
                      value={formData.role}
                      onChange={e => setFormData({...formData, role: e.target.value as any})}
                    >
                      <option value="salesman">সেলসম্যান</option>
                      <option value="manager">ম্যানেজার</option>
                      <option value="accountant">একাউন্ট্যান্ট</option>
                      <option value="admin">এডমিন</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-6 bg-primary dark:bg-blue-500 rounded-full" />
                    <label className="text-sm font-bold text-slate-700 dark:text-slate-300 font-bengali text-lg">অ্যাক্সেস পারমিশন (Permissions)</label>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {modules.map(module => (
                      <label 
                        key={module.id} 
                        className={`flex items-center gap-2 p-2 rounded-lg border transition-all cursor-pointer group ${
                          formData.permissions?.includes(module.id) 
                            ? 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30 text-blue-700 dark:text-blue-400 shadow-sm' 
                            : 'bg-slate-50 dark:bg-slate-800 border-slate-100 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded-md border flex items-center justify-center transition-all ${
                          formData.permissions?.includes(module.id)
                            ? 'bg-blue-600 border-blue-600 dark:bg-blue-500 dark:border-blue-500'
                            : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700'
                        }`}>
                          {formData.permissions?.includes(module.id) && <CheckCircle2 size={12} className="text-white" />}
                        </div>
                        <input 
                          type="checkbox" 
                          hidden 
                          checked={formData.permissions?.includes(module.id)}
                          onChange={() => handlePermissionChange(module.id)}
                        />
                        <span className="text-xs font-bold font-bengali">{module.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <button 
                  type="submit"
                  className="w-full py-4 bg-primary dark:bg-blue-600 text-white rounded-xl font-bold font-bengali hover:bg-primary/90 dark:hover:bg-blue-700 transition-all shadow-lg shadow-primary/20 dark:shadow-blue-900/20 flex items-center justify-center gap-2 mt-4 sticky bottom-0"
                >
                  {editingUser ? <CheckCircle2 size={20} /> : <UserPlus size={20} />}
                  {editingUser ? "আপডেট করুন" : "স্টাফ যোগ করুন"}
                </button>
              </form>
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
