import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

interface MapComponentProps {
    center: [number, number];
    zoom?: number;
    markers?: Array<{
        position: [number, number];
        label?: string;
        type?: 'worker' | 'customer';
    }>;
    showRoute?: boolean;
}

// Draws the real road route by calling OSRM directly — no leaflet-routing-machine, no wrong address panel
function RouteLayer({ markers }: { markers: any[] }) {
    const map = useMap();
    const [stats, setStats] = useState<{ distance: string; time: string } | null>(null);
    const polylineRef = useRef<L.Polyline | null>(null);

    useEffect(() => {
        if (!map || markers.length < 2) return;

        const wLat = Number(markers[0].position[0]);
        const wLng = Number(markers[0].position[1]);
        const cLat = Number(markers[1].position[0]);
        const cLng = Number(markers[1].position[1]);

        if (isNaN(wLat) || isNaN(wLng) || isNaN(cLat) || isNaN(cLng)) return;

        // Call OSRM directly — returns actual road geometry
        const url = `https://router.project-osrm.org/route/v1/driving/${wLng},${wLat};${cLng},${cLat}?overview=full&geometries=geojson`;

        fetch(url)
            .then(r => r.json())
            .then(data => {
                if (!data.routes || data.routes.length === 0) return;

                const route = data.routes[0];
                const coords: [number, number][] = route.geometry.coordinates.map(
                    ([lng, lat]: [number, number]) => [lat, lng]
                );

                // Remove old polyline if re-rendered
                if (polylineRef.current) {
                    map.removeLayer(polylineRef.current);
                }

                const poly = L.polyline(coords, {
                    color: '#4f46e5',
                    weight: 6,
                    opacity: 0.9
                }).addTo(map);

                polylineRef.current = poly;

                // Fit map to show full route
                map.fitBounds(poly.getBounds(), { padding: [60, 60] });

                setStats({
                    distance: (route.distance / 1000).toFixed(2) + ' km',
                    time: Math.round(route.duration / 60) + ' mins'
                });
            })
            .catch(() => {
                // Fallback: straight-line haversine
                const R = 6371;
                const dLat = (cLat - wLat) * Math.PI / 180;
                const dLng = (cLng - wLng) * Math.PI / 180;
                const a = Math.sin(dLat / 2) ** 2 + Math.cos(wLat * Math.PI / 180) * Math.cos(cLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
                const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                setStats({ distance: dist.toFixed(2) + ' km', time: Math.round(dist * 2) + ' mins' });
            });

        return () => {
            if (polylineRef.current) {
                try { map.removeLayer(polylineRef.current); } catch (e) {}
            }
        };
    }, [map, markers[0].position[0], markers[0].position[1], markers[1].position[0], markers[1].position[1]]);

    if (!stats) return (
        <div className="absolute top-4 left-4 z-[1000] bg-white/90 backdrop-blur-md px-4 py-2 rounded-full border border-slate-200 text-[10px] font-black uppercase tracking-widest text-indigo-600 shadow-sm pointer-events-none animate-pulse">
            Calculating Route...
        </div>
    );

    return (
        <div className="absolute top-4 left-4 z-[1000] bg-white/90 backdrop-blur-md px-5 py-3 rounded-2xl border border-slate-200 shadow-xl pointer-events-none">
            <h4 className="font-black text-slate-900 text-sm uppercase tracking-wider mb-1">Live Tracking</h4>
            <div className="flex items-center gap-4 text-xs">
                <span className="font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md">Dist: {stats.distance}</span>
                <span className="font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md">ETA: {stats.time}</span>
            </div>
        </div>
    );
}

export default function MapComponent({ center, zoom = 13, markers = [], showRoute = true }: MapComponentProps) {
    if (!center || isNaN(center[0]) || isNaN(center[1])) {
        return <div className="w-full h-full min-h-[400px] flex items-center justify-center bg-slate-100 rounded-3xl animate-pulse text-slate-500 font-bold border border-slate-200">Waiting for GPS Coordinates...</div>;
    }

    return (
        <div className="w-full h-full min-h-[400px] rounded-3xl overflow-hidden border border-slate-200 shadow-inner group relative">
            <MapContainer center={center} zoom={zoom} scrollWheelZoom={false} className="w-full h-full min-h-[400px]">
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {markers.map((marker, idx) => {
                    if (isNaN(marker.position[0]) || isNaN(marker.position[1])) return null;

                    if (marker.type === 'customer') {
                        const customerIcon = L.divIcon({
                            className: '',
                            html: `<div style="
                                width:36px;height:36px;
                                background:linear-gradient(135deg,#ef4444,#f97316);
                                border-radius:50% 50% 50% 0;
                                transform:rotate(-45deg) translateX(50%);
                                border:3px solid white;
                                box-shadow:0 0 0 3px #ef4444,0 4px 12px rgba(239,68,68,0.5);
                            "></div>`,
                            iconSize: [36, 36],
                            iconAnchor: [18, 36]
                        });
                        return (
                            <Marker key={idx} position={marker.position} icon={customerIcon}>
                                {marker.label && <Popup><div className="font-bold text-sm text-red-600">{marker.label}</div></Popup>}
                            </Marker>
                        );
                    }

                    return (
                        <Marker key={idx} position={marker.position} icon={DefaultIcon}>
                            {marker.label && <Popup><div className="font-bold p-1">{marker.label}</div></Popup>}
                        </Marker>
                    );
                })}

                {showRoute && markers.length >= 2 && (
                    <RouteLayer markers={markers} />
                )}
            </MapContainer>
        </div>
    );
}
