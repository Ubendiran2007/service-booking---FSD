import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, doc, updateDoc, getDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { User, Booking, BookingStatus } from '../types';
import Layout from '../components/Layout';
import { Search, MapPin, Star, Calendar, Clock, CheckCircle, X, MessageSquare, CreditCard, AlertCircle, User as UserIcon, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { cn } from '../lib/utils';
import { bookingService } from '../services/bookingService';

export default function CustomerDashboard({ view = 'search', user }: { view?: 'search' | 'bookings', user: User }) {
  const [workers, setWorkers] = useState<User[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [bookingModal, setBookingModal] = useState<{ open: boolean; worker: User | null }>({ open: false, worker: null });
  const [feedbackModal, setFeedbackModal] = useState<{ open: boolean; booking: Booking | null }>({ open: false, booking: null });
  
  const [bookingDate, setBookingDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [bookingTime, setBookingTime] = useState('10:00');
  const [customLocation, setCustomLocation] = useState('');
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [location, setLocation] = useState<{ lat: number, lng: number } | null>(null);
  const [allBookings, setAllBookings] = useState<Booking[]>([]);

  useEffect(() => {
    if (Notification.permission === 'default') {
      Notification.requestPermission();
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
      // Prevent overlapping bookings
      const bookedSlotsForWorker = allBookings
        .filter(b => b.workerId === bookingModal.worker?.uid && b.date === bookingDate && b.status !== 'rejected')
        .map(b => b.time);
      
      if (bookedSlotsForWorker.includes(bookingTime)) {
        alert("This time slot has just been locked by another booking. Please select another time.");
        return;
      }

      // Get current user's default location if custom is empty
      let finalLocation = customLocation;
      if (!finalLocation) {
        const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
        if (userDoc.exists()) {
          const profile = userDoc.data().profile;
          finalLocation = profile.address;
          // Update profile if local state has newer coordinates
          if (location && !profile.location) {
            await updateDoc(doc(db, 'users', auth.currentUser.uid), {
              'profile.location': location
            });
          }
        }
      } else if (location) {
          // If they typed something but we also have coordinates, save them to profile
          await updateDoc(doc(db, 'users', auth.currentUser.uid), {
             'profile.location': location
          });
      }

      const newBooking = {
        customerId: auth.currentUser.uid,
        workerId: bookingModal.worker.uid,
        serviceType: bookingModal.worker.profile.category,
        date: bookingDate,
        time: bookingTime,
        status: 'pending' as BookingStatus,
        location: finalLocation,
        payment: {
          amount: getDynamicPrice(),
          status: 'pending'
        },
        createdAt: new Date().toISOString()
      };

      await bookingService.createBooking(newBooking);
      setBookingModal({ open: false, worker: null });
      setCustomLocation('');
    } catch (err) {
      alert('Failed to book service');
      console.error(err);
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
      alert('Failed to submit feedback');
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
    
    // demand_multiplier
    const allSlots = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];
    const bookedOnDate = allBookings.filter(b => 
      b.workerId === bookingModal.worker?.uid && 
      b.date === bookingDate && 
      b.status !== 'rejected'
    ).length;
    const bookingRatio = bookedOnDate / allSlots.length; 
    const demand_multiplier = bookingRatio > 0.7 ? 1.5 : bookingRatio > 0.4 ? 1.2 : 1.0;

    // urgency_multiplier
    const today = format(new Date(), 'yyyy-MM-dd');
    const urgency_multiplier = bookingDate === today ? 1.3 : 1.0;

    // rating_multiplier
    const rating = bookingModal.worker.profile.rating || 0;
    const rating_multiplier = rating >= 4.8 ? 1.2 : rating >= 4.0 ? 1.1 : 1.0;

    const price = base_price * demand_multiplier * urgency_multiplier * rating_multiplier;
    return price;
  };

  const workersWithScores = workers.map(w => {
    let distance = 0;
    if (user.profile.location && w.profile.location) {
      distance = haversineDistance(user.profile.location, w.profile.location);
    }
    
    // 0.4 × distance_score (scale 0-100, where 0km = 100, >=50km = 0)
    const distanceScoreVal = distance > 0 ? Math.max(100 - (distance * 2), 0) : 50;
    
    // 0.3 × rating_score (scale 0-100, rating 5.0 = 100)
    const ratingScoreVal = (w.profile.rating || 0) * 20;
    
    // 0.2 × availability_score (scale 0-100, % of slots available today)
    const allSlots = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];
    const bookedToday = allBookings.filter(b => b.workerId === w.uid && b.date === format(new Date(), 'yyyy-MM-dd') && b.status !== 'rejected').length;
    const availabilityScoreVal = Math.max(((allSlots.length - bookedToday) / allSlots.length) * 100, 0);

    // 0.1 × reliability_score (completed / total jobs)
    const workerJobs = allBookings.filter(b => b.workerId === w.uid);
    const totalJobs = workerJobs.length;
    const completedJobs = workerJobs.filter(b => b.status === 'completed').length;
    const reliabilityScoreVal = totalJobs > 0 ? (completedJobs / totalJobs) * 100 : 50;

    const score = (0.4 * distanceScoreVal) + (0.3 * ratingScoreVal) + (0.2 * availabilityScoreVal) + (0.1 * reliabilityScoreVal);
    
    return { ...w, distance, score, reliability: reliabilityScoreVal };
  });

  const filteredWorkers = workersWithScores.filter(w => {
    const matchesSearch = w.profile.name.toLowerCase().includes(search.toLowerCase()) || 
                         w.profile.category?.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || w.profile.category === selectedCategory;
    return matchesSearch && matchesCategory;
  }).sort((a, b) => b.score - a.score).slice(0, 3); // Return only top 3

  const handleAutoAssign = () => {
    const availableMatch = filteredWorkers[0];
    if (availableMatch) {
      setBookingModal({ open: true, worker: availableMatch });
    } else {
      alert("No suitable professionals found for the selected category.");
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
                        <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center group-hover:bg-indigo-600 transition-colors">
                          <UserIcon className="w-6 h-6 text-indigo-600 group-hover:text-white" />
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-900 text-lg">{worker.profile.name}</h3>
                          <p className="text-sm font-bold text-indigo-600 uppercase tracking-wider">{worker.profile.category}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 bg-amber-50 px-2 py-1 rounded-lg">
                        <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                        <span className="text-sm font-bold text-amber-700">{worker.profile.rating || 'New'}</span>
                      </div>
                    </div>

                    <div className="space-y-2 mb-6 text-slate-600 text-sm">
                      <p className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-slate-400" /> 
                        {worker.distance > 0 ? `${worker.distance.toFixed(1)} km away` : worker.profile.address}
                      </p>
                      <div className="flex items-center gap-4">
                        <p className="flex items-center gap-1.5">
                          <CheckCircle className="w-4 h-4 text-emerald-500" /> Score: {Math.round(worker.score)}
                        </p>
                        <p className="flex items-center gap-1.5 border-l border-slate-200 pl-4">
                          <AlertCircle className="w-4 h-4 text-indigo-500" /> Rel: {Math.round(worker.reliability)}%
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => setBookingModal({ open: true, worker })}
                      className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-indigo-600 transition-all flex items-center justify-center gap-2"
                    >
                      Book Service
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
                        <h4 className="font-bold text-slate-900 text-lg tracking-tight">{booking.serviceType}</h4>
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
                          "bg-slate-100 text-slate-700"
                        )}>
                          {booking.status === 'accepted' ? 'On The Way' : booking.status}
                        </span>
                    </div>
                  </div>

                  {/* Live Tracking Timeline */}
                  {booking.status !== 'rejected' && (
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
                      {booking.status === 'accepted' && <p className="text-indigo-600 animate-pulse flex items-center gap-2"><MapPin className="w-4 h-4"/> ETA: Under 30 mins</p>}
                    </div>

                    <div className="flex items-center gap-4">
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
                          onClick={() => setBookingModal({ open: true, worker: workers.find(w => w.profile.category === booking.serviceType && w.uid !== booking.workerId) || null })}
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
                  <p className="text-slate-500">With {bookingModal.worker?.profile.name || 'Professional'}</p>
                </div>
                <button onClick={() => setBookingModal({ open: false, worker: null })} className="p-2 hover:bg-slate-100 rounded-full">
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
                        disabled={['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'].filter(t => !allBookings.filter(b => b.workerId === bookingModal.worker?.uid && b.date === bookingDate && b.status !== 'rejected' && b.status !== 'completed').map(b => b.time).includes(t)).length === 0}
                      >
                        {['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00']
                          .filter(t => !allBookings.filter(b => b.workerId === bookingModal.worker?.uid && b.date === bookingDate && b.status !== 'rejected' && b.status !== 'completed').map(b => b.time).includes(t))
                          .map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Service Location</label>
                  <div className="relative">
                    <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                    <input
                      type="text"
                      placeholder="Use default or enter specific address"
                      className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                      value={customLocation}
                      onChange={(e) => setCustomLocation(e.target.value)}
                    />
                  </div>
                  <button 
                    onClick={() => {
                      if (navigator.geolocation) {
                        navigator.geolocation.getCurrentPosition((pos) => {
                          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                          setLocation(coords);
                          setCustomLocation(`${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`);
                        });
                      }
                    }}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 ml-1"
                  >
                    <MapPin className="w-3 h-3" /> {location ? 'Location Updated' : 'Capture Current Location'}
                  </button>
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
    </Layout>
  );
}
