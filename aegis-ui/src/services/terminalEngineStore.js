import axios from 'axios';
import connection from './signalRService';
import { AEGIS_API_URL } from '../constants';

const MAX_LOG_COUNT = 1200;
const STORAGE_KEY = 'aegis_terminal_state_v1';
const INITIAL_BOOT_LOG_MESSAGE = 'Terminal engine initialized. Secure telemetry channel is active.';

const DEFAULT_FILTERS = Object.freeze({
  telemetry: true,
  packets: true,
  crypto: true,
  system: true,
  commands: true,
  mission: true,
  handover: true,
  background: false,
  targetId: 'ALL'
});

const DEFAULT_METRICS = Object.freeze({
  cpu: 0,
  ram: 0,
  fecCount: 0,
  attackCount: 0,
  cryptoStatus: 'Bekleniyor...'
});

const subscribers = new Set();
let persistTimer = null;
let engineInitialized = false;

const createLogEntry = (type, source, message, metadata = null) => {
  const uid = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : (Date.now().toString(36) + Math.random().toString(36).slice(2));

  return {
    id: uid,
    timestamp: new Date().toLocaleTimeString('tr-TR', { hour12: false }),
    type,
    source,
    message,
    metadata
  };
};

const sanitizeLoadedLogs = (candidate) => {
  if (!Array.isArray(candidate)) return null;
  return candidate
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      id: item.id || createLogEntry('SYSTEM', 'SİSTEM', '').id,
      timestamp: item.timestamp || new Date().toLocaleTimeString('tr-TR', { hour12: false }),
      type: item.type || 'SYSTEM',
      source: item.source || 'SİSTEM',
      message: item.message || '',
      metadata: item.metadata ?? null
    }))
    .slice(-MAX_LOG_COUNT);
};

const sanitizeLoadedFilters = (candidate) => {
  if (!candidate || typeof candidate !== 'object') return null;
  return {
    telemetry: Boolean(candidate.telemetry),
    packets: Boolean(candidate.packets),
    crypto: Boolean(candidate.crypto),
    system: Boolean(candidate.system),
    commands: Boolean(candidate.commands),
    mission: Boolean(candidate.mission),
    handover: Boolean(candidate.handover),
    background: Boolean(candidate.background),
    targetId: typeof candidate.targetId === 'string' && candidate.targetId.trim() !== ''
      ? candidate.targetId
      : 'ALL'
  };
};

const sanitizeLoadedMetrics = (candidate) => {
  if (!candidate || typeof candidate !== 'object') return null;
  return {
    cpu: Number.isFinite(candidate.cpu) ? candidate.cpu : 0,
    ram: Number.isFinite(candidate.ram) ? candidate.ram : 0,
    fecCount: Number.isFinite(candidate.fecCount) ? candidate.fecCount : 0,
    attackCount: Number.isFinite(candidate.attackCount) ? candidate.attackCount : 0,
    cryptoStatus: typeof candidate.cryptoStatus === 'string' && candidate.cryptoStatus.trim() !== ''
      ? candidate.cryptoStatus
      : DEFAULT_METRICS.cryptoStatus
  };
};

