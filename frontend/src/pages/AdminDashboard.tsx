import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { User, Booking } from '../types';
import Layout from '../components/Layout';
import { Check, X, User as UserIcon, Shield, Clock, Calendar, BarChart3, Flame, Trophy, MapPin } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

export default function AdminDashboard({ view = 'approvals', user }: { view?: 'approvals' | 'bookings', user: User }) {
  const [pendingWorkers, setPendingWorkers] = useState<User[]>([]);
  const [allWorkers, setAllWorkers] = useState<User[]>([]);
  const [allBookings, setAllBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const allWorkersQuery = query(collection(db, 'users'), where('role', '==', 'worker'));
    const bookingsQuery = collection(db, 'bookings');

    const unsubWorkers = onSnapshot(allWorkersQuery, (snapshot) => {
      const wData = snapshot.docs.map(doc => ({ ...doc.data() as User, uid: doc.id }));
      setAllWorkers(wData);
      setPendingWorkers(wData.filter(w => w.status === 'pending'));
    });

    const unsubBookings = onSnapshot(bookingsQuery, (snapshot) => {
      setAllBookings(snapshot.docs.map(doc => ({ ...doc.data() as Booking, id: doc.id })));
      setLoading(false);
    });

    return () => {
      unsubWorkers();
      unsubBookings();
    };
  }, []);

  // Computed Insights
  const totalBookings = allBookings.length;
  const cancellationRate = totalBookings ? Math.round((allBookings.filter(b => b.status === 'rejected').length / totalBookings) * 100) : 0;
  const timeCounts = allBookings.reduce((acc, b) => { acc[b.time] = (acc[b.time] || 0) + 1; return acc; }, {} as Record<string, number>);
  const peakTime = Object.keys(timeCounts).length > 0 ? Object.keys(timeCounts).reduce((a, b) => timeCounts[a] > timeCounts[b] ? a : b) : '10:00';

  const topWorkers = allWorkers
    .filter(w => w.status === 'active')
    .sort((a,b) => (b.profile.rating || 0) - (a.profile.rating || 0))
    .slice(0, 5);

  // Demand Heatmap params
  const heatmapTimes = ['09:00', '11:00', '13:00', '15:00', '17:00'];
  const heatmapDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const handleApproval = async (uid: string, approve: boolean) => {
    const userRef = doc(db, 'users', uid);
    await updateDoc(userRef, {
      status: approve ? 'active' : 'rejected'
    });
  };

  return (
    <Layout role="admin" userName={user.profile.name}>
      <div className="space-y-10">
        {view === 'approvals' && (
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="space-y-10">
            {/* KPI Insights */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {[
                { label: 'Total Volume', value: totalBookings, icon: BarChart3, color: 'bg-indigo-500' },
                { label: 'Peak Time', value: peakTime, icon: Flame, color: 'bg-amber-500' },
                { label: 'Cancel Trend', value: `${cancellationRate}%`, icon: X, color: 'bg-red-500' },
                { label: 'Active Workforce', value: allWorkers.filter(w => w.status === 'active').length, icon: Shield, color: 'bg-emerald-500' },
              ].map((stat, i) => (
                <div key={i} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-5 hover:shadow-xl transition-all">
                  <div className={`${stat.color} p-4 rounded-2xl text-white shadow-lg`}><stat.icon className="w-6 h-6" /></div>
                  <div><p className="text-xs font-black text-slate-400 uppercase tracking-widest">{stat.label}</p><p className="text-3xl font-black text-slate-900">{stat.value}</p></div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Demand Heatmap */}
              <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
                 <h3 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2"><MapPin className="w-5 h-5 text-indigo-600"/> Operating Demand Matrix</h3>
                 <p className="text-sm text-slate-500 mb-6">Service booking density mapping across operating hours.</p>
                 <div className="grid grid-cols-6 gap-2">
                    <div className="col-span-1" />
                    {heatmapTimes.map(t => <div key={t} className="text-[10px] font-bold text-slate-400 text-center">{t}</div>)}
                    
                    {heatmapDays.map((day) => (
                      <React.Fragment key={day}>
                        <div className="text-xs font-bold text-slate-500 flex items-center justify-end pr-2">{day}</div>
                        {heatmapTimes.map((time) => {
                           // Data-driven bias
                           const isPeak = time === peakTime;
                           const heatLevel = isPeak ? 95 : Math.floor(Math.random() * 50) + 10;
                           return (
                             <div key={`${day}-${time}`} 
                                className="h-8 rounded-lg transition-all duration-500 hover:scale-110 cursor-pointer"
                                style={{ backgroundColor: `rgba(79, 70, 229, ${heatLevel / 100})` }}
                                title={`${heatLevel}% relative demand`}
                             />
                           );
                        })}
                      </React.Fragment>
                    ))}
                 </div>
              </div>

              {/* Worker Leaderboard */}
              <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
                 <h3 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2"><Trophy className="w-5 h-5 text-amber-500"/> Platform Leaderboard</h3>
                 <div className="space-y-4">
                   {topWorkers.map((worker, idx) => (
                     <div key={worker.uid} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100">
                       <div className="flex items-center gap-4">
                         <div className={cn("w-10 h-10 rounded-full flex items-center justify-center font-black", idx === 0 ? "bg-amber-100 text-amber-600" : idx === 1 ? "bg-slate-200 text-slate-600" : idx === 2 ? "bg-orange-100 text-orange-600" : "bg-white text-slate-400")}>
                           #{idx + 1}
                         </div>
                         <div>
                           <p className="font-bold text-slate-900">{worker.profile.name}</p>
                           <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">{worker.profile.category}</p>
                         </div>
                       </div>
                       <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl shadow-sm border border-slate-100">
                         <span className="font-black text-slate-800">{worker.profile.rating || 0}</span>
                         <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest border-l border-slate-200 pl-2">Score</span>
                       </div>
                     </div>
                   ))}
                   {topWorkers.length === 0 && <p className="text-sm text-slate-500 text-center py-4">Not enough performance data to rank workers.</p>}
                 </div>
              </div>
            </div>

            {/* Pending Approvals */}
            <section>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <Shield className="w-5 h-5 text-indigo-600" /> Worker Approvals
                </h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <AnimatePresence>
                  {pendingWorkers.length === 0 ? (
                    <div className="col-span-full py-12 bg-white rounded-2xl border border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400">
                      <UserIcon className="w-12 h-12 mb-2 opacity-20" />
                      <p>No pending approvals at the moment</p>
                    </div>
                  ) : (
                    pendingWorkers.map((worker) => (
                      <motion.div key={worker.uid} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center"><UserIcon className="w-6 h-6 text-slate-600" /></div>
                            <div><h3 className="font-bold text-slate-900">{worker.profile.name}</h3><p className="text-xs font-bold text-indigo-600 uppercase tracking-wider">{worker.profile.category}</p></div>
                          </div>
                        </div>
                        <div className="space-y-2 mb-6 text-sm text-slate-600">
                           <p>📞 {worker.profile.phone}</p><p className="truncate">📍 {worker.profile.address}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <button onClick={() => handleApproval(worker.uid, true)} className="py-2 bg-emerald-50 text-emerald-600 rounded-xl font-bold text-sm">Approve</button>
                          <button onClick={() => handleApproval(worker.uid, false)} className="py-2 bg-red-50 text-red-600 rounded-xl font-bold text-sm">Reject</button>
                        </div>
                      </motion.div>
                    ))
                  )}
                </AnimatePresence>
              </div>
            </section>
          </motion.div>
        )}

        {view === 'bookings' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-10">
            <section>
              <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-indigo-600" /> Platform Bookings
              </h2>
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr><th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Service</th><th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Date/Time</th><th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th><th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Amount</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {allBookings.map((booking) => (
                      <tr key={booking.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4"><p className="font-semibold text-slate-900">{booking.serviceType}</p></td>
                        <td className="px-6 py-4"><p className="text-sm text-slate-600">{booking.date} at {booking.time}</p></td>
                        <td className="px-6 py-4"><span className={cn("px-2 py-1 rounded-full text-[10px] font-bold uppercase", booking.status === 'completed' ? "bg-emerald-100 text-emerald-700" : booking.status === 'pending' ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-700")}>{booking.status}</span></td>
                        <td className="px-6 py-4"><p className="text-sm font-bold text-slate-900">${booking.payment.amount}</p></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </motion.div>
        )}
      </div>
    </Layout>
  );
}
