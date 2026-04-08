import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { User, Booking, BookingStatus } from '../types';
import Layout from '../components/Layout';
import { 
  Check, 
  X, 
  User as UserIcon, 
  Shield, 
  Clock, 
  Calendar, 
  BarChart3, 
  Flame, 
  Trophy, 
  MapPin, 
  TrendingUp, 
  AlertCircle, 
  Zap, 
  Award, 
  Activity, 
  ArrowUpRight, 
  ArrowDownRight,
  Info,
  Layers,
  Star,
  Phone,
  CheckCircle,
  CreditCard,
  Search,
  Filter
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, subDays, isWithinInterval } from 'date-fns';
import { cn } from '../lib/utils';

function VerificationCard({
  worker,
  onReview,
}: {
  worker: User;
  onReview: (uid: string, approve: boolean, remarks: string) => Promise<void>;
}) {
  const [remarks, setRemarks] = useState('');
  const v = worker.profile.verification;
  return (
    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="font-black text-slate-900 text-lg">{worker.profile.name}</h4>
          <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">{worker.profile.category}</p>
        </div>
        <span className="text-[10px] font-black bg-amber-50 text-amber-700 px-2 py-1 rounded-lg border border-amber-100">Pending</span>
      </div>
      <p className="text-sm text-slate-600">
        <span className="font-bold text-slate-800">Experience:</span> {v?.experienceYears ?? 0} yrs
      </p>
      <p className="text-sm text-slate-600">
        <span className="font-bold text-slate-800">Skills:</span> {(v?.skills || []).join(', ') || '—'}
      </p>
      <div className="space-y-2">
        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Documents</p>
        <ul className="space-y-1">
          {(v?.certificateUrls || []).map((url, i) => (
            <li key={url}>
              <a href={url} target="_blank" rel="noreferrer" className="text-indigo-600 text-sm font-bold underline">
                Open document {i + 1}
              </a>
            </li>
          ))}
          {(v?.certificateUrls || []).length === 0 && <li className="text-xs text-slate-400">No files uploaded</li>}
        </ul>
      </div>
      <textarea
        className="w-full p-3 rounded-xl border border-slate-200 text-sm min-h-[80px]"
        placeholder="Remarks to worker (required for rejection)"
        value={remarks}
        onChange={(e) => setRemarks(e.target.value)}
      />
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onReview(worker.uid, true, remarks)}
          className="py-3 bg-emerald-600 text-white rounded-xl font-black text-xs uppercase tracking-widest"
        >
          Approve
        </button>
        <button
          type="button"
          disabled={!remarks.trim()}
          onClick={() => onReview(worker.uid, false, remarks)}
          className="py-3 bg-red-600 text-white rounded-xl font-black text-xs uppercase tracking-widest disabled:opacity-40"
        >
          Reject
        </button>
      </div>
    </div>
  );
}

