import { Filter, ShieldAlert, Radio, TerminalSquare, Key, Target, Package, GitMerge, Bug } from 'lucide-react';

export default function TerminalFilters({ filters, toggleFilter, setTargetFilter, activeDrones, logs = [] }) {
  const handleExportLogs = () => {
    const lines = logs.map((log) => `[${log.timestamp}] [${log.source}] (${log.type}) ${log.message}`);
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    anchor.href = url;
    anchor.download = `aegis-terminal-${stamp}.log`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };
  
  // Reusable filter toggle renderer
  const renderFilterToggle = (key, label, IconComponent, colorClass) => {
    const isActive = filters[key];
    const [borderClass = '', textClass = 'text-slate-300'] = colorClass.split(' ');
    const dotClass = textClass.replace('text-', 'bg-');
    const tintClass = `${dotClass}/20`;
    
    return (
      <div 
        onClick={() => toggleFilter(key)}
        className={`flex items-center gap-3 p-2 rounded cursor-pointer transition-all border ${isActive ? `bg-slate-900 ${colorClass}` : 'bg-slate-950/50 border-slate-800 text-slate-600 grayscale opacity-70 hover:opacity-100'}`}
      >
        <div className={`w-4 h-4 rounded border flex items-center justify-center ${isActive ? `${borderClass} ${tintClass}` : 'border-slate-700'}`}>
          {isActive && <div className={`w-2 h-2 rounded-sm ${dotClass}`} />}
        </div>
        <IconComponent size={14} className={isActive ? '' : 'text-slate-500'} />
        <span className="text-xs font-bold tracking-wide select-none">{label}</span>
      </div>
    );
  };

  return (
    <div className="w-64 bg-slate-950/80 border-r border-slate-800 flex flex-col z-10">
      
      {/* Header */}
      <div className="h-10 bg-slate-900 border-b border-slate-800 flex items-center px-4">
        <span className="text-slate-400 text-xs font-mono font-bold flex items-center gap-2 tracking-widest uppercase">
          <Filter size={14} className="text-blue-400" />
          Siber Filtreler
        </span>
      </div>

      <div className="p-4 flex flex-col gap-6">
        
        {/* 1) Target selection */}
        <div className="flex flex-col gap-2">
          <span className="text-[10px] text-slate-500 font-black tracking-widest uppercase flex items-center gap-1">
            <Target size={12} /> İzlenen Hedef
          </span>
          <div className="relative">
            <select 
              value={filters.targetId}
              onChange={(e) => setTargetFilter(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-xs font-bold p-2 rounded appearance-none outline-none focus:border-blue-500 cursor-pointer"
            >
              <option value="ALL">TÜM FİLO VE SİSTEM</option>
              {activeDrones && activeDrones.map(id => (
                <option key={id} value={id}>Sadece {id}</option>
              ))}
            </select>
            <div className="absolute right-2 top-1/2 transform -translate-y-1/2 pointer-events-none text-slate-500">
              ▼
            </div>
          </div>
        </div>

        {/* 2) Log type filters */}
        <div className="flex flex-col gap-2">
          <span className="text-[10px] text-slate-500 font-black tracking-widest uppercase mb-1">
            Log Görünümü
          </span>
          
          {renderFilterToggle(
            'telemetry', 
            'Telemetri Akışı', 
            Radio, 
            'border-slate-600 text-slate-300'
          )}

          {renderFilterToggle(
            'packets',
            'Paket Olayları',
            Package,
            'border-cyan-800 text-cyan-400'
          )}
          
          {renderFilterToggle(
            'crypto', 
            'Şifre Rotasyonları', 
            Key, 
            'border-fuchsia-800 text-fuchsia-400'
          )}
          
          {renderFilterToggle(
            'system', 
            'Sistem & Uyarılar', 
            ShieldAlert, 
            'border-red-800 text-red-400'
          )}
          
          {renderFilterToggle(
            'commands', 
            'C2 Komutları', 
            TerminalSquare, 
            'border-amber-700 text-amber-400'
          )}

          {renderFilterToggle(
            'mission',
            'Görev Akışı',
            Target,
            'border-indigo-700 text-indigo-400'
          )}

          {renderFilterToggle(
            'handover',
            'Handover Olayları',
            GitMerge,
            'border-teal-700 text-teal-400'
          )}

          {renderFilterToggle(
            'background',
            'Arkaplan (DEBUG)',
            Bug,
            'border-slate-700 text-slate-400'
          )}

        </div>
      </div>

      {/* Footer actions */}
      <div className="mt-auto p-4 border-t border-slate-800/50">
        <button 
          onClick={handleExportLogs}
          className="w-full py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded text-[10px] font-bold text-slate-400 transition-colors"
        >
          LOGLARI DIŞA AKTAR (.LOG)
        </button>
      </div>

    </div>
  );
}
