import { useState, useEffect } from 'react';
import { Server, Radio, Trash2, Crosshair, Zap, AlertTriangle, Activity } from 'lucide-react';
import axios from 'axios';
import { AEGIS_API_URL } from '../../../constants';

export default function GksPanel({ selectedGks, setSelectedGks, drones, activeGks }) {
  const [pingMs, setPingMs] = useState(null);
  const [isPinging, setIsPinging] = useState(false);
  const [localRadius, setLocalRadius] = useState(50.0);
  const [isEvacuating, setIsEvacuating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [feedback, setFeedback] = useState({ tone: 'info', text: '' });

  useEffect(() => {
    if (selectedGks) {
      setLocalRadius(selectedGks.radius || 50.0);
      setPingMs(null); // Reset ping when switching panels
      setFeedback({ tone: 'info', text: '' });
    }
  }, [selectedGks]);

  if (!selectedGks) return null;

  // Find drones connected to this GKS
  const connectedDrones = drones.filter(d => d.active_gks === selectedGks.id);

  const handlePing = () => {
    setIsPinging(true);
    axios.post(`${AEGIS_API_URL}/deployment/gks-ping/${selectedGks.id}`)
      .then(res => setPingMs(res.data.latency))
      .catch(() => {
        setFeedback({ tone: 'error', text: 'Ping sorgusu sırasında hata oluştu.' });
        setPingMs(-1); // -1 indicates error
      })
      .finally(() => setIsPinging(false));
  };

  const handleEvacuate = async () => {
    if (connectedDrones.length === 0) {
      setFeedback({ tone: 'warn', text: 'Bu istasyona bağlı İHA bulunmuyor.' });
      return;
    }
    
    // Find another active GKS
    const otherGksList = activeGks.filter(g => g.id !== selectedGks.id);
    if (otherGksList.length === 0) {
      setFeedback({ tone: 'warn', text: 'Tahliye için başka aktif GKS bulunamadı.' });
      return;
    }

    if (window.confirm(`${selectedGks.id} istasyonundaki TÜM İHA'lar (${connectedDrones.length} adet) acil tahliye edilecek. Onaylıyor musunuz?`)) {
      setIsEvacuating(true);
      
      // Randomly distribute drones or just send them all to the first available one
      const targetGks = otherGksList[0];
      
      const promises = connectedDrones.map(drone => 
        axios.post(`${AEGIS_API_URL}/tactical/command`, {
          uavId: drone.id,
          commandType: "HANDOVER",
          targetIp: targetGks.host || targetGks.id.toLowerCase()
        })
      );

      try {
        await Promise.all(promises);
        setFeedback({ tone: 'success', text: `${connectedDrones.length} İHA ${targetGks.id} istasyonuna yönlendirildi.` });
      } catch {
        setFeedback({ tone: 'error', text: 'Tahliye sırasında bazı komutlar başarısız oldu.' });
      } finally {
        setIsEvacuating(false);
      }
    }
  };

  const handleRadiusChange = (e) => {
    const newRad = parseFloat(e.target.value);
    setLocalRadius(newRad);
    
    // Update API (debounce could be used, but onMouseUp/onBlur is safer. We'll just call it immediately for simplicity over local network)
    axios.put(`${AEGIS_API_URL}/deployment/gks-radius/${selectedGks.id}`, { radius: newRad })
      .catch(() => setFeedback({ tone: 'error', text: 'Menzil güncellemesi başarısız oldu.' }));
  };

  const handleDelete = async () => {
    if (isDeleting) return;
    if (!window.confirm(`${selectedGks.id} istasyonunu KALICI OLARAK silmek istediğinize emin misiniz?`)) return;

    setIsDeleting(true);
    try {
      await axios.delete(`${AEGIS_API_URL}/deployment/delete-gks/${selectedGks.id}`);
      setFeedback({ tone: 'success', text: `${selectedGks.id} silme emri gönderildi.` });
      setSelectedGks(null);
    } catch {
      setFeedback({ tone: 'error', text: 'GKS silme emri gönderilemedi.' });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="w-80 border-l border-slate-800 bg-slate-900/50 flex flex-col z-10">
      <div className="p-3 border-b border-slate-700 bg-slate-900 font-bold text-slate-200 text-xs tracking-widest flex items-center justify-between">
        <span>GKS DETAYLARI</span>
        <button onClick={() => setSelectedGks(null)} className="text-slate-500 hover:text-slate-300">✕</button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        
        {/* GKS INFO CARD */}
        <div className="p-3 rounded-lg border shadow-inner bg-slate-950 border-blue-900">
          <h2 className="text-xl font-black flex items-center gap-2 mb-2 text-blue-400">
            <Server size={20} />
            {selectedGks.id.toUpperCase()}
          </h2>
          <div className="flex justify-between text-[11px] font-mono font-bold">
            <span className="text-slate-300">DURUM: AKTİF</span>
            <span className="text-emerald-400">YAYINDA</span>
          </div>
        </div>

        {/* LOCATION & RANGE */}
        <div className="bg-slate-900 p-2 rounded border border-slate-700 flex flex-col col-span-3">
          <span className="text-slate-400 text-[10px] font-semibold uppercase tracking-wider mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1"><Radio size={12} /> Kapsama Alanı Şemsiyesi</span>
            <strong className="text-blue-400">{localRadius.toFixed(1)} km</strong>
          </span>
          <input 
            type="range" 
            min="10" 
            max="150" 
            step="1" 
            value={localRadius} 
            onChange={handleRadiusChange}
            className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer mb-2 accent-blue-500"
          />
          <span className="text-slate-500 text-[10px] mt-1 font-mono text-center border-t border-slate-800 pt-1">
            {selectedGks.lat.toFixed(5)}N, {selectedGks.lng.toFixed(5)}E
          </span>
        </div>

        {/* CONNECTED DRONES */}
        <div className="mt-2">
          <h3 className="text-xs font-bold text-slate-400 mb-2 uppercase flex items-center gap-2">
            <Crosshair size={14} /> Bağlı İHA'lar ({connectedDrones.length})
          </h3>
          {connectedDrones.length === 0 ? (
            <div className="text-slate-500 text-xs italic p-2 border border-slate-800 rounded text-center">
              Bu istasyona bağlı İHA bulunmamaktadır.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {connectedDrones.map(drone => (
                <div key={drone.id} className={`p-2 rounded border text-xs font-mono font-bold flex justify-between ${drone.isStale ? 'bg-red-950/20 border-red-900 text-red-500' : 'bg-slate-800 border-slate-700 text-emerald-400'}`}>
                  <span>{drone.id}</span>
                  <span>{drone.isStale ? 'KAYIP' : 'AKTİF'}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-auto flex flex-col gap-2">
          {feedback.text && (
            <div className={`text-[11px] rounded border px-2 py-2 ${
              feedback.tone === 'success'
                ? 'bg-emerald-950/30 border-emerald-700 text-emerald-300'
                : feedback.tone === 'warn'
                  ? 'bg-amber-950/30 border-amber-700 text-amber-300'
                  : 'bg-red-950/30 border-red-700 text-red-300'
            }`}>
              {feedback.text}
            </div>
          )}
          
          <button 
            onClick={handleEvacuate}
            disabled={isEvacuating}
            className="w-full bg-orange-950/60 hover:bg-orange-900 border border-orange-700 p-2.5 rounded text-[11px] font-bold transition-all text-orange-400 flex items-center justify-center gap-2"
          >
            {isEvacuating ? (
              <span className="animate-pulse flex items-center gap-2"><Activity size={14} /> TAHLİYE EDİLİYOR...</span>
            ) : (
              <><AlertTriangle size={14} /> TÜM FİLOYU TAHLİYE ET</>
            )}
          </button>

          <button 
            onClick={handlePing}
            disabled={isPinging}
            className="w-full bg-blue-950/60 hover:bg-blue-900 border border-blue-800 p-2 rounded text-[11px] font-bold transition-all text-blue-300 flex items-center justify-center gap-2"
          >
            {isPinging ? (
              <span className="animate-pulse flex items-center gap-2"><Activity size={14} /> SINANIYOR...</span>
            ) : (
              <><Zap size={14} /> 
                {pingMs === null ? 'BAĞLANTIYI SINA (PING)' : 
                 pingMs === -1 ? 'BAĞLANTI HATASI' : 
                 `GECİKME: ${pingMs} ms`}
              </>
            )}
          </button>

          <button 
            onClick={handleDelete}
            disabled={isDeleting}
            className="w-full bg-red-950/80 hover:bg-red-900 border border-red-900 p-3 rounded text-[11px] tracking-wider font-extrabold transition-all text-red-400 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isDeleting ? (
              <><Activity size={16} className="animate-spin" /> SİLİNİYOR...</>
            ) : (
              <><Trash2 size={16} /> İSTASYONU YIK / İPTAL ET</>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
