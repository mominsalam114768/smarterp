/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Sale } from "../types";
import { api } from "../services/api";
import { formatDhakaDate, formatDhakaDateTime } from "./utils";

const performPrint = (html: string, printerType: 'thermal' | 'a4' = 'thermal') => {
  // Styles for the print content that will be injected
  const isThermal = printerType === 'thermal';
  
  const contentWithStyle = `
    <div class="print-content-wrapper ${isThermal ? 'thermal-layout' : 'a4-layout'}">
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&family=Noto+Sans+Bengali:wght@400;700&display=swap');
        
        .print-content-wrapper { 
          font-family: 'Inter', 'Noto Sans Bengali', sans-serif; 
          color: #1e293b !important; 
          background-color: #ffffff !important;
          margin: 0 auto;
          line-height: 1.5;
        }

        .thermal-layout {
          width: 80mm;
          max-width: 80mm;
          padding: 5mm;
          font-size: 12px;
        }

        .a4-layout {
          width: 210mm;
          max-width: 100%;
          padding: 20mm;
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
          border-bottom: 2px solid #e2e8f0 !important; 
          padding: 8px 10px; 
          font-weight: bold; 
          color: #475569 !important; 
        }

        .print-content-wrapper td { 
          border-bottom: 1px solid #f1f5f9 !important; 
          padding: 8px 10px; 
          vertical-align: top; 
          color: #1e293b !important; 
        }

        .thermal-layout th, .thermal-layout td {
          padding: 5px 2px;
          font-size: 11px;
        }

        .print-header { 
          border-bottom: 4px solid #2563eb !important; 
          padding-bottom: 15px; 
          margin-bottom: 20px; 
          display: flex; 
          align-items: start; 
          gap: 15px; 
        }

        .thermal-layout .print-header {
          border-bottom-width: 2px !important;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 5px;
        }

        .print-title { font-size: 20px; font-weight: 900; color: #1e293b !important; line-height: 1.2; }
        .thermal-layout .print-title { font-size: 18px; }

        .font-bold { font-weight: bold !important; }
        .text-right { text-align: right !important; }
        .text-center { text-align: center !important; }
        .text-primary { color: #2563eb !important; }
        .text-rose { color: #e11d48 !important; }
        .text-emerald { color: #059669 !important; }
        
        @page {
          margin: 0;
        }
        @media print {
          body { margin: 0; padding: 0; background: #fff !important; }
          .print-content-wrapper { margin: 0 auto !important; }
          .a4-layout { width: 210mm !important; max-width: 100% !important; padding: 15mm !important; }
          .thermal-layout { width: 80mm !important; max-width: 80mm !important; padding: 2mm !important; margin: 0 auto !important; }
        }
      </style>
      ${html}
    </div>
  `;

  const event = new CustomEvent('smart-print', { detail: { html: contentWithStyle } });
  window.dispatchEvent(event);
};

