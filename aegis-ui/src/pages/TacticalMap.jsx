import { useMemo, useState } from 'react';


import FleetSidebar from '../components/TacticalMap/FleetPanel';
import MapDisplay from '../components/TacticalMap/MapDisplay';
import HUDPanel from '../components/TacticalMap/HUD/HUDPanel';
import GksPanel from '../components/TacticalMap/HUD/GksPanel';
import FleetC2Toolbar from '../components/TacticalMap/FleetC2Toolbar';
import useFleetTelemetry from '../hooks/useFleetTelemetry';

export default function TacticalMap({ isActive = true }) {
  const { drones, activeGks } = useFleetTelemetry();
  const [selectedDroneId, setSelectedDroneId] = useState(null);
  const [selectedGks, setSelectedGks] = useState(null);

  const [interactionMode, setInteractionMode] = useState('NONE');
  const [stagedWaypoints, setStagedWaypoints] = useState([]);
  const [pendingManeuver, setPendingManeuver] = useState(null);

  const selectedDrone = useMemo(
    () => drones.find(d => d.id === selectedDroneId) ?? null,
    [drones, selectedDroneId]
  );

  const handleSelectDrone = (droneOrNull) => {
    setSelectedDroneId(droneOrNull?.id ?? null);
    if (droneOrNull) {
      setSelectedGks(null);
    }
  };

  return (
    <div className="flex h-[calc(100vh-96px)] w-full">

      {/* Left fleet panel */}
      <FleetSidebar
        drones={drones}
        selectedDrone={selectedDrone}
        setSelectedDrone={handleSelectDrone}
      />

      {/* Map workspace */}
      <div className="flex-1 flex flex-col relative">
        <FleetC2Toolbar
          interactionMode={interactionMode} setInteractionMode={setInteractionMode}
          stagedWaypoints={stagedWaypoints} setStagedWaypoints={setStagedWaypoints}
          selectedDrone={selectedDrone}
        />
        <MapDisplay
          drones={drones} activeGks={activeGks} selectedDrone={selectedDrone} setSelectedDrone={handleSelectDrone}
          setSelectedGks={setSelectedGks}
          interactionMode={interactionMode} setInteractionMode={setInteractionMode}
          stagedWaypoints={stagedWaypoints} setStagedWaypoints={setStagedWaypoints}
          pendingManeuver={pendingManeuver} setPendingManeuver={setPendingManeuver}
          isActive={isActive}
        />
      </div>

      {/* Show GKS panel when a station is selected; otherwise show UAV HUD */}
      {selectedGks ? (
        <GksPanel 
          selectedGks={selectedGks} 
          setSelectedGks={setSelectedGks} 
          drones={drones} 
          activeGks={activeGks}
        />
      ) : (
        <HUDPanel 
          key={selectedDrone?.id ?? 'none'}
          selectedDrone={selectedDrone} 
          setSelectedDrone={handleSelectDrone}
          activeGks={activeGks}
          interactionMode={interactionMode} 
          setInteractionMode={setInteractionMode} 
          pendingManeuver={pendingManeuver}
          setPendingManeuver={setPendingManeuver}
        />
      )}

    </div>
  );
}
