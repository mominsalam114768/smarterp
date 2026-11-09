/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ShoppingCart, Search, UserPlus, Trash2, Minus, Plus, CreditCard, Banknote, Smartphone, Scan, Package, X } from "lucide-react";
import { useEffect, useState, FormEvent, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { api } from "../services/api";
import { Product, Customer, Sale, User } from "../types";
import { cn } from "../lib/utils";
import { printInvoice } from "../lib/printUtils";
import { BarcodeScanner } from "./BarcodeScanner";

interface POSProps {
  user: User | null;
}

export function POS({ user }: POSProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<{id: string, name: string}[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState("all");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [cart, setCart] = useState<{product: Product, quantity: number, discount: number, discountPercent: number, scannedBarcodes?: string[], warrantyType?: 'none' | 'guarantee' | 'warranty', warrantyDuration?: string}[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<'cash'|'card'|'mobile_pay'>('cash');
  const [paidAmount, setPaidAmount] = useState(0);
  const [overallDiscountFixed, setOverallDiscountFixed] = useState(0);
  const [overallDiscountPercent, setOverallDiscountPercent] = useState(0);
  const [vatPercent, setVatPercent] = useState(0);
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);
  
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [newCustomerFormData, setNewCustomerFormData] = useState({
    name: "",
    phone: "",
    address: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const cartRef = useRef<HTMLDivElement>(null);

  const showNotify = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const scrollToCart = () => {
    cartRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const isAdmin = user?.role === 'admin';
  const canAddSale = isAdmin || user?.permissions?.includes('add_sale');

  useEffect(() => {
    // Initial fetch
    api.getProducts().then(items => { setProducts(items); setFilteredProducts(items); });
    api.getCategories().then(setCategories);
    api.getCustomers().then(items => {
      const filtered = isAdmin ? items : items.filter(c => c.createdBy === user?.id);
      setCustomers(filtered);
    });

    // Real-time subscriptions
    const unsubProd = api.subscribeProducts(items => {
      setProducts(items);
      setFilteredProducts(items);
    });
    const unsubCat = api.subscribeCategories(setCategories);
    const unsubCust = api.subscribeCustomers(items => {
      const filtered = isAdmin ? items : items.filter(c => c.createdBy === user?.id);
      setCustomers(filtered);
    });

    return () => {
      unsubProd();
      unsubCat();
      unsubCust();
    };
  }, [isAdmin, user?.id]);

  useEffect(() => {
    let filtered = products;

    if (selectedCategoryId !== "all") {
      filtered = filtered.filter(p => p.categoryId === selectedCategoryId);
    }

    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      filtered = filtered.filter(p => 
        p.name.toLowerCase().includes(lowerSearch) || 
        (p.bnName && p.bnName.toLowerCase().includes(lowerSearch)) ||
        p.sku.toLowerCase().includes(lowerSearch) ||
        p.id.toLowerCase().includes(lowerSearch) ||
        p.barcode?.includes(searchTerm)
      );
    }

    setFilteredProducts(filtered);
  }, [searchTerm, products, selectedCategoryId]);

  // Global listener for USB Barcode Scanners
  useEffect(() => {
    let scannedString = "";
    let timeout: any = null;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === "Enter") {
        if (scannedString.length > 2) {
           const res = scannedString;
           const matched = products.find(p => p.barcode === res || p.sku === res || p.barcodes?.includes(res));
           if (matched) {
             addToCart(matched, res);
             showNotify(`${matched.name} কার্টে যোগ করা হয়েছে`, "success");
           } else {
             showNotify(`এই বারকোড দিয়ে কোনো পণ্য পাওয়া যায়নি: ${res}`, "error");
           }
        }
        scannedString = "";
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        scannedString += e.key;
        clearTimeout(timeout);
        timeout = setTimeout(() => {
          scannedString = "";
        }, 100);
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      clearTimeout(timeout);
    };
  }, [products, cart]);

  const addToCart = (product: Product, scannedBarcode?: string) => {
    if (product.stock <= 0) {
      showNotify("এই পণ্যটি স্টকে নেই!", "error");
      return;
    }

    if (product.expiryDate && new Date(product.expiryDate) < new Date()) {
      showNotify("এই পণ্যটির মেয়াদ শেষ হয়ে গেছে!", "error");
      return;
    }

    const existing = cart.find(item => item.product.id === product.id);
    if (existing) {
      if (existing.quantity + 1 > product.stock) {
        showNotify("স্টকের অতিরিক্ত পণ্য যুক্ত করা সম্ভব নয়!", "error");
        return;
      }
      
      const newBarcodes = existing.scannedBarcodes ? [...existing.scannedBarcodes] : [];
      if (scannedBarcode && !newBarcodes.includes(scannedBarcode)) {
        newBarcodes.push(scannedBarcode);
      }
      
      setCart(cart.map(item => item.product.id === product.id ? {...item, quantity: item.quantity + 1, scannedBarcodes: newBarcodes} : item));
    } else {
      setCart([...cart, { 
        product, 
        quantity: 1, 
        discount: 0, 
        discountPercent: 0,
        scannedBarcodes: scannedBarcode ? [scannedBarcode] : [],
        warrantyType: 'none'
      }]);
    }
  };

  const removeFromCart = (id: string) => setCart(cart.filter(item => item.product.id !== id));
  
  const updateQuantity = (id: string, delta: number) => {
    setCart(cart.map(item => {
      if (item.product.id === id) {
        const newQty = item.quantity + delta;
        if (newQty > item.product.stock) {
          showNotify("স্টকের অতিরিক্ত পণ্য যুক্ত করা সম্ভব নয়!", "error");
          return item;
        }
        return {...item, quantity: Math.max(1, newQty)};
      }
      return item;
    }));
  };

  const setQuantity = (id: string, qty: number) => {
    setCart(cart.map(item => {
      if (item.product.id === id) {
        if (qty > item.product.stock) {
          showNotify(`সর্বোচ্চ ${item.product.stock} টি পণ্য স্টকে আছে!`, "error");
          return {...item, quantity: item.product.stock};
        }
        return {...item, quantity: Math.max(1, qty)};
      }
      return item;
    }));
  };

  const updateItemDiscount = (id: string, discount: number) => {
    setCart(cart.map(item => item.product.id === id ? {...item, discount} : item));
  };

  const updateItemDiscountPercent = (id: string, discountPercent: number) => {
    setCart(cart.map(item => item.product.id === id ? {...item, discountPercent} : item));
  };

  const updateItemWarranty = (id: string, type: 'none' | 'guarantee' | 'warranty', duration?: string) => {
    setCart(cart.map(item => item.product.id === id ? {...item, warrantyType: type, warrantyDuration: duration} : item));
  };

  const cartSubtotal = cart.reduce((acc, item) => acc + (item.product.salePrice * item.quantity), 0);
  const totalItemDiscounts = cart.reduce((acc, item) => {
    const itemSubtotal = item.product.salePrice * item.quantity;
    const fixed = item.discount || 0;
    const percent = (itemSubtotal * (item.discountPercent || 0)) / 100;
    return acc + fixed + percent;
  }, 0);
  
  const afterItemDiscount = cartSubtotal - totalItemDiscounts;
  
  const calculatedPercentDiscount = (afterItemDiscount * overallDiscountPercent) / 100;
  const totalDiscount = totalItemDiscounts + overallDiscountFixed + calculatedPercentDiscount;
  
  const payableBeforeVat = Math.max(0, cartSubtotal - totalDiscount);
  const vat = (payableBeforeVat * vatPercent) / 100;
  const totalPayable = payableBeforeVat + vat;
  const due = Math.max(0, totalPayable - paidAmount);

  const handleCheckout = async (forceCustomer?: Customer) => {
    if (cart.length === 0) return alert("কার্ট খালি!");
    
    const customerId = forceCustomer ? forceCustomer.id : selectedCustomerId;
    const selectedCustomer = forceCustomer || customers.find(c => c.id === customerId);
    
    // Rule: Must select an enrolled customer (Cash / Walk-in without customer is prohibited)
    if (!customerId || !selectedCustomer) {
      showNotify("ক্যাশ ক্রেতা প্রযোজ্য নয়! বিক্রয় করতে অবশ্যই তালিকা থেকে ক্রেতা নির্বাচন করুন অথবা '+' দিয়ে নতুন ক্রেতা যোগ করুন।", "error");
      return;
    }

    setIsSubmitting(true);
    
    const sale = {
      customerId: selectedCustomer.id,
      customerName: selectedCustomer.name,
      customerPhone: selectedCustomer.phone || "",
      customerAddress: selectedCustomer.address || "",
      userId: user?.id || "1",
      invoiceNo: `INV-${Date.now().toString().slice(-6)}`,
      totalAmount: cartSubtotal,
      discount: totalDiscount,
      vat,
      payableAmount: totalPayable,
      paidAmount,
      dueAmount: due,
      paymentMethod,
        items: cart.map(item => {
          const itemSubtotal = item.product.salePrice * item.quantity;
          const individualDiscount = (item.discount || 0) + (itemSubtotal * (item.discountPercent || 0) / 100);
          return {
            productId: item.product.id,
            name: item.product.bnName || item.product.name,
            quantity: item.quantity,
            unitPrice: item.product.salePrice,
            discount: item.discount,
            discountPercent: item.discountPercent,
            scannedBarcodes: item.scannedBarcodes,
            warrantyType: item.warrantyType,
            warrantyDuration: item.warrantyDuration,
            subtotal: itemSubtotal - individualDiscount
          };
        })
    };

    try {
      if (!isAdmin) {
        // Salesman mode: Generate Temporary Invoice / Approval Request
        const { sale: createdTempSale } = await api.createSaleRequest(sale);
        setCart([]);
        setPaidAmount(0);
        showNotify("টেম্পোরারি ইনভয়েস তৈরি হয়েছে! এডমিন অনুমোদন করলে এটি চূড়ান্ত হবে ও স্টক কমবে।", "success");
        await printInvoice(createdTempSale, true);
      } else {
        // Admin mode: Instant confirmed Sale
        const createdSale = await api.createSale(sale);
        setCart([]);
        setPaidAmount(0);
        
        // Auto-trigger print with a notification
        showNotify("বিক্রয় সফল হয়েছে! ইনভয়েস প্রিন্ট লেআউট তৈরি হচ্ছে...");
        await printInvoice(createdSale, false);

        // Auto SMS logic
        try {
          const smsConfig = await api.getSMSConfig();
          if (smsConfig.autoSMS && selectedCustomer && selectedCustomer.phone) {
            const message = `প্রিয় ${selectedCustomer.name}, আপনার শপিং এর জন্য ধন্যবাদ। ইনভয়েস: ${createdSale.invoiceNo}, মোট: ৳${Math.round(createdSale.payableAmount)}, পেইড: ৳${createdSale.paidAmount}, বকেয়া: ৳${Math.round(createdSale.dueAmount)}।`;
            await api.sendSMS(selectedCustomer.phone, message);
            console.log("[Auto SMS] Sent to:", selectedCustomer.phone);
          }
        } catch (err) {
          console.error("[Auto SMS] Error:", err);
        }
      }
    } catch (e: any) {
      alert(e.message || "বিক্রয় ব্যর্থ হয়েছে!");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateCustomerAndSale = async (e: FormEvent) => {
    e.preventDefault();
    if (!newCustomerFormData.name || !newCustomerFormData.phone) {
      showNotify("নাম এবং ফোন নম্বর প্রয়োজন", "error");
      return;
    }

    try {
      setIsSubmitting(true);
      const newCustomer = await api.createCustomer({
        name: newCustomerFormData.name,
        phone: newCustomerFormData.phone,
        address: newCustomerFormData.address,
        dueAmount: 0,
        totalSpent: 0,
        createdBy: user?.id
      });
      
      // Update local customers list
      setCustomers([...customers, newCustomer]);
      setSelectedCustomerId(newCustomer.id);
      setShowAddCustomerModal(false);
      
      // Proceed with sale using this new customer object
      await handleCheckout(newCustomer);
    } catch (err) {
      showNotify("কাস্টমার তৈরি করতে সমস্যা হয়েছে", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-64px)] xl:h-[calc(100vh-64px)] xl:overflow-hidden flex flex-col xl:flex-row bg-slate-50 dark:bg-slate-950 transition-colors duration-300 relative">
      {/* Scroll to Cart FAB for Mobile */}
      {cart.length > 0 && (
        <button 
          onClick={scrollToCart}
          className="xl:hidden fixed bottom-20 right-4 z-[40] bg-blue-600 text-white p-4 rounded-full shadow-2xl animate-bounce flex items-center justify-center"
        >
          <div className="relative">
            <ShoppingCart size={24} />
            <span className="absolute -top-3 -right-3 bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full border-2 border-blue-600">
              {cart.length}
            </span>
          </div>
        </button>
      )}

      {/* Left Panel: Product Selection */}
      <div className="flex-1 min-h-[500px] xl:min-h-0 overflow-hidden flex flex-col border-r border-slate-200 dark:border-slate-800">
        <div className="p-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 space-y-4 transition-colors">
          <div className="flex gap-2">
            <div className="relative flex-1 group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors" size={18} />
              <input 
                type="text" 
                placeholder="পণ্য খুঁজুন (নাম, এসকেইউ বা বারকোড...)"
                className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-lg py-1.5 pl-10 pr-3 focus:ring-2 focus:ring-primary/20 transition-all font-bengali text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && searchTerm.trim()) {
                    const res = searchTerm.trim();
                    const matched = products.find(p => p.barcode === res || p.sku === res || p.barcodes?.includes(res));
                    if (matched) {
                      addToCart(matched, res);
                      setSearchTerm("");
                    }
                  }
                }}
              />
            </div>
            <button onClick={() => setShowScanner(true)} className="p-2 bg-primary/10 text-primary rounded-xl hover:bg-primary/20 transition-colors dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50">
              <Scan size={24} />
            </button>
          </div>
          
          <div className="flex gap-2 pb-2 overflow-x-auto no-scrollbar">
            <button 
              onClick={() => setSelectedCategoryId("all")}
              className={cn(
                "px-4 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all font-bengali",
                selectedCategoryId === "all" ? "bg-primary text-white" : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
              )}
            >
              সবগুলো
            </button>
            {categories.map((cat) => (
              <button 
                key={cat.id} 
                onClick={() => setSelectedCategoryId(cat.id)}
                className={cn(
                  "px-4 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all font-bengali",
                  selectedCategoryId === cat.id ? "bg-primary text-white" : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                )}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 transition-colors">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
            {filteredProducts.map(product => (
              <button 
                key={product.id}
                onClick={() => addToCart(product)}
                disabled={product.stock <= 0 || (product.expiryDate ? new Date(product.expiryDate) < new Date() : false)}
                className={cn(
                  "bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm hover:border-primary dark:hover:border-blue-500 hover:shadow-md transition-all text-left flex flex-col h-full group",
                  (product.stock <= 0 || (product.expiryDate ? new Date(product.expiryDate) < new Date() : false)) && "opacity-60 grayscale cursor-not-allowed"
                )}
              >
                <div className="w-full aspect-square bg-slate-100 dark:bg-slate-800 rounded-xl mb-3 flex items-center justify-center overflow-hidden relative">
                  {product.image ? <img src={product.image} className="w-full h-full object-cover" /> : <Package size={40} className="text-slate-300 dark:text-slate-700" />}
                  {product.stock <= 0 && (
                    <div className="absolute inset-0 bg-rose-500/10 backdrop-blur-[2px] flex items-center justify-center">
                      <span className="bg-rose-600 text-white text-[10px] font-black px-2 py-1 rounded-lg font-bengali">স্টক শেষ</span>
                    </div>
                  )}
                  {product.expiryDate && new Date(product.expiryDate) < new Date() && (
                    <div className="absolute inset-0 bg-rose-600/20 backdrop-blur-[2px] flex items-center justify-center">
                      <span className="bg-rose-700 text-white text-[10px] font-black px-2 py-1 rounded-lg font-bengali">মেয়াদ শেষ</span>
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm mb-1 font-bengali line-clamp-1">{product.bnName || product.name}</h4>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium mb-2">{product.sku}</p>
                </div>
                <div className="flex items-center justify-between mt-auto pt-2 border-t border-slate-50 dark:border-slate-800">
                  <span className="font-bold text-primary dark:text-blue-400">৳{product.salePrice}</span>
                  <span className={cn(
                    "text-[10px] font-bold px-1.5 py-0.5 rounded",
                    product.stock > 10 ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-500" : 
                    product.stock > 0 ? "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-500" :
                    "bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-500"
                  )}>{product.stock} টি</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right Panel: Cart & Checkout */}
      <div ref={cartRef} className="w-full xl:w-[450px] bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col transition-colors duration-300 scroll-mt-20">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-xl text-slate-900 dark:text-white font-bengali">কার্ট লিষ্ট</h3>
            <button className="text-slate-400 dark:text-slate-500 hover:text-rose-500 dark:hover:text-rose-400 transition-colors bg-slate-50 dark:bg-slate-800 p-2 rounded-xl" onClick={() => setCart([])}><Trash2 size={20} /></button>
          </div>
          
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 font-bengali">
                ক্রেতা নির্বাচন <span className="text-rose-500">*</span>:
              </label>
              <span className="text-[11px] text-slate-400 font-bengali">তালিকাভুক্ত ক্রেতা প্রয়োজন</span>
            </div>
            <div className="flex gap-2">
              <select 
                className={cn(
                  "flex-1 bg-slate-50 dark:bg-slate-800 border text-slate-800 dark:text-slate-100 rounded-xl px-3 py-2.5 font-bengali text-sm outline-none transition-all appearance-none",
                  !selectedCustomerId 
                    ? "border-rose-300 dark:border-rose-800 focus:ring-2 focus:ring-rose-400/20 bg-rose-50/30 dark:bg-rose-950/20" 
                    : "border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-blue-500/20"
                )}
                value={selectedCustomerId}
                onChange={e => setSelectedCustomerId(e.target.value)}
              >
                <option value="">-- ক্রেতা নির্বাচন করুন (বাধ্যতামূলক) --</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name} {c.phone ? `(${c.phone})` : ''}</option>)}
              </select>
              <button 
                onClick={() => {
                  setNewCustomerFormData({ name: "", phone: "", address: "" });
                  setShowAddCustomerModal(true);
                }}
                className="p-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors shrink-0 shadow-md shadow-blue-500/10"
                title="নতুন ক্রেতা যুক্ত করুন"
              >
                <UserPlus size={18} />
              </button>
            </div>
            {!selectedCustomerId && (
              <p className="text-[11px] text-rose-500 font-semibold font-bengali mt-0.5">
                ⚠️ ক্যাশ ক্রেতা গ্রহণযোগ্য নয়। শুধুমাত্র যোগ করা ক্রেতার কাছেই বিক্রি করা যাবে।
              </p>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto border-b border-slate-50 dark:border-slate-800">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-300 dark:text-slate-700 p-8 text-center space-y-4">
              <div className="w-20 h-20 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center">
                <ShoppingCart size={40} />
              </div>
              <p className="font-bengali text-sm">আপনার কার্টটি বর্তমানে খালি আছে। ডান পাশ থেকে পণ্য যোগ করুন।</p>
            </div>
          ) : (
            <div className="flex flex-col h-full">
              <div className="divide-y divide-slate-100 dark:divide-slate-800 flex-shrink-0">
                {cart.map(item => (
                  <div key={item.product.id} className="p-4 flex gap-4 animate-in slide-in-from-right-4 duration-300">
                    <div className="w-14 h-14 bg-slate-50 dark:bg-slate-800 rounded-xl flex-shrink-0 flex items-center justify-center">
                      {item.product.image ? (
                        <img src={item.product.image} className="w-full h-full object-cover rounded-xl" />
                      ) : (
                        <Package size={28} className="text-slate-300 dark:text-slate-700" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-1">
                        <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm font-bengali truncate">{item.product.bnName || item.product.name}</h4>
                        <button 
                          onClick={() => removeFromCart(item.product.id)}
                          className="text-slate-300 hover:text-rose-500 transition-colors p-1"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                         <p className="text-xs text-slate-400 dark:text-slate-500 font-bold">৳{item.product.salePrice} x {item.quantity}</p>
                         <div className="flex items-center gap-2">
                           <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded px-1.5 py-0.5">
                              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold">৳</span>
                              <input 
                                type="number" 
                                className="w-16 bg-transparent outline-none text-[10px] font-bold text-slate-600 dark:text-slate-300 text-right"
                                value={item.discount}
                                onChange={(e) => updateItemDiscount(item.product.id, Number(e.target.value))}
                                title="Fixed Discount"
                              />
                           </div>
                           <div className="flex items-center gap-1 bg-blue-50/50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900 rounded px-1.5 py-0.5">
                              <input 
                                type="number" 
                                className="w-10 bg-transparent outline-none text-[10px] font-bold text-blue-600 dark:text-blue-400 text-right"
                                value={item.discountPercent}
                                onChange={(e) => updateItemDiscountPercent(item.product.id, Number(e.target.value))}
                                title="Percentage Discount"
                              />
                              <span className="text-[10px] text-blue-400 dark:text-blue-500 font-bold">%</span>
                           </div>
                         </div>
                      </div>

                      <div className="flex items-center gap-2 mb-3">
                        <select
                          className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-lg px-2 py-1 text-xs font-bengali outline-none focus:ring-1 focus:ring-primary/20"
                          value={item.warrantyType || 'none'}
                          onChange={(e) => updateItemWarranty(item.product.id, e.target.value as any, item.warrantyDuration || '')}
                        >
                          <option value="none">ওয়ারেন্টি নেই</option>
                          <option value="warranty">ওয়ারেন্টি</option>
                          <option value="guarantee">গ্যারান্টি</option>
                        </select>
                        {item.warrantyType && item.warrantyType !== 'none' && (
                          <input 
                            type="text" 
                            placeholder="যেমন: ১ বছর"
                            className="w-24 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-lg px-2 py-1 text-xs font-bengali outline-none focus:ring-1 focus:ring-primary/20"
                            value={item.warrantyDuration || ''}
                            onChange={(e) => updateItemWarranty(item.product.id, item.warrantyType as any, e.target.value)}
                          />
                        )}
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1 bg-slate-100/50 dark:bg-slate-800/50 rounded-lg p-0.5 border border-slate-100 dark:border-slate-800">
                          <button onClick={() => updateQuantity(item.product.id, -1)} className="p-1 hover:bg-white dark:hover:bg-slate-700 rounded shadow-sm text-slate-500 dark:text-slate-400 transition-all"><Minus size={14} /></button>
                          <input 
                            type="number"
                            min="1"
                            className="w-14 text-center font-bold text-xs text-slate-700 dark:text-slate-200 bg-transparent outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            value={item.quantity}
                            onChange={(e) => setQuantity(item.product.id, parseInt(e.target.value) || 1)}
                          />
                          <button onClick={() => updateQuantity(item.product.id, 1)} className="p-1 hover:bg-white dark:hover:bg-slate-700 rounded shadow-sm text-slate-500 dark:text-slate-400 transition-all"><Plus size={14} /></button>
                        </div>
                        <span className="font-black text-slate-900 dark:text-white">
                          ৳{((item.product.salePrice * item.quantity) - (item.discount || 0) - ((item.product.salePrice * item.quantity * (item.discountPercent || 0)) / 100)).toFixed(0)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Intermediate calculations inside scroll area */}
              <div className="p-6 bg-slate-50/30 dark:bg-slate-800/30 space-y-4 border-t border-slate-100 dark:border-slate-800">
                <div className="space-y-4 text-sm">
                  <div className="flex justify-between text-slate-500 dark:text-slate-400 font-medium px-1">
                    <span className="font-bold font-bengali">সাব-টোটাল</span>
                    <span className="font-bold dark:text-slate-200">৳{cartSubtotal}</span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                   <div className="bg-white dark:bg-slate-900 p-2.5 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm">
                       <p className="text-[10px] font-bold text-primary dark:text-blue-400 mb-1 font-bengali">ডিসকাউন্ট (৳)</p>
                       <input 
                         type="number" 
                         className="w-full bg-transparent outline-none font-black text-slate-900 dark:text-white text-right text-sm"
                         value={overallDiscountFixed}
                         onChange={e => setOverallDiscountFixed(Number(e.target.value))}
                       />
                    </div>
                    <div className="bg-white dark:bg-slate-900 p-2.5 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm">
                       <p className="text-[10px] font-bold text-primary dark:text-blue-400 mb-1 font-bengali">ডিসকাউন্ট (%)</p>
                       <input 
                         type="number" 
                         className="w-full bg-transparent outline-none font-black text-slate-900 dark:text-white text-right text-sm"
                         value={overallDiscountPercent}
                         onChange={e => setOverallDiscountPercent(Number(e.target.value))}
                       />
                    </div>
                  </div>
 
                  <div className="flex justify-between items-center px-1">
                    <span className="font-bold font-bengali text-rose-600 dark:text-rose-500 text-xs uppercase tracking-tight">মোট ডিসকাউন্ট</span>
                    <span className="font-black text-rose-600 dark:text-rose-500">- ৳{totalDiscount}</span>
                  </div>
 
                  <div className="flex justify-between items-center px-1 text-slate-500 dark:text-slate-400">
                    <div className="flex items-center gap-2">
                      <span className="font-bold font-bengali">ভাট</span>
                      <div className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-0.5 w-20 shadow-sm transition-all focus-within:ring-2 focus-within:ring-primary/20">
                        <input 
                          type="number" 
                          className="w-full bg-transparent outline-none text-xs font-black text-slate-700 dark:text-slate-200 text-center"
                          value={vatPercent}
                          onChange={e => setVatPercent(Number(e.target.value))}
                        />
                        <span className="text-xs text-slate-400 dark:text-slate-500 font-bold">%</span>
                      </div>
                    </div>
                    <span className="font-black text-slate-800 dark:text-slate-200">৳{vat.toFixed(2)}</span>
                  </div>
                </div>
 
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'cash', icon: Banknote, label: 'ক্যাশ' },
                    { id: 'card', icon: CreditCard, label: 'কার্ড' },
                    { id: 'mobile_pay', icon: Smartphone, label: 'বিকাশ' },
                  ].map(method => (
                    <button 
                      key={method.id} 
                      onClick={() => setPaymentMethod(method.id as any)}
                      className={cn(
                        "flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all h-16 justify-center",
                        paymentMethod === method.id 
                          ? "bg-blue-600 border-blue-600 text-white shadow-lg" 
                          : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-blue-100 dark:hover:border-blue-700"
                      )}
                    >
                      <method.icon size={18} className={paymentMethod === method.id ? "text-white" : "text-slate-500 dark:text-slate-400"} />
                      <span className="font-bold font-bengali text-[10px]">{method.label}</span>
                    </button>
                  ))}
                </div>
 
                <div className="flex items-center gap-3 bg-white dark:bg-slate-900 py-3 px-4 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm">
                  <span className="text-sm font-black text-blue-600 dark:text-blue-400 font-bengali">পেইড:</span>
                  <input 
                    type="number" 
                    className="flex-1 bg-transparent font-black text-slate-900 dark:text-white outline-none text-right text-lg"
                    value={paidAmount || ""}
                    onChange={e => setPaidAmount(Number(e.target.value))}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
 
        <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 space-y-3 flex-shrink-0">
          <div className="flex justify-between items-center bg-blue-50/30 dark:bg-blue-900/20 p-3 rounded-xl border border-blue-100/50 dark:border-blue-800/50">
            <div>
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Payable Amount</p>
              <p className="font-black text-2xl text-blue-600 dark:text-blue-400 leading-none">৳{Math.round(totalPayable)}</p>
            </div>
            {due > 0 && (
              <div className="text-right">
                <p className="text-[10px] font-bold text-rose-400 dark:text-rose-500 uppercase tracking-wider mb-0.5">Due Amount</p>
                <p className="font-black text-lg text-rose-600 dark:text-rose-500 leading-none">৳{due.toFixed(0)}</p>
              </div>
            )}
          </div>

          <button 
            onClick={() => handleCheckout()}
            disabled={cart.length === 0 || !canAddSale || isSubmitting || !selectedCustomerId}
            className="w-full bg-blue-600 text-white font-black py-4 rounded-xl flex items-center justify-center gap-3 shadow-xl shadow-blue-200 hover:bg-blue-700 active:scale-[0.98] transition-all disabled:grayscale disabled:opacity-50 font-bengali text-lg"
          >
            {isSubmitting ? (
              <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <ShoppingCart size={20} />
                {!canAddSale 
                  ? "পারমিশন নেই" 
                  : (!selectedCustomerId 
                    ? "ক্রেতা নির্বাচন করুন" 
                    : (!isAdmin ? "টেম্পোরারি ইনভয়েস তৈরি করুন" : "ইনভয়েস সম্পন্ন করুন")
                  )
                }
              </>
            )}
          </button>
        </div>
      </div>

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

      {/* Scanner Modal */}
      <AnimatePresence>
        {showScanner && (
          <BarcodeScanner 
            onClose={() => setShowScanner(false)} 
            onResult={(res) => {
               const matched = products.find(p => p.barcode === res || p.sku === res || p.barcodes?.includes(res));
               if (matched) {
                 addToCart(matched, res);
                 showNotify(`${matched.name} কার্টে যোগ করা হয়েছে`, "success");
               } else {
                 setSearchTerm(res);
                 showNotify("পণ্য পাওয়া যায়নি, সার্চ করা হচ্ছে", "error");
               }
               setShowScanner(false);
            }} 
          />
        )}
      </AnimatePresence>

      {/* Add Customer Modal */}
      <AnimatePresence>
        {showAddCustomerModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl border border-slate-100 dark:border-slate-800"
            >
              <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white font-bengali">নতুন কাস্টমার</h2>
                <button 
                  onClick={() => setShowAddCustomerModal(false)}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-slate-400 dark:text-slate-500"
                >
                  <X size={24} />
                </button>
              </div>
              
              <form onSubmit={handleCreateCustomerAndSale} className="p-8 space-y-5">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-sans">কাস্টমারের নাম</label>
                  <input 
                    required 
                    type="text" 
                    autoFocus
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg py-1.5 px-3 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/20 outline-none transition-all font-bengali text-sm"
                    value={newCustomerFormData.name}
                    onChange={e => setNewCustomerFormData({ ...newCustomerFormData, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-sans">ফোন নম্বর</label>
                  <input 
                    required 
                    type="tel" 
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg py-1.5 px-3 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm"
                    value={newCustomerFormData.phone}
                    onChange={e => setNewCustomerFormData({ ...newCustomerFormData, phone: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-sans">ঠিকানা (ঐচ্ছিক)</label>
                  <textarea 
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg py-1.5 px-3 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/20 outline-none transition-all font-bengali resize-none text-sm"
                    rows={2}
                    value={newCustomerFormData.address}
                    onChange={e => setNewCustomerFormData({ ...newCustomerFormData, address: e.target.value })}
                  />
                </div>

                <div className="flex justify-end gap-4 pt-4">
                  <button 
                    type="button" 
                    onClick={() => setShowAddCustomerModal(false)}
                    className="flex-1 py-3 px-6 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 font-bold font-bengali hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                  >
                    বাতিল
                  </button>
                  <button 
                    type="submit" 
                    disabled={isSubmitting}
                    className="flex-1 py-3 px-8 bg-blue-600 text-white rounded-xl font-bold font-bengali hover:bg-blue-700 shadow-lg shadow-blue-900/20 disabled:opacity-50 transition-all"
                  >
                    {isSubmitting ? "লোডিং..." : "সংরক্ষণ করুন"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
