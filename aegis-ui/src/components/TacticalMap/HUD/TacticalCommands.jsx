import { Crosshair, Battery, Loader2, CheckCircle2, XCircle, ChevronUp, ChevronDown, ArrowUpToLine, ArrowDownToLine, RefreshCw, Infinity as InfinityIcon } from 'lucide-react';
import useTacticalCommand from '../../../hooks/useTacticalCommand';

export default function TacticalCommands({ selectedDrone, interactionMode, setInteractionMode, pendingManeuver, setPendingManeuver }) {
  // Shared tactical command state machine hook.
  const { commandStatus, activeCommand, sendCommand } = useTacticalCommand();

  // Lock controls when telemetry is stale or another command is in-flight.
  const isSystemLocked = selectedDrone?.isStale || commandStatus === 'PENDING';

  // Dynamic button renderer driven by command state.
  const renderButton = (commandId, defaultIcon, defaultLabel, baseColorClass) => {
    // Map-based target selection flow for advanced maneuvers.
    if (['ORBIT_TARGET', 'FIGURE_8'].includes(commandId)) {
      const isSelecting = interactionMode === 'SELECT_MANEUVER_TARGET' && pendingManeuver === commandId;
      let currentLabel = isSelecting ? 'HEDEF SEÇİN' : defaultLabel;
      let currentColorClass = isSelecting ? 'bg-amber-600 border-amber-400 text-white opacity-100 shadow-[0_0_15px_rgba(245,158,11,0.6)] animate-pulse' : baseColorClass;

      return (
        <button
          onClick={() => {
            if (isSelecting) {
              setInteractionMode('NONE');
              setPendingManeuver(null);
            } else {
              setInteractionMode('SELECT_MANEUVER_TARGET');
              setPendingManeuver(commandId);
            }
          }}
          disabled={isSystemLocked && !isSelecting}
          className={`py-2 px-3 rounded text-xs font-bold transition-all flex items-center justify-center gap-2 border shadow-sm ${currentColorClass}`}
        >
          {defaultIcon} <span className="truncate">{currentLabel}</span>
        </button>
      );
    }

    // Special handling for route drawing mode.
    if (commandId === 'SELECT_TARGET') {
      const isDrawing = interactionMode === 'DRAW_ROUTE';
      let currentLabel = isDrawing ? 'ROTAYI İPTAL ET' : defaultLabel;
      let currentColorClass = isDrawing ? 'bg-blue-600 border-blue-400 text-white shadow-[0_0_15px_rgba(59,130,246,0.5)]' : baseColorClass;

      return (
        <button
          onClick={() => setInteractionMode(isDrawing ? 'NONE' : 'DRAW_ROUTE')}
          disabled={isSystemLocked}
          className={`py-2 px-3 rounded text-xs font-bold transition-all flex items-center justify-center gap-2 border shadow-sm ${currentColorClass}`}
        >
          {defaultIcon} <span className="truncate">{currentLabel}</span>
        </button>
      );
    }

    const isThisCommandActive = activeCommand === commandId;

    // Default button appearance.
    let currentIcon = defaultIcon;
    let currentLabel = defaultLabel;
    let currentColorClass = baseColorClass;

    // Apply state-specific styling for active command button.
    if (isThisCommandActive) {
      if (commandStatus === 'PENDING') {
        currentIcon = <Loader2 size={14} className="animate-spin text-yellow-400" />;
        currentLabel = "EMİR İLETİLİYOR...";
        currentColorClass = "bg-yellow-900/60 border-yellow-600 text-yellow-200 cursor-wait";
      } else if (commandStatus === 'SUCCESS') {
        currentIcon = <CheckCircle2 size={14} className="text-emerald-400 animate-pulse" />;
        currentLabel = "ONAYLANDI";
        currentColorClass = "bg-emerald-900/60 border-emerald-500 text-emerald-200 cursor-default shadow-[0_0_10px_rgba(16,185,129,0.2)]";
      } else if (commandStatus === 'FAILED') {
        currentIcon = <XCircle size={14} className="text-red-400" />;
        currentLabel = "HATA";
        currentColorClass = "bg-red-900/80 border-red-500 text-red-200 cursor-not-allowed";
      }
    } else if (isSystemLocked) {
      // Dim inactive controls while command pipeline is locked.
      currentColorClass = "bg-slate-900 border-slate-800 text-slate-600 opacity-50 cursor-not-allowed grayscale";
    }

    return (
      <button
        onClick={() => sendCommand(selectedDrone.id, commandId)}
        // Disable when control plane is locked or this command is still resolving.
        disabled={isSystemLocked || (isThisCommandActive && commandStatus !== 'IDLE')}
        className={`py-2 px-3 rounded text-xs font-bold transition-all flex items-center justify-center gap-2 border shadow-sm ${currentColorClass}`}
      >
        {currentIcon} <span className="truncate">{currentLabel}</span>
      </button>
    );
  };

  return (
    <div className="mt-4 flex flex-col gap-2">
      <span className="text-slate-300 text-[11px] font-bold uppercase tracking-wider mb-1">
        Taktiksel Komutlar
      </span>

      {renderButton(
        'STOP',
        <XCircle size={14} className={isSystemLocked ? "" : "text-red-400"} />,
        'Görevi İptal Et (LOITER)',
        'bg-red-950 hover:bg-red-900 border-red-600 text-red-100 shadow-[0_0_15px_rgba(220,38,38,0.3)] animate-pulse'
      )}

      {renderButton(
        'SELECT_TARGET',
        <Crosshair size={14} />,
        'Haritadan Hedef Seç',
        'bg-blue-900/60 hover:bg-blue-800 border-blue-600 text-blue-200'
      )}

      {renderButton(
        'RTL',
        <Battery size={14} />,
        'Ana Üsse Dön (RTL)',
        'bg-red-900/60 hover:bg-red-800 border-red-600 text-red-200'
      )}

      {/* Advanced maneuver scenarios */}
      <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mt-2 mb-1 border-t border-slate-800 pt-2">
        İleri Düzey Manevralar (Sürüler)
      </span>

      <div className="grid grid-cols-1 gap-2">
        {renderButton('ORBIT_TARGET', <RefreshCw size={14} className="text-blue-300" />, 'Hedef Etrafında Yörüngeye Gir', 'bg-blue-900/40 hover:bg-blue-800/60 border-blue-600 text-blue-200')}
        {renderButton('FIGURE_8', <InfinityIcon size={14} className="text-purple-300" />, 'Gözetleme Modu (8 Çiz)', 'bg-purple-900/40 hover:bg-purple-800/60 border-purple-600 text-purple-200')}
      </div>

      {/* Speed and altitude overrides */}
      <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mt-2 mb-1 border-t border-slate-800 pt-2">
        Telemetri Kontrol (Overrides)
      </span>

      <div className="grid grid-cols-2 gap-2">
        {renderButton('SPEED_INC', <ChevronUp size={14} />, 'Hız Artır', 'bg-slate-800 hover:bg-slate-700 border-slate-600 text-slate-200')}
        {renderButton('SPEED_DEC', <ChevronDown size={14} />, 'Hız Düşür', 'bg-slate-800 hover:bg-slate-700 border-slate-600 text-slate-200')}

        {renderButton('ALT_INC', <ArrowUpToLine size={14} />, 'İrtifa Artır', 'bg-slate-800 hover:bg-slate-700 border-slate-600 text-slate-200')}
        {renderButton('ALT_DEC', <ArrowDownToLine size={14} />, 'İrtifa Düşür', 'bg-slate-800 hover:bg-slate-700 border-slate-600 text-slate-200')}
      </div>
    </div>
  );
}