const loadInitialState = () => {
  if (typeof window === 'undefined') {
    return {
      logs: [createLogEntry('SYSTEM', 'GKS-KONYA', INITIAL_BOOT_LOG_MESSAGE)],
      activeDrones: [],
      filters: { ...DEFAULT_FILTERS },
      metrics: { ...DEFAULT_METRICS }
    };
  }

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        logs: [createLogEntry('SYSTEM', 'GKS-KONYA', INITIAL_BOOT_LOG_MESSAGE)],
        activeDrones: [],
        filters: { ...DEFAULT_FILTERS },
        metrics: { ...DEFAULT_METRICS }
      };
    }

    const parsed = JSON.parse(raw);
    const loadedLogs = sanitizeLoadedLogs(parsed.logs);
    const loadedFilters = sanitizeLoadedFilters(parsed.filters);
    const loadedMetrics = sanitizeLoadedMetrics(parsed.metrics);
    const loadedDrones = Array.isArray(parsed.activeDrones)
      ? parsed.activeDrones.filter((id) => typeof id === 'string' && id.trim() !== '')
      : [];

    const logs = loadedLogs && loadedLogs.length > 0
      ? loadedLogs
      : [createLogEntry('SYSTEM', 'GKS-KONYA', INITIAL_BOOT_LOG_MESSAGE)];

    return {
      logs,
      activeDrones: loadedDrones,
      filters: loadedFilters || { ...DEFAULT_FILTERS },
      metrics: loadedMetrics || { ...DEFAULT_METRICS }
    };
  } catch {
    return {
      logs: [createLogEntry('SYSTEM', 'GKS-KONYA', INITIAL_BOOT_LOG_MESSAGE)],
      activeDrones: [],
      filters: { ...DEFAULT_FILTERS },
      metrics: { ...DEFAULT_METRICS }
    };
  }
};

let state = loadInitialState();

const snapshot = () => state;

const schedulePersist = () => {
  if (typeof window === 'undefined') return;
  if (persistTimer) return;
  persistTimer = window.setTimeout(() => {
    persistTimer = null;
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        logs: state.logs,
        activeDrones: state.activeDrones,
        filters: state.filters,
        metrics: state.metrics
      }));
    } catch {
      // Ignore storage quota errors and continue without persistence.
    }
  }, 250);
};

const notify = () => {
  schedulePersist();
  subscribers.forEach((listener) => listener());
};

const updateState = (updater) => {
  const next = updater(state);
  if (!next || next === state) return;
  state = next;
  notify();
};

const addActiveDrone = (droneId) => {
  if (typeof droneId !== 'string' || droneId.trim() === '') return;
  updateState((prev) => {
    if (prev.activeDrones.includes(droneId)) return prev;
    return { ...prev, activeDrones: [...prev.activeDrones, droneId] };
  });
};

const addLog = (type, source, message, metadata = null) => {
  updateState((prev) => {
    const newLog = createLogEntry(type, source, message, metadata);
    return { ...prev, logs: [...prev.logs, newLog].slice(-MAX_LOG_COUNT) };
  });
};

const getLogTypeFromOpsEvent = (evt) => {
  const category = String(evt?.category || '').toUpperCase();
  const severity = String(evt?.severity || '').toUpperCase();

  if (severity === 'DEBUG' || severity === 'TRACE') return 'BACKGROUND';
  if (severity === 'ERROR' || severity === 'CRITICAL') return 'ALERT';

  switch (category) {
    case 'PACKET': return 'PACKET';
    case 'CRYPTO': return 'CRYPTO';
    case 'COMMAND': return 'COMMAND';
    case 'MISSION': return 'MISSION';
    case 'HANDOVER': return 'HANDOVER';
    case 'SECURITY': return 'ALERT';
    default: return 'SYSTEM';
  }
};

const getOpsEventSource = (evt) => {
  if (evt?.source && String(evt.source).trim() !== '') return String(evt.source);
  if (evt?.entityId && String(evt.entityId).trim() !== '') return String(evt.entityId);
  return 'SİSTEM';
};

const formatOpsEventMessage = (evt) => {
  const base = evt?.message || evt?.eventType || 'Operasyonel olay alındı.';
  const data = evt?.data || {};
  const details = [];
  const entityLabel = evt?.entityId && evt?.entityId !== evt?.source
    ? `[${evt.entityId}] `
    : '';

  if (data.commandType) details.push(`Komut: ${data.commandType}`);
  if (data.waypointCount !== undefined) details.push(`WP: ${data.waypointCount}`);
  if (data.targetIp) details.push(`Hedef: ${data.targetIp}`);
  if (data.targetGks) details.push(`GKS: ${data.targetGks}`);

  const body = details.length > 0 ? `${base} (${details.join(' | ')})` : base;
  return `${entityLabel}${body}`;
};