export default function AdminDashboard({ view = 'approvals', user }: { view?: 'approvals' | 'bookings' | 'verification', user: User }) {
  const [pendingWorkers, setPendingWorkers] = useState<User[]>([]);
  const [allWorkers, setAllWorkers] = useState<User[]>([]);
  const [allBookings, setAllBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [bookingSearch, setBookingSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | BookingStatus>('all');

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

  // Advanced Analytics Engine
  const approvedWorkers = allWorkers.filter(w => w.status === 'active');
  const totalBookings = allBookings.length;
  const totalRevenue = allBookings.filter(b => b.status === 'completed').reduce((acc, b) => acc + (b.payment?.amount || 0), 0);
  
  // 📈 Growth Trend: Current 7 days vs Prev 7 days
  const recentBookingsCount = allBookings.filter(b => isWithinInterval(new Date(b.date), { start: subDays(new Date(), 7), end: new Date() })).length;
  const prevBookingsCount = allBookings.filter(b => isWithinInterval(new Date(b.date), { start: subDays(new Date(), 14), end: subDays(new Date(), 7) })).length;
  const growthTrend = prevBookingsCount > 0 ? Math.round(((recentBookingsCount - prevBookingsCount) / prevBookingsCount) * 100) : recentBookingsCount > 0 ? 100 : 0;

  // ⚙️ Utilization: active_workers_on_jobs / total_approved_workers
  const activeWorkerIds = new Set(allBookings.filter(b => b.status === 'accepted').map(b => b.workerId));
  const utilizationRate = approvedWorkers.length > 0 ? Math.round((activeWorkerIds.size / approvedWorkers.length) * 100) : 0;

  // ⚠️ Cancellation Rate: cancelled_bookings / total_bookings
  const cancellationRate = totalBookings > 0 ? Math.round((allBookings.filter(b => b.status === 'rejected').length / totalBookings) * 100) : 0;
  const cancelRisk = cancellationRate > 20 ? 'HIGH' : cancellationRate > 10 ? 'MODERATE' : 'LOW';

  // 🌡️ Demand Strategy Analysis
  const strategyInsights = [];
  if (growthTrend > 10) strategyInsights.push({ title: 'Demand Surge', text: 'Booking volume is increasing. Review pending worker approvals.', icon: TrendingUp, color: 'text-indigo-600', bg: 'bg-indigo-50/50' });
  if (cancelRisk === 'HIGH') strategyInsights.push({ title: 'Quality Alert', text: 'High cancellation rates detected. Audit worker reliability scores.', icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50/50' });
  if (utilizationRate > 80) strategyInsights.push({ title: 'Supply Burnout', text: 'Worker utilization at peak level. High risk of delays.', icon: Zap, color: 'text-amber-600', bg: 'bg-amber-50/50' });
  if (utilizationRate < 30 && approvedWorkers.length > 0) strategyInsights.push({ title: 'Under-Utilization', text: 'Workers are under-utilized. Launch morning promos.', icon: Info, color: 'text-slate-600', bg: 'bg-slate-50/50' });

  // Heatmap params & Peak Calculation
  const heatmapTimes = ['09:00', '11:00', '13:00', '15:00', '17:00'];
  const heatmapDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const timeCounts = allBookings.reduce((acc, b) => { acc[b.time] = (acc[b.time] || 0) + 1; return acc; }, {} as Record<string, number>);
  const peakTime = Object.keys(timeCounts).length > 0 ? Object.keys(timeCounts).reduce((a, b) => timeCounts[a] > timeCounts[b] ? a : b) : '10:00';

  // Performance Ranking
  const topWorkers = allWorkers
    .filter(w => w.status === 'active')
    .map(w => {
       const workerJobs = allBookings.filter(b => b.workerId === w.uid);
       const completionRate = workerJobs.length > 0 ? (workerJobs.filter(b => b.status === 'completed').length / workerJobs.length) * 100 : 0;
       const rankScore = ((w.profile.rating || 0) * 10) + (completionRate / 2);
       return { ...w, completionRate, rankScore };
    })
    .sort((a,b) => b.rankScore - a.rankScore)
    .slice(0, 5);

  const handleApproval = async (uid: string, approve: boolean) => {
    const userRef = doc(db, 'users', uid);
    await updateDoc(userRef, {
      status: approve ? 'active' : 'rejected'
    });
  };

  const handleVerificationReview = async (uid: string, approve: boolean, remarks: string) => {
    const userRef = doc(db, 'users', uid);
    await updateDoc(userRef, {
      'profile.verification.status': approve ? 'verified' : 'rejected',
      'profile.verification.adminRemarks': remarks.trim(),
      'profile.verification.reviewedAt': new Date().toISOString(),
    });
  };

  const pendingVerification = allWorkers.filter((w) => w.profile.verification?.status === 'pending');

  return (
    <Layout role="admin" userName={user.profile.name}>
      <div className="space-y-10">
        {view === 'approvals' && (
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="space-y-10">
            {/* KPI Diagnostics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {[
                { label: 'Demand Growth', value: `${growthTrend > 0 ? '+' : ''}${growthTrend}%`, icon: TrendingUp, color: 'bg-indigo-600', sub: 'vs last 7 days', trend: growthTrend > 0 ? 'up' : 'down' },
                { label: 'Worker Utilization', value: `${utilizationRate}%`, icon: Layers, color: 'bg-slate-900', sub: 'Workers on jobs', trend: 'neutral' },
                { label: 'Cancellation Rate', value: `${cancellationRate}%`, icon: AlertCircle, color: cancelRisk === 'HIGH' ? 'bg-red-500' : 'bg-amber-500', sub: 'System reliability', trend: 'risk' },
                { label: 'Gross Revenue', value: `$${totalRevenue.toFixed(0)}`, icon: CreditCard, color: 'bg-emerald-600', sub: 'Total completed', trend: 'positive' },
              ].map((stat, i) => (
                <div key={i} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl transition-all overflow-hidden relative group">
                  <div className="flex items-center gap-4 relative z-10">
                    <div className={`${stat.color} p-4 rounded-2xl text-white shadow-lg`}><stat.icon className="w-6 h-6" /></div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{stat.label}</p>
                      <p className="text-2xl font-black text-slate-900 leading-none mt-1">{stat.value}</p>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-slate-50 flex items-center justify-between relative z-10">
                     <span className="text-xs font-bold text-slate-400">{stat.sub}</span>
                     {stat.trend === 'up' && <ArrowUpRight className="w-4 h-4 text-emerald-500" />}
                     {stat.trend === 'down' && <ArrowDownRight className="w-4 h-4 text-red-500" />}
                  </div>
                </div>
              ))}
            </div>

            {/* Strategy Center */}
            {strategyInsights.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {strategyInsights.map((ins, i) => (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} key={i} className={cn("p-5 rounded-2xl border flex items-start gap-3", ins.bg)}>
                    <ins.icon className={cn("w-5 h-5 shrink-0 mt-0.5", ins.color)} />
                    <div>
                      <p className={cn("text-[9px] font-black uppercase tracking-widest leading-none mb-1", ins.color)}>{ins.title}</p>
                      <p className="text-xs font-bold text-slate-700 leading-snug">{ins.text}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Demand Heatmap */}
              <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
                 <h3 className="text-xl font-black text-slate-900 mb-6 flex items-center gap-2 tracking-tight"><MapPin className="w-5 h-5 text-indigo-600"/> Operating Demand Matrix</h3>
                 <p className="text-sm text-slate-500 mb-8">Visualizing service density across peak hours.</p>
                 <div className="grid grid-cols-6 gap-2">
                    <div className="col-span-1" />
                    {heatmapTimes.map(t => <div key={t} className="text-[10px] font-black text-slate-400 text-center tracking-tighter uppercase">{t}</div>)}
                    
                    {heatmapDays.map((day) => (
                      <React.Fragment key={day}>
                        <div className="text-[10px] font-black text-slate-400 flex items-center justify-end pr-2 uppercase">{day}</div>
                        {heatmapTimes.map((time) => {
                           // 🔮 Real Density Alignment: Calculate actual slot load
                           const slotCount = allBookings.filter(b => b.time === time && format(new Date(b.date), 'EEE') === day).length;
                           
                           // Calculate relative heat (Total Slot Bookings vs Platform Peak)
                           const peakCount = Object.values(timeCounts).length > 0 ? Math.max(...(Object.values(timeCounts) as number[])) : 1;
                           const heatLevel = slotCount > 0 ? Math.round((slotCount / peakCount) * 100) : 0;
                           
                           return (
                             <div 
                                key={`${day}-${time}`} 
                                className={cn("h-10 rounded-xl transition-all duration-300 hover:scale-110 cursor-pointer border border-transparent", slotCount > 0 ? "hover:border-indigo-300 hover:shadow-lg shadow-indigo-100" : "opacity-30 border-slate-50")} 
                                style={{ backgroundColor: slotCount > 0 ? `rgba(79, 70, 229, ${Math.max(heatLevel / 100, 0.2)})` : `rgba(248, 250, 252, 1)` }} 
                                title={`${slotCount} bookings at ${day} ${time}`} 
                             />
                           );
                        })}
                      </React.Fragment>
                    ))}
                 </div>
              </div>

              {/* Leaderboard */}
              <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden group">
                 <div className="absolute top-0 right-0 p-8 opacity-5"><Trophy className="w-32 h-32 text-amber-500" /></div>
                 <h3 className="text-xl font-black text-slate-900 mb-2 flex items-center gap-2 relative z-10 tracking-tight"><Trophy className="w-5 h-5 text-amber-500"/> Power Ranking</h3>
                 <p className="text-sm text-slate-500 mb-8 relative z-10">Ranked by Success Index (Rating + Completion).</p>
                 <div className="space-y-6 relative z-10">
                   {topWorkers.map((worker, i) => (
                     <div key={worker.uid} className="flex items-center justify-between">
                       <div className="flex items-center gap-4">
                         <div className="relative">
                            <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white font-black">{worker.profile.name[0]}</div>
                            <div className={cn("absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black text-white border-2 border-white", i === 0 ? "bg-amber-400" : i === 1 ? "bg-slate-400" : "bg-orange-400")}>{i + 1}</div>
                         </div>
                         <div>
                            <p className="font-black text-slate-900 tracking-tight leading-none mb-1">{worker.profile.name}</p>
                            <span className="text-[9px] font-black text-indigo-600 uppercase tracking-widest">{worker.profile.category}</span>
                         </div>
                       </div>
                       <div className="text-right">
                          <div className="flex items-center gap-1 justify-end text-amber-500"><Star className="w-3.5 h-3.5 fill-current" /><span className="text-xs font-black text-slate-900">{worker.profile.rating?.toFixed(1) || 'N/A'}</span></div>
                          <p className="text-[9px] font-black text-indigo-500 uppercase mt-1 bg-indigo-50 px-2 py-0.5 rounded-full inline-block">Score: {worker.rankScore.toFixed(0)}</p>
                       </div>
                     </div>
                   ))}
                   {topWorkers.length === 0 && <p className="text-xs text-slate-400 text-center py-4 uppercase font-black">Insufficent Data</p>}
                 </div>
              </div>
            </div>

            {/* Approvals Grid */}
            <section>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                <Shield className="w-8 h-8 text-indigo-600" /> Professional Approvals
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
                <AnimatePresence mode="popLayout">
                  {pendingWorkers.map((worker) => (
                    <motion.div layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} key={worker.uid} className="bg-white p-7 rounded-[32px] border border-slate-200 shadow-sm flex flex-col justify-between group">
                      <div>
                        <div className="flex gap-4 mb-6">
                          <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-2xl font-black border border-slate-200">{worker.profile.name[0]}</div>
                          <div>
                            <h4 className="font-black text-slate-900 text-xl leading-tight mb-1">{worker.profile.name}</h4>
                            <span className="px-3 py-1 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-lg">{worker.profile.category}</span>
                          </div>
                        </div>
                        <div className="space-y-4 mb-8 text-sm">
                           <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-3"><Phone className="w-4 h-4 text-slate-400" /><p className="font-bold text-slate-700">{worker.profile.phone}</p></div>
                           <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-3"><MapPin className="w-4 h-4 text-slate-400" /><p className="font-bold text-slate-700 truncate">{worker.profile.address}</p></div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-50">
                        <button onClick={() => handleApproval(worker.uid, true)} className="py-4 bg-emerald-600 text-white rounded-2xl text-xs font-black uppercase hover:bg-emerald-700 shadow-lg shadow-emerald-50 active:scale-95 flex items-center justify-center gap-2"><Check className="w-4 h-4" /> Approve</button>
                        <button onClick={() => handleApproval(worker.uid, false)} className="py-4 bg-slate-100 text-slate-400 rounded-2xl text-xs font-black uppercase hover:bg-red-50 hover:text-red-500 border border-slate-200">Decline</button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {pendingWorkers.length === 0 && (
                  <div className="col-span-full py-20 bg-white rounded-[40px] border-2 border-dashed border-slate-100 text-center">
                    <CheckCircle className="w-12 h-12 text-emerald-200 mx-auto mb-4" />
                    <p className="text-slate-400 font-black uppercase tracking-widest text-xs">All Profiles Reviewed</p>
                  </div>
                )}
              </div>
            </section>
          </motion.div>
        )}

        {view === 'verification' && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
            <div>
              <h2 className="text-2xl font-black text-slate-900 flex items-center gap-2">
                <Shield className="w-8 h-8 text-indigo-600" /> Certificate & skills verification
              </h2>
              <p className="text-slate-500 text-sm mt-1">Review uploads, then approve or reject with remarks.</p>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {pendingVerification.length === 0 ? (
                <div className="col-span-full py-20 bg-white rounded-3xl border border-dashed border-slate-200 text-center text-slate-400 font-bold">
                  No pending verification submissions.
                </div>
              ) : (
                pendingVerification.map((w) => (
                  <VerificationCard key={w.uid} worker={w} onReview={handleVerificationReview} />
                ))
              )}
            </div>
          </motion.div>
        )}

        {view === 'bookings' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-10">
            <section>
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                    <Calendar className="w-8 h-8 text-indigo-600" /> Platform Bookings
                  </h2>
                  <p className="text-sm text-slate-500">Live monitoring of all service interactions.</p>
                </div>
                <div className="flex items-center gap-3">
                   <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input 
                        type="text" 
                        placeholder="Search services..." 
                        className="pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-64" 
                        value={bookingSearch}
                        onChange={(e) => setBookingSearch(e.target.value)}
                      />
                   </div>
                   <select 
                     className="pl-3 pr-8 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none appearance-none cursor-pointer"
                     value={statusFilter}
                     onChange={(e) => setStatusFilter(e.target.value as any)}
                   >
                     <option value="all">All Status</option>
                     <option value="pending">Pending</option>
                     <option value="accepted">Accepted</option>
                     <option value="completed">Completed</option>
                     <option value="rejected">Rejected</option>
                     <option value="cancelled">Cancelled</option>
                   </select>
                </div>
              </div>

              <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden p-2">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50 text-slate-400 text-[10px] uppercase font-black tracking-widest border-b border-slate-100">
                       <th className="px-6 py-4">Status</th>
                       <th className="px-6 py-4">Service Details</th>
                       <th className="px-6 py-4 text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {allBookings
                      .filter(b => {
                        const matchesSearch = b.serviceType.toLowerCase().includes(bookingSearch.toLowerCase()) || 
                                            b.id.toLowerCase().includes(bookingSearch.toLowerCase());
                        const matchesStatus = statusFilter === 'all' || b.status === statusFilter;
                        return matchesSearch && matchesStatus;
                      })
                      .map((booking) => (
                      <tr key={booking.id} className="group hover:bg-indigo-50/30 transition-all cursor-default">
                        <td className="px-6 py-4">
                           <span className={cn("px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest", 
                             booking.status === 'completed' ? "bg-emerald-50 text-emerald-600" : 
                             booking.status === 'pending' ? "bg-amber-50 text-amber-600" : 
                             "bg-slate-50 text-slate-400")}>
                             {booking.status}
                           </span>
                        </td>
                        <td className="px-6 py-4">
                           <p className="font-black text-slate-900 tracking-tight">{booking.serviceType}</p>
                           <p className="text-[11px] font-bold text-slate-400 mt-0.5">{booking.date} • {booking.time}</p>
                        </td>
                        <td className="px-6 py-4 text-right">
                           <p className="text-sm font-black text-slate-900">${booking.payment.amount}</p>
                           {booking.payment.amount > 100 && (
                             <span className="text-[9px] font-black text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full mt-1 inline-block">High Value</span>
                           )}
                        </td>
                      </tr>
                    ))}
                    {allBookings.length === 0 && (
                      <tr><td colSpan={3} className="px-6 py-20 text-center text-slate-300 font-black uppercase tracking-widest text-xs">No active bookings detected</td></tr>
                    )}
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
