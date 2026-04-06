import { useMemo, useSyncExternalStore } from 'react';
import {
  primeTerminalEngine,
  subscribeTerminalStore,
  getTerminalSnapshot,
  toggleTerminalFilter,
  setTerminalTargetFilter,
  executeTerminalCommand
} from '../services/terminalEngineStore';

const isTargetMatched = (log, targetId) => {
  if (targetId === 'ALL') return true;

  const metadata = log.metadata || {};
  const metaEntityId = metadata.entityId || metadata.entityID || metadata.target || null;
  const metaUavId = metadata.data?.uavId || metadata.data?.target || null;
  const bySource = log.source === targetId;
  const byEntity = metaEntityId === targetId || metaUavId === targetId;
  const bySystem = log.source === 'GKS-KONYA' || log.source === 'OPERATÖR';

  return bySource || byEntity || bySystem;
};

const isTypeEnabled = (log, filters) => {
  if (!filters.telemetry && log.type === 'TELEMETRY') return false;
  if (!filters.packets && log.type === 'PACKET') return false;
  if (!filters.crypto && log.type === 'CRYPTO') return false;
  if (!filters.system && (log.type === 'SYSTEM' || log.type === 'ALERT')) return false;
  if (!filters.commands && log.type === 'COMMAND') return false;
  if (!filters.mission && log.type === 'MISSION') return false;
  if (!filters.handover && log.type === 'HANDOVER') return false;
  if (!filters.background && log.type === 'BACKGROUND') return false;
  return true;
};

export default function useTerminalEngine() {
  primeTerminalEngine();

  const snapshot = useSyncExternalStore(
    subscribeTerminalStore,
    getTerminalSnapshot,
    getTerminalSnapshot
  );

  const filteredLogs = useMemo(() => {
    const targetId = snapshot.filters.targetId;
    return snapshot.logs.filter((log) => {
      if (!isTargetMatched(log, targetId)) return false;
      return isTypeEnabled(log, snapshot.filters);
    });
  }, [snapshot.logs, snapshot.filters]);

  return {
    logs: filteredLogs,
    filters: snapshot.filters,
    toggleFilter: toggleTerminalFilter,
    setTargetFilter: setTerminalTargetFilter,
    executeTerminalCommand,
    activeDrones: snapshot.activeDrones,
    metrics: snapshot.metrics
  };
}
