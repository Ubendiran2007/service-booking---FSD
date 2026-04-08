import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle, AlertCircle, X, Info } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

interface ToastProps {
  message: string;
  type: ToastType;
  isVisible: boolean;
  onClose: () => void;
}

export default function Toast({ message, type, isVisible, onClose }: ToastProps) {
  React.useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => {
        onClose();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [isVisible, onClose]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, x: 100 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 100 }}
          className="fixed top-8 right-8 z-[300] min-w-[320px] max-w-[90vw]"
        >
          <div className={`px-6 py-4 rounded-2xl shadow-2xl border flex items-center gap-4 transition-all ${
            type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-900' :
            type === 'error' ? 'bg-red-50 border-red-100 text-red-900' :
            'bg-indigo-50 border-indigo-100 text-indigo-900'
          }`}>
            <div className={`p-2 rounded-xl ${
              type === 'success' ? 'bg-emerald-500 text-white' :
              type === 'error' ? 'bg-red-500 text-white' :
              'bg-indigo-500 text-white'
            }`}>
              {type === 'success' && <CheckCircle className="w-5 h-5" />}
              {type === 'error' && <AlertCircle className="w-5 h-5" />}
              {type === 'info' && <Info className="w-5 h-5" />}
            </div>
            
            <div className="flex-1">
              <p className="text-sm font-black tracking-tight leading-tight uppercase opacity-50 mb-0.5">
                {type === 'success' ? 'Confirmed' : type === 'error' ? 'System Error' : 'Notification'}
              </p>
              <p className="text-sm font-bold">{message}</p>
            </div>

            <button 
              onClick={onClose}
              className="p-1 hover:bg-black/5 rounded-lg transition-colors"
            >
              <X className="w-4 h-4 opacity-40 hover:opacity-100" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
