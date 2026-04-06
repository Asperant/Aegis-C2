import { Wifi, WifiOff, Battery, AlertTriangle } from 'lucide-react';

export default function FleetPanel({ drones, selectedDrone, setSelectedDrone }) {
  // Count UAVs with active telemetry link.
  const activeCount = drones.filter(d => !d.isStale).length;

  return (
    <div className="w-72 border-r border-slate-800 bg-slate-900/50 flex flex-col z-10">
      <div className="p-4 border-b border-slate-800 font-bold text-slate-400 text-sm tracking-widest flex justify-between items-center">
        <span>FİLO YÖNETİMİ</span>
        <span className={`${activeCount > 0 ? 'bg-emerald-900 text-emerald-400' : 'bg-red-900 text-red-400'} px-2 py-0.5 rounded text-xs transition-colors`}>
          {activeCount} AKTİF
        </span>
      </div>
      
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {drones.map(drone => {
          const isSelected = selectedDrone?.id === drone.id;
          const isStale = drone.isStale; // Derived from telemetry staleness hook.

          return (
            <div
              key={drone.id}
              onClick={() => setSelectedDrone(drone)}
              className={`p-3 rounded-lg border cursor-pointer transition-all duration-300 ${
                isStale 
                  ? 'bg-slate-950 border-red-900/50 grayscale-[0.5] opacity-75 hover:border-red-700' // Stale telemetry state
                  : isSelected 
                    ? 'bg-slate-800 border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.1)]' // Selected card
                    : 'bg-slate-900/80 border-slate-700 hover:border-slate-500' // Default state
              }`}
            >
              <div className="flex justify-between items-center mb-2">
                <span className={`font-bold tracking-wide ${isStale ? 'text-red-500' : 'text-emerald-400'}`}>
                  {drone.id}
                </span>
                {/* Show disconnected icon when telemetry is stale */}
                {isStale ? (
                  <WifiOff size={16} className="text-red-500 animate-pulse" />
                ) : (
                  <Wifi size={16} className={drone.battery > 20 ? "text-emerald-500" : "text-yellow-500"} />
                )}
              </div>
              
              <div className="flex justify-between items-center text-xs text-slate-400">
                <span className="flex items-center gap-1">
                  {isStale ? (
                    <AlertTriangle size={14} className="text-red-500" />
                  ) : (
                    <Battery size={14} className={drone.battery > 20 ? "text-emerald-500" : "text-red-500"}/>
                  )}
                  {isStale ? <span className="text-red-500 font-bold">BAĞLANTI KOPTU</span> : `%${drone.battery}`}
                </span>
                {/* Strike out stale telemetry values for visual warning */}
                <span className={`flex flex-col text-right ${isStale ? 'line-through text-slate-600' : ''}`}>
                  <span>İrtifa: {drone.alt}m</span>
                  <span className="text-[10px] text-blue-400">{drone.active_gks}</span>
                </span>
              </div>
            </div>
          );
        })}

        {/* Empty-state card when no UAV is available */}
        {drones.length === 0 && (
          <div className="text-center text-slate-500 text-xs mt-10 p-4 border border-dashed border-slate-700 rounded flex flex-col items-center gap-2">
            <Wifi size={24} className="opacity-20 animate-ping" />
            Radar taraması yapılıyor...<br/>Sinyal bekleniyor.
          </div>
        )}
      </div>
    </div>
  );
}
