import { Server, Cpu, HardDrive, ShieldBan, Lock, Activity } from 'lucide-react';

export default function NodeHealthMonitor({ metrics }) {
  const cpuLoad = Math.max(0, Math.min(100, Number(metrics?.cpu || 0)));
  // RAM is reported in MB; normalize against a 2048 MB reference for percentage bar.
  const ramMb = Math.max(0, Number(metrics?.ram || 0));
  const ramLoad = Math.max(0, Math.min(100, Math.round((ramMb / 2048) * 100)));

  return (
    <div className="w-72 bg-slate-950/80 border-l border-slate-800 flex flex-col z-10">
      
      {/* Header */}
      <div className="h-10 bg-slate-900 border-b border-slate-800 flex items-center px-4 justify-between">
        <span className="text-slate-400 text-xs font-mono font-bold flex items-center gap-2 tracking-widest uppercase">
          <Server size={14} className="text-blue-400" />
          Sistem Sağlığı
        </span>
        <span className="flex h-2 w-2 relative">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6 custom-scrollbar">
        
        {/* 1) Node resource metrics */}
        <div className="flex flex-col gap-3">
          <span className="text-[10px] text-slate-500 font-black tracking-widest uppercase mb-1">
            GKS-KONYA (Node-01)
          </span>
          
          <div className="bg-slate-900 border border-slate-800 p-2 rounded flex flex-col gap-1">
            <div className="flex justify-between items-center text-xs font-mono font-bold">
              <span className="text-slate-400 flex items-center gap-1"><Cpu size={12}/> CPU Yükü</span>
              <span className="text-emerald-400">%{cpuLoad}</span>
            </div>
            <div className="w-full bg-slate-950 rounded-full h-1">
              <div className="bg-emerald-500 h-1 rounded-full transition-all duration-1000" style={{ width: `${cpuLoad}%` }}></div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-2 rounded flex flex-col gap-1">
            <div className="flex justify-between items-center text-xs font-mono font-bold">
              <span className="text-slate-400 flex items-center gap-1"><HardDrive size={12}/> RAM (Bellek)</span>
              <span className="text-blue-400">%{ramLoad} ({ramMb}MB)</span>
            </div>
            <div className="w-full bg-slate-950 rounded-full h-1">
              <div className="bg-blue-500 h-1 rounded-full transition-all duration-1000" style={{ width: `${ramLoad}%` }}></div>
            </div>
          </div>
        </div>

        {/* 2) Security and crypto metrics */}
        <div className="flex flex-col gap-3">
          <span className="text-[10px] text-slate-500 font-black tracking-widest uppercase mb-1">
            Kriptografi & Ağ
          </span>

          <div className="flex justify-between items-center bg-slate-900 border border-slate-800 p-2 rounded text-xs">
            <span className="text-slate-400 flex items-center gap-1 font-bold">
              <Lock size={12} className="text-fuchsia-500" /> ŞİFRELEME
            </span>
            <span className="font-mono font-bold text-fuchsia-500">
              AES-256 (Aktif)
            </span>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-2 rounded flex flex-col gap-1">
            <div className="flex justify-between items-center text-xs font-mono font-bold">
              <span className="text-slate-400 flex items-center gap-1"><Activity size={12} className="text-emerald-500"/> FEC KURTARMA</span>
              <span className={metrics?.fecCount > 0 ? "text-emerald-400" : "text-slate-500"}>
                {metrics?.fecCount || 0} PKT
              </span>
            </div>
            <p className="text-[9px] text-slate-500 mt-1 leading-relaxed">
              Sistem başlangıcından beri <strong className="text-emerald-400">{metrics?.fecCount || 0}</strong> kayıp paket onarıldı.
            </p>
          </div>
        </div>

        {/* 3) Blocked attack counters */}
        <div className={`border p-4 rounded-lg flex flex-col items-center justify-center text-center mt-2 transition-all duration-300 ${metrics?.attackCount > 0 ? 'bg-red-950/20 border-red-900/50' : 'bg-slate-900 border-slate-800'}`}>
          <ShieldBan size={24} className={metrics?.attackCount > 0 ? "text-red-500 mb-2" : "text-slate-600 mb-2"} />
          <span className={metrics?.attackCount > 0 ? "text-red-500 text-[10px] font-black tracking-widest uppercase" : "text-slate-500 text-[10px] font-black tracking-widest uppercase"}>
            Engellenen Saldırılar
          </span>
          <span className={`text-4xl font-black font-mono my-1 ${metrics?.attackCount > 0 ? "text-red-400" : "text-slate-600"}`}>
            {metrics?.attackCount || 0}
          </span>
          <p className="text-[9px] text-slate-500 leading-relaxed">
            Replay denemeleri zaman damgasi dogrulamasi ile engellendi.
          </p>
        </div>

      </div>

      {/* Footer note */}
      <div className="p-4 border-t border-slate-800 bg-slate-900/50">
        <div className="flex gap-2 items-start text-blue-400/80">
          <Lock size={14} className="shrink-0 mt-0.5" />
          <p className="text-[9px] font-semibold leading-relaxed">
            <strong className="text-blue-400">SIFIR GÜVEN (ZERO TRUST)</strong><br/>
            Tüm uç noktalar ECDH/ECDSA ile doğrulanmış ve veri akışı AES-256-GCM ile şifrelenmiştir.
          </p>
        </div>
      </div>

    </div>
  );
}
