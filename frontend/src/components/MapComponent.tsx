import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icons in React-Leaflet
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

function ChangeView({ center, zoom }: { center: [number, number], zoom: number }) {
  const map = useMap();
  map.setView(center, zoom);
  return null;
}

export default function MapComponent({ center, zoom = 13, markers = [], showRoute = true }: MapComponentProps) {
  const polylinePositions = markers.map(m => m.position);
  
  return (
    <div className="w-full h-full min-h-[400px] rounded-3xl overflow-hidden border border-slate-200 shadow-inner group">
      <MapContainer center={center || [19.0760, 72.8777]} zoom={zoom} scrollWheelZoom={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          className="grayscale-0 hover:grayscale-[0.2] transition-colors"
        />
        <ChangeView center={center} zoom={zoom} />
        
        {markers.map((marker, idx) => (
          <Marker 
            key={idx} 
            position={marker.position}
            icon={marker.type === 'customer' ? L.icon({
                iconUrl: 'https://cdn-icons-png.flaticon.com/512/25/25694.png',
                iconSize: [32, 32],
                iconAnchor: [16, 32]
            }) : DefaultIcon}
          >
            {marker.label && <Popup className="rounded-xl overflow-hidden"><div className="font-bold p-2">{marker.label}</div></Popup>}
          </Marker>
        ))}

        {showRoute && markers.length >= 2 && (
          <Polyline 
            positions={polylinePositions} 
            pathOptions={{ 
                color: '#4f46e5', 
                weight: 4, 
                dashArray: '10, 10', 
                dashSpeed: 2,
                opacity: 0.6 
            }} 
          />
        )}
      </MapContainer>
      <div className="absolute top-4 right-4 z-[1000] bg-white/90 backdrop-blur-md px-4 py-2 rounded-full border border-slate-200 text-[10px] font-black uppercase tracking-widest text-indigo-600 shadow-sm pointer-events-none">
        Live Connection Active
      </div>
    </div>
  );
}
