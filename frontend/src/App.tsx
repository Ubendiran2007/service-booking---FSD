import React, { useEffect, useState } from 'react';
import { 
  BrowserRouter as Router, 
  Routes, 
  Route, 
  Navigate, 
  useNavigate 
} from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './lib/firebase';
import { User } from './types';

// Pages
import Login from './pages/Login';
import Register from './pages/Register';
import AdminDashboard from './pages/AdminDashboard';
import CustomerDashboard from './pages/CustomerDashboard';
import WorkerDashboard from './pages/WorkerDashboard';
import PendingApproval from './pages/PendingApproval';

const ProtectedRoute = ({ children, allowedRoles }: { children: (user: User) => React.ReactNode, allowedRoles?: string[] }) => {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data() as User;
          setUser(userData);
          if (allowedRoles && !allowedRoles.includes(userData.role)) {
            navigate('/');
          }
        } else {
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [navigate, allowedRoles]);

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-screen bg-slate-50 gap-4">
      <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      <p className="font-bold text-slate-500 animate-pulse">Initializing ServiFlow...</p>
    </div>
  );
  
  if (!user) return <Navigate to="/login" />;
  if (user.role === 'worker' && user.status === 'pending') return <PendingApproval />;

  return <>{children(user)}</>;
};

export default function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50 antialiased">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          
          <Route path="/admin" element={
            <ProtectedRoute allowedRoles={['admin']}>
              {(user) => <AdminDashboard view="approvals" user={user} />}
            </ProtectedRoute>
          } />
          <Route path="/admin/bookings" element={
            <ProtectedRoute allowedRoles={['admin']}>
              {(user) => <AdminDashboard view="bookings" user={user} />}
            </ProtectedRoute>
          } />
          <Route path="/admin/verification" element={
            <ProtectedRoute allowedRoles={['admin']}>
              {(user) => <AdminDashboard view="verification" user={user} />}
            </ProtectedRoute>
          } />
          
          <Route path="/customer" element={
            <ProtectedRoute allowedRoles={['customer']}>
              {(user) => <CustomerDashboard view="search" user={user} />}
            </ProtectedRoute>
          } />
          <Route path="/customer/bookings" element={
            <ProtectedRoute allowedRoles={['customer']}>
              {(user) => <CustomerDashboard view="bookings" user={user} />}
            </ProtectedRoute>
          } />
          
          <Route path="/worker" element={
            <ProtectedRoute allowedRoles={['worker']}>
              {(user) => <WorkerDashboard view="schedule" user={user} />}
            </ProtectedRoute>
          } />
          <Route path="/worker/requests" element={
            <ProtectedRoute allowedRoles={['worker']}>
              {(user) => <WorkerDashboard view="requests" user={user} />}
            </ProtectedRoute>
          } />
          <Route path="/worker/reviews" element={
            <ProtectedRoute allowedRoles={['worker']}>
              {(user) => <WorkerDashboard view="reviews" user={user} />}
            </ProtectedRoute>
          } />
          <Route path="/worker/verification" element={
            <ProtectedRoute allowedRoles={['worker']}>
              {(user) => <WorkerDashboard view="verification" user={user} />}
            </ProtectedRoute>
          } />

          <Route path="/" element={<Navigate to="/login" />} />
        </Routes>
      </div>
    </Router>
  );
}
