import { useSyncExternalStore } from 'react';
import {
  primeFleetTelemetry,
  subscribeFleetStore,
  getFleetSnapshot
} from '../services/fleetTelemetryStore';

export default function useFleetTelemetry() {
  primeFleetTelemetry();

  const snapshot = useSyncExternalStore(
    subscribeFleetStore,
    getFleetSnapshot,
    getFleetSnapshot
  );

  return {
    drones: snapshot.drones,
    activeGks: snapshot.activeGks,
    networkHistory: snapshot.networkHistory
  };
}
