import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, TerminalSquare, BarChart3, Radio, Activity, Wifi, WifiOff, LogOut } from 'lucide-react';
import TacticalMap from './pages/TacticalMap';
import CommandTerminal from './pages/CommandTerminal';
import Analytics from './pages/Analytics';
import Login from './pages/Login';
import connection, { startConnection } from './services/signalRService';
import { CONNECTION_STATUS } from './constants';
import { logger } from './utils/logger';
import { primeTerminalEngine } from './services/terminalEngineStore';
import { primeFleetTelemetry } from './services/fleetTelemetryStore';

// Route guard for authenticated pages.
const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem('aegis_token');
  const location = useLocation();

  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return children;
};

const MainLayout = ({ time, connStatus, handleLogout, formatTime }) => {
  const location = useLocation();
  const path = location.pathname;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Global header */}
      <header className="h-16 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between px-6 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <Radio className="text-emerald-500 animate-pulse" size={24} />
          <span className="font-black text-xl tracking-widest">
            AEGIS <span className="text-emerald-500">C2</span>
          </span>
        </div>

        <nav className="flex gap-2 bg-slate-950 p-1 rounded-lg border border-slate-800">
          <Link to="/" className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all text-sm font-medium ${path === '/' ? 'bg-slate-800 text-white' : 'hover:bg-slate-800/50 text-slate-400'}`}>
            <LayoutDashboard size={16} /> Harita
          </Link>
          <Link to="/terminal" className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all text-sm font-medium ${path === '/terminal' ? 'bg-slate-800 text-white' : 'hover:bg-slate-800/50 text-slate-400'}`}>
            <TerminalSquare size={16} /> Terminal
          </Link>
          <Link to="/analytics" className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all text-sm font-medium ${path === '/analytics' ? 'bg-slate-800 text-white' : 'hover:bg-slate-800/50 text-slate-400'}`}>
            <BarChart3 size={16} /> Analiz
          </Link>
        </nav>

        <div className="flex items-center gap-4">
          <span className="text-xs font-bold text-slate-500 tracking-widest">v2.0.0-BETA</span>
          <button onClick={handleLogout} className="text-red-400 hover:text-red-300 transition-colors bg-red-950/30 p-2 rounded-md border border-red-900/50">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-hidden relative">
        <Routes>
          <Route path="/" element={<TacticalMap isActive />} />
          <Route path="/terminal" element={<CommandTerminal />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* Dynamic status footer */}
      <footer className="h-8 border-t border-slate-700 bg-slate-950 flex items-center justify-between px-4 text-[11px] text-slate-200 font-mono z-50">
        <div className="flex items-center gap-3 flex-1">
          {connStatus === CONNECTION_STATUS.CONNECTED && (
            <span className="text-emerald-400 font-bold flex items-center gap-1.5 bg-emerald-950/30 px-2 py-0.5 rounded border border-emerald-900/50">
              <Wifi size={11} /> GKS DATALINK AKTİF
            </span>
          )}
          {connStatus === CONNECTION_STATUS.RECONNECTING && (
            <span className="text-yellow-400 font-bold flex items-center gap-1.5 bg-yellow-950/30 px-2 py-0.5 rounded border border-yellow-900/50 animate-pulse">
              <Activity size={11} /> DATALINK YENİDEN KURULUYOR...
            </span>
          )}
          {connStatus === CONNECTION_STATUS.DISCONNECTED && (
            <span className="text-red-500 font-bold flex items-center gap-1.5 bg-red-950/30 px-2 py-0.5 rounded border border-red-900/50">
              <WifiOff size={11} /> DATALINK BAĞLANTISI KESİLDİ
            </span>
          )}
          {connStatus === CONNECTION_STATUS.CONNECTING && (
            <span className="text-slate-400 font-bold flex items-center gap-1.5">
              <Activity size={11} className="animate-spin" /> BAĞLANILIYOR...
            </span>
          )}
          <span className="text-slate-600">|</span>
          <span className="text-slate-500">AEGIS C2 v2.0</span>
        </div>

        <div className="flex items-center gap-4 font-semibold flex-1 justify-center">
          <span className="text-slate-400">37.8728°N  32.4922°E</span>
          <span className="text-cyan-500 font-bold tracking-wider text-[10px]">GKS-01 KONYA</span>
        </div>

        <div className="flex items-center justify-end gap-3 flex-1">
          <span className="text-slate-500 text-[10px]">UTC+3</span>
          <span className="text-white bg-slate-800 px-2.5 py-0.5 rounded border border-slate-600 font-bold tracking-widest">
            {formatTime(time)}
          </span>
        </div>
      </footer>
    </div>
  );
};

export default function App() {
  const [time, setTime] = useState(new Date());
  const [connStatus, setConnStatus] = useState(CONNECTION_STATUS.CONNECTING);

  useEffect(() => {
    primeTerminalEngine();
    primeFleetTelemetry();

    const updateConnectionState = () => {
      if (connection.state === "Connected") {
        setConnStatus(CONNECTION_STATUS.CONNECTED);
      } else if (connection.state === "Reconnecting") {
        setConnStatus(CONNECTION_STATUS.RECONNECTING);
      } else {
        setConnStatus(CONNECTION_STATUS.DISCONNECTED);
      }
    };

    updateConnectionState();

    const onReconnecting = () => setConnStatus(CONNECTION_STATUS.RECONNECTING);
    const onReconnected = () => setConnStatus(CONNECTION_STATUS.CONNECTED);
    const onClose = () => {
      setConnStatus(CONNECTION_STATUS.DISCONNECTED);
      logger.warn('GKS connection closed. Reconnecting shortly.');
      setTimeout(() => {
        setConnStatus(CONNECTION_STATUS.CONNECTING);
        startConnection().then(updateConnectionState).catch(updateConnectionState);
      }, 3000);
    };

    connection.onreconnecting(onReconnecting);
    connection.onreconnected(onReconnected);
    connection.onclose(onClose);

    if (connection.state === "Disconnected") {
      startConnection().then(updateConnectionState).catch(updateConnectionState);
    }

    const timer = setInterval(() => setTime(new Date()), 1000);

    return () => {
      clearInterval(timer);
      connection.off("reconnecting", onReconnecting);
      connection.off("reconnected", onReconnected);
      connection.off("close", onClose);
    };
  }, []);

  const formatTime = (date) => {
    return date.toLocaleTimeString('tr-TR', { hour12: false }) + " (LOCAL)";
  };

  const handleLogout = () => {
    localStorage.removeItem('aegis_token');
    window.location.href = '/login';
  };

  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />

        {/* Protected application routes */}
        <Route path="/*" element={
          <ProtectedRoute>
            <MainLayout 
              time={time} 
              connStatus={connStatus} 
              handleLogout={handleLogout} 
              formatTime={formatTime} 
            />
          </ProtectedRoute>
        } />
      </Routes>
    </Router>
  );
}
