import { useMemo } from 'react';
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Activity, Battery, ShieldAlert, Zap, ShieldCheck, Crosshair } from 'lucide-react';
import useFleetTelemetry from '../hooks/useFleetTelemetry';
import useTerminalEngine from '../hooks/useTerminalEngine';
import { calculateDistance } from '../utils/geo';

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900 border border-slate-700 p-3 rounded shadow-xl z-50">
        <p className="text-slate-300 font-bold mb-1">{label}</p>
        {payload.map((entry, index) => (
          <p key={index} style={{ color: entry.color || entry.fill || '#10b981' }} className="text-sm font-mono">
            {entry.name}: {entry.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export default function Analytics() {
  const { drones, activeGks, networkHistory } = useFleetTelemetry();
  const { metrics } = useTerminalEngine();

  const activeDronesCount = drones?.length || 0;
  const currentAvgPing = networkHistory.length > 0 ? networkHistory[networkHistory.length - 1].ping : 0;
  const currentAvgQos = networkHistory.length > 0 ? networkHistory[networkHistory.length - 1].qos : 0;

  const activeGksMap = useMemo(() => {
    const map = new Map();
    (activeGks || []).forEach(gks => map.set(gks.id, gks));
    return map;
  }, [activeGks]);

  const kineticData = drones?.map(d => {
    const assignedGks = activeGksMap.get(d.active_gks);
    const range = assignedGks
      ? Number(calculateDistance(assignedGks.lat, assignedGks.lng, d.lat, d.lng)) || 0
      : 0;

    return {
      name: d.id,
      batarya: d.battery || 0,
      menzil: range
    };
  }) || [];

  // Display only real, non-zero security event counters.
  const securityData = [
    { name: 'Engellenen Saldırı (Replay)', value: metrics?.attackCount || 0, color: '#ef4444' },
    { name: 'FEC Kurtarması (Onarılan)', value: metrics?.fecCount || 0, color: '#a855f7' }
  ].filter(item => item.value > 0); // Include only non-zero categories.

  const totalThreats = (metrics?.attackCount || 0) + (metrics?.fecCount || 0);

  return (
    <div className="h-[calc(100vh-96px)] w-full bg-slate-950 text-slate-200 p-6 overflow-y-auto custom-scrollbar">

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-xl flex items-center gap-4">
          <div className="p-3 bg-blue-900/30 text-blue-400 rounded-lg"><Crosshair size={24} /></div>
          <div>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Aktif Fİlo</p>
            <h3 className="text-2xl font-mono font-bold text-slate-200">{activeDronesCount} <span className="text-sm text-slate-500">Hedef</span></h3>
          </div>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-xl flex items-center gap-4">
          <div className="p-3 bg-emerald-900/30 text-emerald-400 rounded-lg"><Activity size={24} /></div>
          <div>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Ağ Sağlığı (QoS)</p>
            <h3 className={`text-2xl font-mono font-bold ${currentAvgQos < 95 ? 'text-yellow-500' : 'text-emerald-400'}`}>
              %{currentAvgQos}
            </h3>
          </div>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-xl flex items-center gap-4">
          <div className="p-3 bg-yellow-900/30 text-yellow-500 rounded-lg"><Zap size={24} /></div>
          <div>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Ortalama Gecikme</p>
            <h3 className={`text-2xl font-mono font-bold ${currentAvgPing > 100 ? 'text-red-400' : 'text-yellow-400'}`}>
              {currentAvgPing} <span className="text-sm text-slate-500">ms</span>
            </h3>
          </div>
        </div>
        <div className="bg-slate-900/50 border border-red-900/50 p-4 rounded-xl flex items-center gap-4">
          <div className="p-3 bg-red-900/30 text-red-500 rounded-lg"><ShieldAlert size={24} /></div>
          <div>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Püskürtülen Tehdit</p>
            <h3 className="text-2xl font-mono font-bold text-red-400">{metrics?.attackCount || 0} <span className="text-sm text-slate-500">Saldırı</span></h3>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">

        {/* Chart 1: Network quality */}
        <div className="col-span-2 bg-slate-900/50 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-300 tracking-widest flex items-center gap-2">
              <Activity size={16} className="text-emerald-500" /> SİNYAL KALİTESİ (QoS) ve GECİKME
            </h3>
            <span className="text-xs text-slate-500 bg-slate-950 px-2 py-1 rounded border border-slate-800 flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Canlı Akış
            </span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={networkHistory}>
                <defs>
                  <linearGradient id="colorQos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorPing" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#eab308" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#eab308" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="time" stroke="#64748b" fontSize={10} tickMargin={10} />
                <YAxis yAxisId="left" stroke="#eab308" fontSize={11} orientation="left" domain={[0, 'dataMax + 50']} />
                <YAxis yAxisId="right" stroke="#10b981" fontSize={11} orientation="right" domain={[0, 100]} />
                <Tooltip content={<CustomTooltip />} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />

                <Area yAxisId="right" type="monotone" dataKey="qos" name="Kalite (QoS %)" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorQos)" isAnimationActive={false} />
                <Area yAxisId="left" type="monotone" dataKey="ping" name="Gecikme (Ping ms)" stroke="#eab308" strokeWidth={2} fillOpacity={1} fill="url(#colorPing)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Security events */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 flex flex-col relative">
          <h3 className="text-sm font-bold text-slate-300 tracking-widest flex items-center gap-2 mb-4">
            <ShieldAlert size={16} className="text-blue-500" /> GUVENLIK OLAYLARI
          </h3>
          <div className="flex-1 relative flex flex-col items-center justify-center">

            {/* Render radar state when no events exist, otherwise show pie chart. */}
            {totalThreats === 0 ? (
              <div className="flex flex-col items-center justify-center h-full w-full opacity-80">
                <div className="relative flex items-center justify-center mb-4">
                  <div className="absolute w-24 h-24 rounded-full border border-emerald-500/30 animate-ping"></div>
                  <div className="absolute w-16 h-16 rounded-full border border-emerald-500/50 animate-pulse"></div>
                  <ShieldCheck size={40} className="text-emerald-500 z-10" />
                </div>
                <span className="text-emerald-500 font-bold tracking-widest text-xs">AĞ TRAFİĞİ TEMİZ</span>
                <span className="text-slate-500 text-[10px] mt-1">Siber anomali tespit edilmedi.</span>
              </div>
            ) : (
              <>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-4">
                  <span className="text-3xl font-black text-slate-200 font-mono">{totalThreats}</span>
                  <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-1">Guvenlik Olayi</span>
                </div>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={securityData} cx="50%" cy="50%" innerRadius={65} outerRadius={85} paddingAngle={5} dataKey="value" stroke="none">
                      {securityData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                    <Legend iconType="diamond" wrapperStyle={{ fontSize: '11px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </>
            )}

          </div>
        </div>

        {/* Chart 3: Battery and range profile */}
        <div className="col-span-3 bg-slate-900/50 border border-slate-800 rounded-xl p-5">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-bold text-slate-300 tracking-widest flex items-center gap-2">
              <Battery size={16} className="text-blue-500" /> KİNETİK RİSK VE MENZİL PROFİLİ (BINGO)
            </h3>
            <span className="text-xs text-slate-500">Menzili uzak ancak bataryası düşük ({"<"}%20) olan hedefler kırmızı yanar.</span>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={kineticData} barSize={30}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickMargin={10} />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip content={<CustomTooltip />} />

                {/* Keep explicit legend payload and bar colors for consistent rendering. */}
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} payload={[
                  { value: 'Bağlı GKS Uzaklık (km)', type: 'rect', color: '#3b82f6' },
                  { value: 'Kalan Batarya (%)', type: 'rect', color: '#10b981' }
                ]} />

                <Bar dataKey="menzil" name="Bağlı GKS Uzaklık (km)" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="batarya" name="Kalan Batarya (%)" fill="#10b981" radius={[4, 4, 0, 0]}>
                  {kineticData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.batarya < 20 ? '#ef4444' : '#10b981'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
    </div>
  );
}
