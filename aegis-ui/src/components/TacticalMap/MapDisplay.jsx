import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair } from 'lucide-react';
import axios from 'axios';
import { AEGIS_API_URL } from '../../constants';

// Map marker icon factories.
const gksIcon = (gksId) => L.divIcon({
  className: 'bg-transparent border-none',
  html: `
    <div class="relative w-14 h-14 flex items-center justify-center cursor-pointer">
      <div class="absolute inset-0 rounded-full bg-blue-500/5 border border-blue-500/20"></div>
      <div class="relative flex flex-col items-center">
        <div class="w-9 h-9 bg-blue-950/80 border-2 border-blue-500 rounded-sm flex items-center justify-center shadow-[0_0_15px_rgba(59,130,246,0.6)]">
          <div class="w-2 h-2 bg-blue-300 rounded-full animate-ping"></div>
        </div>
        <div class="absolute top-10 text-blue-400 text-[10px] font-bold tracking-widest whitespace-nowrap bg-slate-900/80 px-1.5 py-0.5 rounded border border-blue-900/50">
          ${gksId}
        </div>
      </div>
    </div>
  `,
  iconSize: [56, 56], iconAnchor: [28, 28], popupAnchor: [0, -18]
});

const createUavIcon = (isStale) => {
  const outerClass = isStale ? 'bg-red-950/80 border-red-600' : 'bg-emerald-950/80 border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)]';
  const innerClass = isStale ? 'bg-red-500' : 'bg-emerald-400';
  const haloClass = isStale ? 'bg-red-500/5 border-red-500/20' : 'bg-emerald-500/5 border-emerald-500/25';
  return L.divIcon({
    className: 'bg-transparent border-none',
    html: `
      <div class="relative w-12 h-12 flex items-center justify-center cursor-pointer">
        <div class="absolute inset-0 rounded-full border ${haloClass}"></div>
        <div class="relative w-7 h-7 border-[2px] rounded-full flex items-center justify-center ${outerClass}">
          <div class="w-2 h-2 rounded-full ${innerClass}"></div>
        </div>
      </div>
    `,
    iconSize: [48, 48], iconAnchor: [24, 24], popupAnchor: [0, -16]
  });
};

function MapInteractionHandler({ interactionMode, setInteractionMode, setStagedWaypoints, pendingManeuver, setPendingManeuver, selectedDrone }) {
  const modeRef = React.useRef(interactionMode);
  const pendingManeuverRef = React.useRef(pendingManeuver);
  const selectedDroneRef = React.useRef(selectedDrone);

  React.useEffect(() => { modeRef.current = interactionMode; }, [interactionMode]);
  React.useEffect(() => { pendingManeuverRef.current = pendingManeuver; }, [pendingManeuver]);
  React.useEffect(() => { selectedDroneRef.current = selectedDrone; }, [selectedDrone]);

  useMapEvents({
    click(e) {
      if (modeRef.current === 'SPAWN_UAV') {
        axios.post(`${AEGIS_API_URL}/deployment/spawn-uav`, { lat: e.latlng.lat, lon: e.latlng.lng })
          .then(() => {
            setInteractionMode('NONE');
          })
          .catch(() => {});
      } else if (modeRef.current === 'SPAWN_GKS') {
        axios.post(`${AEGIS_API_URL}/deployment/spawn-gks`, { lat: e.latlng.lat, lon: e.latlng.lng })
          .then(() => {
            setInteractionMode('NONE');
          })
          .catch(() => {});
      } else if (modeRef.current === 'DRAW_ROUTE') {
        setStagedWaypoints(prev => [...prev, e.latlng]);
      } else if (modeRef.current === 'SELECT_MANEUVER_TARGET' && pendingManeuverRef.current && selectedDroneRef.current) {
        axios.post(`${AEGIS_API_URL}/tactical/command`, {
          uavId: selectedDroneRef.current.id,
          commandType: pendingManeuverRef.current,
          lat: e.latlng.lat,
          lng: e.latlng.lng
        })
        .then(() => {
          setInteractionMode('NONE');
          setPendingManeuver(null);
        })
        .catch(() => {});
      }
    }
  });
  return null;
}

function MapVisibilityHandler({ isActive }) {
  const map = useMap();

  React.useEffect(() => {
    const invalidate = () => {
      map.invalidateSize(false);
    };

    const container = map.getContainer();
    let resizeObserver = null;

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => invalidate());
      resizeObserver.observe(container);
    }

    const onWindowResize = () => invalidate();
    const onVisibilityChange = () => {
      if (!document.hidden && isActive) {
        invalidate();
      }
    };

    window.addEventListener('resize', onWindowResize);
    document.addEventListener('visibilitychange', onVisibilityChange);

    // Recalculate map size on mount and layout transitions.
    const timers = [0, 50, 200, 500, 1000].map(delay =>
      setTimeout(() => {
        if (!isActive) return;
        invalidate();
      }, delay)
    );

    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener('resize', onWindowResize);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [isActive, map]);

  return null;
}

