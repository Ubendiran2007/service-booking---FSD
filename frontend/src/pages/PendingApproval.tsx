import React from 'react';
import { Clock, ShieldAlert, LogOut } from 'lucide-react';
import { auth } from '../lib/firebase';
import { signOut } from 'firebase/auth';

export default function PendingApproval() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl p-8 shadow-2xl border border-slate-200 text-center">
        <div className="w-20 h-20 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <Clock className="w-10 h-10 text-amber-500 animate-pulse" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Registration Pending</h1>
        <p className="text-slate-500 mb-8">
          Thank you for joining ServiFlow! Your professional profile is currently being reviewed by our admin team. This usually takes 24-48 hours.
        </p>
        
        <div className="p-4 bg-indigo-50 rounded-2xl flex items-start gap-3 text-left mb-8 border border-indigo-100">
          <ShieldAlert className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
          <p className="text-sm text-indigo-900 font-medium">
            You will receive full access to the dashboard once your certifications and details are verified.
          </p>
        </div>

        <button 
          onClick={() => signOut(auth)}
          className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
        >
          <LogOut className="w-5 h-5" /> Sign Out
        </button>
      </div>
    </div>
  );
}
