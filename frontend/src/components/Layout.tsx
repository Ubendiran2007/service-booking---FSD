import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { LogOut, User as UserIcon, Calendar, CheckCircle, Clock, Star, MapPin, Search, Menu, X, Bell, Navigation, CreditCard, ExternalLink, Shield, BarChart3, Sun, Moon } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
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
  const notificationPanelRef = React.useRef<HTMLDivElement>(null);
  const [theme, setTheme] = React.useState<'light' | 'dark'>('light');

  React.useEffect(() => {
    const stored = localStorage.getItem('sf-theme');
    if (stored === 'light' || stored === 'dark') {
      setTheme(stored);
      document.documentElement.classList.toggle('dark', stored === 'dark');
      return;
    }
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches;
    const initial: 'light' | 'dark' = prefersDark ? 'dark' : 'light';
    setTheme(initial);
    document.documentElement.classList.toggle('dark', initial === 'dark');
  }, []);

  const toggleTheme = () => {
    setTheme((cur) => {
      const next = cur === 'dark' ? 'light' : 'dark';
      localStorage.setItem('sf-theme', next);
      document.documentElement.classList.toggle('dark', next === 'dark');
      return next;
    });
  };

  React.useEffect(() => {
    if (!showNotifications) return;
    const closeIfOutside = (e: MouseEvent) => {
      const el = notificationPanelRef.current;
      if (el && !el.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', closeIfOutside);
    return () => document.removeEventListener('mousedown', closeIfOutside);
  }, [showNotifications]);

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
      { label: 'Dashboard', path: '/admin/dashboard', icon: BarChart3 },
      { label: 'Professional Approvals', path: '/admin/approvals', icon: CheckCircle },
      { label: 'Verification', path: '/admin/verification', icon: Shield },
      { label: 'All Bookings', path: '/admin/bookings', icon: Calendar },
    ],
    customer: [
      { label: 'Find Workers', path: '/customer', icon: Search },
      { label: 'My Bookings', path: '/customer/bookings', icon: Calendar },
    ],
    worker: [
      { label: 'My Schedule', path: '/worker', icon: Calendar },
      { label: 'New Requests', path: '/worker/requests', icon: Clock },
      { label: 'Reports', path: '/worker/reports', icon: BarChart3 },
      { label: 'Verification', path: '/worker/verification', icon: Shield },
      { label: 'My Reviews', path: '/worker/reviews', icon: Star },
    ],
  };
  const dedupedNavItems = navItems[role].filter(
    (item, idx, arr) => arr.findIndex((x) => x.label === item.label && x.path === item.path) === idx
  );

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <header className="bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center gap-6">
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200">
                <Calendar className="text-white w-6 h-6" />
              </div>
              <span className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">ServiFlow</span>
            </div>

            {/* Desktop Nav */}
            <nav className="hidden md:flex items-center gap-4 flex-1 min-w-0">
              <div className="grid grid-flow-col auto-cols-fr items-center gap-2 flex-1 min-w-0">
                {dedupedNavItems.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className="h-10 px-3 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
                  >
                    <item.icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                ))}
              </div>
              <div className="h-6 w-px bg-slate-200 dark:bg-slate-800 mx-1 shrink-0" />
              <div className="flex items-center gap-4 shrink-0">
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="p-2 rounded-xl text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"
                  title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                  aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                >
                  {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                </button>
                {/* Notifications — ref used for click-outside to close */}
                <div className="relative" ref={notificationPanelRef}>
                  <button 
                    type="button"
                    onClick={() => setShowNotifications(!showNotifications)}
                    className="p-2 text-slate-400 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors relative"
                  >
                    <Bell className="w-5 h-5" />
                    {notifications.filter(n => !n.isRead).length > 0 && (
                      <span className="absolute top-[6px] right-[6px] w-2 h-2 bg-red-500 rounded-full animate-pulse shadow-[0_0_5px_rgba(239,68,68,0.8)]" />
                    )}
                  </button>

                  {/* Notification Dropdown */}
                  {showNotifications && (
                    <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-slate-950 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden z-50">
                      <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 flex justify-between items-center">
                        <h4 className="font-bold text-slate-900 dark:text-slate-100">Notifications</h4>
                        {notifications.filter(n => !n.isRead).length > 0 && (
                          <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg uppercase tracking-widest">
                            {notifications.filter(n => !n.isRead).length} New
                          </span>
                        )}
                      </div>
                      <div className="max-h-[60vh] overflow-y-auto">
                        {notifications.length === 0 ? (
                          <div className="p-12 text-center">
                            <div className="w-16 h-16 bg-slate-50 dark:bg-slate-900/40 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-dashed border-slate-100 dark:border-slate-800">
                               <Bell className="w-6 h-6 text-slate-200" />
                            </div>
                            <p className="text-sm font-bold text-slate-400">No new activity</p>
                          </div>
                        ) : (
                          notifications.map((notif) => (
                            <div 
                              key={notif.id} 
                              className={`p-5 border-b border-slate-50 transition-all ${!notif.isRead ? 'bg-indigo-50/40 relative' : ''}`}
                            >
                              {!notif.isRead && <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-600" />}
                              <div className="flex gap-4">
                                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${notif.type === 'booking' ? 'bg-indigo-600 text-white' : 'bg-emerald-500 text-white shadow-lg'}`}>
                                  {notif.type === 'booking' ? <Calendar className="w-5 h-5" /> : <CreditCard className="w-5 h-5" />}
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center justify-between mb-1">
                                    <p className="text-xs font-black text-slate-900 dark:text-slate-100 tracking-tight uppercase">{notif.title}</p>
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">{formatDistanceToNow(new Date(notif.createdAt))} ago</p>
                                  </div>
                                  <p className="text-[13px] text-slate-600 dark:text-slate-300 leading-snug font-medium">{notif.message}</p>
                                  
                                  <div className="flex items-center gap-2 mt-3">
                                    {(notif.title.includes('Confirmed') || notif.title.includes('Request') || notif.title.includes('Completed')) && (
                                      <button 
                                        onClick={() => { 
                                          markAsRead(notif.id); 
                                          setShowNotifications(false);
                                          if (role === 'customer') navigate('/customer/bookings');
                                          else if (role === 'worker') {
                                            if (notif.title.includes('Request')) navigate('/worker/requests');
                                            else navigate('/worker');
                                          }
                                        }}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-[10px] font-black uppercase tracking-wider hover:bg-indigo-700 transition-colors"
                                      >
                                        <Navigation className="w-3 h-3" /> {notif.title.includes('Request') ? 'View' : 'Track'}
                                      </button>
                                    )}
                                    {notif.isRead ? (
                                      <span className="text-[9px] font-black text-slate-300 uppercase">Read</span>
                                    ) : (
                                      <button 
                                        onClick={() => markAsRead(notif.id)}
                                        className="text-[9px] font-black text-indigo-600 uppercase tracking-widest hover:underline"
                                      >
                                        Dismiss
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="w-px h-6 bg-slate-200 dark:bg-slate-800" />
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-900 flex items-center justify-center border border-slate-200 dark:border-slate-800">
                    <UserIcon className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                  </div>
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{userName || 'User'}</span>
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
              className="md:hidden p-2 text-slate-600 dark:text-slate-200"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              {isMenuOpen ? <X /> : <Menu />}
            </button>
          </div>
        </div>

        {/* Mobile Nav */}
        {isMenuOpen && (
          <div className="md:hidden bg-white dark:bg-slate-950 border-t border-slate-100 dark:border-slate-800 p-4 space-y-4">
            {dedupedNavItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className="flex items-center gap-3 p-3 rounded-lg text-slate-600 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-slate-900 hover:text-indigo-600 dark:hover:text-indigo-400 font-medium"
                onClick={() => setIsMenuOpen(false)}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </Link>
            ))}
            <button
              type="button"
              onClick={toggleTheme}
              className="flex items-center gap-3 p-3 rounded-lg text-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900 font-medium w-full text-left"
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </button>
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
