import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { Calendar, Mail, Lock, AlertCircle, ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      let userCredential;
      try {
        userCredential = await signInWithEmailAndPassword(auth, email, password);
      } catch (signInErr: any) {
        // Dev Fallback: Auto-register if it's a seeded account we're testing
        if (signInErr.code === 'auth/user-not-found' || signInErr.code === 'auth/invalid-credential') {
          const devEmails = [
            'admin@serviflow.com', 
            'john.plumber@example.com', 
            'sarah.spark@example.com', 
            'mike.mechanic@example.com', 
            'anna.tidy@example.com',
            'customer.jane@example.com'
          ];
          if (devEmails.includes(email)) {
            userCredential = await createUserWithEmailAndPassword(auth, email, password);
          } else {
            throw signInErr;
          }
        } else {
          throw signInErr;
        }
      }

      const userRef = doc(db, 'users', userCredential.user.uid);
      let userDoc = await getDoc(userRef);
      
      // Sync Logic: If UID lookup fails, check if an account with this email exists (e.g. from seed)
      if (!userDoc.exists()) {
        const { collection, getDocs, setDoc, deleteDoc, query, where } = await import('firebase/firestore');
        const q = query(collection(db, 'users'), where('email', '==', email));
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
          const oldDoc = querySnapshot.docs[0];
          const userData = oldDoc.data();
          // Move data to new UID and update UID field
          await setDoc(userRef, { ...userData, uid: userCredential.user.uid });
          // If the old one was a different ID, delete it
          if (oldDoc.id !== userCredential.user.uid) {
             await deleteDoc(oldDoc.ref);
          }
          userDoc = await getDoc(userRef);
        }
      }

      if (userDoc.exists()) {
        const userData = userDoc.data();
        if (userData.role === 'admin') navigate('/admin');
        else if (userData.role === 'customer') navigate('/customer');
        else if (userData.role === 'worker') navigate('/worker');
      } else {
        setError('User record not found in database.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-indigo-50 via-white to-slate-50">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white rounded-3xl shadow-2xl shadow-indigo-100/50 border border-indigo-50 p-8 sm:p-10"
      >
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-200 mb-6">
            <Calendar className="text-white w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight mb-2">Welcome Back</h1>
          <p className="text-slate-500">Sign in to manage your bookings</p>
        </div>

        {error && (
          <motion.div 
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="mb-6 p-4 bg-red-50 border border-red-100 text-red-600 rounded-xl flex items-center gap-3 text-sm"
          >
            <AlertCircle className="w-5 h-5 shrink-0" />
            {error}
          </motion.div>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700 ml-1">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
              <input
                type="email"
                required
                className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all outline-none text-slate-900"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700 ml-1">Password</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
              <input
                type="password"
                required
                className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all outline-none text-slate-900"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2 group disabled:opacity-70"
          >
            {loading ? 'Signing in...' : (
              <>
                Sign In
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </form>

        <div className="mt-8 text-center">
          <p className="text-slate-500 text-sm">
            Don't have an account?{' '}
            <Link to="/register" className="text-indigo-600 font-bold hover:text-indigo-700">
              Create an account
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