const setupConnectionListeners = () => {
  const lastLogTimes = new Map();
  const lastPacketEventTimes = new Map();

  const handleTelemetry = (data) => {
    let drone = null;
    try {
      drone = typeof data === 'string' ? JSON.parse(data) : data;
    } catch {
      addLog('ALERT', 'SİSTEM', 'Telemetri parse hatası alındı.');
      return;
    }

    if (!drone || typeof drone !== 'object' || !drone.id) return;

    const now = Date.now();
    const isNewDrone = !state.activeDrones.includes(drone.id);
    addActiveDrone(drone.id);

    if (isNewDrone) {
      addLog('SYSTEM', 'GKS-KONYA', `Yeni İHA tespit edildi: ${drone.id} sisteme kaydedildi.`);
    }

    const lastTime = lastLogTimes.get(drone.id) || 0;
    if (now - lastTime > 5000) {
      lastLogTimes.set(drone.id, now);
      addLog('TELEMETRY', drone.id, `Alt: ${drone.alt}m | Spd: ${drone.speed}km/h | Bat: %${drone.battery}`);
    }
  };

  const handleOpsEvent = (data) => {
    let evt = data;
    try {
      if (typeof data === 'string') {
        evt = JSON.parse(data);
      }
    } catch (error) {
      addLog('ALERT', 'SİSTEM', `Ops event parse hatası: ${error.message}`);
      return;
    }

    if (!evt || typeof evt !== 'object') return;

    const source = getOpsEventSource(evt);
    const type = getLogTypeFromOpsEvent(evt);
    const eventType = String(evt.eventType || '');

    if (source.startsWith('İHA-')) {
      addActiveDrone(source);
    }

    if (type === 'PACKET' && eventType === 'packet.telemetry.received') {
      const now = Date.now();
      const last = lastPacketEventTimes.get(source) || 0;
      if (now - last < 1000) return;
      lastPacketEventTimes.set(source, now);
    }

    addLog(type, source, formatOpsEventMessage(evt), evt);
  };

  const handleSystemHealth = (data) => {
    try {
      const health = typeof data === 'string' ? JSON.parse(data) : data;
      updateState((prev) => ({
        ...prev,
        metrics: {
          ...prev.metrics,
          cpu: health.Cpu || 0,
          ram: health.Ram || 0,
          fecCount: health.FecCount || prev.metrics.fecCount,
          attackCount: health.AttackCount || prev.metrics.attackCount,
          cryptoStatus: health.CryptoStatus || prev.metrics.cryptoStatus
        }
      }));
    } catch {
      addLog('ALERT', 'SİSTEM', 'Sistem sağlık verisi parse edilemedi.');
    }
  };

  const handleBackendLog = (type, source, message) => addLog(type, source, message);
  const handleCommandAck = (uavId, commandType) => addLog('SYSTEM', uavId, `Komut doğrulandı: ${commandType}`);
  const handleSystemAlert = (message) => addLog('ALERT', 'GKS-KONYA', message);

  connection.on('ReceiveTelemetry', handleTelemetry);
  connection.on('ReceiveSystemHealth', handleSystemHealth);
  connection.on('ReceiveLog', handleBackendLog);
  connection.on('ReceiveOpsEvent', handleOpsEvent);
  connection.on('CommandDispatched', handleCommandAck);
  connection.on('SystemAlert', handleSystemAlert);
};

const fetchEventHistory = async () => {
  try {
    const res = await axios.get(`${AEGIS_API_URL}/events/history`);
    const historyEvents = res.data;
    if (Array.isArray(historyEvents) && historyEvents.length > 0) {
      historyEvents.sort((a, b) => new Date(a.timestampUtc) - new Date(b.timestampUtc));
      
      let newLogs = [];
      historyEvents.forEach(evt => {
        const type = getLogTypeFromOpsEvent(evt);
        const source = getOpsEventSource(evt);
        const message = formatOpsEventMessage(evt);
        const timestamp = new Date(evt.timestampUtc).toLocaleTimeString('tr-TR', { hour12: false });
        
        if (source.startsWith('İHA-')) {
          addActiveDrone(source);
        }
        
        newLogs.push({
          id: evt.eventId || createLogEntry(type, source, message).id,
          timestamp,
          type,
          source,
          message,
          metadata: evt
        });
      });

      updateState((prev) => {
        const existingIds = new Set(prev.logs.map(l => l.id));
        const uniqueHistoryLogs = newLogs.filter(l => !existingIds.has(l.id));
        
        return { 
          ...prev, 
          logs: [...prev.logs, ...uniqueHistoryLogs].slice(-MAX_LOG_COUNT) 
        };
      });
    }
  } catch (err) {
    console.error("Geçmiş loglar çekilemedi:", err);
  }
};

