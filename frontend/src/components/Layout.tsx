import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { LogOut, User as UserIcon, Calendar, CheckCircle, Clock, Star, MapPin, Search, Menu, X, Bell } from 'lucide-react';
import { auth, db } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { collection, query, where, orderBy, limit, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { Notification } from '../types';
import { cn } from '../lib/utils';

interface LayoutProps {
  children: React.ReactNode;
  role: 'admin' | 'customer' | 'worker';
  userName?: string;
}

export default function Layout({ children, role, userName }: LayoutProps) {
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [notifications, setNotifications] = React.useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = React.useState(false);

  React.useEffect(() => {
    if (!auth.currentUser) return;
    const q = query(
      collection(db, 'notifications'), 
      where('userId', '==', auth.currentUser.uid),
      orderBy('createdAt', 'desc'),
      limit(20)
    );
    const unsub = onSnapshot(q, (snapshot) => {
      setNotifications(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Notification)));
    });
    return () => unsub();
  }, []);

  const markAsRead = async (id: string) => {
    await updateDoc(doc(db, 'notifications', id), { isRead: true });
  };

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  const navItems = {
    admin: [
      { label: 'Worker Approvals', path: '/admin', icon: CheckCircle },
      { label: 'All Bookings', path: '/admin/bookings', icon: Calendar },
    ],
    customer: [
      { label: 'Find Workers', path: '/customer', icon: Search },
      { label: 'My Bookings', path: '/customer/bookings', icon: Calendar },
    ],
    worker: [
      { label: 'My Schedule', path: '/worker', icon: Calendar },
      { label: 'New Requests', path: '/worker/requests', icon: Clock },
      { label: 'My Reviews', path: '/worker/reviews', icon: Star },
    ],
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200">
                <Calendar className="text-white w-6 h-6" />
              </div>
              <span className="text-xl font-bold text-slate-900 tracking-tight">ServiFlow</span>
            </div>

            {/* Desktop Nav */}
            <nav className="hidden md:flex items-center gap-8">
              {navItems[role].map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className="text-sm font-medium text-slate-600 hover:text-indigo-600 transition-colors flex items-center gap-2"
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </Link>
              ))}
              <div className="h-6 w-px bg-slate-200 mx-2" />
              <div className="flex items-center gap-4">
                {/* Notifications */}
                <div className="relative">
                  <button 
                    onClick={() => setShowNotifications(!showNotifications)}
                    className="p-2 text-slate-400 hover:text-indigo-600 transition-colors relative"
                  >
                    <Bell className="w-5 h-5" />
                    {notifications.filter(n => !n.isRead).length > 0 && (
                      <span className="absolute top-[6px] right-[6px] w-2 h-2 bg-red-500 rounded-full animate-pulse shadow-[0_0_5px_rgba(239,68,68,0.8)]" />
                    )}
                  </button>

                  {/* Notification Dropdown */}
                  {showNotifications && (
                    <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden z-50">
                      <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                        <h4 className="font-bold text-slate-900">Notifications</h4>
                        {notifications.filter(n => !n.isRead).length > 0 && (
                          <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg uppercase tracking-widest">
                            {notifications.filter(n => !n.isRead).length} New
                          </span>
                        )}
                      </div>
                      <div className="max-h-[60vh] overflow-y-auto">
                        {notifications.length === 0 ? (
                          <div className="p-8 text-center text-slate-400 text-sm">
                            <Bell className="w-8 h-8 mx-auto mb-2 opacity-20" />
                            <p>No notifications yet.</p>
                          </div>
                        ) : (
                          notifications.map((notif) => (
                            <div 
                              key={notif.id} 
                              onClick={() => { if(!notif.isRead) markAsRead(notif.id); setShowNotifications(false); }}
                              className={`p-4 border-b border-slate-50 hover:bg-slate-50 transition-colors cursor-pointer flex gap-4 ${!notif.isRead ? 'bg-indigo-50/40' : ''}`}
                            >
                              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${!notif.isRead ? 'bg-indigo-100 text-indigo-600 shadow-inner' : 'bg-slate-100 text-slate-400'}`}>
                                <Bell className="w-5 h-5" />
                              </div>
                              <div>
                                <p className={`text-sm ${!notif.isRead ? 'font-black text-slate-900' : 'font-bold text-slate-700'}`}>{notif.title}</p>
                                <p className="text-[13px] text-slate-500 mt-1 leading-snug">{notif.message}</p>
                                <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase tracking-wider">{new Date(notif.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="w-px h-6 bg-slate-200" />
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200">
                    <UserIcon className="w-4 h-4 text-slate-600" />
                  </div>
                  <span className="text-sm font-semibold text-slate-700">{userName || 'User'}</span>
                </div>
                <button
                  onClick={handleLogout}
                  className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                  title="Logout"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            </nav>

            {/* Mobile Menu Button */}
            <button
              className="md:hidden p-2 text-slate-600"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              {isMenuOpen ? <X /> : <Menu />}
            </button>
          </div>
        </div>

        {/* Mobile Nav */}
        {isMenuOpen && (
          <div className="md:hidden bg-white border-t border-slate-100 p-4 space-y-4">
            {navItems[role].map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className="flex items-center gap-3 p-3 rounded-lg text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 font-medium"
                onClick={() => setIsMenuOpen(false)}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </Link>
            ))}
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 p-3 rounded-lg text-red-600 hover:bg-red-50 font-medium w-full text-left"
            >
              <LogOut className="w-5 h-5" />
              Logout
            </button>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