export const printInvoice = async (sale: Sale) => {
  const business = await api.getBusiness().catch(() => ({ 
    name: 'Smart Business', 
    address: 'Dhaka, Bangladesh',
    phone: '01XXXXXXXXX',
    logo: '',
    defaultPrinter: 'thermal' as const
  }));

  const printerType = business.defaultPrinter || 'thermal';
  const isThermal = printerType === 'thermal';

  // Fetch customer stats to show total due
  let customerDue = 0;
  let previousDue = 0;
  
  if (sale.customerId && sale.customerId !== 'walking') {
    try {
      const customers = await api.getCustomers();
      const customer = customers.find(c => c.id === sale.customerId);
      if (customer) {
        customerDue = customer.dueAmount;
        previousDue = Math.max(0, customerDue - sale.dueAmount);
      }
    } catch (e) {
      console.error("Failed to fetch customer for print", e);
    }
  }
  
  const html = `
    <div class="print-header" style="display: flex; align-items: start; gap: 20px;">
      ${business.logo ? `<img src="${business.logo}" style="height: 80px; width: auto; object-fit: contain; border-radius: 8px;" />` : ''}
      <div style="flex: 1;">
        <div class="print-title">${business.name}</div>
        <div style="font-size: 14px; color: #64748b; margin-top: 5px;">${business.address}</div>
        <div style="font-size: 14px; color: #64748b;">ফোন: ${business.phone}</div>
      </div>
    </div>
    
    <div style="display: flex; justify-content: space-between; margin-bottom: 30px;">
      <div style="flex: 1;">
        <div style="color:#64748b; font-size: 12px; text-transform: uppercase;">ক্রেতার তথ্য:</div>
        <div style="font-weight:bold; font-size: 18px; margin-top: 5px;">${sale.customerName || 'সাধারণ ক্রেতা'}</div>
        ${sale.customerPhone ? `<div style="color: #64748b; font-size: 13px;">ফোন: ${sale.customerPhone}</div>` : ''}
        ${sale.customerAddress ? `<div style="color: #64748b; font-size: 13px;">ঠিকানা: ${sale.customerAddress}</div>` : ''}
        ${sale.customerId ? `<div style="color: #64748b; font-size: 13px;">আইডি: ${sale.customerId}</div>` : ''}
      </div>
      <div style="flex: 1; text-align: right;">
        <div style="font-size: 20px; font-weight: bold; color: #2563eb;">ইনভয়েস: #${sale.invoiceNo}</div>
        <div style="color: #64748b; margin-top: 5px; font-size: 13px;">তারিখ (ঢাকা সময়): ${sale.createdAt ? formatDhakaDateTime(sale.createdAt) : formatDhakaDateTime(new Date())}</div>
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
        ${sale.items.map(item => `
          <tr>
            <td>
              <div>${item.name}</div>
              ${item.warrantyType && item.warrantyType !== 'none' ? `<div style="font-size: 11px; color: #64748b;">${item.warrantyType === 'warranty' ? 'ওয়ারেন্টি' : 'গ্যারান্টি'}: ${item.warrantyDuration || ''}</div>` : ''}
              ${item.scannedBarcodes && item.scannedBarcodes.length > 0 ? `<div style="font-size: 11px; color: #64748b; font-family: monospace;">[${item.scannedBarcodes.join(', ')}]</div>` : ''}
            </td>
            <td style="text-align: center;">${item.quantity}</td>
            <td style="text-align: right;">৳ ${item.unitPrice}</td>
            <td style="text-align: right;" class="font-bold">৳ ${item.subtotal}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div style="margin-left: auto; width: 320px; border-top: 2px solid #f1f5f9; padding-top: 15px;">
      <div style="display: flex; justify-content: space-between; padding: 4px 0;">
        <span>উপ-মোট (Subtotal):</span>
        <span>৳ ${sale.totalAmount}</span>
      </div>
      <div style="display: flex; justify-content: space-between; padding: 4px 0; color: #e11d48;">
        <span>ছাড় (-):</span>
        <span>৳ ${sale.discount}</span>
      </div>
      <div style="display: flex; justify-content: space-between; padding: 8px 0; margin-top: 5px; border-top: 1px solid #e2e8f0; font-weight: bold; font-size: 16px; color: #0f172a;">
        <span>নিট বিল:</span>
        <span>৳ ${sale.payableAmount}</span>
      </div>
      <div style="display: flex; justify-content: space-between; padding: 4px 0; color: #059669; font-weight: bold;">
        <span>জমা পরিশোধ:</span>
        <span>৳ ${sale.paidAmount}</span>
      </div>
      <div style="display: flex; justify-content: space-between; padding: 4px 0; color: #e11d48; font-weight: bold; border-bottom: 1px dashed #e2e8f0; padding-bottom: 8px;">
        <span>এই চালানে বাকি:</span>
        <span>৳ ${sale.dueAmount}</span>
      </div>
      
      ${sale.customerId && sale.customerId !== 'walking' ? `
        <div style="display: flex; justify-content: space-between; padding: 6px 0; margin-top: 4px; color: #64748b; font-size: 13px;">
          <span>পূর্বের বকেয়া (+):</span>
          <span>৳ ${previousDue}</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 10px 0; margin-top: 5px; border-top: 2px solid #2563eb; font-weight: bold; font-size: 18px; color: #1e293b;">
          <span>সর্বমোট বকেয়া:</span>
          <span>৳ ${customerDue}</span>
        </div>
      ` : ''}
    </div>

    <div style="margin-top: 60px; text-align: center; font-size: 13px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 20px;">
      <div style="font-weight: bold; color: #64748b;">ক্রয় করার জন্য আপনাকে ধন্যবাদ!</div>
      <div style="margin-top: 5px;">সফটওয়্যার দ্বারা তৈরি এই কপিটি সংগ্রহে রাখুন।</div>
      <div style="margin-top: 10px; font-size: 10px; opacity: 0.7;">প্রিন্ট করা হয়েছে (ঢাকা সময়): ${formatDhakaDateTime(new Date())}</div>
    </div>
  `;
  performPrint(html, printerType);
};

export const printReport = async (title: string, data: { label: string, value: string }[]) => {
  const business = await api.getBusiness().catch(() => ({ 
    name: 'Smart Business',
    logo: '',
    address: '',
    phone: '',
    currency: 'BDT',
    defaultPrinter: 'thermal' as const
  }));
  const printerType = business.defaultPrinter || 'thermal';
  const html = `
    <div class="print-header" style="display: flex; align-items: center; gap: 15px;">
      ${business.logo ? `<img src="${business.logo}" style="height: 40px; width: auto; object-contain;" />` : ''}
      <div>
        <div class="print-title">${business.name}</div>
        <div style="font-size: 12px; color: #64748b;">ব্যবসায়িক প্রতিবেদন (Business Report)</div>
      </div>
    </div>

    <div style="text-align: center; margin-bottom: 40px;">
      <div style="font-size: 24px; font-weight: bold; color: #2563eb; margin-bottom: 10px;">${title}</div>
      <div style="font-size: 14px; color: #64748b;">তারিখ (ঢাকা সময়): ${formatDhakaDate(new Date())}</div>
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
            <td>${item.label}</td>
            <td style="text-align: right;" class="font-bold">${item.value}</td>
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
    name: 'Smart Business', 
    address: 'Dhaka, Bangladesh',
    phone: '01XXXXXXXXX',
    logo: '',
    defaultPrinter: 'thermal' as const
  }));
  const printerType = business.defaultPrinter || 'thermal';
  
  const html = `
    <div class="print-header" style="display: flex; align-items: start; gap: 20px;">
      ${business.logo ? `<img src="${business.logo}" style="height: 80px; width: auto; object-fit: contain; border-radius: 8px;" />` : ''}
      <div style="flex: 1;">
        <div class="print-title">${business.name}</div>
        <div style="font-size: 14px; color: #64748b; margin-top: 5px;">${business.address}</div>
        <div style="font-size: 14px; color: #64748b;">ফোন: ${business.phone}</div>
      </div>
    </div>
    
    <div style="text-align: center; margin-bottom: 30px;">
      <div style="font-size: 20px; font-weight: bold; color: #2563eb;">কাস্টমার লেজার স্টেটমেন্ট</div>
      <div style="font-size: 14px; color: #64748b;">তারিখ (ঢাকা সময়): ${formatDhakaDate(new Date())}</div>
    </div>

    <div style="background: #f8fafc; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 30px;">
      <div style="display: flex; justify-content: space-between;">
        <div>
          <div style="color:#64748b; font-size: 12px; text-transform: uppercase;">ক্রেতার তথ্য:</div>
          <div style="font-weight:bold; font-size: 20px; margin-top: 5px;">${customer.name}</div>
          <div style="color: #64748b; font-size: 14px;">ফোন: ${customer.phone}</div>
          <div style="color: #64748b; font-size: 14px;">ঠিকানা: ${customer.address || 'N/A'}</div>
        </div>
        <div style="text-align: right;">
          <div style="color:#e11d48; font-size: 12px; text-transform: uppercase;">বর্তমান বকেয়া:</div>
          <div style="font-weight:bold; font-size: 24px; color: #e11d48; margin-top: 5px;">৳ ${customer.dueAmount}</div>
          <div style="color: #64748b; font-size: 14px; margin-top: 5px;">মোট কেনাকাটা: ৳ ${customer.totalSpent}</div>
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
          <th style="text-align: right;">বকেয়া</th>
        </tr>
      </thead>
      <tbody>
        ${sales.map(sale => `
          <tr>
            <td>${sale.createdAt ? formatDhakaDate(sale.createdAt) : 'N/A'}</td>
            <td>${sale.invoiceNo}</td>
            <td style="text-align: right;">৳ ${sale.totalAmount}</td>
            <td style="text-align: right;">৳ ${sale.paidAmount}</td>
            <td style="text-align: right;">৳ ${sale.dueAmount}</td>
          </tr>
        `).join('')}
        ${sales.length === 0 ? '<tr><td colspan="5" style="text-align:center; padding: 30px; color: #94a3b8;">কোনো লেনদেন পাওয়া যায়নি</td></tr>' : ''}
      </tbody>
    </table>

    <div style="margin-top: 80px; text-align: center; font-size: 13px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 20px;">
      <div style="font-weight: bold; color: #64748b;">আমাদের সাথে থাকার জন্য ধন্যবাদ।</div>
      <div style="margin-top: 10px; font-size: 10px; opacity: 0.7;">প্রিন্ট করা হয়েছে (ঢাকা সময়): ${formatDhakaDateTime(new Date())}</div>
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
  description?: string
}) => {
  const business = await api.getBusiness().catch(() => ({ 
    name: 'Smart Business', 
    address: 'Dhaka, Bangladesh',
    phone: '01XXXXXXXXX',
    logo: '',
    defaultPrinter: 'thermal' as const
  }));
  const printerType = business.defaultPrinter || 'thermal';

  const html = `
    <div class="print-header" style="display: flex; align-items: start; gap: 20px;">
      ${business.logo ? `<img src="${business.logo}" style="height: 80px; width: auto; object-fit: contain; border-radius: 8px;" />` : ''}
      <div style="flex: 1;">
        <div class="print-title">${business.name}</div>
        <div style="font-size: 14px; color: #64748b; margin-top: 5px;">${business.address}</div>
        <div style="font-size: 14px; color: #64748b;">ফোন: ${business.phone}</div>
      </div>
    </div>
    
    <div style="text-align: center; margin-bottom: 30px;">
      <div style="font-size: 22px; font-weight: bold; color: #059669; border: 2px solid #059669; display: inline-block; padding: 5px 20px; border-radius: 8px; text-transform: uppercase;">
        ${data.type === 'customer' ? 'মানি রিসিট (ক্রেতা)' : 'পেমেন্ট ভাউচার (সরবরাহকারী)'}
      </div>
      <div style="font-size: 14px; color: #64748b; margin-top: 10px;">তারিখ (ঢাকা সময়): ${formatDhakaDateTime(new Date())}</div>
    </div>

    <div style="background: #f8fafc; padding: 25px; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 30px;">
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
        <div>
          <div style="color:#64748b; font-size: 12px; text-transform: uppercase;">${data.type === 'customer' ? 'গৃহীত হয়েছে:' : 'প্রদান করা হয়েছে:'}</div>
          <div style="font-weight:bold; font-size: 20px; margin-top: 5px; color: #1e293b;">${data.name}</div>
          <div style="color: #64748b; font-size: 14px;">ফোন: ${data.phone}</div>
        </div>
        <div style="text-align: right;">
          <div style="color:#64748b; font-size: 12px; text-transform: uppercase;">পেমেন্ট পরিমাণ:</div>
          <div style="font-weight:bold; font-size: 28px; color: #059669; margin-top: 5px;">৳ ${data.amount}</div>
        </div>
      </div>
      
      ${data.description ? `
        <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #e2e8f0;">
          <div style="color:#64748b; font-size: 12px; text-transform: uppercase;">বিবরণ:</div>
          <div style="font-size: 14px; color: #1e293b; margin-top: 4px;">${data.description}</div>
        </div>
      ` : ''}
    </div>

    <div style="display: flex; justify-content: space-between; align-items: center; padding: 20px; border: 2px dashed #cbd5e1; border-radius: 12px;">
      <div style="font-size: 18px; font-weight: bold; color: #475569;">অবশিষ্ট বকেয়া:</div>
      <div style="font-size: 24px; font-weight: 900; color: #e11d48;">৳ ${data.dueRemaining}</div>
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
