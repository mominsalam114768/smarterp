/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as XLSX from "xlsx";
import { formatDhakaDateTime, formatDhakaDate } from "./utils";

export function generateExcelWorkbook(data: any): Blob {
  const wb = XLSX.utils.book_new();

  // 1. Products Sheet
  if (data.products && Array.isArray(data.products)) {
    const productsData = data.products.map((p: any) => ({
      "Product ID": p.id || "",
      "Name (English)": p.name || "",
      "Name (Bengali)": p.bnName || "",
      "SKU": p.sku || "",
      "Barcode": p.barcode || (Array.isArray(p.barcodes) ? p.barcodes.join(", ") : ""),
      "Category": p.categoryId || "",
      "Purchase Price": p.purchasePrice ?? 0,
      "Sale Price": p.salePrice ?? 0,
      "Stock": p.stock ?? 0,
      "Min Stock": p.minStock ?? 0,
      "Unit": p.unit || "pcs",
      "Expiry Date": p.expiryDate || ""
    }));
    const wsProducts = XLSX.utils.json_to_sheet(productsData.length ? productsData : [{ Message: "কোনো পণ্য নেই" }]);
    XLSX.utils.book_append_sheet(wb, wsProducts, "পণ্য (Products)");
  }

  // 2. Sales Sheet
  if (data.sales && Array.isArray(data.sales)) {
    const salesData = data.sales.map((s: any) => ({
      "Invoice No": s.invoiceNo || s.id || "",
      "Customer Name": s.customerName || "",
      "Customer Phone": s.customerPhone || "",
      "Total Amount": s.totalAmount ?? 0,
      "Discount": s.discount ?? 0,
      "VAT": s.vat ?? 0,
      "Payable Amount": s.payableAmount ?? s.totalAmount ?? 0,
      "Paid Amount": s.paidAmount ?? 0,
      "Due Amount": s.dueAmount ?? 0,
      "Payment Method": s.paymentMethod || "cash",
      "Date (ঢাকা সময়)": s.createdAt ? formatDhakaDateTime(s.createdAt) : "",
      "Total Items": Array.isArray(s.items) ? s.items.length : 0
    }));
    const wsSales = XLSX.utils.json_to_sheet(salesData.length ? salesData : [{ Message: "কোনো বিক্রি নেই" }]);
    XLSX.utils.book_append_sheet(wb, wsSales, "বিক্রি (Sales)");
  }

  // 3. Customers Sheet
  if (data.customers && Array.isArray(data.customers)) {
    const customersData = data.customers.map((c: any) => ({
      "Customer ID": c.id || "",
      "Name": c.name || "",
      "Phone": c.phone || "",
      "Address": c.address || "",
      "Due Amount (বকেয়া)": c.dueAmount ?? 0,
      "Total Spent (মোট ক্রয়)": c.totalSpent ?? 0
    }));
    const wsCustomers = XLSX.utils.json_to_sheet(customersData.length ? customersData : [{ Message: "কোনো গ্রাহক নেই" }]);
    XLSX.utils.book_append_sheet(wb, wsCustomers, "গ্রাহক (Customers)");
  }

  // 4. Dedicated Due Management Sheet: বকেয়া গ্রাহক তালিকা (Customer Dues)
  const dueCustomers = (data.customers && Array.isArray(data.customers))
    ? data.customers
        .filter((c: any) => (Number(c.dueAmount) || 0) > 0)
        .sort((a: any, b: any) => (Number(b.dueAmount) || 0) - (Number(a.dueAmount) || 0))
    : [];

  const dueCustomersData = dueCustomers.map((c: any, index: number) => ({
    "ক্রমিক নং": index + 1,
    "গ্রাহকের নাম": c.name || "",
    "মোবাইল নম্বর": c.phone || "",
    "ঠিকানা": c.address || "",
    "বর্তমান বকেয়া (৳)": Number(c.dueAmount) || 0,
    "মোট ক্রয় (৳)": Number(c.totalSpent) || 0,
    "বকেয়ার অবস্থা": "বকেয়া রয়েছে"
  }));

  const wsDueCustomers = XLSX.utils.json_to_sheet(
    dueCustomersData.length ? dueCustomersData : [{ "বার্তা": "আলহামদুলিল্লাহ, কোনো গ্রাহকের বকেয়া নেই।" }]
  );
  XLSX.utils.book_append_sheet(wb, wsDueCustomers, "বকেয়া হিসাব (Due List)");

  // 5. Dedicated Due Invoices Sheet: বাকি বিক্রি চালান (Credit Sales)
  const dueSales = (data.sales && Array.isArray(data.sales))
    ? data.sales
        .filter((s: any) => (Number(s.dueAmount) || 0) > 0)
        .sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    : [];

  const dueSalesData = dueSales.map((s: any, index: number) => ({
    "ক্রমিক নং": index + 1,
    "ইনভয়েস নং": s.invoiceNo || s.id || "",
    "তারিখ ও সময় (ঢাকা সময়)": s.createdAt ? formatDhakaDateTime(s.createdAt) : "",
    "গ্রাহকের নাম": s.customerName || "",
    "মোবাইল নম্বর": s.customerPhone || "",
    "মোট বিল (৳)": s.payableAmount ?? s.totalAmount ?? 0,
    "পরিশোধিত জমা (৳)": s.paidAmount ?? 0,
    "বাকি টাকা (৳)": s.dueAmount ?? 0,
    "পেমেন্ট অবস্থা": (Number(s.paidAmount) || 0) > 0 ? "আংশিক বাকি" : "সম্পূর্ণ বাকি"
  }));

  const wsDueSales = XLSX.utils.json_to_sheet(
    dueSalesData.length ? dueSalesData : [{ "বার্তা": "কোনো বাকি বিক্রির চালান নেই।" }]
  );
  XLSX.utils.book_append_sheet(wb, wsDueSales, "বাকি বিক্রি (Due Sales)");

  // 6. Expenses Sheet
  if (data.expenses && Array.isArray(data.expenses)) {
    const expensesData = data.expenses.map((e: any) => ({
      "Expense ID": e.id || "",
      "Category (খাত)": e.category || "",
      "Amount (টাকা)": e.amount ?? 0,
      "Note / বিবরণ": e.note || e.description || "",
      "Date (তারিখ)": e.date ? formatDhakaDate(e.date) : ""
    }));
    const wsExpenses = XLSX.utils.json_to_sheet(expensesData.length ? expensesData : [{ Message: "কোনো খরচ নেই" }]);
    XLSX.utils.book_append_sheet(wb, wsExpenses, "খরচ (Expenses)");
  }

  // 7. Suppliers Sheet
  if (data.suppliers && Array.isArray(data.suppliers)) {
    const suppliersData = data.suppliers.map((sup: any) => ({
      "Supplier ID": sup.id || "",
      "Name": sup.name || "",
      "Phone": sup.phone || "",
      "Company / কোম্পানি": sup.company || "",
      "Address": sup.address || "",
      "Due Amount (দেনা/বকেয়া)": sup.dueAmount ?? 0
    }));
    const wsSuppliers = XLSX.utils.json_to_sheet(suppliersData.length ? suppliersData : [{ Message: "কোনো সরবরাহকারী নেই" }]);
    XLSX.utils.book_append_sheet(wb, wsSuppliers, "সরবরাহকারী (Suppliers)");
  }

  // 8. Summary Sheet (with comprehensive Due statistics)
  const totalCustomerDue = dueCustomers.reduce((sum: number, c: any) => sum + (Number(c.dueAmount) || 0), 0);
  const totalSalesDue = dueSales.reduce((sum: number, s: any) => sum + (Number(s.dueAmount) || 0), 0);
  const totalSupplierDue = (data.suppliers && Array.isArray(data.suppliers))
    ? data.suppliers.reduce((sum: number, sup: any) => sum + (Number(sup.dueAmount) || 0), 0)
    : 0;

  const summaryData = [
    { "বিষয়": "ব্যবসার নাম", "তথ্য": data.business?.name || "Smart Business" },
    { "বিষয়": "ঠিকানা", "তথ্য": data.business?.address || "" },
    { "বিষয়": "মোবাইল", "তথ্য": data.business?.phone || "" },
    { "বিষয়": "কারেন্সি", "তথ্য": data.business?.currency || "BDT" },
    { "বিষয়": "রিপোর্টের তারিখ ও সময় (ঢাকা সময়)", "তথ্য": formatDhakaDateTime(new Date()) },
    { "বিষয়": "--------------------", "তথ্য": "--------------------" },
    { "বিষয়": "মোট গ্রাহক বকেয়া (পাওনা টাকা)", "তথ্য": `৳ ${totalCustomerDue.toLocaleString('bn-BD')}` },
    { "বিষয়": "বকেয়া ওয়ালা গ্রাহকের সংখ্যা", "তথ্য": `${dueCustomers.length} জন` },
    { "বিষয়": "মোট বাকি বিক্রির চালান (মেমো)", "তথ্য": `${dueSales.length} টি (৳ ${totalSalesDue.toLocaleString('bn-BD')})` },
    { "বিষয়": "সরবরাহকারীর কাছে দেনা (সাপ্লায়ার বকেয়া)", "তথ্য": `৳ ${totalSupplierDue.toLocaleString('bn-BD')}` },
    { "বিষয়": "নীট পাওনা / উদ্বৃত্ত", "তথ্য": `৳ ${(totalCustomerDue - totalSupplierDue).toLocaleString('bn-BD')}` },
    { "বিষয়": "--------------------", "তথ্য": "--------------------" },
    { "বিষয়": "মোট পণ্য সংখ্যা", "তথ্য": data.products?.length || 0 },
    { "বিষয়": "মোট বিক্রি সংখ্যা", "তথ্য": data.sales?.length || 0 },
    { "বিষয়": "মোট নিবন্ধিত গ্রাহক", "তথ্য": data.customers?.length || 0 },
    { "বিষয়": "মোট সরবরাহকারী", "তথ্য": data.suppliers?.length || 0 }
  ];
  const wsSummary = XLSX.utils.json_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, wsSummary, "সারসংক্ষেপ (Summary)");

  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Blob([wbout], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
