import React, { useEffect, useState, useRef, useCallback } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, getDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { Booking, BookingStatus, User } from '../types';
import Layout from '../components/Layout';
import { Check, X, Clock, Calendar, MapPin, Phone, User as UserIcon, DollarSign, Navigation, Star, TrendingUp, AlertCircle, Info, Zap, Award, Bell, LogOut, ChevronRight, CheckCircle, Shield, Activity, Flame, BarChart3, LineChart } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, formatDistanceToNow, isToday, isYesterday } from 'date-fns';
import TrackingMap from '../components/TrackingMap';
import { bookingService } from '../services/bookingService';
import Toast, { ToastType } from '../components/Toast';
import { cn } from '../lib/utils';
import { BOOKING_SLOT_TIMES } from '../lib/scheduling';

// Travel Model: ETA = (Distance / 30 km/h) * 60 mins = Distance * 2
const calculateTravelMinutes = (dist: number) => Math.round(dist * 2);

// Haversine formula for distance calculation
const haversineDistance = (p1: { lat: number; lng: number }, p2: { lat: number; lng: number }) => {
  const R = 6371; // km
  const dLat = (p2.lat - p1.lat) * Math.PI / 180;
  const dLng = (p2.lng - p1.lng) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export default function WorkerDashboard({ view = 'schedule', user }: { view?: 'schedule' | 'requests' | 'reviews' | 'verification' | 'reports', user: User }) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectModal, setRejectModal] = useState<{ open: boolean; bookingId: string }>({ open: false, bookingId: '' });
  const [rejectionReason, setRejectionReason] = useState('');
  const [viewMap, setViewMap] = useState<Booking | null>(null);
  const liveRouteMapRef = useRef<HTMLDivElement>(null);
  const [customerProfiles, setCustomerProfiles] = useState<Record<string, any>>({});
  const [isUpdating, setIsUpdating] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(!user.profile.welcomeShown);
  const [toast, setToast] = useState<{ message: string; type: ToastType; visible: boolean }>({ message: '', type: 'info', visible: false });
  const [isOnline, setIsOnline] = useState(user.profile.isOnline ?? true);

  // Real-time GPS tracking for worker (pushes to Firestore so TrackingMap picks it up)
  const watchIdRef = useRef<number | null>(null);
  const [currentLocation, setCurrentLocation] = useState<{lat: number, lng: number} | null>(user.profile.location || null);
  const [scheduleViewDate, setScheduleViewDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [skillInput, setSkillInput] = useState((user.profile.verification?.skills || []).join(', '));
  const [expYears, setExpYears] = useState(String(user.profile.verification?.experienceYears ?? 0));
  const [serviceRadius, setServiceRadius] = useState(String(user.profile.serviceRadiusKm ?? 15));
  const [employeeId, setEmployeeId] = useState(user.profile.verification?.employeeId ?? '');
  const [reportPeriod, setReportPeriod] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [reportVisual, setReportVisual] = useState<'card' | 'bar' | 'graph'>('bar');

  const startWorkerTracking = useCallback(() => {
    if (!navigator.geolocation) return;
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCurrentLocation(coords);
        if (auth.currentUser) {
          updateDoc(doc(db, 'users', auth.currentUser.uid), { 'profile.location': coords }).catch(() => {});
        }
      },
      (err) => console.warn('GPS watch error:', err.message),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );
  }, []);

  useEffect(() => {
    return () => { if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current); };
  }, []);

  useEffect(() => {
    const bookingsQuery = query(collection(db, 'bookings'), where('workerId', '==', auth.currentUser?.uid));
    const unsub = onSnapshot(bookingsQuery, async (snapshot) => {
      const bookingsData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Booking));
      setBookings(bookingsData);
      const profiles: Record<string, any> = {};
      for (const booking of bookingsData) {
        if (!profiles[booking.customerId]) {
          const userDoc = await getDoc(doc(db, 'users', booking.customerId));
          if (userDoc.exists()) profiles[booking.customerId] = userDoc.data().profile;
        }
      }
      setCustomerProfiles(profiles);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!auth.currentUser) return;
    const unsub = onSnapshot(doc(db, 'users', auth.currentUser.uid), (snapshot) => {
      if (snapshot.exists()) {
        const userData = snapshot.data() as User;
        setIsOnline(userData.profile.isOnline ?? true);
        setCurrentLocation(userData.profile.location || null);
      }
    });
    return () => unsub();
  }, []);

  // Auto-start tracking if there are active jobs to ensure customers see live movement
  useEffect(() => {
    if (isOnline || bookings.some(b => b.status === 'accepted')) {
      startWorkerTracking();
    } else {
       if (watchIdRef.current) {
          navigator.geolocation.clearWatch(watchIdRef.current);
          watchIdRef.current = null;
       }
    }
  }, [bookings, startWorkerTracking, isOnline]);

  /** When opening the live route panel from Active Jobs, scroll so the map is in view (user may be scrolled down). */
  useEffect(() => {
    if (!viewMap) return;
    const t = window.setTimeout(() => {
      liveRouteMapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 200);
    return () => clearTimeout(t);
  }, [viewMap]);

  const handleStatusUpdate = async (bookingId: string, status: BookingStatus, reason?: string) => {
    try {
      setIsUpdating(true);
      if (status === 'accepted') {
        let activeLocation = currentLocation || user.profile.location;
        
        if (navigator.geolocation) {
          try {
            const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
              navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
            });
            activeLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            await updateDoc(doc(db, 'users', auth.currentUser!.uid), {
              'profile.location': activeLocation
            });
            setCurrentLocation(activeLocation);
          } catch (e) {
            console.warn("GPS acquire failed, falling back to profile location:", e);
            if (!activeLocation) {
              setToast({ message: "GPS Signal Required: Please enable location or set a manual point in your profile to accept jobs.", type: 'error', visible: true });
              setIsUpdating(false);
              return;
            }
          }
        } else if (!activeLocation) {
          setToast({ message: "Location services unavailable. Please update your profile with a static location first.", type: 'error', visible: true });
          setIsUpdating(false);
          return;
        }

        const bookingPre = bookings.find(b => b.id === bookingId);
        if (bookingPre?.location && typeof bookingPre.location !== 'string' && user.profile.location) {
          const rKm = user.profile.serviceRadiusKm ?? 50;
          const d = haversineDistance(user.profile.location, bookingPre.location as { lat: number; lng: number });
          if (d > rKm) {
            setToast({
              message: `Job site is outside your service zone (${rKm} km). Update radius under Verification & zone or decline.`,
              type: 'error',
              visible: true,
            });
            setIsUpdating(false);
            return;
          }
        }
      }

      const booking = bookings.find(b => b.id === bookingId);
      await bookingService.updateStatus(
        bookingId, 
        status, 
        reason, 
        booking?.customerId, 
        booking?.serviceType
      );
    } catch (err) {
      console.error(err);
      setToast({ message: 'Failed to update status. Please check your connection.', type: 'error', visible: true });
    } finally {
      setIsUpdating(false);
    }
    setRejectModal({ open: false, bookingId: '' });
    setRejectionReason('');
  };

  const pendingRequests = [...bookings.filter(b => b.status === 'pending')].sort(
    (a, b) => (a.urgency === 'urgent' ? 0 : 1) - (b.urgency === 'urgent' ? 0 : 1)
  );
  const activeJobs = bookings.filter(b => b.status === 'accepted');
  const completedJobs = bookings.filter(b => b.status === 'completed');

  // Performance Intelligence
  const totalEarnings = completedJobs.reduce((acc, job) => acc + (job.payment?.amount || 0), 0);
  const avgJobValue = completedJobs.length > 0 ? (totalEarnings / completedJobs.length).toFixed(1) : '0';
  const acceptanceRate = bookings.length > 0 ? Math.round(((activeJobs.length + completedJobs.length) / (bookings.length)) * 100) : 100;
  
  // Peak Hours Calculation
  const hourCounts: Record<number, number> = {};
  bookings.forEach(b => {
    const hour = parseInt(b.time.split(':')[0]);
    hourCounts[hour] = (hourCounts[hour] || 0) + 1;
  });
  const peakHour = Object.entries(hourCounts).sort((a,b) => b[1] - a[1])[0]?.[0] || '10';
  const peakDisplay = `${peakHour}:00 - ${parseInt(peakHour)+2}:00`;

  const earningsByHour: Record<number, number> = {};
  completedJobs.forEach((b) => {
    const h = parseInt(b.time.split(':')[0], 10);
    earningsByHour[h] = (earningsByHour[h] || 0) + (b.payment?.amount || 0);
  });
  const chartHours = [9, 10, 11, 12, 13, 14, 15, 16, 17];
  const maxHourEarning = Math.max(...chartHours.map((h) => earningsByHour[h] || 0), 1);

  const slotBookingOnDay = (time: string) =>
    bookings.find((b) => b.date === scheduleViewDate && b.time === time);

  const reportData = (() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (reportPeriod === 'daily') {
      const todayKey = format(today, 'yyyy-MM-dd');
      return Array.from({ length: 7 }, (_, idx) => {
        const day = new Date(today);
        day.setDate(today.getDate() - (6 - idx));
        const dayKey = format(day, 'yyyy-MM-dd');
        const dayDone = completedJobs.filter((b) => b.date === dayKey);
        // Include in-progress jobs for today so the current day doesn't appear empty.
        const dayInProgress =
          dayKey === todayKey
            ? bookings.filter((b) => b.date === dayKey && (b.status === 'pending' || b.status === 'accepted'))
            : [];
        const completedEarnings = dayDone.reduce((sum, b) => sum + (b.payment?.amount || 0), 0);
        const inProgressEarnings = dayInProgress.reduce((sum, b) => sum + (b.payment?.amount || 0), 0);
        return {
          key: dayKey,
          label: format(day, 'EEE'),
          subLabel: dayKey === todayKey ? `${format(day, 'dd MMM')} (Today)` : format(day, 'dd MMM'),
          jobs: dayDone.length + dayInProgress.length,
          earnings: completedEarnings + inProgressEarnings,
        };
      });
    }

    if (reportPeriod === 'weekly') {
      return Array.from({ length: 8 }, (_, idx) => {
        const rangeEnd = new Date(today);
        rangeEnd.setDate(today.getDate() - (7 * (7 - idx)));
        const rangeStart = new Date(rangeEnd);
        rangeStart.setDate(rangeEnd.getDate() - 6);
        const inWeek = completedJobs.filter((b) => {
          const d = new Date(`${b.date}T00:00:00`);
          return d >= rangeStart && d <= rangeEnd;
        });
        return {
          key: format(rangeStart, 'yyyy-MM-dd'),
          label: `W${idx + 1}`,
          subLabel: `${format(rangeStart, 'dd MMM')} - ${format(rangeEnd, 'dd MMM')}`,
          jobs: inWeek.length,
          earnings: inWeek.reduce((sum, b) => sum + (b.payment?.amount || 0), 0),
        };
      });
    }

    return Array.from({ length: 6 }, (_, idx) => {
      const monthDate = new Date(today.getFullYear(), today.getMonth() - (5 - idx), 1);
      const m = monthDate.getMonth();
      const y = monthDate.getFullYear();
      const inMonth = completedJobs.filter((b) => {
        const d = new Date(`${b.date}T00:00:00`);
        return d.getMonth() === m && d.getFullYear() === y;
      });
      return {
        key: format(monthDate, 'yyyy-MM'),
        label: format(monthDate, 'MMM'),
        subLabel: format(monthDate, 'yyyy'),
        jobs: inMonth.length,
        earnings: inMonth.reduce((sum, b) => sum + (b.payment?.amount || 0), 0),
      };
    });
  })();
  const reportMax = Math.max(...reportData.map((d) => d.earnings), 1);
  const reportTotals = reportData.reduce(
    (acc, d) => ({ jobs: acc.jobs + d.jobs, earnings: acc.earnings + d.earnings }),
    { jobs: 0, earnings: 0 }
  );
  const hasReportData = reportData.some((d) => d.earnings > 0 || d.jobs > 0);
  const graphPoints = reportData.map((d, idx) => {
    const x = reportData.length <= 1 ? 50 : (idx / (reportData.length - 1)) * 100;
    const y = 100 - (reportMax > 0 ? (d.earnings / reportMax) * 100 : 0);
    return { x, y: Math.max(0, Math.min(100, y)), label: d.label, value: d.earnings };
  });

  const saveProfessionalProfile = async () => {
    if (!auth.currentUser) return;
    const skills = skillInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const yrs = Math.max(0, Math.min(60, parseInt(expYears, 10) || 0));
    const radius = Math.max(1, Math.min(200, parseFloat(serviceRadius) || 15));
    const patch: Record<string, unknown> = {
      'profile.verification.skills': skills,
      'profile.verification.experienceYears': yrs,
      'profile.verification.employeeId': employeeId.trim().toUpperCase(),
      'profile.serviceRadiusKm': radius,
    };
    if (user.profile.verification?.status !== 'verified') {
      patch['profile.verification.status'] = 'pending';
      patch['profile.verification.submittedAt'] = new Date().toISOString();
    }
    await updateDoc(doc(db, 'users', auth.currentUser.uid), patch);
    setToast({ message: 'Profile & zone saved.', type: 'success', visible: true });
  };

  // Performance Ranking (heuristic based on reliability)
  const reliability = acceptanceRate > 90 ? 'Top 5%' : acceptanceRate > 70 ? 'Top 15%' : 'Standard';

  const closeWelcomeModal = async () => {
    setShowWelcomeModal(false);
    if (auth.currentUser) {
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        'profile.welcomeShown': true
      });
    }
  };

  return (
    <Layout role="worker" userName={user.profile.name}>
      <div className="space-y-10">
        <div className="flex items-center justify-end">
          <button
            onClick={async () => {
              try {
                const newStatus = !isOnline;
                setIsOnline(newStatus);
                await updateDoc(doc(db, 'users', auth.currentUser!.uid), { 'profile.isOnline': newStatus });
                setToast({ message: `Status Updated: You are now ${newStatus ? 'Online' : 'Incognito'}`, type: 'success', visible: true });
              } catch (err) {
                setToast({ message: "Failed to update status. Check your connection.", type: 'error', visible: true });
              }
            }}
            className={cn("px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg active:scale-95", isOnline ? "bg-slate-900 text-white hover:bg-slate-800" : "bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-100")}
          >
            {isOnline ? 'Go Incognito' : 'Go Online'}
          </button>
        </div>

        {/* Real-Time Map Panel — scroll target for "Live Route" */}
        <div ref={liveRouteMapRef} className="scroll-mt-24">
        <AnimatePresence>
          {viewMap && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden bg-white rounded-3xl border border-slate-200 shadow-xl"
            >
              <div className="p-4 border-b flex justify-between items-center">
                <div>
                  <h3 className="font-bold flex items-center gap-2">
                    <Navigation className="w-5 h-5 text-indigo-600" />
                    Live Route → {customerProfiles[viewMap.customerId]?.name}'s Location
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">Real-time road routing • Updates as you move</p>
                </div>
                <button onClick={() => setViewMap(null)} className="p-2 hover:bg-slate-100 rounded-full">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="h-[450px]">
                {viewMap.location && typeof viewMap.location !== 'string' ? (
                  <TrackingMap
                    workerId={auth.currentUser!.uid}
                    customerLocation={viewMap.location as { lat: number; lng: number }}
                    workerName={user.profile.name}
                    customerName={customerProfiles[viewMap.customerId]?.name || 'Customer'}
                    height="450px"
                  />
                ) : (
                  <div className="h-full flex items-center justify-center bg-slate-50 text-slate-500 font-bold text-sm">
                    ⚠️ No GPS location saved for this booking.
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        </div>

        {view === 'requests' && (
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="space-y-10">
            <section>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-amber-500" /> New Service Requests
                </h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {pendingRequests.length === 0 ? (
                  <div className="col-span-full py-12 bg-white rounded-3xl border border-dashed border-slate-300 text-center text-slate-400">
                    <p>No new requests at the moment</p>
                  </div>
                ) : (
                  pendingRequests.map((booking, i) => {
                    const customer = customerProfiles[booking.customerId];
                    const activeWorkerPos = currentLocation || user.profile.location;
                    const dist = (booking.location && typeof booking.location !== 'string' && activeWorkerPos)
                       ? haversineDistance(
                           activeWorkerPos,
                           booking.location as { lat: number; lng: number }
                         )
                       : 0;
                    const travelTime = calculateTravelMinutes(dist);
                    const priceLevel = (booking.payment?.amount || 50) > 60 ? 'HIGH PAY' : 'AVERAGE';

                    return (
                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1 }}
                      key={booking.id}
                      className={cn(
                        'bg-white p-6 rounded-3xl border shadow-sm relative overflow-hidden group',
                        booking.urgency === 'urgent' ? 'border-amber-400 ring-2 ring-amber-100' : 'border-slate-200'
                      )}
                    >
                      {booking.urgency === 'urgent' && (
                        <div className="mb-4 flex items-center justify-center gap-2 py-2 rounded-xl bg-amber-500 text-white text-[10px] font-black uppercase tracking-widest">
                          <Flame className="w-4 h-4" /> Urgent request — prioritize response
                        </div>
                      )}
                      <div className="flex justify-between items-start mb-6">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-slate-950 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-slate-200">
                             <UserIcon className="w-6 h-6 text-slate-400" />
                          </div>
                          <div>
                            <h3 className="font-black text-slate-900 tracking-tight">{customer?.name || 'Client'}</h3>
                            <div className="flex items-center gap-1.5">
                               <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                               <span className="text-[10px] font-black text-slate-500">4.9 • Trusted Member</span>
                            </div>
                          </div>
                        </div>
                        {booking.notes && (
                          <div className="mt-4 p-3 bg-indigo-50/30 rounded-xl border border-indigo-100/50">
                            <p className="text-[10px] font-black text-indigo-500 uppercase tracking-tight mb-1 flex items-center gap-1.5"><Info className="w-3 h-3" /> Customer Incident Notes</p>
                            <p className="text-xs text-slate-600 font-medium italic">"{booking.notes}"</p>
                          </div>
                        )}
                        <div className={`px-2.5 py-1 rounded-lg text-[9px] font-black tracking-widest uppercase border ${priceLevel === 'HIGH PAY' ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>
                           {priceLevel}
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 mb-6">
                         <div className="bg-slate-50/80 rounded-2xl p-3 border border-slate-100 text-center flex flex-col justify-center">
                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter mb-0.5">Commute</span>
                            <span className="text-sm font-black text-slate-900 leading-none">{dist > 0 ? `${dist.toFixed(1)}km` : '<1km'}</span>
                            <span className="text-[8px] text-slate-300 font-mono mt-1 uppercase scale-90">Via: {currentLocation ? 'Live GPS' : 'Profile'}</span>
                         </div>
                         <div className="bg-slate-50/80 rounded-2xl p-3 border border-slate-100 text-center flex flex-col justify-center">
                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter mb-0.5">Travel</span>
                            <span className="text-sm font-black text-slate-900 leading-none">{dist > 0 ? `${travelTime}m` : '5m'}</span>
                         </div>
                         <div className="bg-indigo-600 rounded-2xl p-3 shadow-lg shadow-indigo-100 text-center flex flex-col justify-center">
                            <span className="text-[8px] font-black text-white/50 uppercase tracking-tighter mb-0.5">Earnings</span>
                            <span className="text-sm font-black text-white leading-none">₹{booking.payment.amount}</span>
                         </div>
                      </div>

                      <div className="flex items-center gap-3">
                         <button 
                           onClick={() => handleStatusUpdate(booking.id, 'accepted')}
                           disabled={isUpdating}
                           className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50 active:scale-95"
                         >
                           Accept Job
                         </button>
                         <button 
                           onClick={() => setRejectModal({ open: true, bookingId: booking.id })}
                           className="w-14 h-14 bg-slate-50 text-slate-400 rounded-2xl border border-slate-100 hover:bg-red-50 hover:text-red-500 transition-all flex items-center justify-center p-0"
                         >
                           <X className="w-6 h-6" />
                         </button>
                      </div>
                    </motion.div>
                    );
                  })
                )}
              </div>
            </section>
          </motion.div>
        )}

        {view === 'schedule' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-10">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
              {[
                { label: 'Revenue Efficiency', value: `₹${totalEarnings}`, icon: DollarSign, color: 'bg-emerald-500', trend: `Avg ₹${avgJobValue}/job`, desc: 'Total earnings' },
                { label: 'Market Standing', value: reliability, icon: Award, color: 'bg-amber-500', trend: 'Based on reliability', desc: 'Rank vs others' },
                { label: 'Peak Velocity', value: peakDisplay, icon: Zap, color: 'bg-indigo-500', trend: 'Highest demand', desc: 'Optimal work time' },
                { label: 'Acceptance Rate', value: `${acceptanceRate}%`, icon: TrendingUp, color: 'bg-indigo-600', trend: 'Job conversion', desc: 'Last 30 days' },
                { label: 'Reliability Index', value: `${Math.round(user.profile.reliabilityScore ?? 100)}`, icon: Shield, color: 'bg-slate-800', trend: `Canc. ${user.profile.reliabilityStats?.cancellations ?? 0} · Late ${user.profile.reliabilityStats?.delays ?? 0}`, desc: 'Platform score' },
              ].map((stat, i) => (
                <div key={i} className="bg-white p-6 rounded-3xl border border-slate-100 flex items-center gap-4 hover:shadow-lg hover:-translate-y-1 transition-all group">
                  <div className={`${stat.color} p-4 rounded-2xl text-white shadow-xl`}><stat.icon className="w-6 h-6" /></div>
                  <div>
                    <p className="text-[10px] font-black font-black text-slate-400 uppercase tracking-widest">{stat.label}</p>
                    <p className="text-2xl font-black text-slate-900 leading-none mt-1">{stat.value}</p>
                    <p className="text-[10px] font-bold text-indigo-600 mt-1.5">{stat.trend}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
              <h3 className="text-lg font-black text-slate-900 mb-2 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-emerald-500" /> Earnings by time of day
              </h3>
              <p className="text-slate-500 text-sm mb-6">
                Completed job revenue by start hour. Peak hour:{' '}
                <span className="font-black text-slate-800">
                  {Object.entries(earningsByHour).sort((a, b) => b[1] - a[1])[0]?.[0] || '—'}
                  :00
                </span>
              </p>
              <div className="flex items-end gap-2 h-32">
                {chartHours.map((h) => {
                  const amt = earningsByHour[h] || 0;
                  const pct = maxHourEarning > 0 ? Math.round((amt / maxHourEarning) * 100) : 0;
                  return (
                    <div key={h} className="flex flex-col items-center gap-2 flex-1">
                      <span className={cn('text-[9px] font-black', amt > 0 ? 'text-indigo-600' : 'text-slate-300')}>
                        ₹{amt.toFixed(0)}
                      </span>
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: `${Math.max(pct, 4)}%` }}
                        className={cn('w-full rounded-t-lg min-h-[4px]', amt > 0 ? 'bg-indigo-600' : 'bg-slate-100')}
                        title={`${h}:00 · ₹${amt.toFixed(0)}`}
                      />
                      <span className="text-[9px] font-black text-slate-400">{h}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-indigo-600" /> Schedule grid
                </h3>
                <input
                  type="date"
                  className="px-4 py-2 border border-slate-200 rounded-xl text-sm font-bold"
                  value={scheduleViewDate}
                  onChange={(e) => setScheduleViewDate(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {BOOKING_SLOT_TIMES.map((time) => {
                  const b = slotBookingOnDay(time);
                  let tone = 'bg-slate-50 border-slate-100 text-slate-500';
                  let label = 'Available';
                  if (b) {
                    if (b.status === 'pending') {
                      tone = 'bg-amber-50 border-amber-200 text-amber-900';
                      label = 'Pending';
                    } else if (b.status === 'accepted') {
                      tone = 'bg-indigo-50 border-indigo-200 text-indigo-900';
                      label = 'Confirmed';
                    } else if (b.status === 'completed') {
                      tone = 'bg-emerald-50 border-emerald-200 text-emerald-900';
                      label = 'Done';
                    } else if (b.status === 'rejected' || b.status === 'cancelled') {
                      tone = 'bg-slate-100 border-slate-200 text-slate-500';
                      label = b.status;
                    }
                  }
                  return (
                    <div key={time} className={cn('rounded-2xl border p-4', tone)}>
                      <p className="text-sm font-black">{time}</p>
                      <p className="text-[10px] font-bold uppercase tracking-tight mt-1">{label}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-indigo-600" /> Active Jobs
              </h2>
              <div className="space-y-4">
                {activeJobs.length === 0 ? (
                  <p className="text-slate-400 bg-white p-12 rounded-3xl border border-dashed border-slate-300 text-center">No active jobs currently.</p>
                ) : (
                  activeJobs.map((booking) => (
                    <div key={booking.id} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600"><Calendar className="w-6 h-6" /></div>
                        <div><h4 className="font-bold text-slate-900">{customerProfiles[booking.customerId]?.name}'s {booking.serviceType}</h4><p className="text-sm text-slate-500">{booking.date} at {booking.time}</p></div>
                      </div>
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={() => {
                            setViewMap(booking);
                            startWorkerTracking(); // push live GPS to Firestore
                          }} 
                          className="px-6 py-3 bg-indigo-50 text-indigo-600 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-indigo-100 transition-colors"
                        >
                          <MapPin className="w-4 h-4" /> Live Route
                        </button>
                        <button onClick={() => handleStatusUpdate(booking.id, 'completed')} className="px-6 py-3 bg-emerald-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-all">Mark Completed</button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

          </motion.div>
        )}

        {view === 'reviews' && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-10">
            {/* Reviews & Performance */}
            <section>
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                    <Star className="w-7 h-7 text-amber-500 fill-amber-500" />
                    Customer Feedback
                  </h2>
                  <p className="text-slate-500">Your total professional performance on ServiFlow</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6">
                {completedJobs.filter(b => b.payment.status === 'paid' && b.feedback).length === 0 ? (
                  <div className="bg-white p-20 rounded-3xl border border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400">
                     <Star className="w-12 h-12 mb-4 opacity-10" />
                     <p className="font-medium">No reviews from customers yet.</p>
                  </div>
                ) : (
                  completedJobs.filter(b => b.payment.status === 'paid' && b.feedback).map((booking) => (
                    <motion.div key={booking.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden group">
                       <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                         <Star className="w-24 h-24 text-amber-500 fill-amber-500" />
                       </div>
                       
                       <div className="flex justify-between items-start mb-6">
                         <div className="flex items-center gap-4">
                           <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 font-bold uppercase">
                             {customerProfiles[booking.customerId]?.name?.[0] || 'C'}
                           </div>
                           <div>
                             <h4 className="font-bold text-slate-900">{customerProfiles[booking.customerId]?.name}</h4>
                             <div className="flex items-center gap-1 mt-1">
                               {[...Array(5)].map((_, i) => (
                                 <Star key={i} className={`w-3.5 h-3.5 ${i < (booking.feedback?.rating || 0) ? 'text-amber-500 fill-amber-500' : 'text-slate-200 fill-slate-200'}`} />
                               ))}
                             </div>
                           </div>
                         </div>
                         <span className="text-xs font-bold text-slate-400">{booking.date}</span>
                       </div>

                       <blockquote className="text-slate-600 leading-relaxed italic mb-4">
                         "{booking.feedback?.comment}"
                       </blockquote>
                       
                       <div className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">{booking.serviceType} Professional Service</div>
                    </motion.div>
                  ))
                )}
              </div>
            </section>

          </motion.div>
        )}

        {view === 'verification' && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-8 max-w-3xl">
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
              <h2 className="text-2xl font-black text-slate-900 flex items-center gap-2 mb-2">
                <Shield className="w-7 h-7 text-indigo-600" /> Professional verification & service zone
              </h2>
              <p className="text-slate-500 text-sm mb-6">
                Status:{' '}
                <span className="font-black text-slate-800 uppercase">{user.profile.verification?.status || 'none'}</span>
                {user.profile.verification?.adminRemarks && (
                  <span className="block mt-2 text-amber-800 bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs font-bold">
                    Admin: {user.profile.verification.adminRemarks}
                  </span>
                )}
              </p>

              <div className="space-y-4 mb-6">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Skills (comma-separated)</label>
                <input
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 font-medium"
                  value={skillInput}
                  onChange={(e) => setSkillInput(e.target.value)}
                  placeholder="e.g. Pipe repair, Drain cleaning, Installation"
                />
              </div>
              <div className="space-y-2 mb-6">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Employee ID</label>
                <input
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 font-mono uppercase"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  placeholder="e.g. EMP10452"
                />
                <p className="text-[10px] text-slate-400 font-bold">
                  Must match: first 5 letters of your name (uppercase) + first 5 digits of phone.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Experience (years)</label>
                  <input
                    type="number"
                    min={0}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200"
                    value={expYears}
                    onChange={(e) => setExpYears(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Service radius (km)</label>
                  <input
                    type="number"
                    min={1}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200"
                    value={serviceRadius}
                    onChange={(e) => setServiceRadius(e.target.value)}
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={saveProfessionalProfile}
                className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-indigo-600 transition-all"
              >
                Save skills, experience & zone
              </button>
            </div>
          </motion.div>
        )}

        {view === 'reports' && (
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
            <section className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-2xl font-black text-slate-900 flex items-center gap-2">
                    <BarChart3 className="w-7 h-7 text-indigo-600" /> Performance Reports
                  </h2>
                  <p className="text-slate-500 text-sm mt-1">
                    Switch between daily, weekly and monthly reports. Choose card, bar or graph view.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mb-3">
                {[
                  { id: 'daily' as const, label: 'Daily Report' },
                  { id: 'weekly' as const, label: 'Weekly Report' },
                  { id: 'monthly' as const, label: 'Monthly Report' },
                ].map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setReportPeriod(p.id)}
                    className={cn(
                      'px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest border transition-all',
                      reportPeriod === p.id
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap gap-2 mb-6">
                {[
                  { id: 'card' as const, label: 'Card', icon: Calendar },
                  { id: 'bar' as const, label: 'Bar', icon: BarChart3 },
                  { id: 'graph' as const, label: 'Graph', icon: LineChart },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setReportVisual(m.id)}
                    className={cn(
                      'px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest border transition-all flex items-center gap-2',
                      reportVisual === m.id
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    )}
                  >
                    <m.icon className="w-3.5 h-3.5" /> {m.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Total jobs</p>
                  <p className="text-2xl font-black text-slate-900 mt-1">{reportTotals.jobs}</p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Total earnings</p>
                  <p className="text-2xl font-black text-slate-900 mt-1">₹{reportTotals.earnings.toFixed(0)}</p>
                </div>
              </div>

              {reportVisual === 'card' && (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {reportData.map((d) => (
                    <div key={d.key} className="rounded-2xl border border-slate-100 bg-white p-3">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{d.label}</p>
                      <p className="text-[10px] text-slate-400">{d.subLabel}</p>
                      <p className="text-sm font-black text-slate-900 mt-1">₹{d.earnings.toFixed(0)}</p>
                      <p className="text-[10px] font-bold text-indigo-600 mt-1">{d.jobs} jobs</p>
                    </div>
                  ))}
                </div>
              )}

              {reportVisual === 'bar' && (
                <div className="rounded-2xl border border-slate-100 p-4">
                  {!hasReportData ? (
                    <div className="h-40 flex items-center justify-center text-slate-400 font-bold text-sm">
                      No report data available for selected period.
                    </div>
                  ) : (
                    <div className="flex items-end gap-2 h-44">
                      {reportData.map((d) => {
                        const pct = reportMax > 0 ? Math.round((d.earnings / reportMax) * 100) : 0;
                        return (
                          <div key={d.key} className="flex-1 flex flex-col items-center gap-2">
                            <span className="text-[9px] font-bold text-slate-400">₹{d.earnings.toFixed(0)}</span>
                            <motion.div
                              initial={{ height: 0 }}
                              animate={{ height: `${Math.max(pct, d.earnings > 0 ? 10 : 4)}%` }}
                              className={cn('w-full rounded-t-xl min-h-[4px]', d.earnings > 0 ? 'bg-indigo-600' : 'bg-slate-100')}
                              title={`${d.subLabel}: ₹${d.earnings.toFixed(0)} • ${d.jobs} jobs`}
                            />
                            <span className="text-[10px] font-black text-slate-500">{d.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {reportVisual === 'graph' && (
                <div className="rounded-2xl border border-slate-100 p-4">
                  {!hasReportData ? (
                    <div className="h-40 flex items-center justify-center text-slate-400 font-bold text-sm">
                      No report data available for selected period.
                    </div>
                  ) : (
                    <>
                      <div className="h-40">
                        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
                          <polyline
                            fill="none"
                            stroke="rgb(79 70 229)"
                            strokeWidth="2"
                            points={graphPoints.map((p) => `${p.x},${p.y}`).join(' ')}
                          />
                          {graphPoints.map((p) => (
                            <circle key={p.label} cx={p.x} cy={p.y} r="2.2" fill="rgb(79 70 229)" />
                          ))}
                        </svg>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        {graphPoints.map((p) => (
                          <div key={`${p.label}-legend`} className="flex-1 text-center">
                            <p className="text-[10px] font-black text-slate-500">{p.label}</p>
                            <p className="text-[9px] font-bold text-slate-400">₹{p.value.toFixed(0)}</p>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </section>
          </motion.div>
        )}
      </div>

      {/* Reject Reason Modal */}
      <AnimatePresence>
        {rejectModal.open && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl">
              <h3 className="text-2xl font-bold text-slate-900 mb-2">Decline Request</h3>
              <p className="text-slate-500 mb-6">Please provide a reason for declining this service request.</p>
              <textarea className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-red-500 min-h-[120px]" placeholder="e.g., I have another booking..." value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} />
              <div className="grid grid-cols-2 gap-3 mt-6">
                <button onClick={() => setRejectModal({ open: false, bookingId: '' })} className="py-3 bg-slate-100 text-slate-600 rounded-xl font-bold">Cancel</button>
                <button onClick={() => handleStatusUpdate(rejectModal.bookingId, 'rejected', rejectionReason)} disabled={!rejectionReason.trim()} className="py-3 bg-red-600 text-white rounded-xl font-bold disabled:opacity-50">Decline</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      
      {/* Welcome Approval Modal */}
      <AnimatePresence>
        {showWelcomeModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.8, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 40 }}
              className="bg-white w-full max-w-lg rounded-[40px] p-10 shadow-2xl relative overflow-hidden text-center"
            >
              {/* Decorative Background Elements */}
              <div className="absolute -top-24 -left-24 w-64 h-64 bg-indigo-50 rounded-full opacity-50 blur-3xl" />
              <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-emerald-50 rounded-full opacity-50 blur-3xl" />
              
              <div className="relative z-10">
                <motion.div 
                  initial={{ rotate: -10, scale: 0 }}
                  animate={{ rotate: 0, scale: 1 }}
                  transition={{ type: "spring", damping: 12, delay: 0.2 }}
                  className="w-24 h-24 bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-indigo-200"
                >
                  <Award className="w-12 h-12 text-white" />
                </motion.div>
                
                <h2 className="text-3xl font-black text-slate-900 mb-4 tracking-tight leading-tight">
                  Congratulations, <span className="text-indigo-600">{user.profile.name}!</span>
                </h2>
                
                <p className="text-slate-600 mb-10 text-lg leading-relaxed font-medium">
                  Your professional profile has been <span className="text-emerald-600 font-bold uppercase tracking-tight">officially verified</span>. You now have full access to view service requests, track your earnings, and grow your business on ServiFlow.
                </p>
                
                <div className="grid grid-cols-3 gap-4 mb-10">
                   {[
                     { label: 'Verified', icon: CheckCircle, color: 'text-emerald-500' },
                     { label: 'Active', icon: Activity, color: 'text-indigo-500' },
                     { label: 'Insured', icon: Shield, color: 'text-indigo-600' }
                   ].map((badge, i) => (
                     <div key={i} className="flex flex-col items-center gap-2 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <badge.icon className={`w-5 h-5 ${badge.color}`} />
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{badge.label}</span>
                     </div>
                   ))}
                </div>

                <button 
                  onClick={closeWelcomeModal}
                  className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-3 active:scale-95 group"
                >
                  Enter My Dashboard
                  <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <Toast 
        message={toast.message} 
        type={toast.type} 
        isVisible={toast.visible} 
        onClose={() => setToast({ ...toast, visible: false })} 
      />
    </Layout>
  );
}
