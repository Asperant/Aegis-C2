import { ShieldCheck, ShieldAlert, Activity } from 'lucide-react';

export default function CyberStatus({ selectedDrone }) {
  const isStale = selectedDrone.isStale;

  // Use backend telemetry values and fall back to zero when absent.
  const ping = selectedDrone.ping ?? 0;
  const qos = selectedDrone.qos ?? 0;

  return (
    <div className={`p-3 rounded border flex flex-col gap-2 transition-colors ${isStale ? 'bg-red-950/20 border-red-900/50' : 'bg-slate-900 border-emerald-700/50'}`}>
      <span className={`${isStale ? 'text-red-500' : 'text-emerald-400'} text-[11px] font-black uppercase tracking-wider flex items-center gap-1 mb-1`}>
        {isStale ? <ShieldAlert size={14} /> : <ShieldCheck size={14} />} 
        Siber Kalkan Durumu
      </span>
      
      <div className="flex justify-between items-center text-xs font-mono font-semibold">
        <span className="text-slate-400">Şifreleme:</span>
        <span className={isStale ? 'text-red-500 line-through' : 'text-emerald-400'}>
          AES-256 (Aktif)
        </span>
      </div>
      
      <div className="flex justify-between items-center text-xs font-mono font-semibold">
        <span className="text-slate-400">Sinyal (Ping):</span>
        <span className={isStale ? 'text-red-500' : 'text-emerald-400 flex items-center gap-1'}>
          {!isStale && <Activity size={12} className={ping > 100 ? "text-yellow-500 animate-pulse" : ""} />} 
          {isStale ? 'BAĞLANTI YOK' : (
             <span className={ping > 100 ? "text-yellow-500" : "text-emerald-400"}>
               {ping}ms
             </span>
          )}
        </span>
      </div>
      
      <div className="flex justify-between items-center text-xs font-mono font-semibold">
        <span className="text-slate-400">QoS (Kayıp):</span>
        <span className={isStale ? 'text-red-500' : 'text-emerald-400'}>
          {isStale ? '---' : (
             <span className={qos > 5 ? "text-red-400" : "text-emerald-400"}>
               %{qos}
             </span>
          )}
        </span>
      </div>
    </div>
  );
}
