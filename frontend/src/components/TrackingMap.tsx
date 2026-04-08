import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-routing-machine';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

// ─── Fix default marker icons ────────────────────────────────────────────────
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl, shadowUrl: iconShadow, iconSize: [25, 41], iconAnchor: [12, 41] });

// ─── Hide LRM's built-in itinerary/geocoder panels via injected CSS ──────────
if (typeof document !== 'undefined' && !document.getElementById('lrm-hide')) {
  const s = document.createElement('style');
  s.id = 'lrm-hide';
  s.textContent = '.leaflet-routing-container,.leaflet-routing-geocoders{display:none!important}';
  document.head.appendChild(s);
}

// ─── Icons ────────────────────────────────────────────────────────────────────
const workerIcon = L.divIcon({
  className: '',
  html: `<div style="width:38px;height:38px;background:linear-gradient(135deg,#4f46e5,#7c3aed);border-radius:50%;border:3px solid white;box-shadow:0 0 0 3px #4f46e5,0 4px 12px rgba(79,70,229,0.5);display:flex;align-items:center;justify-content:center;">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
  </div>`,
  iconSize: [38, 38],
  iconAnchor: [19, 38],
  popupAnchor: [0, -40]
});

const customerIcon = L.divIcon({
  className: '',
  html: `<div style="width:38px;height:38px;background:linear-gradient(135deg,#ef4444,#f97316);border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 0 0 3px #ef4444,0 4px 12px rgba(239,68,68,0.5);"></div>`,
  iconSize: [38, 38],
  iconAnchor: [19, 38],
  popupAnchor: [0, -40]
});

// ─── Haversine fallback when OSRM / LRM is unavailable ─────────────────────────
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s1 = Math.sin(dLat / 2) ** 2;
  const s2 = Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s1 + s2), Math.sqrt(1 - s1 - s2));
}

/** Straight-line estimate; ETA assumes ~30 km/h average (same mobility model as listings). */
function fallbackRouteFromCoords(
  worker: { lat: number; lng: number },
  customer: { lat: number; lng: number }
): { distance: string; duration: string } {
  const km = haversineKm(worker, customer);
  const mins = Math.max(5, Math.round((km / 30) * 60));
  return { distance: `${km.toFixed(1)} km (approx.)`, duration: `${mins} mins (approx.)` };
}

// ─── Nominatim reverse geocode ────────────────────────────────────────────────
async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
      { headers: { 'Accept-Language': 'en' } }
    );
    const data = await res.json();
    if (data?.display_name) {
      // Return short readable form: road + suburb/city
      const a = data.address || {};
      const parts = [a.road, a.suburb || a.neighbourhood, a.city || a.town || a.village].filter(Boolean);
      return parts.length > 0 ? parts.join(', ') : data.display_name.split(',').slice(0, 3).join(',');
    }
  } catch (_) {}
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface TrackingMapProps {
  workerId: string;                          // Firestore UID — for live location updates
  customerLocation: { lat: number; lng: number }; // Booking's saved GPS
  workerName?: string;
  customerName?: string;
  height?: string;
}

