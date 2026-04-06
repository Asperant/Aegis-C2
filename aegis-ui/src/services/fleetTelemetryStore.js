import connection from './signalRService';
import { logger } from '../utils/logger';

const subscribers = new Set();

const MAX_PATH_POINTS = 1000;
const MAX_HISTORY_POINTS = 300;
const WATCHDOG_STALE_MS = 3000;
const FLUSH_INTERVAL_MS = 250;
const HISTORY_INTERVAL_MS = 2000;

let state = {
  drones: [],
  activeGks: [],
  networkHistory: []
};

let storeInitialized = false;
const pendingUpdates = new Map();

const notify = () => {
  subscribers.forEach((listener) => listener());
};

const updateState = (updater) => {
  const next = updater(state);
  if (!next || next === state) return;
  state = next;
  notify();
};

const parseTelemetryMessage = (message) => {
  if (typeof message === 'string') return JSON.parse(message);
  return message;
};

const sanitizeNumber = (value) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
};

const flushTelemetryUpdates = () => {
  if (pendingUpdates.size === 0) return;

  const updates = Array.from(pendingUpdates.values());
  pendingUpdates.clear();
  const now = Date.now();

  updateState((prev) => {
    const droneMap = new Map(prev.drones.map((drone) => [drone.id, drone]));

    updates.forEach((incomingDrone) => {
      if (!incomingDrone || typeof incomingDrone !== 'object' || !incomingDrone.id) return;

      const currentPos = [incomingDrone.lat, incomingDrone.lng];
      const oldDrone = droneMap.get(incomingDrone.id);

      if (oldDrone) {
        const updatedPath = [...(oldDrone.path || []), currentPos].slice(-MAX_PATH_POINTS);
        droneMap.set(incomingDrone.id, {
          ...oldDrone,
          ...incomingDrone,
          lastUpdate: now,
          isStale: false,
          path: updatedPath,
          active_gks: incomingDrone.active_gks || oldDrone.active_gks || 'GKS-?'
        });
        return;
      }

      droneMap.set(incomingDrone.id, {
        ...incomingDrone,
        lastUpdate: now,
        isStale: false,
        path: [currentPos],
        active_gks: incomingDrone.active_gks || 'GKS-?'
      });
    });

    return {
      ...prev,
      drones: Array.from(droneMap.values())
    };
  });
};

const markStaleDrones = () => {
  const now = Date.now();

  updateState((prev) => {
    let changed = false;

    const nextDrones = prev.drones.map((drone) => {
      if (!drone.isStale && now - drone.lastUpdate > WATCHDOG_STALE_MS) {
        changed = true;
        logger.warn(`Telemetry watchdog marked ${drone.id} as stale.`);
        return {
          ...drone,
          isStale: true,
          status: 'SİNYAL KAYBI',
          ping: '---',
          qos: '---'
        };
      }
      return drone;
    });

    if (!changed) return prev;
    return { ...prev, drones: nextDrones };
  });
};

const appendNetworkHistorySample = () => {
  const drones = state.drones;
  if (!Array.isArray(drones) || drones.length === 0) return;

  const avgPing = drones.reduce((sum, drone) => sum + sanitizeNumber(drone.ping), 0) / drones.length;
  const avgLoss = drones.reduce((sum, drone) => sum + sanitizeNumber(drone.qos), 0) / drones.length;
  const successRate = Math.max(0, 100 - avgLoss);

  const now = new Date();
  const timeLabel = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
  const sample = {
    time: timeLabel,
    ping: Math.round(avgPing),
    qos: Number(successRate.toFixed(1))
  };

  updateState((prev) => ({
    ...prev,
    networkHistory: [...prev.networkHistory, sample].slice(-MAX_HISTORY_POINTS)
  }));
};

const setupConnectionListeners = () => {
  const handleTelemetry = (message) => {
    try {
      const incomingDrone = parseTelemetryMessage(message);
      if (!incomingDrone || !incomingDrone.id) return;
      pendingUpdates.set(incomingDrone.id, incomingDrone);
    } catch (error) {
      logger.error('Telemetry parse error', error);
    }
  };

  const handleGksLocations = (message) => {
    try {
      const locations = typeof message === 'string' ? JSON.parse(message) : message;
      if (!Array.isArray(locations)) return;
      updateState((prev) => ({ ...prev, activeGks: locations }));
    } catch (error) {
      logger.error('GKS locations parse error', error);
    }
  };

  connection.on('ReceiveTelemetry', handleTelemetry);
  connection.on('ReceiveGksLocations', handleGksLocations);
};

export const primeFleetTelemetry = () => {
  if (storeInitialized) return;
  storeInitialized = true;

  setupConnectionListeners();
  setInterval(flushTelemetryUpdates, FLUSH_INTERVAL_MS);
  setInterval(markStaleDrones, 1000);
  setInterval(appendNetworkHistorySample, HISTORY_INTERVAL_MS);
};

export const subscribeFleetStore = (listener) => {
  subscribers.add(listener);
  return () => subscribers.delete(listener);
};

export const getFleetSnapshot = () => state;
