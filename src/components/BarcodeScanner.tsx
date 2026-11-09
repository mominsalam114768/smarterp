import { useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface BarcodeScannerProps {
  onResult: (result: string) => void;
  onClose: () => void;
}

export function BarcodeScanner({ onResult, onClose }: BarcodeScannerProps) {
  const scannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const html5QrCode = new Html5Qrcode("reader");

    const config = { fps: 10, qrbox: { width: 250, height: 250 } };
    
    html5QrCode.start(
      { facingMode: "environment" }, 
      config,
      (decodedText) => {
        // Stop scanning, return result
        html5QrCode.stop().then(() => {
           onResult(decodedText);
        }).catch(err => {
           console.error("Failed to stop scanner", err);
           onResult(decodedText);
        });
      },
      (errorMessage) => {
        // parse errors, can ignore
      }
    ).catch(err => {
      console.error("Error starting scanner", err);
    });

    return () => {
      if (html5QrCode.isScanning) {
        html5QrCode.stop().catch(error => console.error("Error stopping scanner automatically", error));
      }
    };
  }, [onResult]);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white dark:bg-slate-900 rounded-3xl overflow-hidden w-full max-w-md shadow-2xl border border-slate-100 dark:border-slate-800"
      >
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white font-bengali">বারকোড স্ক্যান করুন</h2>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-400 dark:text-slate-500"
          >
            <X size={20} />
          </button>
        </div>
        
        <div className="p-4 flex flex-col items-center">
          <div id="reader" className="w-full rounded-xl overflow-hidden bg-black" ref={scannerRef}></div>
          <p className="mt-4 text-sm text-slate-500 font-bengali text-center">
            পণ্য খুঁজতে বারকোড ক্যামেরার সামনে ধরুন
          </p>
        </div>
      </motion.div>
    </div>
  );
}