export default function MapDisplay({ drones, activeGks, selectedDrone, setSelectedDrone, setSelectedGks, interactionMode, setInteractionMode, stagedWaypoints, setStagedWaypoints, pendingManeuver, setPendingManeuver, isActive = true }) {
  // Fallback map center when no active GKS is present.
  const defaultCenter = [37.8728, 32.4922];
  const mapCenter = activeGks && activeGks.length > 0 ? [activeGks[0].lat, activeGks[0].lng] : defaultCenter;

  return (
    <div className={`flex-1 min-h-0 relative bg-slate-950 z-0 ${interactionMode !== 'NONE' ? 'cursor-crosshair' : ''}`}>
      <MapContainer
        center={mapCenter}
        zoom={7}
        style={{ height: '100%', width: '100%' }}
        className="z-0"
        zoomControl={false}
        attributionControl={false}
        whenReady={(event) => {
          setTimeout(() => event.target.invalidateSize(false), 0);
        }}
      >
        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
        <MapVisibilityHandler isActive={isActive} />
        <MapInteractionHandler 
          interactionMode={interactionMode} setInteractionMode={setInteractionMode} 
          setStagedWaypoints={setStagedWaypoints} 
          pendingManeuver={pendingManeuver} setPendingManeuver={setPendingManeuver}
          selectedDrone={selectedDrone}
        />

        {/* 1) GKS markers (Redis-backed) */}
        {activeGks && activeGks.map((gks, idx) => (
          <React.Fragment key={`gks-${idx}`}>
            <Marker 
              position={[gks.lat, gks.lng]} 
              icon={gksIcon(gks.id)}
              eventHandlers={{
                click: () => {
                  setSelectedGks(gks);
                  setSelectedDrone(null); // Clear drone selection when opening GKS panel.
                }
              }}
            >
              <Popup className="custom-popup">
                <strong className="text-blue-500 text-sm">{gks.id}</strong><br />
                <span className="text-slate-600 text-xs uppercase tracking-wider">Yer Kontrol İstasyonu</span><br/>
                {selectedDrone && (
                   <button 
                     onClick={(e) => {
                       e.stopPropagation();
                       // Dispatch handover request directly from map popup.
                       axios.post(`${AEGIS_API_URL}/tactical/command`, {
                          uavId: selectedDrone.id,
                          commandType: "HANDOVER",
                          targetIp: gks.host || gks.id.toLowerCase()
                       }).catch(() => {});
                     }}
                     className="mt-2 text-[10px] bg-red-900/50 hover:bg-red-800 border border-red-500/50 text-red-300 px-2 py-1 flex items-center gap-1 rounded cursor-pointer w-full justify-center transition"
                   >
                     {selectedDrone.id} Icin Handover Baslat
                   </button>
                )}
              </Popup>
            </Marker>
            
            {/* Geofence circle for each GKS */}
            <Circle
              center={[gks.lat, gks.lng]}
              radius={(gks.radius || 50) * 1000}
              pathOptions={{ color: '#3b82f6', dashArray: '5, 10', fillOpacity: 0.03, weight: 1.5 }}
            />
          </React.Fragment>
        ))}

        {/* 3) Staged route and waypoint markers */}
        {stagedWaypoints && stagedWaypoints.length > 0 && (
          <React.Fragment>
            <Polyline positions={stagedWaypoints.map(wp => [wp.lat, wp.lng])} pathOptions={{ color: '#3b82f6', weight: 2, dashArray: '5, 5' }} />
            {stagedWaypoints.map((wp, idx) => {
              const waypointIcon = L.divIcon({
                className: 'bg-transparent border-none',
                html: `<div class="w-3 h-3 bg-blue-500 rounded-full border-2 border-white shadow-[0_0_10px_rgba(59,130,246,0.8)]"><div class="w-full h-full bg-blue-400 rounded-full animate-ping opacity-75"></div></div>`,
                iconSize: [12, 12],
                iconAnchor: [6, 6]
              });
              return (
                <Marker key={`wp-${idx}`} position={[wp.lat, wp.lng]} icon={waypointIcon}>
                  <Popup className="custom-popup">
                    <strong className="text-blue-500 text-[10px]">HEDEF NOKTA {idx + 1}</strong>
                  </Popup>
                </Marker>
              );
            })}
          </React.Fragment>
        )}

        {/* 4) UAV markers and tracks */}
        {drones.map(drone => {
          const isStale = drone.isStale;
          
          // Resolve assigned GKS location for current UAV.
          const myGks = activeGks?.find(g => g.id === drone.active_gks);
          const gksLocation = myGks ? [myGks.lat, myGks.lng] : null;

          return (
            <React.Fragment key={drone.id}>
              {/* GKS-to-UAV link polyline when station data is available */}
              {!isStale && gksLocation && (
                <Polyline
                  positions={[gksLocation, [drone.lat, drone.lng]]}
                  pathOptions={{ color: '#0ea5e9', weight: 1.5, opacity: 0.3, dashArray: '2, 8' }}
                />
              )}

              {/* Flight track polyline */}
              {drone.path && drone.path.length > 1 && (
                <Polyline
                  positions={drone.path}
                  pathOptions={{ color: isStale ? '#ef4444' : '#10b981', weight: 2, opacity: 0.5, dashArray: '4, 6' }}
                />
              )}

              <Marker position={[drone.lat, drone.lng]} icon={createUavIcon(isStale)} eventHandlers={{ click: () => setSelectedDrone(drone) }} opacity={isStale ? 0.6 : 1.0}>
                <Popup className="custom-popup">
                  <strong className={isStale ? "text-red-600" : "text-emerald-500"}>{drone.id} {isStale && "(SINYAL KAYBI)"}</strong><br />
                  Mod: <span className="text-slate-700 font-semibold">{drone.status}</span>
                </Popup>
              </Marker>
            </React.Fragment>
          );
        })}
      </MapContainer>

      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none opacity-20 z-[1000]">
        <Crosshair size={300} strokeWidth={0.5} />
      </div>
    </div>
  );
}
