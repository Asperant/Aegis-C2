import * as signalR from '@microsoft/signalr';
import { logger } from '../utils/logger';

// SignalR hub URL from environment (.env or runtime-injected window.env in Kubernetes)
const HUB_URL = window.env?.VITE_HUB_URL || import.meta.env.VITE_HUB_URL || 'http://localhost:5247/telemetryHub';

// Build a shared connection instance for the UI.
const connection = new signalR.HubConnectionBuilder()
    .withUrl(HUB_URL, {
        accessTokenFactory: () => localStorage.getItem('aegis_token') // Bearer token source
    })
    .withAutomaticReconnect() // Retry on transient disconnects
    .configureLogging(signalR.LogLevel.Information)
    .build();

// Start SignalR connection with retry logic.
export const startConnection = async () => {
    try {
        if (connection.state === signalR.HubConnectionState.Disconnected) {
            await connection.start();
            logger.info('[AEGIS UI] SignalR connection established.');
        }
    } catch (err) {
        logger.error('[AEGIS UI] SignalR connection failed:', err);
        // Retry after a short delay.
        setTimeout(startConnection, 5000);
    }
};

export default connection;