export const primeTerminalEngine = () => {
  if (engineInitialized) return;
  engineInitialized = true;
  setupConnectionListeners();
  fetchEventHistory();
};

export const subscribeTerminalStore = (listener) => {
  subscribers.add(listener);
  return () => subscribers.delete(listener);
};

export const getTerminalSnapshot = () => snapshot();

export const toggleTerminalFilter = (key) => {
  updateState((prev) => ({
    ...prev,
    filters: { ...prev.filters, [key]: !prev.filters[key] }
  }));
};

export const setTerminalTargetFilter = (targetId) => {
  updateState((prev) => ({
    ...prev,
    filters: { ...prev.filters, targetId }
  }));
};

const sendTacticalWithFallback = async (uavId, commandType, lat = null, lng = null) => {
  try {
    await connection.invoke('SendTacticalCommand', uavId, commandType, lat, lng);
    return;
  } catch (signalRError) {
    addLog('ALERT', 'AĞ HATASI', `SignalR komutu iletilemedi, REST fallback deneniyor: ${signalRError.message}`);
  }

  await axios.post(`${AEGIS_API_URL}/tactical/command`, { uavId, commandType, lat, lng });
  addLog('SYSTEM', 'GKS-KONYA', `${uavId} için ${commandType} komutu REST fallback ile gönderildi.`);
};

export const executeTerminalCommand = async (rawCmd) => {
  if (!rawCmd || rawCmd.trim() === '') return;
  addLog('COMMAND', 'OPERATÖR', `> ${rawCmd}`);
  const args = rawCmd.trim().split(' ');
  const command = args[0].toLowerCase();

  try {
    if (command === '/clear') {
      updateState((prev) => ({ ...prev, logs: [] }));
      addLog('SYSTEM', 'GKS-KONYA', 'Terminal ekranı temizlendi.');
    } else if (command === '/rtl' && args[1]) {
      addLog('SYSTEM', 'GKS-KONYA', `${args[1]} için RTL emri şifreleniyor...`);
      await sendTacticalWithFallback(args[1], 'RTL');
    } else if (command === '/auto' && args[1]) {
      addLog('SYSTEM', 'GKS-KONYA', `${args[1]} devriye moduna geçiriliyor...`);
      await sendTacticalWithFallback(args[1], 'AUTO_PATROL');
    } else if (command === '/orbit' && args[1]) {
      addLog('SYSTEM', 'GKS-KONYA', `${args[1]} için Yörünge (Orbit) manevrası başlatılıyor...`);
      await sendTacticalWithFallback(args[1], 'ORBIT_TARGET');
    } else if (command === '/figure_8' && args[1]) {
      addLog('SYSTEM', 'GKS-KONYA', `${args[1]} için Gözetleme (Figure-8) manevrası başlatılıyor...`);
      await sendTacticalWithFallback(args[1], 'FIGURE_8');
    } else if (command === '/stop' && args[1]) {
      addLog('SYSTEM', 'GKS-KONYA', `${args[1]} havada sabitleniyor (Hover)...`);
      await sendTacticalWithFallback(args[1], 'STOP');
    } else {
      addLog('ALERT', 'SİSTEM', 'Geçerli Komutlar: /clear, /rtl <ID>, /auto <ID>, /orbit <ID>, /figure_8 <ID>, /stop <ID>');
    }
  } catch (error) {
    addLog('ALERT', 'AĞ HATASI', `İletilemedi: ${error.message}`);
  }
};
