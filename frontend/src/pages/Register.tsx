import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { Calendar, Mail, Lock, User, Phone, MapPin, Briefcase, AlertCircle, ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';
import { UserRole } from '../types';
import Toast, { ToastType } from '../components/Toast';

export default function Register() {
  const [role, setRole] = useState<UserRole>('customer');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [category, setCategory] = useState('electrician');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [location, setLocation] = useState<{ lat: number, lng: number } | null>(null);
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');
  const [gpsError, setGpsError] = useState('');
  const [toast, setToast] = useState<{ message: string; type: ToastType; visible: boolean }>({ message: '', type: 'info', visible: false });
  const navigate = useNavigate();

  // Removed auto-capture to ensure workers explicitly choose to connect their GPS location

  const coordsToLabel = (coords: { lat: number; lng: number }) =>
    `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`;

  const reverseGeocode = async (coords: { lat: number; lng: number }) => {
    // Best-effort: no API key required. Falls back to raw coordinates if rate-limited/unavailable.
    try {
      const url = new URL('https://nominatim.openstreetmap.org/reverse');
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('lat', String(coords.lat));
      url.searchParams.set('lon', String(coords.lng));
      url.searchParams.set('zoom', '18');
      url.searchParams.set('addressdetails', '1');

      const res = await fetch(url.toString(), {
        headers: {
          // Some environments block requests without a UA; keep it simple but explicit.
          'Accept': 'application/json',
        },
      });
      if (!res.ok) return coordsToLabel(coords);
      const data: any = await res.json();
      return (data?.display_name as string | undefined) || coordsToLabel(coords);
    } catch {
      return coordsToLabel(coords);
    }
  };

  const setLocationAndAddress = async (coords: { lat: number; lng: number }) => {
    setGpsError('');
    setLocation(coords);
    setManualLat(String(coords.lat));
    setManualLng(String(coords.lng));
    // Always store something deterministic even if reverse geocode fails.
    setAddress(coordsToLabel(coords));
    const resolved = await reverseGeocode(coords);
    setAddress(resolved);
  };

  const parseManualCoords = () => {
    const lat = Number(manualLat);
    const lng = Number(manualLng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return { lat, lng };
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (!location) {
        throw new Error('Real GPS location coordinates are strictly required. Please enable location permissions.');
      }
      // Ensure address is derived from coordinates (no manual entry).
      const derivedAddress = address?.trim() ? address.trim() : coordsToLabel(location);
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const uid = userCredential.user.uid;
      
      const userData = {
        uid,
        email,
        role,
        status: role === 'worker' ? 'pending' : 'active',
        profile: {
          name,
          phone,
          address: derivedAddress,
          location,
          ...(role === 'worker' && {
            category,
            rating: 0,
            totalReviews: 0,
            welcomeShown: false,
            verification: {
              status: 'none' as const,
              certificateUrls: [],
              skills: [],
              experienceYears: 0,
            },
            serviceRadiusKm: 15,
            reliabilityScore: 100,
            reliabilityStats: { cancellations: 0, delays: 0, onTimeCompletes: 0 },
          })
        },
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'users', uid), userData);
      
      if (role === 'worker') {
        setToast({ message: 'Registration successful! Please wait for admin approval.', type: 'success', visible: true });
        setTimeout(() => navigate('/login'), 3000);
      } else {
        navigate('/customer');
      }
    } catch (err: any) {
      console.error("FULL FIREBASE ERROR:", err);
      // Firebase errors often have a 'code' like 'auth/email-already-in-use'
      const errorMessage = err.code ? `Firebase: ${err.code}` : (err.message || 'Failed to register');
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const categories = ['electrician', 'plumber', 'mechanic', 'house keeping', 'carpenter', 'painter'];

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-indigo-50 via-white to-slate-50 py-12">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-2xl w-full bg-white rounded-3xl shadow-2xl shadow-indigo-100/50 border border-indigo-50 p-8 sm:p-10"
      >
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-200 mb-6">
            <Calendar className="text-white w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight mb-2">Create Account</h1>
          <p className="text-slate-500">Join our community of professionals and customers</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-100 text-red-600 rounded-xl flex items-center gap-3 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0" />
            {error}
          </div>
        )}

        <form onSubmit={handleRegister} className="space-y-6">
          <div className="grid grid-cols-2 gap-4 p-1 bg-slate-100 rounded-2xl mb-8">
            <button
              type="button"
              onClick={() => setRole('customer')}
              className={`py-3 px-4 rounded-xl text-sm font-bold transition-all ${
                role === 'customer' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Customer
            </button>
            <button
              type="button"
              onClick={() => setRole('worker')}
              className={`py-3 px-4 rounded-xl text-sm font-bold transition-all ${
                role === 'worker' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Service Worker
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700 ml-1">Full Name</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                <input
                  type="text"
                  required
                  className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700 ml-1">Phone Number</label>
              <div className="relative">
                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                <input
                  type="tel"
                  required
                  className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="+1 234 567 890"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700 ml-1">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                <input
                  type="email"
                  required
                  className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
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
                  className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-semibold text-slate-700 ml-1">Address (auto from GPS)</label>
              <div className="relative">
                <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                <input
                  type="text"
                  required
                  readOnly
                  className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-700"
                  placeholder="Capture GPS to generate address"
                  value={address}
                />
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

              <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-wider mt-3 ml-1">
                <button
                  type="button"
                  onClick={() => {
                    if (navigator.geolocation) {
                      navigator.geolocation.getCurrentPosition(
                        (pos) => setLocationAndAddress({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                        () => setGpsError('GPS Active Signal Required.')
                      );
                    } else {
                      setGpsError('Location not supported in this browser.');
                    }
                  }}
                  className={location ? 'text-emerald-600' : 'text-indigo-600 hover:text-indigo-700'}
                >
                  <MapPin className="w-3 h-3 inline mr-1" /> Use Live GPS
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const coords = parseManualCoords();
                    if (!coords) {
                      setGpsError('Enter valid coordinates (lat -90..90, lng -180..180).');
                      return;
                    }
                    setLocationAndAddress(coords);
                  }}
                  className="text-slate-600 hover:text-slate-900 transition-colors"
                >
                  Apply Entered Coordinates
                </button>
              </div>
              {location && (
                 <p className="mt-2 text-[10px] text-emerald-600 font-mono text-center bg-emerald-50 py-2 rounded-xl border border-emerald-100/50">
                    Active Coordinates: {coordsToLabel(location)}
                 </p>
              )}
              {gpsError && <p className="text-red-500 text-xs mt-1 ml-1 font-bold">{gpsError}</p>}
            </div>

            {role === 'worker' && (
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-semibold text-slate-700 ml-1">Service Category</label>
                <div className="relative">
                  <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                  <select
                    className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none appearance-none"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat.charAt(0).toUpperCase() + cat.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2 group disabled:opacity-70 mt-8"
          >
            {loading ? 'Creating Account...' : (
              <>
                Create Account
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </form>

        <div className="mt-8 text-center">
          <p className="text-slate-500 text-sm">
            Already have an account?{' '}
            <Link to="/login" className="text-indigo-600 font-bold hover:text-indigo-700">
              Sign In
            </Link>
          </p>
        </div>
      </motion.div>
      <Toast 
        message={toast.message} 
        type={toast.type} 
        isVisible={toast.visible} 
        onClose={() => setToast({ ...toast, visible: false })} 
      />
    </div>
  );
}
