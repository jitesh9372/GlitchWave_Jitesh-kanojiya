import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { motion } from 'framer-motion';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Map as MapIcon, Loader2, AlertTriangle, Info, Clock } from 'lucide-react';

// Component to dynamically resize/fit bounds if we wanted to, but we'll default to India
function MapFocus() {
  const map = useMap();
  useEffect(() => {
    // Force a resize calculation after map mount to ensure tiles load correctly inside grid/flex
    setTimeout(() => {
      map.invalidateSize();
    }, 100);
  }, [map]);
  return null;
}

export default function CriticalZones() {
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<any[]>([]);

  useEffect(() => {
    const fetchAlerts = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('users_detail')
          .select('*')
          .eq('feature_type', 'alert')
          .order('created_at', { ascending: false });

        if (error) throw error;

        // Parse string "(lat, lng)" to numbers and compute severity
        const parsedAlerts = (data || []).map((alert: any) => {
          let lat = 0, lng = 0;
          if (alert.location && typeof alert.location === 'string') {
            const locMatch = alert.location.match(/\(([^,]+),\s*([^)]+)\)/);
            if (locMatch) {
              lat = parseFloat(locMatch[1]);
              lng = parseFloat(locMatch[2]);
            }
          }

          const ageInMinutes = (new Date().getTime() - new Date(alert.created_at).getTime()) / 60000;
          let severity = 'low';
          
          if (alert.status === 'resolved') {
            severity = 'low';
          } else if (ageInMinutes > 5) {
            severity = 'critical';
          } else {
            severity = 'high';
          }

          return { ...alert, lat, lng, severity };
        }).filter(a => a.lat !== 0 && a.lng !== 0); // Only keep valid coordinates

        // Mock historical & live data showing accidents and overall situation in India
        const MOCK_INDIA_INCIDENTS = [
          { id: 'm1', name: 'NH-48 Highway Patrol', message: 'Major multi-vehicle pileup. Road blocked.', status: 'active', created_at: new Date(Date.now() - 10 * 60000).toISOString(), lat: 19.2823, lng: 72.8806, severity: 'critical', type: 'Accident' },
          { id: 'm2', name: 'Mumbai Fire Response', message: 'Industrial fire in MIDC area. 4 Fire engines dispatched.', status: 'active', created_at: new Date(Date.now() - 15 * 60000).toISOString(), lat: 19.1136, lng: 72.8697, severity: 'critical', type: 'Fire' },
          { id: 'm3', name: 'Delhi Traffic Police', message: 'Waterlogging causing severe traffic jams at ITO.', status: 'active', created_at: new Date(Date.now() - 2 * 60000).toISOString(), lat: 28.6276, lng: 77.2404, severity: 'high', type: 'Hazard' },
          { id: 'm4', name: 'Bangalore EMT', message: 'Medical emergency reported on ORR. Ambulance approaching.', status: 'active', created_at: new Date(Date.now() - 1 * 60000).toISOString(), lat: 12.9716, lng: 77.5946, severity: 'high', type: 'Medical' },
          { id: 'm5', name: 'Chennai Disaster Response', message: 'Cyclone warning alert active for coastal regions.', status: 'active', created_at: new Date(Date.now() - 8 * 60000).toISOString(), lat: 13.0827, lng: 80.2707, severity: 'critical', type: 'Weather' },
          { id: 'm6', name: 'Pune City Police', message: 'Protest cleared. Traffic returning to normal in Shivaji Nagar.', status: 'resolved', created_at: new Date(Date.now() - 45 * 60000).toISOString(), lat: 18.5204, lng: 73.8567, severity: 'low', type: 'General' },
          { id: 'm7', name: 'Hyderabad Highway Auth', message: 'Overturned truck cleared from Outer Ring Road.', status: 'resolved', created_at: new Date(Date.now() - 120 * 60000).toISOString(), lat: 17.3850, lng: 78.4867, severity: 'low', type: 'Accident' },
          { id: 'm8', name: 'Kolkata Emergency', message: 'Building collapse reports in older districts. Search & rescue initiated.', status: 'active', created_at: new Date(Date.now() - 3 * 60000).toISOString(), lat: 22.5726, lng: 88.3639, severity: 'high', type: 'Critical' },
          { id: 'm9', name: 'Jaipur Police', message: 'Suspicious object reported. Area cordoned off for safety.', status: 'active', created_at: new Date(Date.now() - 25 * 60000).toISOString(), lat: 26.9124, lng: 75.7873, severity: 'critical', type: 'Security' },
          { id: 'm10', name: 'Ahmedabad Traffic', message: 'Major bridge repair work ongoing. Diversion in place.', status: 'active', created_at: new Date(Date.now() - 60 * 60000).toISOString(), lat: 23.0225, lng: 72.5714, severity: 'high', type: 'Traffic' },
          { id: 'm11', name: 'Agra Highway Patrol', message: 'Dense fog causing extremely low visibility on Yamuna Expressway.', status: 'active', created_at: new Date(Date.now() - 30 * 60000).toISOString(), lat: 27.2038, lng: 77.9629, severity: 'high', type: 'Weather' },
          { id: 'm12', name: 'Kochi Port Authority', message: 'Oil spill reported off coast. Cleanup crew dispatched.', status: 'active', created_at: new Date(Date.now() - 40 * 60000).toISOString(), lat: 9.9312, lng: 76.2673, severity: 'critical', type: 'Hazard' }
        ];

        setAlerts([...parsedAlerts, ...MOCK_INDIA_INCIDENTS]);
      } catch (err) {
        console.error("Error fetching critical zones:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchAlerts();

    // Subscribe to live DB changes
    const subscription = supabase
      .channel('critical-zone-alerts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users_detail' }, fetchAlerts)
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const getMarkerOptions = (severity: string) => {
    switch (severity) {
      case 'critical':
        return { color: '#ef4444', fillColor: '#ef4444', radius: 12, className: 'animate-pulse' };
      case 'high':
        return { color: '#f97316', fillColor: '#f97316', radius: 8 };
      case 'low':
      default:
        return { color: '#10b981', fillColor: '#10b981', radius: 5 };
    }
  };

  return (
    <div className="pt-24 px-4 pb-12 w-full max-w-7xl mx-auto min-h-screen flex flex-col">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 flex flex-col gap-2"
      >
        <h1 className="text-3xl md:text-5xl font-black text-slate-900 tracking-tight flex items-center gap-3">
          <MapIcon className="w-8 h-8 text-primary" />
          Critical Zones Map
        </h1>
        <p className="text-slate-500 font-medium max-w-xl">
          Live geographic hotspots visualizing emergency SOS triggers across India.
        </p>
      </motion.div>

      {/* Legend */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="flex flex-wrap gap-4 mb-4"
      >
        <div className="flex items-center gap-2 bg-red-50 text-red-700 px-3 py-1.5 rounded-lg border border-red-200 text-sm font-bold">
          <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" /> Critical Risk (Ongoing &gt; 5m)
        </div>
        <div className="flex items-center gap-2 bg-orange-50 text-orange-700 px-3 py-1.5 rounded-lg border border-orange-200 text-sm font-bold">
          <div className="w-3 h-3 rounded-full bg-orange-500" /> High Risk (Active)
        </div>
        <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg border border-emerald-200 text-sm font-bold">
          <div className="w-3 h-3 rounded-full bg-emerald-500" /> Safe Zone (Resolved)
        </div>
      </motion.div>

      {/* Map Wrapping Container */}
      <div className="bg-white p-2 rounded-2xl shadow-sm border border-slate-200 relative overflow-hidden z-0" style={{ height: '600px', width: '100%' }}>
        {loading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm">
            <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
            <p className="font-bold text-slate-700">Loading Geodata...</p>
          </div>
        )}
        
        <MapContainer 
          center={[20.5937, 78.9629]} 
          zoom={5} 
          scrollWheelZoom={true}
          style={{ height: '100%', width: '100%', zIndex: 0, borderRadius: '0.75rem' }}
        >
          <MapFocus />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          />
          
          {alerts.map((alert) => (
            <CircleMarker
              key={alert.id}
              center={[alert.lat, alert.lng]}
              pathOptions={{
                ...getMarkerOptions(alert.severity),
                fillOpacity: 0.6,
                weight: 2
              }}
            >
              <Popup className="rounded-xl font-sans">
                <div className="p-1 min-w-[200px]">
                  <h3 className="font-bold text-slate-800 text-sm flex items-center justify-between mb-1">
                    {alert.name || 'Anonymous User'}
                    {alert.severity === 'critical' && <AlertTriangle className="w-4 h-4 text-red-500 inline" />}
                  </h3>
                  <p className="text-xs text-slate-600 mb-2 leading-relaxed">{alert.message}</p>
                  
                  <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono bg-slate-50 p-2 rounded">
                    <Info className="w-3 h-3" />
                    Status: <span className="uppercase font-bold text-slate-700">{alert.status}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono mt-1 px-2">
                    <Clock className="w-3 h-3" />
                    {new Date(alert.created_at).toLocaleString()}
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
