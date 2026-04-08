import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, doc, updateDoc, getDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { User, Booking, BookingStatus, BookingUrgency } from '../types';
import Layout from '../components/Layout';
import { 
  Search, 
  MapPin, 
  Star, 
  Calendar, 
  Clock, 
  CheckCircle, 
  X, 
  MessageSquare, 
  CreditCard, 
  AlertCircle, 
  User as UserIcon, 
  Zap,
  Navigation,
  ExternalLink,
  PhoneCall,
  Bell,
  ArrowRight,
  ChevronRight,
  TrendingUp,
  DollarSign,
  Filter,
  LogOut,
  Shield,
  Flame
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, formatDistanceToNow } from 'date-fns';
import { cn } from '../lib/utils';
import { bookingService } from '../services/bookingService';
import MapComponent from '../components/MapComponent';
import TrackingMap from '../components/TrackingMap';
import Toast, { ToastType } from '../components/Toast';
import {
  BOOKING_SLOT_TIMES,
  isWorkerSlotBlocked,
  suggestSlotsForWorker,
  DEFAULT_SLOT_DURATION_MINUTES,
} from '../lib/scheduling';

export default function CustomerDashboard({ view = 'search', user }: { view?: 'search' | 'bookings', user: User }) {
  const [workers, setWorkers] = useState<User[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [bookingModal, setBookingModal] = useState<{ open: boolean; worker: User | null }>({ open: false, worker: null });
  const [feedbackModal, setFeedbackModal] = useState<{ open: boolean; booking: Booking | null }>({ open: false, booking: null });
  const [trackingModal, setTrackingModal] = useState<{ open: boolean; booking: Booking | null }>({ open: false, booking: null });
  
  const [bookingDate, setBookingDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [bookingTime, setBookingTime] = useState('10:00');
  const [bookingUrgency, setBookingUrgency] = useState<BookingUrgency>('normal');
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [problemNotes, setProblemNotes] = useState('');
  const [location, setLocation] = useState<{ lat: number, lng: number } | null>(user.profile.location || null);
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');
  const [gpsError, setGpsError] = useState('');
  const [toast, setToast] = useState<{ message: string; type: ToastType; visible: boolean }>({ message: '', type: 'info', visible: false });
  const [allBookings, setAllBookings] = useState<Booking[]>([]);

  const parseManualCoords = () => {
    const lat = Number(manualLat);
    const lng = Number(manualLng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return { lat, lng };
  };

  const setBookingCoords = (coords: { lat: number; lng: number }) => {
    const normalized = { lat: coords.lat, lng: coords.lng };
    setGpsError('');
    setLocation(normalized);
    setManualLat(String(normalized.lat));
    setManualLng(String(normalized.lng));
  };

  // Reset location error when opening the booking modal; sync manual fields from current choice.
  useEffect(() => {
    if (!bookingModal.open) return;
    setGpsError('');
    const base = location ?? user.profile.location ?? null;
    if (base) {
      setManualLat(String(base.lat));
      setManualLng(String(base.lng));
    }
    // Intentionally only when modal opens/closes — not on every location change while typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingModal.open]);

  useEffect(() => {
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Auto-capture and save GPS on mount to fix legacy accounts without coordinates
  useEffect(() => {
    if (!user.profile.location && navigator.geolocation && auth.currentUser) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setLocation(coords);
          try {
            await updateDoc(doc(db, 'users', auth.currentUser!.uid), {
              'profile.location': coords
            });
            // Also update local user object so map works immediately
            user.profile.location = coords;
          } catch (e) {
            console.error('Failed to save GPS to profile:', e);
          }
        },
        (err) => {
          console.warn('GPS auto-capture failed:', err.message);
        },
        { timeout: 8000, enableHighAccuracy: true }
      );
    }
  }, []);

  useEffect(() => {
    const workersQuery = query(collection(db, 'users'), where('role', '==', 'worker'), where('status', '==', 'active'));
    const unsubWorkers = onSnapshot(workersQuery, (snapshot) => {
      setWorkers(snapshot.docs.map(doc => ({ ...doc.data() as User, uid: doc.id })));
    });

    if (auth.currentUser) {
      const bookingsQuery = query(collection(db, 'bookings'), where('customerId', '==', auth.currentUser.uid));
      const unsubBookings = onSnapshot(bookingsQuery, (snapshot) => {
        setBookings(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Booking)));
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'modified' && change.doc.data().status !== 'pending') {
            if (Notification.permission === 'granted') {
              new Notification('ServiFlow Update', { body: `Your booking status changed to ${change.doc.data().status}`});
            }
          }
        });
      });
      
      const allBookingsQuery = query(collection(db, 'bookings'));
      const unsubAllBookings = onSnapshot(allBookingsQuery, (snapshot) => {
        setAllBookings(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Booking)));
      });

      return () => {
        unsubWorkers();
        unsubBookings();
        unsubAllBookings();
      };
    }

    return () => unsubWorkers();
  }, []);

  const handleBooking = async () => {
    if (!bookingModal.worker || !auth.currentUser) return;
    
    try {
      if (
        isWorkerSlotBlocked(bookingModal.worker.uid, bookingDate, bookingTime, allBookings, DEFAULT_SLOT_DURATION_MINUTES)
      ) {
        setToast({
          message: 'That time overlaps an existing booking for this professional. Pick another slot.',
          type: 'error',
          visible: true,
        });
        return;
      }

      // Force numeric GPS coordinates for the booking
      let activeLocation = location;
      
      // If no specific location captured, use profile one
      if (!activeLocation && user.profile.location) {
          activeLocation = user.profile.location;
      }

      if (!activeLocation || typeof activeLocation === 'string') {
        setToast({ message: "Precision GPS coordinates are missing for this booking. Please capture your position first.", type: 'error', visible: true });
        return;
      }

      const workerBase = bookingModal.worker.profile.location;
      const radiusKm = bookingModal.worker.profile.serviceRadiusKm ?? 50;
      if (workerBase) {
        const d = haversineDistance(workerBase, activeLocation);
        if (d > radiusKm) {
          setToast({
            message: `This destination is outside this professional’s service zone (${radiusKm} km).`,
            type: 'error',
            visible: true,
          });
          return;
        }
      }

      const newBooking = {
        customerId: auth.currentUser.uid,
        workerId: bookingModal.worker.uid,
        serviceType: bookingModal.worker.profile.category,
        date: bookingDate,
        time: bookingTime,
        status: 'pending' as BookingStatus,
        notes: problemNotes,
        location: activeLocation,
        urgency: bookingUrgency,
        slotDurationMinutes: DEFAULT_SLOT_DURATION_MINUTES,
        amount: getDynamicPrice(),
        payment: {
          amount: getDynamicPrice(),
          status: 'pending'
        },
        createdAt: new Date().toISOString()
      };

      await bookingService.createBooking(newBooking);
      setBookingModal({ open: false, worker: null });
      setProblemNotes('');
    } catch (err: any) {
      const errorMessage = err?.message || 'Unknown error';
      setToast({ message: `Failed to book service: ${errorMessage}`, type: 'error', visible: true });
      console.error('Booking Error:', err);
    }
  };

  const handleFeedback = async () => {
    if (!feedbackModal.booking) return;

    try {
      await bookingService.submitFeedback(feedbackModal.booking.id, rating, comment);
      setFeedbackModal({ open: false, booking: null });
      setRating(5);
      setComment('');
    } catch (err) {
      setToast({ message: 'Failed to submit feedback. Check your connection.', type: 'error', visible: true });
      console.error(err);
    }
  };

  const haversineDistance = (coords1: {lat: number, lng: number}, coords2: {lat: number, lng: number}) => {
    const R = 6371; // km
    const dLat = (coords2.lat - coords1.lat) * Math.PI / 180;
    const dLng = (coords2.lng - coords1.lng) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(coords1.lat * Math.PI / 180) * Math.cos(coords2.lat * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
  };

  const getDynamicPrice = () => {
    const base_price = 50;
    if (!bookingModal.worker) return base_price;
    
    // 1. Demand Multiplier: (Bookings in slot / Total workers in category)
    const categoryWorkers = workers.filter(w => w.profile.category === bookingModal.worker?.profile.category).length;
    const slotBookings = allBookings.filter(b => 
      b.serviceType === bookingModal.worker?.profile.category && 
      b.date === bookingDate && 
      b.time === bookingTime &&
      b.status !== 'rejected' &&
      b.status !== 'cancelled'
    ).length;
    
    const demandRatio = categoryWorkers > 0 ? slotBookings / categoryWorkers : 0;
    const demand_multiplier = 1 + (demandRatio * 1.5); // Scalable demand impact

    // 2. Lead-time multiplier: Same-day = 1.3x, Next-day = 1.1x, others = 1.0x
    const today = format(new Date(), 'yyyy-MM-dd');
    const tomorrow = format(new Date(Date.now() + 86400000), 'yyyy-MM-dd');
    const lead_multiplier = bookingDate === today ? 1.3 : bookingDate === tomorrow ? 1.1 : 1.0;

    // 3. Explicit urgent flag (customer-selected) — premium
    const urgent_multiplier = bookingUrgency === 'urgent' ? 1.35 : 1.0;

    // 4. Rating Multiplier: (Rating / 5) normalized
    const rating = bookingModal.worker.profile.rating || 0;
    const rating_multiplier = 1 + (rating / 10); // Elite pros get up to 1.5x

    const price = base_price * demand_multiplier * lead_multiplier * urgent_multiplier * rating_multiplier;
    return price;
  };

  const workersWithScores = workers.map(w => {
    let distance = 0;
    const activeCustomerLoc = location || user.profile.location;
    if (activeCustomerLoc && w.profile.location) {
      distance = haversineDistance(activeCustomerLoc, w.profile.location);
    }

    const radiusKm = w.profile.serviceRadiusKm ?? 50;
    const inServiceZone =
      !activeCustomerLoc || !w.profile.location ? true : haversineDistance(w.profile.location, activeCustomerLoc) <= radiusKm;
    
    const etaMin = distance > 0 ? Math.round((distance / 30) * 60) : 10;

    const workerJobs = allBookings.filter(b => b.workerId === w.uid);
    const totalJobs = workerJobs.length;
    const completedJobs = workerJobs.filter(b => b.status === 'completed').length;
    const bookingReliability = totalJobs > 0 ? (completedJobs / totalJobs) : 1;
    const platformRel = (w.profile.reliabilityScore ?? 100) / 100;
    const reliabilityBlend = 0.55 * bookingReliability + 0.45 * platformRel;

    const slotBlocked = isWorkerSlotBlocked(w.uid, bookingDate, bookingTime, allBookings, DEFAULT_SLOT_DURATION_MINUTES);
    const availability = slotBlocked ? 0 : 1;

    const distScore = distance > 0 ? Math.max(1 - (distance / 50), 0) : 0.5;
    const ratingScore = (w.profile.rating || 0) / 5;
    const v = w.profile.verification?.status;
    const verifiedScore = v === 'verified' ? 1 : v === 'pending' ? 0.55 : 0.25;

    const score =
      (inServiceZone ? 1 : 0) *
      (0.32 * distScore +
        0.26 * ratingScore +
        0.18 * availability +
        0.14 * reliabilityBlend +
        0.1 * verifiedScore);

    let matchReason = 'Top Rated';
    if (!inServiceZone) matchReason = 'Outside zone';
    else if (availability === 1 && distance < 5) matchReason = 'Ready Now & Near';
    else if (reliabilityBlend > 0.92) matchReason = 'Highly Reliable';
    else if (v === 'verified') matchReason = 'Verified Pro';
    else if (score > 0.55) matchReason = 'Strong Match';

    return { 
      ...w, 
      distance, 
      etaMin, 
      score, 
      reliability: Math.round(reliabilityBlend * 100), 
      matchReason,
      source: location ? 'Live' : 'Profile',
      customerPos: activeCustomerLoc,
      inServiceZone,
    };
  });

  const filteredWorkers = workersWithScores.filter(w => {
    const matchesSearch = w.profile.name.toLowerCase().includes(search.toLowerCase()) || 
                         w.profile.category?.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || w.profile.category === selectedCategory;
    const dest = location || user.profile.location;
    const zoneOk =
      !dest || !w.profile.location ? true : haversineDistance(w.profile.location, dest) <= (w.profile.serviceRadiusKm ?? 50);
    return matchesSearch && matchesCategory && zoneOk;
  }).sort((a, b) => b.score - a.score).slice(0, 6);

  const handleAutoAssign = () => {
    if (selectedCategory === 'all') {
       setToast({ message: "Please select a service category (e.g., Plumber, Mechanic) first so we can find the best match for your specific needs.", type: 'info', visible: true });
       return;
    }

    // 1. Take the top result from our pre-scored, pre-sorted filteredWorkers array
    const bestMatch = filteredWorkers[0];
    
    if (bestMatch) {
      if (bestMatch.score > 0.6) { // Minimum threshold for "good match"
        setBookingModal({ open: true, worker: bestMatch });
      } else {
        setToast({ message: "Best found match has a low confidence score. We recommend reviewing manually.", type: 'info', visible: true });
        setBookingModal({ open: true, worker: bestMatch });
      }
    } else {
      setToast({ message: `No available ${selectedCategory} professionals found in your area.`, type: 'info', visible: true });
    }
  };

  const categories = ['all', 'electrician', 'plumber', 'mechanic', 'house keeping', 'carpenter', 'painter'];

  return (
    <Layout role="customer" userName={user.profile.name}>
      <div className="space-y-8">
        {view === 'search' && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8"
          >
            {/* Search & Filter */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-6">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search for services or workers..."
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${
                      selectedCategory === cat 
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' 
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Live Service Map Section */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <Navigation className="w-5 h-5 text-indigo-600" />
                  Live Explorer: Workers Near You
                </h2>
              </div>
              <div className="h-[350px] bg-white rounded-[32px] border border-slate-200 shadow-xl overflow-hidden relative group">
                <MapComponent
                  center={[location?.lat || 20, location?.lng || 78]}
                  zoom={12}
                  markers={[
                    ...(location ? [{ position: [location.lat, location.lng], label: '🏠 You (Current Location)', type: 'customer' as const }] : []),
                    ...filteredWorkers
                      .filter(w => w.profile.location && (w.profile.isOnline !== false || bookings.some(b => b.workerId === w.uid && b.status === 'accepted')))
                      .map(w => ({
                        position: [w.profile.location!.lat, w.profile.location!.lng],
                        label: `Professional: ${w.profile.name} (${w.profile.category})`,
                        type: 'worker' as const
                      }))
                  ]}
                  showRoute={false}
                />
                {!location && (
                   <div className="absolute inset-0 bg-slate-50/50 backdrop-blur-[2px] flex items-center justify-center z-20">
                      <div className="bg-white p-6 rounded-2xl shadow-xl border border-slate-200 text-center max-w-sm">
                         <MapPin className="w-8 h-8 text-indigo-600 mx-auto mb-4 animate-bounce" />
                         <p className="font-bold text-slate-900 mb-2">Acquiring Precision GPS...</p>
                         <p className="text-xs text-slate-500">Please enable location permissions to see workers on the map.</p>
                      </div>
                   </div>
                )}
              </div>
            </section>

            {/* Workers Grid */}
            <section>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <Star className="w-5 h-5 text-indigo-600" />
                  Smart Professional Recommendations
                </h2>
                <button
                  onClick={handleAutoAssign}
                  className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl text-sm font-bold shadow-lg hover:shadow-xl transition-all flex items-center gap-2"
                >
                  <Zap className="w-4 h-4" /> Auto Assign Best Match
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredWorkers.map((worker) => (
                  <motion.div
                    key={worker.uid}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-xl hover:border-indigo-100 transition-all group"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center group-hover:bg-indigo-600 transition-colors shadow-inner">
                          <UserIcon className="w-6 h-6 text-indigo-600 group-hover:text-white" />
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-900 text-lg tracking-tight">{worker.profile.name}</h3>
                          <div className="flex items-center gap-2 flex-wrap">
                             <p className="text-xs font-black text-indigo-600 uppercase tracking-widest">{worker.profile.category}</p>
                             {worker.profile.verification?.status === 'verified' && (
                               <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                                 <Shield className="w-3 h-3" /> Verified
                               </span>
                             )}
                             <div className="w-1 h-1 bg-slate-300 rounded-full hidden sm:block" />
                             <p className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">{worker.matchReason}</p>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-1 font-bold">Zone: {worker.profile.serviceRadiusKm ?? 50} km • Reliability {Math.round(worker.profile.reliabilityScore ?? 100)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 bg-amber-50 px-2 py-1 rounded-lg border border-amber-100">
                        <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                        <span className="text-sm font-black text-amber-700">{worker.profile.rating?.toFixed(1) || 'N/A'}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-6">
                      <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                         <div className="flex items-center gap-2 text-slate-400 mb-1">
                            <Clock className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-bold uppercase tracking-tight">Est. Arrival</span>
                         </div>
                         <p className="text-sm font-black text-slate-900">{worker.etaMin} mins</p>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                         <div className="flex items-center gap-2 text-slate-400 mb-1">
                            <MapPin className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-bold uppercase tracking-tight">Distance</span>
                         </div>
                         <p className="text-sm font-black text-slate-900">
                            {worker.distance < 0.1 ? 'Nearby' : `${worker.distance.toFixed(1)} km`}
                         </p>
                         <p className="text-[8px] text-slate-300 font-bold mt-1 uppercase tracking-tighter">
                            Via: {worker.source} • {worker.customerPos?.lat.toFixed(2) || '??'},{worker.customerPos?.lng.toFixed(2) || '??'}
                         </p>
                      </div>
                      <div className="col-span-2 px-4 py-2 bg-indigo-50/50 rounded-xl border border-indigo-100/50 flex items-center justify-between">
                         <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">Reliability Score</span>
                         <span className="text-xs font-black text-indigo-700">{worker.reliability}%</span>
                      </div>
                    </div>

                    <button
                      onClick={() => setBookingModal({ open: true, worker })}
                      className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-indigo-600 shadow-lg shadow-slate-200 hover:shadow-indigo-200 transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                    >
                      Book Professional
                    </button>
                  </motion.div>
                ))}
              </div>
            </section>
          </motion.div>
        )}

        {view === 'bookings' && (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-8"
          >
            {/* My Bookings */}
            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-indigo-600" />
                My Recent Bookings
              </h2>
          <div className="space-y-4">
            {bookings.length === 0 ? (
              <div className="bg-white p-12 rounded-3xl border border-dashed border-slate-300 text-center text-slate-400">
                <Calendar className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p>You haven't made any bookings yet.</p>
              </div>
            ) : (
              bookings.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map((booking) => (
                <div key={booking.id} className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm flex flex-col gap-8 relative overflow-hidden group hover:shadow-xl transition-all">
                  
                  {/* Header */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-12 h-12 rounded-2xl flex items-center justify-center shadow-inner",
                        booking.status === 'completed' ? "bg-emerald-50 text-emerald-600" :
                        booking.status === 'rejected' ? "bg-red-50 text-red-600" : "bg-indigo-50 text-indigo-600"
                      )}>
                        <Calendar className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-bold text-slate-900 text-lg tracking-tight">{booking.serviceType}</h4>
                          {booking.urgency === 'urgent' && (
                            <span className="text-[9px] font-black uppercase bg-amber-500 text-white px-2 py-0.5 rounded-md flex items-center gap-1">
                              <Flame className="w-3 h-3" /> Urgent
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-medium text-slate-500">{booking.date} at {booking.time}</p>
                      </div>
                    </div>
                    <div className="text-right">
                       <span className={cn(
                          "px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest",
                          booking.status === 'completed' ? "bg-emerald-100 text-emerald-700" :
                          booking.status === 'pending' ? "bg-amber-100 text-amber-700 shadow-[0_0_15px_rgba(251,191,36,0.3)]" :
                          booking.status === 'accepted' ? "bg-indigo-100 text-indigo-700 shadow-[0_0_15px_rgba(79,70,229,0.3)] animate-pulse" :
                          booking.status === 'rejected' ? "bg-red-100 text-red-700" :
                          booking.status === 'cancelled' ? "bg-slate-200 text-slate-600" :
                          "bg-slate-100 text-slate-700"
                        )}>
                          {booking.status === 'accepted' ? 'On The Way' : booking.status}
                        </span>
                    </div>
                  </div>

                  {/* Live Tracking Timeline */}
                  {booking.status !== 'rejected' && booking.status !== 'cancelled' && (
                    <div className="relative pt-6 pb-2 w-full max-w-2xl mx-auto">
                       <div className="absolute top-1/2 left-[10%] right-[10%] h-1 bg-slate-100 -translate-y-1/2 rounded-full" />
                       <div className={cn(
                         "absolute top-1/2 left-[10%] h-1 -translate-y-1/2 rounded-full transition-all duration-1000",
                         booking.status === 'completed' ? 'w-[80%] bg-gradient-to-r from-emerald-400 to-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 
                         booking.status === 'accepted' ? 'w-[55%] bg-gradient-to-r from-indigo-400 to-indigo-600 shadow-[0_0_10px_rgba(79,70,229,0.5)]' : 
                         'w-[25%] bg-amber-400'
                       )} />
                       
                       <div className="relative flex justify-between px-2">
                         {['Requested', 'Matched', 'On The Way', 'Completed'].map((step, idx) => {
                           let active = false;
                           if (idx <= 1) active = true; // requested and matched are baseline for pendings
                           if (idx === 2 && ['accepted', 'completed'].includes(booking.status)) active = true;
                           if (idx === 3 && booking.status === 'completed') active = true;
                           
                           return (
                             <div key={step} className="flex flex-col items-center gap-3 z-10 w-20">
                               <div className={cn(
                                 "w-5 h-5 rounded-full border-[3px] transition-all duration-500 bg-white",
                                 active && booking.status === 'completed' ? 'border-emerald-500 scale-110 shadow-[0_0_10px_rgba(16,185,129,0.5)]' :
                                 active ? 'border-indigo-600 scale-110 shadow-[0_0_10px_rgba(79,70,229,0.5)]' : 'border-slate-200 scale-90'
                               )} />
                               <span className={cn(
                                 "text-[9px] uppercase font-black tracking-widest text-center",
                                 active && booking.status === 'completed' ? 'text-emerald-700' :
                                 active ? 'text-indigo-700' : 'text-slate-400'
                               )}>{step}</span>
                             </div>
                           );
                         })}
                       </div>
                    </div>
                  )}

                  {/* Footer Actions */}
                  <div className="flex items-center justify-between mt-2 border-t border-slate-100 pt-6">
                    <div className="text-sm font-bold text-slate-500">
                      {booking.status === 'accepted' && (
                         <div className="flex items-center gap-4">
                            <div className="flex flex-col">
                               <span className="text-[10px] font-black uppercase tracking-tight text-indigo-500 mb-0.5">Live Distance</span>
                               <p className="text-sm font-black text-slate-900 flex items-center gap-1.5">
                                  <MapPin className="w-3.5 h-3.5 text-indigo-600" />
                                  {workers.find(w => w.uid === booking.workerId)?.profile.location && user.profile.location 
                                    ? haversineDistance(user.profile.location, workers.find(w => w.uid === booking.workerId)!.profile.location!).toFixed(1)
                                    : 'Recalculating'} km
                               </p>
                            </div>
                            <div className="w-px h-8 bg-slate-100" />
                            <div className="flex flex-col">
                               <span className="text-[10px] font-black uppercase tracking-tight text-emerald-500 mb-0.5">Real-Time ETA</span>
                               <p className="text-sm font-black text-slate-900 flex items-center gap-1.5">
                                  <Clock className="w-3.5 h-3.5 text-emerald-600" />
                                  {(() => {
                                      const w = workers.find(w => w.uid === booking.workerId);
                                      if (!w?.profile.location || !user.profile.location) return 'Calculating';
                                      const dist = haversineDistance(user.profile.location, w.profile.location);
                                      return Math.round((dist * 2.5) + 5);
                                  })()} mins
                               </p>
                            </div>
                         </div>
                      )}
                    </div>

                    <div className="flex items-center gap-4 flex-wrap">
                      {(booking.status === 'pending' || booking.status === 'accepted') && (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await bookingService.cancelBooking(booking.id, 'customer');
                              setToast({ message: 'Booking cancelled.', type: 'success', visible: true });
                            } catch (e) {
                              console.error(e);
                              setToast({ message: 'Could not cancel booking.', type: 'error', visible: true });
                            }
                          }}
                          className="px-5 py-3 bg-slate-100 text-slate-700 rounded-xl text-sm font-bold border border-slate-200 hover:bg-red-50 hover:text-red-600 hover:border-red-100 transition-all"
                        >
                          Cancel booking
                        </button>
                      )}
                      {booking.status === 'accepted' && (
                        <button
                          onClick={() => setTrackingModal({ open: true, booking })}
                          className="px-6 py-3 bg-indigo-600 text-white rounded-xl text-sm font-black shadow-lg shadow-indigo-100 hover:scale-105 transition-all flex items-center gap-2 active:scale-95"
                        >
                          <Navigation className="w-4 h-4" /> Track Professional
                        </button>
                      )}
                      
                      {booking.status === 'completed' && !booking.feedback && (
                        <button
                          onClick={() => setFeedbackModal({ open: true, booking })}
                          className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-indigo-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-200 hover:scale-105 transition-all flex items-center gap-2"
                        >
                          <CreditCard className="w-4 h-4" /> Pay & Rate Worker
                        </button>
                      )}
                      
                      {booking.feedback && (
                        <div className="flex items-center gap-4 bg-emerald-50 px-4 py-2 rounded-2xl border border-emerald-100">
                          <div className="flex items-center gap-1.5 text-emerald-700 text-xs font-black uppercase tracking-wider">
                            <CheckCircle className="w-4 h-4" /> Paid
                          </div>
                          <div className="w-px h-4 bg-emerald-200" />
                          <div className="flex items-center gap-1 text-amber-500">
                            <Star className="w-4 h-4 fill-amber-500" />
                            <span className="font-extrabold">{booking.feedback.rating}</span>
                          </div>
                        </div>
                      )}

                      {booking.status === 'rejected' && (
                        <button
                          onClick={() => {
                            const alternative = workers.find(w => w.profile.category === booking.serviceType && w.uid !== booking.workerId);
                            if (alternative) {
                              setBookingModal({ open: true, worker: alternative });
                            } else {
                              setToast({ message: "No immediate alternatives found. Please search again.", type: 'info', visible: true });
                              // If we are already on some subview, this helps
                              window.location.href = '/customer'; 
                            }
                          }}
                          className="px-6 py-3 bg-slate-900 text-white rounded-xl text-sm font-bold shadow-lg hover:bg-indigo-600 transition-all flex items-center gap-2"
                        >
                          <Search className="w-4 h-4" /> Find Alternative
                        </button>
                      )}
                    </div>
                  </div>

                  {booking.status === 'rejected' && booking.rejectionReason && (
                    <div className="p-4 bg-red-50 rounded-xl border border-red-100 flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-bold text-red-900">Request Declined</p>
                        <p className="text-sm text-red-700 italic">" {booking.rejectionReason} "</p>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
            </section>
          </motion.div>
        )}
      </div>

      {/* Booking Modal */}
      <AnimatePresence>
        {bookingModal.open && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl"
            >
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-2xl font-bold text-slate-900">Book Service</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-slate-500 font-medium">With {bookingModal.worker?.profile.name || 'Professional'}</p>
                    <div className="w-1 h-1 bg-slate-300 rounded-full" />
                    <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-[10px] font-black uppercase tracking-widest rounded-md border border-indigo-100">
                      {bookingModal.worker?.profile.category || 'Expert'}
                    </span>
                  </div>
                </div>
                <button onClick={() => { setBookingUrgency('normal'); setBookingModal({ open: false, worker: null }); }} className="p-2 hover:bg-slate-100 rounded-full">
                  <X className="w-6 h-6 text-slate-400" />
                </button>
              </div>

              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">Date</label>
                    <div className="relative">
                      <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                      <input
                        type="date"
                        min={format(new Date(), 'yyyy-MM-dd')}
                        className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                        value={bookingDate}
                        onChange={(e) => setBookingDate(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">Available Times</label>
                    <div className="relative">
                      <Clock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                      <select
                        className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 appearance-none disabled:opacity-50"
                        value={bookingTime}
                        onChange={(e) => setBookingTime(e.target.value)}
                        disabled={
                          BOOKING_SLOT_TIMES.filter(
                            (t) =>
                              !isWorkerSlotBlocked(
                                bookingModal.worker!.uid,
                                bookingDate,
                                t,
                                allBookings,
                                DEFAULT_SLOT_DURATION_MINUTES
                              )
                          ).length === 0
                        }
                      >
                        {BOOKING_SLOT_TIMES.filter(
                          (t) =>
                            !isWorkerSlotBlocked(
                              bookingModal.worker!.uid,
                              bookingDate,
                              t,
                              allBookings,
                              DEFAULT_SLOT_DURATION_MINUTES
                            )
                        ).map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Smart picks (low demand & free)</p>
                    <div className="flex flex-wrap gap-2">
                      {bookingModal.worker &&
                        suggestSlotsForWorker(
                          bookingModal.worker.uid,
                          bookingModal.worker.profile.category,
                          bookingDate,
                          allBookings
                        )
                          .filter((s) => s.free)
                          .slice(0, 4)
                          .map((s) => (
                            <button
                              key={s.time}
                              type="button"
                              onClick={() => setBookingTime(s.time)}
                              className={`text-[10px] font-black px-3 py-1.5 rounded-lg border ${
                                bookingTime === s.time
                                  ? 'bg-indigo-600 text-white border-indigo-600'
                                  : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                              }`}
                            >
                              {s.time} · demand {s.demand}
                            </button>
                          ))}
                    </div>
                  </div>
                </div>

                <label className="flex items-center gap-3 cursor-pointer p-4 bg-amber-50/80 border border-amber-100 rounded-2xl">
                  <input
                    type="checkbox"
                    checked={bookingUrgency === 'urgent'}
                    onChange={(e) => setBookingUrgency(e.target.checked ? 'urgent' : 'normal')}
                    className="w-4 h-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                  />
                  <div>
                    <p className="text-sm font-black text-amber-900">Urgent service</p>
                    <p className="text-[11px] text-amber-800/80">Priority routing & higher pricing for same-day professionals.</p>
                  </div>
                </label>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Service Location</label>
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                    <div className="flex items-center gap-2 text-slate-600 font-bold text-sm">
                      <MapPin className="w-4 h-4 text-indigo-600" />
                      Destination Coordinates
                    </div>
                    <div className="mt-2 text-xs font-mono text-slate-700">
                      {location ? `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}` : 'Not set yet'}
                    </div>
                    <div className="mt-2 text-[10px] text-slate-400 font-bold">
                      Choose **Live GPS** for current position, **Home** for your saved coordinate, or enter coordinates manually.
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <label className="text-[11px] font-black uppercase tracking-wider text-slate-500 ml-1">Latitude</label>
                      <input
                        inputMode="decimal"
                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-sm"
                        placeholder="e.g. 11.2333"
                        value={manualLat}
                        onChange={(e) => setManualLat(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[11px] font-black uppercase tracking-wider text-slate-500 ml-1">Longitude</label>
                      <input
                        inputMode="decimal"
                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-sm"
                        placeholder="e.g. 78.8667"
                        value={manualLng}
                        onChange={(e) => setManualLng(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mt-2">
                    <button 
                      onClick={() => {
                        setGpsError('');
                        if (!navigator.geolocation) {
                          setGpsError('Geolocation is not available in this browser. Use Saved Home or enter coordinates manually.');
                          return;
                        }
                        navigator.geolocation.getCurrentPosition(
                          (pos) => {
                            const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                            setBookingCoords(coords);
                          },
                          () =>
                            setGpsError(
                              'Could not access live GPS. Allow location in your browser settings, or use Saved Home / enter coordinates below.'
                            )
                        );
                      }}
                      className={`text-[10px] uppercase tracking-wider font-black px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 ${location && location.lat !== user.profile.location?.lat ? 'bg-emerald-600 border-emerald-600 text-white shadow-xl shadow-emerald-200 scale-105' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'}`}
                    >
                      <MapPin className="w-3 h-3" /> Use My Exact Live GPS
                    </button>
                    
                    {user.profile.location && (
                      <button 
                        onClick={() => {
                          setBookingCoords(user.profile.location!);
                        }}
                        className={`text-[10px] uppercase tracking-wider font-black px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 ${location?.lat === user.profile.location?.lat ? 'bg-indigo-600 border-indigo-600 text-white shadow-xl shadow-indigo-200 scale-105' : 'bg-indigo-50 border-indigo-100 text-indigo-600 hover:bg-indigo-100'}`}
                      >
                        <UserIcon className="w-3 h-3" /> Use My Saved Home Location
                      </button>
                    )}

                    <button
                      onClick={() => {
                        const coords = parseManualCoords();
                        if (!coords) {
                          setGpsError('Enter valid coordinates (lat -90..90, lng -180..180).');
                          return;
                        }
                        setBookingCoords(coords);
                      }}
                      className="text-[10px] uppercase tracking-wider font-black px-3 py-1.5 rounded-lg border bg-white border-slate-200 text-slate-700 hover:bg-slate-50 transition-all flex items-center gap-1.5"
                    >
                      Apply Entered Coordinates
                    </button>
                  </div>
                  
                  {location && (
                    <div className="mt-3 flex items-center gap-2 px-3 py-1.5 bg-emerald-50 rounded-lg border border-emerald-100 w-fit animate-in fade-in slide-in-from-top-1">
                      <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_#10b981]" />
                      <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-tight">Precision Connected: {location.lat.toFixed(4)}, {location.lng.toFixed(4)}</span>
                    </div>
                  )}
                  
                  {gpsError && <p className="text-red-500 text-xs font-bold ml-1 mt-1">{gpsError}</p>}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-bold text-slate-700 font-bold uppercase tracking-tight">Technical Problem Details</label>
                    <span className="text-[10px] text-slate-400 font-medium italic">Describe symptoms or needed repairs</span>
                  </div>
                  <textarea 
                    placeholder="e.g., Leaky faucet in the kitchen, electrical spark in the living room..."
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 min-h-[80px] text-sm"
                    value={problemNotes}
                    onChange={(e) => setProblemNotes(e.target.value)}
                  />
                </div>

                <div className="p-4 bg-indigo-50 rounded-2xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CreditCard className="w-5 h-5 text-indigo-600" />
                    <span className="text-sm font-bold text-indigo-900">Dynamic Pricing</span>
                  </div>
                  <span className="text-xl font-black text-indigo-600">${getDynamicPrice().toFixed(2)}</span>
                </div>

                <button
                  onClick={handleBooking}
                  className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all"
                >
                  Confirm Booking
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Feedback Modal */}
      <AnimatePresence>
        {feedbackModal.open && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl"
            >
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-2xl font-bold text-slate-900">Payment & Feedback</h3>
                  <p className="text-slate-500">Pay $50.00 and rate the service</p>
                </div>
                <button onClick={() => setFeedbackModal({ open: false, booking: null })} className="p-2 hover:bg-slate-100 rounded-full">
                  <X className="w-6 h-6 text-slate-400" />
                </button>
              </div>

              <div className="space-y-6">
                <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col items-center gap-4">
                   <div className="flex justify-center gap-2">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <button
                        key={s}
                        onClick={() => setRating(s)}
                        className={cn(
                          "p-2 rounded-xl transition-all",
                          rating >= s ? "text-amber-500 scale-110" : "text-slate-200"
                        )}
                      >
                        <Star className={cn("w-10 h-10", rating >= s ? "fill-amber-500" : "")} />
                      </button>
                    ))}
                  </div>
                  <p className="text-sm font-bold text-slate-600">Rate your experience</p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Your Feedback</label>
                  <textarea
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 min-h-[100px]"
                    placeholder="Tell us about the work done..."
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                  />
                </div>

                <div className="space-y-3">
                   <button
                    onClick={handleFeedback}
                    className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
                  >
                    <CreditCard className="w-5 h-5" /> Pay & Submit Review
                  </button>
                  <p className="text-[10px] text-center text-slate-400 flex items-center justify-center gap-1">
                    <CheckCircle className="w-3 h-3 text-emerald-500" /> Secure Payment Powered by ServiFlow Credits
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      
      {/* Tracking Modal */}
      <AnimatePresence>
        {trackingModal.open && trackingModal.booking && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white w-full max-w-4xl rounded-3xl overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                    <Navigation className="w-5 h-5 text-indigo-600" />
                    Tracking {workers.find(w => w.uid === trackingModal.booking?.workerId)?.profile.name || 'Worker'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">Live updates from your professional</p>
                </div>
                <button onClick={() => setTrackingModal({ open: false, booking: null })} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <X className="w-6 h-6 text-slate-400" />
                </button>
              </div>
              <div className="h-[500px] relative">
                {(() => {
                  const booking = trackingModal.booking!;
                  const destLoc = booking.location;
                  if (!destLoc || typeof destLoc === 'string') {
                    return (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50 gap-4">
                        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                        <p className="font-bold text-slate-600">No GPS location for this booking.</p>
                      </div>
                    );
                  }
                  return (
                    <TrackingMap
                      workerId={booking.workerId}
                      customerLocation={destLoc as { lat: number; lng: number }}
                      workerName={workers.find(w => w.uid === booking.workerId)?.profile.name || 'Worker'}
                      customerName={user.profile.name}
                      height="500px"
                    />
                  );
                })()}
              </div>
              <div className="p-6 bg-slate-50 border-t flex items-center justify-between">
                 <div className="flex items-center gap-6">
                    <div className="flex flex-col">
                       <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Status</span>
                       <div className="flex items-center gap-2 text-indigo-600 font-bold">
                          <div className="w-2 h-2 bg-indigo-600 rounded-full animate-ping" />
                          On The Way
                       </div>
                    </div>
                    <div className="w-px h-8 bg-slate-200" />
                    <div className="flex flex-col">
                       <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">ETA</span>
                       <div className="text-slate-900 font-bold">
                          {(() => {
                             const worker = workers.find(w => w.uid === trackingModal.booking?.workerId);
                             if (!worker?.profile.location || !trackingModal.booking?.location || typeof trackingModal.booking?.location === 'string') return '--';
                             const dist = haversineDistance(worker.profile.location, trackingModal.booking.location);
                             return `${Math.round((dist * 2.5) + 5)} mins`;
                          })()}
                       </div>
                    </div>
                 </div>
                 <button 
                   onClick={() => window.open(`tel:${workers.find(w => w.uid === trackingModal.booking?.workerId)?.profile.phone}`)}
                   className="flex items-center gap-2 px-6 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 transition-all shadow-sm"
                 >
                    <PhoneCall className="w-4 h-4 text-indigo-600" /> Call Worker
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