export default function TrackingMap({
  workerId,
  customerLocation,
  workerName = 'Worker',
  customerName = 'Customer',
  height = '450px'
}: TrackingMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const routingControlRef = useRef<any>(null);
  const workerMarkerRef = useRef<L.Marker | null>(null);
  const customerMarkerRef = useRef<L.Marker | null>(null);

  const [workerLoc, setWorkerLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [workerAddress, setWorkerAddress] = useState('Locating worker...');
  const [customerAddress, setCustomerAddress] = useState('Loading address...');
  const [routeInfo, setRouteInfo] = useState<{ distance: string; duration: string } | null>(null);
  const [error, setError] = useState('');

  // ── Validate customer location ──────────────────────────────────────────────
  const cLat = Number(customerLocation?.lat);
  const cLng = Number(customerLocation?.lng);
  const customerValid = !isNaN(cLat) && !isNaN(cLng) && cLat !== 0 && cLng !== 0;

  // ── Reverse geocode customer address once ───────────────────────────────────
  useEffect(() => {
    if (!customerValid) return;
    reverseGeocode(cLat, cLng).then(setCustomerAddress);
  }, [cLat, cLng]);

  // ── Listen to worker location from Firestore in real-time ───────────────────
  useEffect(() => {
    if (!workerId) return;
    const unsub = onSnapshot(doc(db, 'users', workerId), (snap) => {
      if (!snap.exists()) return;
      const loc = snap.data()?.profile?.location;
      if (loc?.lat && loc?.lng) {
        const wLat = Number(loc.lat);
        const wLng = Number(loc.lng);
        if (!isNaN(wLat) && !isNaN(wLng)) {
          setWorkerLoc({ lat: wLat, lng: wLng });
          reverseGeocode(wLat, wLng).then(setWorkerAddress);
        }
      }
    });
    return () => unsub();
  }, [workerId]);

  // ── Initialize map once ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    if (!customerValid) return;

    const map = L.map(mapContainerRef.current, {
      center: [cLat, cLng],
      zoom: 14,
      zoomControl: true
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);

    // Customer marker — fixed, never moves
    const cMarker = L.marker([cLat, cLng], { icon: customerIcon })
      .addTo(map)
      .bindPopup(`<b>🏠 ${customerName}'s Location</b><br/><small id="caddr">Loading...</small>`);
    customerMarkerRef.current = cMarker;

    mapRef.current = map;

    // Update customer popup address once geocoded
    reverseGeocode(cLat, cLng).then(addr => {
      const el = document.getElementById('caddr');
      if (el) el.textContent = addr;
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [customerValid]);

  // ── Update worker marker + recalculate route when worker location changes ───
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !workerLoc || !customerValid) return;

    const wLat = workerLoc.lat;
    const wLng = workerLoc.lng;

    // Move or create worker marker
    if (workerMarkerRef.current) {
      workerMarkerRef.current.setLatLng([wLat, wLng]);
      workerMarkerRef.current.getPopup()?.setContent(
        `<b>📍 ${workerName} (Live)</b><br/><small>${workerAddress}</small>`
      );
    } else {
      const wMarker = L.marker([wLat, wLng], { icon: workerIcon })
        .addTo(map)
        .bindPopup(`<b>📍 ${workerName} (Live)</b><br/><small>${workerAddress}</small>`);
      workerMarkerRef.current = wMarker;
    }

    // ── LRM with OSRM — real road routing ──────────────────────────────────
    if (routingControlRef.current) {
       routingControlRef.current.setWaypoints([
         L.latLng(wLat, wLng),
         L.latLng(cLat, cLng)
       ]);
    } else {
       const control = (L as any).Routing.control({
         waypoints: [
           L.latLng(wLat, wLng),    // FROM: worker live location
           L.latLng(cLat, cLng)     // TO:   customer booking location
         ],
         router: (L as any).Routing.osrmv1({
           serviceUrl: 'https://router.project-osrm.org/route/v1'
         }),
         routeWhileDragging: false,
         show: false,
         addWaypoints: false,
         draggableWaypoints: false,
         fitSelectedRoutes: true,
         lineOptions: {
           styles: [{ color: '#4f46e5', weight: 5, opacity: 0.85 }],
           extendToWaypoints: true,
           missingRouteTolerance: 0
         },
         createMarker: () => null  // We manage our own markers
       }).addTo(map);

       control.on('routesfound', (e: any) => {
         const route = e.routes[0];
         const distKm = (route.summary.totalDistance / 1000).toFixed(1);
         const durMin = Math.round(route.summary.totalTime / 60);
         setRouteInfo({ distance: `${distKm} km`, duration: `${durMin} mins` });
         setError('');
       });

       control.on('routingerror', () => {
         setRouteInfo(fallbackRouteFromCoords({ lat: wLat, lng: wLng }, { lat: cLat, lng: cLng }));
         setError('');
       });

       routingControlRef.current = control;
    }
  }, [workerLoc, customerValid]);

  // ── Guard: invalid customer location ───────────────────────────────────────
  if (!customerValid) {
    return (
      <div className="w-full flex items-center justify-center bg-slate-50 rounded-2xl border border-slate-200 text-slate-500 font-bold text-sm" style={{ height }}>
        ⚠️ Customer location not available for this booking.
      </div>
    );
  }

  return (
    <div className="relative w-full rounded-2xl overflow-hidden border border-slate-200 shadow-lg" style={{ height }}>

      {/* Map container */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* ── Info overlay: Route stats ── */}
      <div className="absolute top-3 left-3 z-[1000] pointer-events-none flex flex-col gap-2">
        {/* Route card */}
        <div className="bg-white/95 backdrop-blur-sm rounded-2xl px-4 py-3 shadow-lg border border-slate-100">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Live Tracking</p>
          {routeInfo ? (
            <p className="text-sm font-black text-slate-900">
              <span className="text-indigo-600">{routeInfo.distance}</span>
              <span className="text-slate-400 mx-1.5">•</span>
              <span className="text-emerald-600">{routeInfo.duration} away</span>
            </p>
          ) : (
            <p className="text-xs font-bold text-indigo-500 animate-pulse">Calculating route...</p>
          )}
        </div>

        {/* Worker address */}
        {workerLoc && (
          <div className="bg-white/95 backdrop-blur-sm rounded-xl px-3 py-2 shadow border border-indigo-100 max-w-[220px]">
            <p className="text-[9px] font-black text-indigo-500 uppercase tracking-widest mb-0.5">Worker Location</p>
            <p className="text-[11px] font-semibold text-slate-700 leading-tight">{workerAddress}</p>
          </div>
        )}

        {/* Customer address */}
        <div className="bg-white/95 backdrop-blur-sm rounded-xl px-3 py-2 shadow border border-red-100 max-w-[220px]">
          <p className="text-[9px] font-black text-red-500 uppercase tracking-widest mb-0.5">Destination</p>
          <p className="text-[11px] font-semibold text-slate-700 leading-tight">{customerAddress}</p>
        </div>
      </div>

      {/* No worker location yet */}
      {!workerLoc && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm z-[999] gap-3">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="font-bold text-slate-700 text-sm">Waiting for worker GPS...</p>
          <p className="text-xs text-slate-400">Worker must have location enabled</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[1000] bg-red-50 border border-red-200 text-red-700 text-xs font-bold px-4 py-2 rounded-full shadow">
          {error}
        </div>
      )}
    </div>
  );
}
