import { PlusCircle, Navigation, Send } from 'lucide-react';
import axios from 'axios';
import { AEGIS_API_URL } from '../../constants';
import { logger } from '../../utils/logger';

export default function FleetC2Toolbar({ interactionMode, setInteractionMode, stagedWaypoints, setStagedWaypoints, selectedDrone }) {

    const dispatchMission = async () => {
        if (!selectedDrone || stagedWaypoints.length === 0) return;
        try {
            await axios.post(`${AEGIS_API_URL}/tactical/mission`, {
                uavId: selectedDrone.id,
                waypoints: stagedWaypoints.map(wp => ({ lat: wp.lat, lng: wp.lng }))
            });
            setStagedWaypoints([]);
            setInteractionMode('NONE');
        } catch (err) {
            logger.error("Görev gönderilemedi", err);
        }
    };

    return (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-[1000] flex gap-2">
            <div className="bg-slate-900/90 border border-slate-700 p-1.5 rounded-lg shadow-xl backdrop-blur-md flex gap-2 items-center">

                <button
                    onClick={() => setInteractionMode(interactionMode === 'SPAWN_UAV' ? 'NONE' : 'SPAWN_UAV')}
                    className={`px-4 py-2 rounded text-xs font-bold transition-all flex items-center gap-2 ${interactionMode === 'SPAWN_UAV' ? 'bg-emerald-600 text-white shadow-[0_0_15px_rgba(16,185,129,0.5)]' : 'bg-slate-800 hover:bg-slate-700 text-emerald-400'}`}
                >
                    <PlusCircle size={16} /> YILDIRIM (SPAWN) İHA
                </button>

                <button
                    onClick={() => setInteractionMode(interactionMode === 'SPAWN_GKS' ? 'NONE' : 'SPAWN_GKS')}
                    className={`px-4 py-2 rounded text-xs font-bold transition-all flex items-center gap-2 ${interactionMode === 'SPAWN_GKS' ? 'bg-blue-600 text-white shadow-[0_0_15px_rgba(59,130,246,0.5)]' : 'bg-slate-800 hover:bg-slate-700 text-blue-400'}`}
                >
                    <Navigation size={16} /> BÖLGESEL GKS KUR
                </button>

            </div>

            {interactionMode === 'DRAW_ROUTE' && stagedWaypoints.length > 0 && (
                <div className="bg-emerald-900/90 border border-emerald-500 p-1.5 rounded-lg shadow-xl backdrop-blur-md flex items-center">
                    <button
                        onClick={dispatchMission}
                        className="px-4 py-2 rounded text-xs font-bold transition-all flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white"
                    >
                        <Send size={16} /> ROTAYI HEDEFE İLET ({stagedWaypoints.length} WP)
                    </button>
                </div>
            )}
        </div>
    );
}
