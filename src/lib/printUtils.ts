/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Sale, Business } from "../types";
import { api, getApiBusinessId } from "../services/api";
import { formatDhakaDate, formatDhakaDateTime } from "./utils";

const escapeHtml = (value: unknown): string => {
  const str = String(value ?? "");
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

const sanitizeImageSrc = (src: unknown): string => {
  const str = String(src ?? "").trim();
  if (!str) return "";
  if (/^data:image\/(png|jpeg|jpg|gif|webp);base64,[a-zA-Z0-9+/=]+$/i.test(str)) {
    return str;
  }
  if (/^https:\/\/[^\s"'<>]+$/i.test(str) || /^\/(?!\/)[^\s"'<>]+$/i.test(str)) {
    return escapeHtml(str);
  }
  return "";
};

export const resolvePrinterType = (business?: Partial<Business> | null): 'thermal' | 'a4' => {
  const bizId = business?.id || getApiBusinessId() || "main-business";
  if (typeof window !== "undefined") {
    const savedLocal = localStorage.getItem(`smart_printer_${bizId}`);
    if (savedLocal === "a4" || savedLocal === "thermal") {
      return savedLocal;
    }
  }
  if (business?.defaultPrinter === "a4" || business?.defaultPrinter === "thermal") {
    return business.defaultPrinter;
  }
  return "thermal";
};

export const buildPrintDocumentHtml = (html: string, printerType: 'thermal' | 'a4' = 'thermal'): string => {
  const isThermal = printerType === 'thermal';

  return `
    <div class="print-content-wrapper ${isThermal ? 'thermal-layout' : 'a4-layout'}" data-printer-type="${printerType}">
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&family=Noto+Sans+Bengali:wght@400;700&display=swap');
        
        .print-content-wrapper { 
          font-family: 'Inter', 'Noto Sans Bengali', sans-serif; 
          color: #1e293b !important; 
          background-color: #ffffff !important;
          margin: 0 auto;
          line-height: 1.5;
          position: relative;
          overflow: hidden;
          box-sizing: border-box;
        }

        .thermal-layout {
          width: 302px !important;
          min-width: 302px !important;
          max-width: 302px !important;
          padding: 16px !important;
          font-size: 12px;
        }

        .a4-layout {
          width: 794px !important;
          min-width: 794px !important;
          max-width: 794px !important;
          min-height: 1123px !important;
          padding: 48px !important;
          font-size: 14px;
        }

        .print-content-wrapper * {
          box-sizing: border-box;
          color-scheme: light;
        }

        .print-content-wrapper table { 
          width: 100%; 
          border-collapse: collapse; 
          margin: 15px 0; 
          background-color: #ffffff !important; 
        }

        .print-content-wrapper th { 
          text-align: left; 
          background: #f8fafc !important; 
          border-bottom: 2px solid #cbd5e1 !important; 
          padding: 10px 12px; 
          font-weight: bold; 
          color: #334155 !important; 
        }

        .print-content-wrapper td { 
          border-bottom: 1px solid #e2e8f0 !important; 
          padding: 10px 12px; 
          vertical-align: top; 
          color: #1e293b !important; 
        }

        .thermal-layout th, .thermal-layout td {
          padding: 5px 3px;
          font-size: 11px;
        }

        .print-header { 
          border-bottom: 3px solid #2563eb !important; 
          padding-bottom: 16px; 
          margin-bottom: 24px; 
          display: flex; 
          align-items: flex-start; 
          justify-content: space-between;
          gap: 16px; 
        }

        .thermal-layout .print-header {
          border-bottom-width: 2px !important;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 6px;
          margin-bottom: 14px;
          padding-bottom: 10px;
        }

        .print-meta-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 20px;
          margin-bottom: 24px;
        }

        .thermal-layout .print-meta-row {
          flex-direction: column;
          gap: 10px;
          margin-bottom: 14px;
        }

        .thermal-layout .print-meta-right {
          text-align: left !important;
          width: 100%;
          border-top: 1px dashed #cbd5e1;
          padding-top: 8px;
        }

        .print-totals-box {
          margin-left: auto;
          width: 340px;
          border-top: 2px solid #e2e8f0;
          padding-top: 15px;
        }

        .thermal-layout .print-totals-box {
          width: 100% !important;
        }

        .print-signatures {
          margin-top: 70px;
          display: flex;
          justify-content: space-between;
          gap: 20px;
        }

        .thermal-layout .print-signatures {
          display: none !important;
        }

        .print-title { font-size: 24px; font-weight: 900; color: #0f172a !important; line-height: 1.2; }
        .thermal-layout .print-title { font-size: 17px; }

        .font-bold { font-weight: bold !important; }
        .text-right { text-align: right !important; }
        .text-center { text-align: center !important; }
        .text-primary { color: #2563eb !important; }
        .text-rose { color: #e11d48 !important; }
        .text-emerald { color: #059669 !important; }
        
        @media print {
          body { margin: 0; padding: 0; background: #fff !important; }
          .print-content-wrapper { margin: 0 auto !important; box-shadow: none !important; border: none !important; }
          .a4-layout { width: 210mm !important; min-width: 210mm !important; max-width: 210mm !important; min-height: 297mm !important; padding: 15mm !important; }
          .thermal-layout { width: 80mm !important; min-width: 80mm !important; max-width: 80mm !important; padding: 3mm !important; margin: 0 auto !important; }
        }
      </style>
      ${html}
    </div>
  `;
};

const performPrint = (html: string, printerType: 'thermal' | 'a4' = 'thermal') => {
  const contentWithStyle = buildPrintDocumentHtml(html, printerType);
  const event = new CustomEvent('smart-print', {
    detail: {
      html: contentWithStyle,
      rawBodyHtml: html,
      printerType
    }
  });
  window.dispatchEvent(event);
};

export const printInvoice = async (sale: Sale, isTemporary?: boolean) => {
  const business = await api.getBusiness().catch(() => ({
    id: getApiBusinessId(),
    name: 'Smart Business',
    address: 'Dhaka, Bangladesh',
    phone: '01XXXXXXXXX',
    logo: '',
    defaultPrinter: 'thermal' as const
  }));

  const printerType = resolvePrinterType(business);
  const isThermal = printerType === 'thermal';
  const isTemp = isTemporary ?? sale.isTemporary ?? (sale.approvalStatus === 'pending');

  let customerDue = 0;
  let previousDue = 0;
  const saleDueVal = Number(sale.dueAmount) || 0;

  if (sale.customerId && sale.customerId !== 'walking') {
    try {
      const customers = await api.getCustomers();
      const customer = customers.find(c => c.id === sale.customerId);
      if (customer) {
        const currentStoredDue = Number(customer.dueAmount) || 0;
        if (isTemp) {
          previousDue = currentStoredDue;
          customerDue = currentStoredDue + saleDueVal;
        } else {
          customerDue = currentStoredDue;
          previousDue = currentStoredDue - saleDueVal;
        }
      }
    } catch (e) {
      console.error("Failed to fetch customer for print", e);
    }
  }

  const safeLogo = sanitizeImageSrc(business.logo);

  const html = `
    ${isTemp ? `
      <div style="position: absolute; top: 40%; left: 50%; transform: translate(-50%, -50%) rotate(-30deg); font-size: ${isThermal ? '28px' : '64px'}; font-weight: 900; color: rgba(220, 38, 38, 0.14); border: ${isThermal ? '3px' : '6px'} dashed rgba(220, 38, 38, 0.25); padding: ${isThermal ? '6px 14px' : '15px 40px'}; border-radius: 12px; pointer-events: none; z-index: 100; letter-spacing: ${isThermal ? '4px' : '10px'}; font-family: 'Arial Black', Impact, sans-serif; text-transform: uppercase; white-space: nowrap; user-select: none;">
        বিক্রয় অর্ডার (TEMPORARY)
      </div>
    ` : ''}

    <div class="print-header">
      ${safeLogo ? `<img src="${safeLogo}" style="height: 72px; width: auto; object-fit: contain; border-radius: 8px;" />` : ''}
      <div style="flex: 1;">
        <div class="print-title">${escapeHtml(business.name)}</div>
        <div style="font-size: 13px; color: #64748b; margin-top: 4px;">${escapeHtml(business.address)}</div>
        <div style="font-size: 13px; color: #64748b;">ফোন: ${escapeHtml(business.phone)}</div>
      </div>
    </div>
    
    <div class="print-meta-row">
      <div style="flex: 1;">
        <div style="color:#64748b; font-size: 11px; text-transform: uppercase; font-weight: bold;">ক্রেতার তথ্য:</div>
        <div style="font-weight:bold; font-size: 17px; margin-top: 4px;">${escapeHtml(sale.customerName || 'সাধারণ ক্রেতা')}</div>
        ${sale.customerPhone ? `<div style="color: #475569; font-size: 13px;">ফোন: ${escapeHtml(sale.customerPhone)}</div>` : ''}
        ${sale.customerAddress ? `<div style="color: #475569; font-size: 13px;">ঠিকানা: ${escapeHtml(sale.customerAddress)}</div>` : ''}
      </div>
      <div class="print-meta-right" style="flex: 1; text-align: right;">
        <div style="font-size: 17px; font-weight: bold; color: #2563eb;">
          ${isTemp ? 'বিক্রয় অর্ডার নং:' : 'ইনভয়েস নং:'} #${escapeHtml(sale.invoiceNo)}
        </div>
        <div style="color: #64748b; margin-top: 4px; font-size: 12px;">তারিখ (ঢাকা সময়): ${escapeHtml(sale.createdAt ? formatDhakaDateTime(sale.createdAt) : formatDhakaDateTime(new Date()))}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>পণ্যের বিবরণ</th>
          <th style="text-align: center;">পরিমাণ</th>
          <th style="text-align: right;">ইউনিট মূল্য</th>
          <th style="text-align: right;">মোট</th>
        </tr>
      </thead>
      <tbody>
        ${(sale.items || []).map(item => `
          <tr>
            <td>
              <div style="font-weight: 600;">${escapeHtml(item.name)}</div>
              ${item.warrantyType && item.warrantyType !== 'none' ? `<div style="font-size: 11px; color: #64748b;">${item.warrantyType === 'warranty' ? 'ওয়ারেন্টি' : 'গ্যারান্টি'}: ${escapeHtml(item.warrantyDuration || '')}</div>` : ''}
              ${item.scannedBarcodes && item.scannedBarcodes.length > 0 ? `<div style="font-size: 11px; color: #64748b; font-family: monospace;">[${escapeHtml(item.scannedBarcodes.join(', '))}]</div>` : ''}
            </td>
            <td style="text-align: center;">${Number(item.quantity) || 0}</td>
            <td style="text-align: right;">৳ ${Number(item.unitPrice) || 0}</td>
            <td style="text-align: right;" class="font-bold">৳ ${Number(item.subtotal) || 0}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div class="print-totals-box">
      <div style="display: flex; justify-content: space-between; padding: 4px 0;">
        <span>উপ-মোট (Subtotal):</span>
        <span>৳ ${Number(sale.totalAmount) || 0}</span>
      </div>
      <div style="display: flex; justify-content: space-between; padding: 4px 0; color: #e11d48;">
        <span>ছাড় (-):</span>
        <span>৳ ${Number(sale.discount) || 0}</span>
      </div>
      <div style="display: flex; justify-content: space-between; padding: 8px 0; margin-top: 5px; border-top: 1px solid #e2e8f0; font-weight: bold; font-size: 16px; color: #0f172a;">
        <span>নিট বিল:</span>
        <span>৳ ${Number(sale.payableAmount) || 0}</span>
      </div>
      <div style="display: flex; justify-content: space-between; padding: 4px 0; color: #059669; font-weight: bold;">
        <span>জমা পরিশোধ:</span>
        <span>৳ ${Number(sale.paidAmount) || 0}</span>
      </div>
      <div style="display: flex; justify-content: space-between; padding: 4px 0; color: ${saleDueVal < 0 ? '#059669' : '#e11d48'}; font-weight: bold; border-bottom: 1px dashed #e2e8f0; padding-bottom: 8px;">
        <span>${saleDueVal < 0 ? 'এই চালানে ক্রেতা পাবে (অতিরিক্ত জমা):' : 'এই চালানে বাকি:'}</span>
        <span>৳ ${Math.abs(saleDueVal)}</span>
      </div>
      
      ${sale.customerId && sale.customerId !== 'walking' ? `
        <div style="display: flex; justify-content: space-between; padding: 6px 0; margin-top: 4px; color: ${previousDue < 0 ? '#059669' : '#64748b'}; font-size: 13px;">
          <span>${previousDue < 0 ? 'পূর্বের ক্রেতা পাবে (-):' : 'পূর্বের বকেয়া (+):'}</span>
          <span>৳ ${Math.abs(previousDue)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 10px 0; margin-top: 5px; border-top: 2px solid #2563eb; font-weight: bold; font-size: 17px; color: ${customerDue < 0 ? '#059669' : '#1e293b'};">
          <span>${customerDue < 0 ? 'সর্বমোট ক্রেতা পাবে:' : 'সর্বমোট বকেয়া:'}</span>
          <span>৳ ${Math.abs(customerDue)}</span>
        </div>
      ` : ''}
    </div>

    <div class="print-signatures">
      <div style="text-align: center; width: 180px; border-top: 1px solid #334155; padding-top: 8px; font-size: 13px; color: #475569;">ক্রেতার স্বাক্ষর</div>
      <div style="text-align: center; width: 180px; border-top: 1px solid #334155; padding-top: 8px; font-size: 13px; color: #475569;">বিক্রেতা / কর্তৃপক্ষের স্বাক্ষর</div>
    </div>

    <div style="margin-top: 40px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 16px;">
      <div style="font-weight: bold; color: #64748b;">ক্রয় করার জন্য আপনাকে ধন্যবাদ!</div>
      <div style="margin-top: 4px;">সফটওয়্যার দ্বারা তৈরি এই কপিটি সংগ্রহে রাখুন।</div>
      <div style="margin-top: 8px; font-size: 10px; opacity: 0.7;">প্রিন্ট করা হয়েছে (ঢাকা সময়): ${escapeHtml(formatDhakaDateTime(new Date()))}</div>
    </div>
  `;
  performPrint(html, printerType);
};

export const printReport = async (title: string, data: { label: string, value: string }[]) => {
  const business = await api.getBusiness().catch(() => ({
    id: getApiBusinessId(),
    name: 'Smart Business',
    logo: '',
    address: '',
    phone: '',
    currency: 'BDT',
    defaultPrinter: 'thermal' as const
  }));
  const printerType = resolvePrinterType(business);
  const safeLogo = sanitizeImageSrc(business.logo);

  const html = `
    <div class="print-header" style="display: flex; align-items: center; gap: 15px;">
      ${safeLogo ? `<img src="${safeLogo}" style="height: 40px; width: auto; object-contain;" />` : ''}
      <div>
        <div class="print-title">${escapeHtml(business.name)}</div>
        <div style="font-size: 12px; color: #64748b;">ব্যবসায়িক প্রতিবেদন (Business Report)</div>
      </div>
    </div>

    <div style="text-align: center; margin-bottom: 40px;">
      <div style="font-size: 24px; font-weight: bold; color: #2563eb; margin-bottom: 10px;">${escapeHtml(title)}</div>
      <div style="font-size: 14px; color: #64748b;">তারিখ (ঢাকা সময়): ${escapeHtml(formatDhakaDate(new Date()))}</div>
    </div>

    <table>
      <thead>
        <tr>
          <th>বিবরণ</th>
          <th style="text-align: right;">মান / পরিমাণ</th>
        </tr>
      </thead>
      <tbody>
        ${data.map(item => `
          <tr>
            <td>${escapeHtml(item.label)}</td>
            <td style="text-align: right;" class="font-bold">${escapeHtml(item.value)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div style="margin-top: 100px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 20px;">
      <div>© ${new Date().getFullYear()} স্মার্ট বিজনেস অটোমেশন - সকল অধিকার সংরক্ষিত</div>
    </div>
  `;
  performPrint(html, printerType);
};

export const printCustomerStatement = async (customer: any, sales: any[]) => {
  const business = await api.getBusiness().catch(() => ({
    id: getApiBusinessId(),
    name: 'Smart Business',
    address: 'Dhaka, Bangladesh',
    phone: '01XXXXXXXXX',
    logo: '',
    defaultPrinter: 'thermal' as const
  }));
  const printerType = resolvePrinterType(business);
  const safeLogo = sanitizeImageSrc(business.logo);
  const dueBal = Number(customer?.dueAmount) || 0;

  const html = `
    <div class="print-header" style="display: flex; align-items: start; gap: 20px;">
      ${safeLogo ? `<img src="${safeLogo}" style="height: 80px; width: auto; object-fit: contain; border-radius: 8px;" />` : ''}
      <div style="flex: 1;">
        <div class="print-title">${escapeHtml(business.name)}</div>
        <div style="font-size: 14px; color: #64748b; margin-top: 5px;">${escapeHtml(business.address)}</div>
        <div style="font-size: 14px; color: #64748b;">ফোন: ${escapeHtml(business.phone)}</div>
      </div>
    </div>
    
    <div style="text-align: center; margin-bottom: 30px;">
      <div style="font-size: 20px; font-weight: bold; color: #2563eb;">কাস্টমার লেজার স্টেটমেন্ট</div>
      <div style="font-size: 14px; color: #64748b;">তারিখ (ঢাকা সময়): ${escapeHtml(formatDhakaDate(new Date()))}</div>
    </div>

    <div style="background: #f8fafc; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 30px;">
      <div style="display: flex; justify-content: space-between;">
        <div>
          <div style="color:#64748b; font-size: 12px; text-transform: uppercase;">ক্রেতার তথ্য:</div>
          <div style="font-weight:bold; font-size: 20px; margin-top: 5px;">${escapeHtml(customer?.name)}</div>
          <div style="color: #64748b; font-size: 14px;">ফোন: ${escapeHtml(customer?.phone)}</div>
          <div style="color: #64748b; font-size: 14px;">ঠিকানা: ${escapeHtml(customer?.address || 'N/A')}</div>
        </div>
        <div style="text-align: right;">
          <div style="color:${dueBal < 0 ? '#059669' : '#e11d48'}; font-size: 12px; text-transform: uppercase;">
            ${dueBal < 0 ? 'বর্তমান ক্রেতা পাবে (অ্যাডভান্স):' : 'বর্তমান বকেয়া:'}
          </div>
          <div style="font-weight:bold; font-size: 24px; color: ${dueBal < 0 ? '#059669' : '#e11d48'}; margin-top: 5px;">
            ৳ ${Math.abs(dueBal)}
          </div>
          <div style="color: #64748b; font-size: 14px; margin-top: 5px;">মোট কেনাকাটা: ৳ ${Number(customer?.totalSpent) || 0}</div>
        </div>
      </div>
    </div>

    <div style="font-weight: bold; margin-bottom: 15px; color: #1e293b;">সাম্প্রতিক লেনদেনের তালিকা:</div>
    <table>
      <thead>
        <tr>
          <th>তারিখ</th>
          <th>চালান নং</th>
          <th style="text-align: right;">মোট টাকা</th>
          <th style="text-align: right;">পেমেন্ট</th>
          <th style="text-align: right;">বকেয়া / ক্রেতা পাবে</th>
        </tr>
      </thead>
      <tbody>
        ${sales.map(sale => {
          const sDue = Number(sale.dueAmount) || 0;
          return `
          <tr>
            <td>${escapeHtml(sale.createdAt ? formatDhakaDate(sale.createdAt) : 'N/A')}</td>
            <td>${escapeHtml(sale.invoiceNo)}</td>
            <td style="text-align: right;">৳ ${Number(sale.payableAmount ?? sale.totalAmount) || 0}</td>
            <td style="text-align: right;">৳ ${Number(sale.paidAmount) || 0}</td>
            <td style="text-align: right; color: ${sDue < 0 ? '#059669' : sDue > 0 ? '#e11d48' : '#1e293b'}; font-weight: ${sDue !== 0 ? 'bold' : 'normal'};">
              ${sDue < 0 ? `ক্রেতা পাবে ৳ ${Math.abs(sDue)}` : `৳ ${sDue}`}
            </td>
          </tr>
        `;
        }).join('')}
        ${sales.length === 0 ? '<tr><td colspan="5" style="text-align:center; padding: 30px; color: #94a3b8;">কোনো লেনদেন পাওয়া যায়নি</td></tr>' : ''}
      </tbody>
    </table>

    <div style="margin-top: 80px; text-align: center; font-size: 13px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 20px;">
      <div style="font-weight: bold; color: #64748b;">আমাদের সাথে থাকার জন্য ধন্যবাদ।</div>
      <div style="margin-top: 10px; font-size: 10px; opacity: 0.7;">প্রিন্ট করা হয়েছে (ঢাকা সময়): ${escapeHtml(formatDhakaDateTime(new Date()))}</div>
    </div>
  `;
  performPrint(html, printerType);
};

export const printPaymentReceipt = async (data: {
  name: string,
  phone: string,
  amount: number,
  type: 'customer' | 'supplier',
  dueRemaining: number,
  description?: string,
  isTemporary?: boolean
}) => {
  const business = await api.getBusiness().catch(() => ({
    id: getApiBusinessId(),
    name: 'Smart Business',
    address: 'Dhaka, Bangladesh',
    phone: '01XXXXXXXXX',
    logo: '',
    defaultPrinter: 'thermal' as const
  }));
  const printerType = resolvePrinterType(business);
  const safeLogo = sanitizeImageSrc(business.logo);
  const remaining = Number(data.dueRemaining) || 0;

  const html = `
    ${data.isTemporary ? `
      <div style="position: absolute; top: 40%; left: 50%; transform: translate(-50%, -50%) rotate(-30deg); font-size: ${printerType === 'thermal' ? '32px' : '70px'}; font-weight: 900; color: rgba(220, 38, 38, 0.14); border: ${printerType === 'thermal' ? '3px' : '6px'} dashed rgba(220, 38, 38, 0.25); padding: ${printerType === 'thermal' ? '6px 18px' : '15px 45px'}; border-radius: 12px; pointer-events: none; z-index: 100; letter-spacing: ${printerType === 'thermal' ? '5px' : '12px'}; font-family: 'Arial Black', Impact, sans-serif; text-transform: uppercase; white-space: nowrap; user-select: none;">
        TEMPORARY
      </div>
    ` : ''}

    <div class="print-header" style="display: flex; align-items: start; gap: 20px;">
      ${safeLogo ? `<img src="${safeLogo}" style="height: 80px; width: auto; object-fit: contain; border-radius: 8px;" />` : ''}
      <div style="flex: 1;">
        <div class="print-title">${escapeHtml(business.name)}</div>
        <div style="font-size: 14px; color: #64748b; margin-top: 5px;">${escapeHtml(business.address)}</div>
        <div style="font-size: 14px; color: #64748b;">ফোন: ${escapeHtml(business.phone)}</div>
      </div>
    </div>
    
    <div style="text-align: center; margin-bottom: 30px;">
      <div style="font-size: 20px; font-weight: bold; color: ${data.type === 'customer' ? '#059669' : '#2563eb'}; border: 2px solid ${data.type === 'customer' ? '#059669' : '#2563eb'}; display: inline-block; padding: 5px 20px; border-radius: 8px; text-transform: uppercase;">
        ${data.type === 'customer' ? 'মানি রিসিট (ক্রেতা)' : 'পেমেন্ট ভাউচার (সরবরাহকারী)'}
      </div>
      <div style="font-size: 14px; color: #64748b; margin-top: 10px;">তারিখ (ঢাকা সময়): ${escapeHtml(formatDhakaDateTime(new Date()))}</div>
    </div>

    <div style="background: #f8fafc; padding: 25px; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 30px;">
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
        <div>
          <div style="color:#64748b; font-size: 12px; text-transform: uppercase;">${data.type === 'customer' ? 'গৃহীত হয়েছে:' : 'প্রদান করা হয়েছে:'}</div>
          <div style="font-weight:bold; font-size: 20px; margin-top: 5px; color: #1e293b;">${escapeHtml(data.name)}</div>
          <div style="color: #64748b; font-size: 14px;">ফোন: ${escapeHtml(data.phone)}</div>
        </div>
        <div style="text-align: right;">
          <div style="color:#64748b; font-size: 12px; text-transform: uppercase;">পেমেন্ট পরিমাণ:</div>
          <div style="font-weight:bold; font-size: 28px; color: #059669; margin-top: 5px;">৳ ${Number(data.amount) || 0}</div>
        </div>
      </div>
      
      ${data.description ? `
        <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #e2e8f0;">
          <div style="color:#64748b; font-size: 12px; text-transform: uppercase;">বিবরণ:</div>
          <div style="font-size: 14px; color: #1e293b; margin-top: 4px;">${escapeHtml(data.description)}</div>
        </div>
      ` : ''}
    </div>

    <div style="display: flex; justify-content: space-between; align-items: center; padding: 20px; border: 2px dashed #cbd5e1; border-radius: 12px;">
      <div style="font-size: 18px; font-weight: bold; color: #475569;">
        ${remaining < 0 ? 'ক্রেতা পাবে (অতিরিক্ত জমা):' : 'অবশিষ্ট বকেয়া:'}
      </div>
      <div style="font-size: 24px; font-weight: 900; color: ${remaining < 0 ? '#059669' : '#e11d48'};">
        ৳ ${Math.abs(remaining)}
      </div>
    </div>

    <div style="margin-top: 100px; display: flex; justify-content: space-between;">
      <div style="text-align: center; width: 200px; border-top: 1px solid #000; padding-top: 10px; font-size: 14px;">গ্রাহকের স্বাক্ষর</div>
      <div style="text-align: center; width: 200px; border-top: 1px solid #000; padding-top: 10px; font-size: 14px;">কর্তৃপক্ষের স্বাক্ষর</div>
    </div>

    <div style="margin-top: 60px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 20px;">
      <div style="font-weight: bold; color: #64748b;">আমাদের সাথে লেনদেন করার জন্য ধন্যবাদ।</div>
      <div style="margin-top: 5px;">সফটওয়্যার দ্বারা তৈরি এই অটো-জেনারেশন কপিটি সংরক্ষিত রাখুন।</div>
    </div>
  `;
  performPrint(html, printerType);
};
