/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, FormEvent, useRef, ChangeEvent } from "react";
import { api } from "../services/api";
import { Product, Category, User } from "../types";
import { Package, Plus, Search, Filter, MoreVertical, Edit, Trash2, FileSpreadsheet, Download, Scan, X } from "lucide-react";
import * as XLSX from 'xlsx';
import { cn } from "../lib/utils";
import { BarcodeScanner } from "./BarcodeScanner";

interface ProductListProps {
  user: User | null;
}

export function ProductList({ user }: ProductListProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [showModal, setShowModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [scannerTarget, setScannerTarget] = useState<'add' | 'remove' | null>(null);
  const [formData, setFormData] = useState<Partial<Product>>({
    name: "",
    bnName: "",
    sku: "",
    barcode: "",
    barcodes: [],
    categoryId: "",
    unit: "pcs",
    purchasePrice: 0,
    salePrice: 0,
    stock: 0,
    minStock: 5,
    expiryDate: "",
    expiredQtyToRemove: 0,
    expiredBarcodesToRemove: [],
  });
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = user?.role === 'admin';
  const canAdd = isAdmin || user?.permissions?.includes('add_product');
  const canDelete = isAdmin || user?.permissions?.includes('delete_product');

  const showNotify = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  useEffect(() => {
    loadData();

    // Real-time Firestore listeners: immediate update across all browsers without reload
    const unsubProducts = api.subscribeProducts((items) => {
      setProducts(items);
    });

    const unsubCategories = api.subscribeCategories((cats) => {
      setCategories(cats);
    });

    return () => {
      unsubProducts();
      unsubCategories();
    };
  }, []);

  const loadData = async () => {
    try {
      const [prodItems, catItems] = await Promise.all([
        api.getProducts(),
        api.getCategories()
      ]);
      setProducts(prodItems);
      setCategories(catItems);
      if (catItems.length > 0 && !formData.categoryId) {
        setFormData(prev => ({ ...prev, categoryId: catItems[0].id }));
      }
    } catch (err) {
      console.error("Load Error:", err);
    }
  };

  const handleAddNewCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      const newCat = await api.createCategory({ name: newCategoryName });
      setCategories(prev => [...prev, newCat]);
      setFormData(prev => ({ ...prev, categoryId: newCat.id }));
      setIsAddingCategory(false);
      setNewCategoryName("");
      showNotify("নতুন ক্যাটাগরি যোগ করা হয়েছে");
    } catch (err) {
      showNotify("ক্যাটাগরি যোগ করা যায়নি", "error");
    }
  };

  const handleCreateOrUpdate = async (e: FormEvent) => {
    e.preventDefault();
    try {
      let finalCategoryId = formData.categoryId;
      let finalStock = Number(formData.stock || 0);

      // Manual removal of expired stock if value is set
      let finalBarcodes = [...(formData.barcodes || [])];
      
      if (editingProduct) {
        if (formData.expiredQtyToRemove && formData.expiredQtyToRemove > 0) {
          finalStock = Math.max(0, finalStock - formData.expiredQtyToRemove);
        }
        
        const expiredBcs = (formData as any).expiredBarcodesToRemove;
        if (expiredBcs && expiredBcs.length > 0) {
          finalBarcodes = finalBarcodes.filter(bc => !expiredBcs.includes(bc));
        }
      }

      // If user is currently adding a new category but didn't click the "plus" button
      if (isAddingCategory && newCategoryName.trim()) {
        try {
          const newCat = await api.createCategory({ name: newCategoryName });
          setCategories(prev => [...prev, newCat]);
          finalCategoryId = newCat.id;
          setIsAddingCategory(false);
          setNewCategoryName("");
        } catch (catErr) {
          console.error("Auto Category Creation Error:", catErr);
          showNotify("নতুন ক্যাটাগরি তৈরি করা সম্ভব হয়নি", "error");
          return;
        }
      }

      const finalData: Partial<Product> = { 
        ...formData, 
        categoryId: finalCategoryId,
        stock: finalStock,
        barcodes: finalBarcodes
      };

      // Remove the UI-only helper field before sending to API
      delete (finalData as any).expiredQtyToRemove;
      delete (finalData as any).expiredBarcodesToRemove;

      if (editingProduct) {
        await api.updateProduct(editingProduct.id, finalData);
        showNotify("পণ্য আপডেট করা হয়েছে");
      } else {
        await api.createProduct(finalData);
        showNotify("নতুন পণ্য যোগ করা হয়েছে");
      }
      setShowModal(false);
      setEditingProduct(null);
      resetForm();
      loadData();
    } catch (err) {
      showNotify("ব্যর্থ হয়েছে!", "error");
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const success = await api.deleteProduct(deleteId);
      if (success) {
        showNotify("পণ্য মুছে ফেলা হয়েছে");
        loadData();
      } else {
        showNotify("মুছে ফেলা সম্ভব হয়নি", "error");
      }
    } catch (err) {
      showNotify("মুছে ফেলা সম্ভব হয়নি", "error");
    } finally {
      setShowDeleteModal(false);
      setDeleteId(null);
    }
  };

  const confirmDelete = (id: string) => {
    setDeleteId(id);
    setShowDeleteModal(true);
  };

  const resetForm = () => {
    setIsAddingCategory(false);
    setNewCategoryName("");
    setFormData({
      name: "",
      bnName: "",
      sku: "",
      categoryId: categories[0]?.id || "",
      unit: "pcs",
      purchasePrice: 0,
      salePrice: 0,
      stock: 0,
      minStock: 5,
      expiryDate: "",
      expiredQtyToRemove: 0,
    });
  };

  const downloadSampleExcel = () => {
    const headers = [
      ["Product Name (English)", "Product Name (Bangla)", "SKU", "Category", "Unit", "Purchase Price", "Sale Price", "Stock", "Min Stock", "Expiry Date (YYYY-MM-DD)"]
    ];
    const ws = XLSX.utils.aoa_to_sheet(headers);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Products");
    XLSX.writeFile(wb, "products_sample.xlsx");
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

        const currentCats = [...categories];
        const productsToCreate: Partial<Product>[] = [];

        for (const row of data) {
          const catName = row["Category"] || "General";
          let cat = currentCats.find(c => c.name.toLowerCase() === catName.toLowerCase());
          
          if (!cat) {
            try {
              cat = await api.createCategory({ name: catName });
              currentCats.push(cat);
              setCategories([...currentCats]);
            } catch (err) {
              console.error("Failed to create category", catName);
            }
          }

          productsToCreate.push({
            name: String(row["Product Name (English)"] || ""),
            bnName: String(row["Product Name (Bangla)"] || ""),
            sku: String(row["SKU"] || `PROD-${Date.now()}-${Math.floor(Math.random()*1000)}`),
            categoryId: cat?.id || "",
            unit: String(row["Unit"] || "pcs"),
            purchasePrice: Number(row["Purchase Price"] || 0),
            salePrice: Number(row["Sale Price"] || 0),
            stock: Number(row["Stock"] || 0),
            minStock: Number(row["Min Stock"] || 5),
            expiryDate: row["Expiry Date (YYYY-MM-DD)"] ? String(row["Expiry Date (YYYY-MM-DD)"]) : undefined,
          });
        }

        await api.createProductsBatch(productsToCreate);
        showNotify(`${productsToCreate.length} টি পন্য সফলভাবে ইমপোর্ট করা হয়েছে`);
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
    setEditingProduct(null);
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      ...product,
      expiredQtyToRemove: 0,
      expiredBarcodesToRemove: []
    });
    setShowModal(true);
  };

  const filtered = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      p.bnName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = selectedCategory === "all" || p.categoryId === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="p-6 space-y-6 bg-slate-50 dark:bg-slate-950 transition-colors duration-300 min-h-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white font-bengali">পণ্য তালিকা</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm font-bengali">আপনার আউটলেটের সব পণ্যের তালিকা এখানে দেখুন</p>
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
              <Plus size={20} />
              <span>নতুন পণ্য যোগ করুন</span>
            </button>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row gap-4 relative transition-colors">
        <div className="relative flex-1 group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors" size={18} />
          <input 
            type="text" 
            placeholder="পণ্য খুঁজুন (নাম বা এসকেইউ...)" 
            className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-lg py-1.5 pl-10 pr-3 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/20 transition-all font-bengali text-sm"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="relative">
          <button 
            onClick={() => setShowFilterDropdown(!showFilterDropdown)}
            className={`flex items-center gap-2 px-4 py-2 border rounded-xl transition-colors font-bengali ${
              selectedCategory !== 'all' 
                ? 'border-primary bg-primary/5 text-primary' 
                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <Filter size={18} />
            <span>ফিল্টার {selectedCategory !== 'all' ? '(সক্রিয়)' : ''}</span>
          </button>
          
          {showFilterDropdown && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowFilterDropdown(false)} />
              <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl z-20 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 transition-colors">
                <div className="p-4 bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 italic text-xs text-slate-400 font-bengali">ক্যাটাগরি অনুযায়ী ফিল্টার করুন</div>
                <div className="p-2 max-h-64 overflow-y-auto">
                  <button 
                    onClick={() => { setSelectedCategory('all'); setShowFilterDropdown(false); }}
                    className={`w-full text-left px-4 py-2 rounded-lg font-bengali text-sm transition-colors ${selectedCategory === 'all' ? 'bg-primary text-white' : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
                  >
                    সকল ক্যাটাগরি
                  </button>
                  {categories.map(cat => (
                    <button 
                      key={cat.id}
                      onClick={() => { setSelectedCategory(cat.id); setShowFilterDropdown(false); }}
                      className={`w-full text-left px-4 py-2 rounded-lg font-bengali text-sm transition-colors ${selectedCategory === cat.id ? 'bg-primary text-white' : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-colors">
        <div className="overflow-x-auto">
          <table className="w-full text-left font-bengali">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">
                <th className="px-6 py-4 border-b dark:border-slate-800">পণ্য</th>
                <th className="px-6 py-4 border-b dark:border-slate-800">ক্যাটাগরি</th>
                <th className="px-6 py-4 border-b dark:border-slate-800">ক্রয় মূল্য</th>
                <th className="px-6 py-4 border-b dark:border-slate-800">বিক্রয় মূল্য</th>
                <th className="px-6 py-4 border-b dark:border-slate-800">মেয়াদ উত্তীর্ণ</th>
                <th className="px-6 py-4 border-b dark:border-slate-800">স্টক</th>
                <th className="px-6 py-4 text-right border-b dark:border-slate-800">অ্যাকশন</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((product) => (
                <tr key={product.id} className={cn(
                  "hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors animate-in fade-in duration-300",
                  product.stock <= product.minStock ? "bg-rose-50/40 dark:bg-rose-900/10" : ""
                )}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-10 h-10 rounded-lg flex items-center justify-center relative",
                        product.stock <= product.minStock 
                          ? "bg-rose-100 text-rose-500 dark:bg-rose-900/30 dark:text-rose-400" 
                          : "bg-slate-50 dark:bg-slate-800 text-slate-300 dark:text-slate-600"
                      )}>
                        <Package size={20} />
                        {product.stock <= product.minStock && (
                          <span className="absolute -top-1 -right-1 flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
                          </span>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-slate-700 dark:text-slate-200">{product.bnName || product.name}</p>
                          {product.stock <= product.minStock && (
                            <span className="bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 text-[10px] px-1.5 py-0.5 rounded-full font-bold font-bengali">স্টক কম</span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider font-sans">{product.sku}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-600 dark:text-slate-400 text-sm">
                    {categories.find(c => c.id === product.categoryId)?.name || "ক্যাটাগরি নেই"}
                  </td>
                  <td className="px-6 py-4 font-bold text-slate-900 dark:text-slate-100">৳ {product.purchasePrice}</td>
                  <td className="px-6 py-4 font-bold text-primary dark:text-blue-400">৳ {product.salePrice}</td>
                  <td className="px-6 py-4">
                    {product.expiryDate ? (
                      <div className="flex flex-col">
                        <span className={cn(
                          "text-xs font-bold font-bengali",
                          new Date(product.expiryDate) < new Date() 
                            ? "text-rose-500" 
                            : (new Date(product.expiryDate).getTime() - new Date().getTime()) < (5 * 24 * 60 * 60 * 1000)
                              ? "text-amber-500"
                              : "text-slate-600 dark:text-slate-400"
                        )}>
                          {new Date(product.expiryDate).toLocaleDateString('bn-BD', { timeZone: 'Asia/Dhaka' })}
                        </span>
                        {new Date(product.expiryDate) < new Date() ? (
                          <span className="text-[10px] font-bold text-rose-500 uppercase tracking-tighter">Expired</span>
                        ) : (new Date(product.expiryDate).getTime() - new Date().getTime()) < (5 * 24 * 60 * 60 * 1000) && (
                          <span className="text-[10px] font-bold text-amber-500 uppercase tracking-tighter">Expiring Soon</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-300 dark:text-slate-700">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      <span className={`font-bold text-sm ${product.stock <= product.minStock ? 'text-rose-500' : 'text-slate-900 dark:text-slate-100'}`}>{product.stock} {product.unit}</span>
                      <div className="w-20 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full ${product.stock <= product.minStock ? 'bg-rose-500' : 'bg-emerald-500'}`} 
                          style={{ width: `${Math.min(100, (product.stock / (product.minStock || 10) * 2) * 100)}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2 text-slate-400 dark:text-slate-500">
                      <button 
                        onClick={() => openEditModal(product)}
                        className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-primary dark:hover:text-blue-400 rounded-lg transition-colors"
                        title="এডিট"
                      >
                        <Edit size={16} />
                      </button>
                      {canDelete && (
                        <button 
                          onClick={() => confirmDelete(product.id)}
                          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-rose-500 rounded-lg transition-colors"
                          title="মুছুন"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                      <button className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 rounded-lg transition-colors"><MoreVertical size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="p-12 text-center text-slate-400 font-bengali">
              <Package size={48} className="mx-auto mb-4 opacity-20" />
              <p>কোনো পণ্য পাওয়া যায়নি</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 transition-colors">
            <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 sticky top-0 z-10 transition-colors">
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-bengali">
                {editingProduct ? "পণ্য এডিট করুন" : "নতুন পণ্য যোগ করুন"}
              </h2>
              <button 
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-slate-400 dark:text-slate-500"
              >
                <Plus className="rotate-45" size={24} />
              </button>
            </div>
            
            <form onSubmit={handleCreateOrUpdate} className="p-8 space-y-6 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300 font-bengali">পণ্যের নাম (English)</label>
                  <input 
                    required 
                    type="text" 
                    className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-lg py-1.5 px-3 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/20 outline-none transition-all font-sans text-sm"
                    value={formData.name || ""}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300 font-bengali">পণ্যের নাম (বাংলা)</label>
                  <input 
                    type="text" 
                    className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-lg py-1.5 px-3 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/20 outline-none transition-all font-bengali text-sm"
                    value={formData.bnName || ""}
                    onChange={e => setFormData({ ...formData, bnName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300 font-bengali">SKU / কোড</label>
                  <input 
                    required 
                    type="text" 
                    className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-lg py-1.5 px-3 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/20 outline-none transition-all font-sans text-sm"
                    value={formData.sku || ""}
                    onChange={e => setFormData({ ...formData, sku: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-bold text-slate-700 dark:text-slate-300 font-bengali">ক্যাটাগরি</label>
                    <button 
                      type="button"
                      onClick={() => setIsAddingCategory(!isAddingCategory)}
                      className="text-xs font-bold text-primary dark:text-blue-400 hover:underline font-bengali"
                    >
                      {isAddingCategory ? "নির্বাচন করুন" : "+ নতুন ক্যাটাগরি"}
                    </button>
                  </div>
                  {isAddingCategory ? (
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        placeholder="ক্যাটাগরির নাম লিখুন"
                        className="flex-1 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-lg py-1.5 px-3 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/20 transition-all font-bengali text-sm"
                        value={newCategoryName}
                        onChange={e => setNewCategoryName(e.target.value)}
                      />
                      <button 
                        type="button"
                        onClick={handleAddNewCategory}
                        className="bg-primary text-white p-1.5 rounded-lg hover:opacity-90"
                      >
                        <Plus size={18} />
                      </button>
                    </div>
                  ) : (
                    <select 
                      required 
                      className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-lg py-1.5 px-3 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/20 transition-all font-bengali text-sm"
                      value={formData.categoryId || ""}
                      onChange={e => setFormData({ ...formData, categoryId: e.target.value })}
                    >
                      <option value="" disabled className="dark:bg-slate-900">ক্যাটাগরি নির্বাচন করুন</option>
                      {categories.map(c => <option key={c.id} value={c.id} className="dark:bg-slate-900">{c.name}</option>)}
                    </select>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300 font-bengali">ইউনিট (Unit)</label>
                  <select 
                    className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-lg py-1.5 px-3 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/20 transition-all font-bengali text-sm"
                    value={formData.unit}
                    onChange={e => setFormData({ ...formData, unit: e.target.value })}
                  >
                    <option value="pcs" className="dark:bg-slate-900">পিস (Pcs)</option>
                    <option value="kg" className="dark:bg-slate-900">কেজি (Kg)</option>
                    <option value="gm" className="dark:bg-slate-900">গ্রাম (Gm)</option>
                    <option value="ltr" className="dark:bg-slate-900">লিটার (Ltr)</option>
                    <option value="ml" className="dark:bg-slate-900">মিলি (Ml)</option>
                    <option value="pack" className="dark:bg-slate-900">প্যাক (Pack)</option>
                    <option value="box" className="dark:bg-slate-900">বক্স (Box)</option>
                    <option value="strip" className="dark:bg-slate-900">পাতা (Strip)</option>
                    <option value="bottle" className="dark:bg-slate-900">বোতল (Bottle)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-bold text-slate-700 dark:text-slate-300 font-bengali">বারকোড সমূহ (Barcodes)</label>
                    <button 
                      type="button" 
                      onClick={() => setScannerTarget('add')}
                      className="text-primary dark:text-blue-400 hover:bg-primary/10 dark:hover:bg-blue-400/10 p-1.5 rounded-lg flex items-center gap-1 text-xs"
                    >
                      <Scan size={14} /> স্ক্যান
                    </button>
                  </div>
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        placeholder="বারকোড লিখে Enter চাপুন"
                        className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-lg py-1.5 px-3 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/20 transition-all font-sans text-sm"
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const val = e.currentTarget.value.trim();
                            if (val && !formData.barcodes?.includes(val)) {
                              setFormData({ ...formData, barcodes: [...(formData.barcodes || []), val] });
                              e.currentTarget.value = "";
                            }
                          }
                        }}
                      />
                    </div>
                    {formData.barcodes && formData.barcodes.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {formData.barcodes.map(code => (
                          <span key={code} className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-xs font-mono text-slate-700 dark:text-slate-300">
                            {code}
                            <button 
                              type="button" 
                              onClick={() => setFormData({ ...formData, barcodes: formData.barcodes?.filter(b => b !== code) })}
                              className="text-slate-400 hover:text-rose-500"
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300 font-bengali">মিনিমাম স্টক অ্যালার্ট</label>
                  <input 
                    type="number" 
                    className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-lg py-1.5 px-3 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/20 transition-all text-sm"
                    value={formData.minStock}
                    onChange={e => setFormData({ ...formData, minStock: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300 font-bengali">মেয়াদ উত্তীর্ণ তারিখ (অপশনাল)</label>
                  <input 
                    type="date" 
                    className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-lg py-1.5 px-3 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm"
                    value={formData.expiryDate || ""}
                    onChange={e => setFormData({ ...formData, expiryDate: e.target.value })}
                  />
                </div>
                {editingProduct && (
                  <>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-rose-600 dark:text-rose-400 font-bengali">মেয়াদ উত্তীর্ণ পন্য বাদ দিন (Stock Out)</label>
                      <input 
                        type="number" 
                        min="0"
                        max={formData.stock}
                        placeholder="পরিমান লিখুন..."
                        className="w-full bg-rose-50 dark:bg-rose-900/10 border-rose-100 dark:border-rose-900/30 rounded-lg py-1.5 px-3 text-rose-900 dark:text-rose-100 focus:ring-2 focus:ring-rose-500/20 outline-none transition-all font-bold text-sm"
                        value={formData.expiredQtyToRemove || ""}
                        onChange={e => setFormData({ ...formData, expiredQtyToRemove: Number(e.target.value) })}
                      />
                      <p className="text-[10px] text-rose-500 font-bold font-bengali">এই পরিমান পণ্য বর্তমান স্টক থেকে কমিয়ে দেওয়া হবে</p>
                    </div>
                    {(formData.barcodes && formData.barcodes.length > 0) && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-bold text-rose-600 dark:text-rose-400 font-bengali">মেয়াদ উত্তীর্ণ বারকোড বাদ দিন (অপশনাল)</label>
                          <button 
                            type="button" 
                            onClick={() => setScannerTarget('remove')}
                            className="text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 p-1.5 rounded-lg flex items-center gap-1 text-xs font-bold"
                          >
                            <Scan size={14} /> স্ক্যান
                          </button>
                        </div>
                        <div className="space-y-2">
                          <input 
                            type="text" 
                            placeholder="বারকোড স্ক্যান করুন বা লিখুন (Enter চাপুন)"
                            className="w-full bg-rose-50 dark:bg-rose-900/10 border-rose-100 dark:border-rose-900/30 rounded-lg py-1.5 px-3 text-rose-900 dark:text-rose-100 focus:ring-2 focus:ring-rose-500/20 transition-all font-sans text-sm placeholder:text-rose-300"
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                const val = e.currentTarget.value.trim();
                                if (val && formData.barcodes?.includes(val) && !(formData as any).expiredBarcodesToRemove?.includes(val)) {
                                  setFormData({
                                    ...formData,
                                    expiredBarcodesToRemove: [...((formData as any).expiredBarcodesToRemove || []), val],
                                    expiredQtyToRemove: (formData.expiredQtyToRemove || 0) + 1
                                  });
                                  e.currentTarget.value = "";
                                } else if (val) {
                                  showNotify("এই বারকোডটি এই পণ্যের বর্তমান বারকোড তালিকায় নেই", "error");
                                }
                              }
                            }}
                          />
                          {((formData as any).expiredBarcodesToRemove || []).length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2 p-2 bg-rose-50 dark:bg-rose-900/20 rounded-lg border border-rose-100 dark:border-rose-900/30">
                              {((formData as any).expiredBarcodesToRemove || []).map((code: string) => (
                                <span key={code} className="inline-flex items-center gap-1 px-2 py-1 bg-white dark:bg-rose-900 border border-rose-200 dark:border-rose-800 rounded-md text-xs font-mono text-rose-700 dark:text-rose-300">
                                  {code}
                                  <button 
                                    type="button" 
                                    onClick={() => setFormData({ 
                                      ...formData, 
                                      expiredBarcodesToRemove: (formData as any).expiredBarcodesToRemove?.filter((b: string) => b !== code),
                                      expiredQtyToRemove: Math.max(0, (formData.expiredQtyToRemove || 1) - 1)
                                    })}
                                    className="text-rose-400 hover:text-rose-600"
                                  >
                                    <X size={12} />
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="p-6 bg-slate-50 dark:bg-slate-800/50 rounded-2xl grid grid-cols-3 gap-6 transition-colors">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300 font-bengali">ক্রয় মূল্য</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">৳</span>
                    <input 
                      required 
                      type="text" 
                      inputMode="decimal"
                      className="w-full bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-lg py-1.5 pl-7 pr-3 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/20 transition-all font-sans text-sm"
                      value={formData.purchasePrice ?? ""}
                      onChange={e => {
                        const val = e.target.value;
                        if (val === "" || /^\d*\.?\d*$/.test(val)) {
                          setFormData({ ...formData, purchasePrice: val as any });
                        }
                      }}
                      onBlur={() => setFormData({ ...formData, purchasePrice: Number(formData.purchasePrice || 0) })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300 font-bengali">বিক্রয় মূল্য</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">৳</span>
                    <input 
                      required 
                      type="text" 
                      inputMode="decimal"
                      className="w-full bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-lg py-1.5 pl-7 pr-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/20 transition-all font-sans font-bold text-primary dark:text-blue-400 text-sm"
                      value={formData.salePrice ?? ""}
                      onChange={e => {
                        const val = e.target.value;
                        if (val === "" || /^\d*\.?\d*$/.test(val)) {
                          setFormData({ ...formData, salePrice: val as any });
                        }
                      }}
                      onBlur={() => setFormData({ ...formData, salePrice: Number(formData.salePrice || 0) })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300 font-bengali">ওপেনিং স্টক</label>
                  <input 
                    required 
                    type="text" 
                    inputMode="decimal"
                    className="w-full bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-lg py-1.5 px-3 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/20 transition-all font-sans text-sm"
                    value={formData.stock ?? ""}
                    onChange={e => {
                      const val = e.target.value;
                      if (val === "" || /^\d*\.?\d*$/.test(val)) {
                        setFormData({ ...formData, stock: val as any });
                      }
                    }}
                    onBlur={() => setFormData({ ...formData, stock: Number(formData.stock || 0) })}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-4 sticky bottom-0 bg-white dark:bg-slate-900 pt-4 pb-0 transition-colors">
                <button 
                  type="button" 
                  onClick={() => setShowModal(false)}
                  className="px-6 py-2 rounded-xl text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-bold font-bengali hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
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

      {scannerTarget && (
        <BarcodeScanner 
          onClose={() => setScannerTarget(null)} 
          onResult={(res) => {
            if (res) {
              if (scannerTarget === 'add') {
                if (!formData.barcodes?.includes(res)) {
                  setFormData({ ...formData, barcodes: [...(formData.barcodes || []), res] });
                }
              } else if (scannerTarget === 'remove') {
                if (formData.barcodes?.includes(res) && !(formData as any).expiredBarcodesToRemove?.includes(res)) {
                  setFormData({
                    ...formData,
                    expiredBarcodesToRemove: [...((formData as any).expiredBarcodesToRemove || []), res],
                    expiredQtyToRemove: (formData.expiredQtyToRemove || 0) + 1
                  });
                } else if (!formData.barcodes?.includes(res)) {
                  showNotify("এই বারকোডটি এই পণ্যের বর্তমান বারকোড তালিকায় নেই", "error");
                }
              }
            }
            setScannerTarget(null);
          }} 
        />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md p-8 shadow-2xl animate-in zoom-in fade-in duration-200 transition-colors border dark:border-slate-800">
            <div className="w-16 h-16 bg-rose-50 dark:bg-rose-900/20 text-rose-500 rounded-2xl flex items-center justify-center mb-6 mx-auto">
              <Trash2 size={32} />
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 text-center mb-2 font-bengali">পণ্যটি ডিলিট করতে চান?</h3>
            <p className="text-slate-500 dark:text-slate-400 text-center mb-8 font-bengali">আপনি কি নিশ্চিতভাবে এই পণ্যটি মুছে ফেলতে চান? এই অ্যাকশনটি রিভার্স করা যাবে না।</p>
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
