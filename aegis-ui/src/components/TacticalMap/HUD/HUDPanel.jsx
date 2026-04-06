import { useState } from 'react';
import axios from 'axios';
import { Crosshair, Compass, Radio, Trash2, Loader2 } from 'lucide-react';
import CyberStatus from './CyberStatus';
import TacticalCommands from './TacticalCommands';
import { calculateDistance } from '../../../utils/geo';
import { AEGIS_API_URL } from '../../../constants';

export default function HUDPanel({ selectedDrone, setSelectedDrone, activeGks, interactionMode, setInteractionMode, pendingManeuver, setPendingManeuver }) {
  const assignedGks = selectedDrone ? activeGks?.find(gks => gks.id === selectedDrone.active_gks) : null;
  const range = selectedDrone && assignedGks
    ? calculateDistance(assignedGks.lat, assignedGks.lng, selectedDrone.lat, selectedDrone.lng)
    : null;
  const [deleteState, setDeleteState] = useState({ status: 'IDLE', message: '' });

  const handleDeleteUav = async () => {
    if (!selectedDrone || deleteState.status === 'PENDING') return;

    const confirmed = window.confirm(`${selectedDrone.id} yok edilsin mi? Bu işlem ilgili podu sonlandırır.`);
    if (!confirmed) return;

    setDeleteState({ status: 'PENDING', message: '' });
    try {
      await axios.delete(`${AEGIS_API_URL}/deployment/delete-uav/${encodeURIComponent(selectedDrone.id)}`);
      setDeleteState({ status: 'SUCCESS', message: `${selectedDrone.id} için yok etme emri gönderildi.` });
      setSelectedDrone?.(null);
    } catch (error) {
      const apiMessage = error?.response?.data?.message;
      setDeleteState({ status: 'FAILED', message: apiMessage || 'İHA silme emri gönderilemedi.' });
    }
  };

  return (
    <div className="w-80 border-l border-slate-800 bg-slate-900/50 flex flex-col z-10">
      <div className="p-3 border-b border-slate-700 bg-slate-900 font-bold text-slate-200 text-xs tracking-widest flex items-center justify-between">
        <span>HEDEF KİLİDİ (HUD)</span>
        {selectedDrone && !selectedDrone.isStale && <span className="animate-pulse text-red-500 font-black">REC</span>}
        {selectedDrone?.isStale && <span className="text-red-500 font-black animate-ping">KAYIP</span>}
      </div>

      {selectedDrone ? (
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">

          {/* UAV identity and battery card */}
          <div className={`p-3 rounded-lg border shadow-inner transition-colors ${selectedDrone.isStale ? 'bg-red-950/20 border-red-900' : 'bg-slate-950 border-slate-600'}`}>
            <h2 className={`text-xl font-black flex items-center gap-2 mb-2 ${selectedDrone.isStale ? 'text-red-500' : 'text-emerald-400'}`}>
              <Crosshair size={20} className={selectedDrone.isStale ? "" : "animate-spin-slow"} />
              {selectedDrone.id}
            </h2>
            <div className="w-full bg-slate-800 rounded-full h-1.5 mb-2">
              <div className={`h-1.5 rounded-full transition-all duration-500 ${selectedDrone.isStale ? 'bg-red-600' : (selectedDrone.battery > 20 ? 'bg-emerald-500' : 'bg-yellow-500 animate-pulse')}`} style={{ width: `${selectedDrone.battery}%` }}></div>
            </div>
            <div className="flex justify-between text-[11px] font-mono font-bold">
              <span className="text-slate-300">BATARYA: %{selectedDrone.battery}</span>
              <span className={selectedDrone.isStale ? 'text-red-400' : 'text-blue-300'}>{selectedDrone.status}</span>
            </div>
          </div>

          {/* Telemetry indicators (altitude, range, speed) */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-slate-900 p-2 rounded border border-slate-700 flex flex-col items-center justify-center">
              <span className="text-slate-400 text-[9px] font-bold uppercase tracking-wider">İrtifa</span>
              <strong className={`text-base font-mono ${selectedDrone.isStale ? 'text-slate-600 line-through' : 'text-white'}`}>
                {selectedDrone.alt}<span className="text-[10px] text-slate-500 ml-0.5">m</span>
              </strong>
            </div>
            <div className="bg-slate-900 p-2 rounded border border-slate-700 flex flex-col items-center justify-center shadow-[inset_0_0_10px_rgba(59,130,246,0.1)]">
              <span className="text-blue-400 text-[9px] font-bold uppercase tracking-wider">Menzil</span>
              <strong className={`text-base font-mono ${selectedDrone.isStale ? 'text-slate-600 line-through' : 'text-blue-300'}`}>
                {range === null ? '---' : Number(range).toFixed(2)}
                {range !== null && <span className="text-[10px] text-slate-500 ml-0.5">km</span>}
              </strong>
            </div>
            <div className="bg-slate-900 p-2 rounded border border-slate-700 flex flex-col items-center justify-center">
              <span className="text-slate-400 text-[9px] font-bold uppercase tracking-wider">Hız</span>
              <strong className={`text-base font-mono ${selectedDrone.isStale ? 'text-slate-600 line-through' : 'text-white'}`}>
                {selectedDrone.speed}<span className="text-[10px] text-slate-500 ml-0.5">kmh</span>
              </strong>
            </div>

            <div className="bg-slate-900 p-2 rounded border border-slate-700 flex flex-col col-span-3">
              <span className="text-slate-400 text-[10px] font-semibold uppercase tracking-wider mb-1 flex items-center gap-1">
                <Compass size={12} /> Son Bilinen Konum (GPS)
              </span>
              <strong className={`text-sm font-mono ${selectedDrone.isStale ? 'text-red-400' : 'text-slate-100'}`}>
                {selectedDrone.lat.toFixed(5)}N, {selectedDrone.lng.toFixed(5)}E
              </strong>
            </div>
          </div>

          <CyberStatus selectedDrone={selectedDrone} />
          <TacticalCommands 
            selectedDrone={selectedDrone} 
            interactionMode={interactionMode} 
            setInteractionMode={setInteractionMode}
            pendingManeuver={pendingManeuver}
            setPendingManeuver={setPendingManeuver}
          />

          {deleteState.status === 'FAILED' && (
            <div className="text-[11px] text-red-300 bg-red-950/40 border border-red-700 rounded p-2">
              {deleteState.message}
            </div>
          )}
          {deleteState.status === 'SUCCESS' && (
            <div className="text-[11px] text-emerald-300 bg-emerald-950/40 border border-emerald-700 rounded p-2">
              {deleteState.message}
            </div>
          )}

          <button
            onClick={handleDeleteUav}
            disabled={deleteState.status === 'PENDING'}
            className={`mt-auto w-full border p-3 rounded text-xs font-bold transition-all flex items-center justify-center gap-2 ${
              deleteState.status === 'PENDING'
                ? 'bg-red-950/50 border-red-700 text-red-200 cursor-wait'
                : 'bg-red-950 hover:bg-red-900 border-red-600 text-red-200'
            }`}
          >
            {deleteState.status === 'PENDING' ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
            {deleteState.status === 'PENDING' ? 'İHA YOK EDİLİYOR...' : 'SEÇİLİ İHA\'YI YOK ET'}
          </button>

        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-xs text-center border-2 border-dashed border-slate-700 rounded-lg m-4 p-6">
          <Radio size={36} className="mb-4 opacity-40 text-slate-300 animate-pulse" />
          <p className="font-semibold text-slate-300">Telemetri ve şifreleme detaylarını görüntülemek için menüden bir hava aracı seçin.</p>
        </div>
      )}
    </div>
  );
}
