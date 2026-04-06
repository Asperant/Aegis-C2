// Geographic and map-related constants
export const GEO_CONSTANTS = {
    BASE_LAT: 37.8728,
    BASE_LNG: 32.4922,
};

// SignalR connection states
export const CONNECTION_STATUS = {
    DISCONNECTED: 'DISCONNECTED',
    CONNECTING: 'CONNECTING',
    CONNECTED: 'CONNECTED',
    RECONNECTING: 'RECONNECTING',
    ERROR: 'ERROR'
};

const RUNTIME_API_URL = window.env?.VITE_API_URL || import.meta.env.VITE_API_URL || `${window.location.origin}/api`;
const RUNTIME_HUB_URL = window.env?.VITE_HUB_URL || import.meta.env.VITE_HUB_URL || `${window.location.origin}/telemetryHub`;

// API endpoints
export const API_ENDPOINTS = {
    LOGIN: `${RUNTIME_API_URL}/auth/login`
};

export const AEGIS_API_URL = RUNTIME_API_URL;
export const AEGIS_HUB_URL = RUNTIME_HUB_URL;
