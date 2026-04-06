import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, getDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { Booking, BookingStatus, User } from '../types';
import Layout from '../components/Layout';
import { Check, X, Clock, Calendar, MapPin, Phone, User as UserIcon, DollarSign, Navigation, Star } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import MapComponent from '../components/MapComponent';
import { bookingService } from '../services/bookingService';

export default function WorkerDashboard({ view = 'schedule', user }: { view?: 'schedule' | 'requests' | 'reviews', user: User }) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectModal, setRejectModal] = useState<{ open: boolean; bookingId: string }>({ open: false, bookingId: '' });
  const [rejectionReason, setRejectionReason] = useState('');
  const [viewMap, setViewMap] = useState<Booking | null>(null);
  const [customerProfiles, setCustomerProfiles] = useState<Record<string, any>>({});

  useEffect(() => {
    const bookingsQuery = query(collection(db, 'bookings'), where('workerId', '==', auth.currentUser?.uid));
    const unsub = onSnapshot(bookingsQuery, async (snapshot) => {
      const bookingsData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Booking));
      setBookings(bookingsData);
      
      // Fetch customer profiles for locations
      const profiles: Record<string, any> = {};
      for (const booking of bookingsData) {
        if (!profiles[booking.customerId]) {
          const userDoc = await getDoc(doc(db, 'users', booking.customerId));
          if (userDoc.exists()) {
            profiles[booking.customerId] = userDoc.data().profile;
          }
        }
      }
      setCustomerProfiles(profiles);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const handleStatusUpdate = async (bookingId: string, status: BookingStatus, reason?: string) => {
    try {
      await bookingService.updateStatus(bookingId, status, reason);
    } catch (err) {
      console.error(err);
      alert('Failed to update status');
    }
    setRejectModal({ open: false, bookingId: '' });
    setRejectionReason('');
  };

  const pendingRequests = bookings.filter(b => b.status === 'pending');
  const activeJobs = bookings.filter(b => b.status === 'accepted');
  const completedJobs = bookings.filter(b => b.status === 'completed');

  return (
    <Layout role="worker" userName={user.profile.name}>
      <div className="space-y-10">
        {/* Map View Integration */}
        <AnimatePresence>
          {viewMap && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden bg-white rounded-3xl border border-slate-200 shadow-xl"
            >
              <div className="p-4 border-b flex justify-between items-center">
                <h3 className="font-bold flex items-center gap-2">
                  <Navigation className="w-5 h-5 text-indigo-600" />
                  Route to {customerProfiles[viewMap.customerId]?.name}'s Location
                </h3>
                <button onClick={() => setViewMap(null)} className="p-2 hover:bg-slate-100 rounded-full">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="h-[400px]">
                {(() => {
                  const workerLoc = user.profile.location || { lat: 19.0760, lng: 72.8777 };
                  const customerLoc = customerProfiles[viewMap.customerId]?.location || { lat: 19.1136, lng: 72.8697 };
                  const markers = [
                    { 
                      position: [workerLoc.lat, workerLoc.lng] as [number, number], 
                      label: 'Your Current Location',
                      type: 'worker' as const
                    },
                    { 
                      position: [customerLoc.lat, customerLoc.lng] as [number, number], 
                      label: `${customerProfiles[viewMap.customerId]?.name || 'Customer'}'s Location`,
                      type: 'customer' as const
                    }
                  ];
                  const center: [number, number] = [
                    (workerLoc.lat + customerLoc.lat) / 2,
                    (workerLoc.lng + customerLoc.lng) / 2
                  ];
                  
                  return (
                    <MapComponent 
                      center={center} 
                      zoom={13}
                      markers={markers}
                    />
                  );
                })()}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

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
                  pendingRequests.map((booking) => (
                    <div key={booking.id} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600">
                             <UserIcon className="w-6 h-6" />
                          </div>
                          <div>
                            <h3 className="font-bold text-slate-900">{customerProfiles[booking.customerId]?.name || 'Client'}</h3>
                            <p className="text-xs font-bold text-slate-400 uppercase">{booking.serviceType}</p>
                          </div>
                        </div>
                        <span className="text-lg font-black text-indigo-600">${booking.payment.amount}</span>
                      </div>
                      <div className="space-y-3 mb-6 text-sm text-slate-600">
                        <p className="flex items-center gap-2"><Calendar className="w-4 h-4" /> {booking.date} at {booking.time}</p>
                        <p className="flex items-center gap-2"><MapPin className="w-4 h-4" /> {customerProfiles[booking.customerId]?.address}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <button onClick={() => handleStatusUpdate(booking.id, 'accepted')} className="py-2 bg-emerald-600 text-white rounded-xl font-bold text-sm">Accept</button>
                        <button onClick={() => setRejectModal({ open: true, bookingId: booking.id })} className="py-2 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm">Decline</button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </motion.div>
        )}

        {view === 'schedule' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-10">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {[
                { label: 'New Requests', value: pendingRequests.length, icon: Clock, color: 'bg-amber-500' },
                { label: 'Active Jobs', value: activeJobs.length, icon: Calendar, color: 'bg-indigo-500' },
                { label: 'Total Earnings', value: `$${completedJobs.reduce((acc, b) => acc + b.payment.amount, 0).toFixed(2)}`, icon: DollarSign, color: 'bg-emerald-500' },
                { label: 'Decline Rate', value: `${bookings.length ? Math.round((bookings.filter(b => b.status === 'rejected').length / bookings.length) * 100) : 0}%`, icon: X, color: 'bg-red-500' },
              ].map((stat, i) => (
                <div key={i} className="bg-white p-6 rounded-2xl border border-slate-200 flex items-center gap-4 hover:shadow-lg hover:-translate-y-1 transition-all">
                  <div className={`${stat.color} p-4 rounded-2xl text-white shadow-xl`}><stat.icon className="w-6 h-6" /></div>
                  <div><p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{stat.label}</p><p className="text-2xl font-black text-slate-900">{stat.value}</p></div>
                </div>
              ))}
            </div>

            {/* Simulated Earnings Chart Insight */}
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-8 items-center justify-between">
               <div>
                  <h3 className="text-lg font-black text-slate-900 mb-2 flex items-center gap-2"><DollarSign className="w-5 h-5 text-emerald-500"/> Revenue Trajectory</h3>
                  <p className="text-slate-500 max-w-sm text-sm">Your projected earnings path based on current active jobs and recent completions. Peak demand detected at 10:00 AM.</p>
               </div>
               <div className="flex items-end gap-3 h-24">
                  {[40, 70, 45, 90, 60, 110, 85].map((h, i) => (
                    <motion.div initial={{ height: 0 }} animate={{ height: `${h}%` }} transition={{ delay: i * 0.1 }} key={i} className={`w-8 rounded-t-lg ${i === 6 ? 'bg-indigo-600' : 'bg-indigo-100'}`} />
                  ))}
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
                        <button onClick={() => setViewMap(booking)} className="px-6 py-3 bg-indigo-50 text-indigo-600 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-indigo-100 transition-colors"><MapPin className="w-4 h-4" /> Live Route</button>
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
    </Layout>
  );
}
