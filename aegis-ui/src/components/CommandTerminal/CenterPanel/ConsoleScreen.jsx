import { useState, useEffect, useRef } from 'react';
import { Terminal, Send, ArrowDown } from 'lucide-react';

export default function ConsoleScreen({ logs, executeTerminalCommand }) {
  const [input, setInput] = useState('');
  const bottomRef = useRef(null);
  const viewportRef = useRef(null);
  const previousLogCountRef = useRef(0);
  const [autoFollow, setAutoFollow] = useState(true);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [pendingLogs, setPendingLogs] = useState(0);

  const checkNearBottom = () => {
    const el = viewportRef.current;
    if (!el) return true;
    const distanceToBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
    return distanceToBottom < 48;
  };

  const scrollToBottom = (behavior = 'smooth') => {
    bottomRef.current?.scrollIntoView({ behavior, block: 'end' });
  };

  useEffect(() => {
    const appendedCount = Math.max(0, logs.length - previousLogCountRef.current);
    previousLogCountRef.current = logs.length;

    if (autoFollow) {
      scrollToBottom('auto');
      requestAnimationFrame(() => {
        setPendingLogs(0);
        setIsNearBottom(true);
      });
      return;
    }

    const nearBottom = checkNearBottom();
    requestAnimationFrame(() => {
      setIsNearBottom(nearBottom);
      if (!nearBottom && appendedCount > 0) {
        setPendingLogs(prev => prev + appendedCount);
      }
    });
  }, [logs, autoFollow]);

  const handleScroll = () => {
    const nearBottom = checkNearBottom();
    setIsNearBottom(nearBottom);

    // Disable auto-follow once the operator scrolls away from the bottom.
    if (!nearBottom && autoFollow) {
      setAutoFollow(false);
    }

    if (!nearBottom) {
      return;
    }

    if (nearBottom) {
      setPendingLogs(0);
    }
  };

  const handleJumpToBottom = () => {
    scrollToBottom('smooth');
    setAutoFollow(true);
    setPendingLogs(0);
    setIsNearBottom(true);
  };

  // Map log categories to visual styles.
  const getLogStyle = (type) => {
    switch (type) {
      case 'TELEMETRY': return 'text-slate-400';            // Standard stream
      case 'PACKET': return 'text-cyan-400 font-semibold';  // Packet-level events
      case 'CRYPTO': return 'text-fuchsia-400 font-bold';   // Cryptography events
      case 'SYSTEM': return 'text-emerald-400 font-bold';   // System status
      case 'MISSION': return 'text-indigo-300 font-bold';   // Mission lifecycle
      case 'HANDOVER': return 'text-teal-300 font-bold';    // Handover lifecycle
      case 'ALERT': return 'text-red-400 font-black';       // Errors and warnings
      case 'COMMAND': return 'text-amber-400 font-bold';    // Operator commands
      case 'BACKGROUND': return 'text-slate-500';           // Background/debug messages
      default: return 'text-slate-300';
    }
  };

  // Submit operator command input.
  const handleCommandSubmit = (e) => {
    e.preventDefault();
    if (input.trim()) {
      executeTerminalCommand(input);
      setInput(''); // Clear input after dispatch.
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-950 border-x border-slate-800 relative z-0">

      {/* Terminal header */}
      <div className="h-10 bg-slate-900 border-b border-slate-800 flex items-center px-4 justify-between select-none">
        <span className="text-slate-400 text-xs font-mono font-bold flex items-center gap-2 tracking-widest">
          <Terminal size={14} className="text-emerald-500" />
          AKTİF C2 TERMİNALİ
        </span>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
            autoFollow
              ? 'text-emerald-400 border-emerald-700 bg-emerald-950/30'
              : 'text-amber-300 border-amber-700 bg-amber-950/30'
          }`}>
            {autoFollow ? 'AKIŞ AÇIK' : 'AKIŞ DURDU'}
          </span>
          <span className="text-[10px] text-slate-500 font-mono bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
            {logs.length} LOG SATIRI
          </span>
        </div>
      </div>

      {/* Streaming log viewport */}
      <div
        ref={viewportRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 font-mono text-[13px] space-y-1 custom-scrollbar bg-black"
        style={{ textShadow: "0 0 5px rgba(16, 185, 129, 0.4)" }}
      >
        {logs.length === 0 ? (
          <div className="text-emerald-700 italic animate-pulse">Sistem baslatiliyor. Telemetri akisi bekleniyor..._</div>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="flex gap-3 hover:bg-emerald-900/20 px-1 rounded transition-colors group">

              {/* Timestamp */}
              <span className="text-emerald-800 shrink-0 group-hover:text-emerald-600">[{log.timestamp}]</span>

              {/* Source label */}
              <span className={`shrink-0 w-28 truncate ${log.source === 'GKS-KONYA' ? 'text-teal-400 font-bold' : 'text-emerald-500'}`}>
                [{log.source}]
              </span>

              {/* Log message */}
              <span className={`${getLogStyle(log.type)} break-all`}>
                {log.message}
              </span>
            </div>
          ))
        )}
        {/* Invisible anchor used for auto-scroll */}
        <div ref={bottomRef} />
      </div>

      {(!isNearBottom || pendingLogs > 0 || !autoFollow) && (
        <div className="absolute right-4 bottom-16 z-20 flex items-center gap-2">
          <button
            type="button"
            onClick={handleJumpToBottom}
            className="text-xs font-mono font-bold px-3 py-2 rounded border border-cyan-700 bg-cyan-950/40 text-cyan-300 hover:bg-cyan-900/60 transition-colors flex items-center gap-2"
          >
            <ArrowDown size={14} />
            Aşağı İn ve Akışı Aç{pendingLogs > 0 ? ` (${pendingLogs})` : ''}
          </button>
        </div>
      )}

      {/* Operator command input */}
      <form
        onSubmit={handleCommandSubmit}
        className="h-12 bg-black border-t border-emerald-900/50 flex items-center px-4 shadow-[0_-5px_15px_rgba(0,0,0,0.5)] z-10"
      >
        <span className="text-emerald-500 font-bold font-mono text-sm shrink-0 mr-2" style={{ textShadow: "0 0 8px rgba(16,185,129,0.6)" }}>
          root@aegis-c2:~#
        </span>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Komut bekliyor..."
          className="flex-1 bg-transparent border-none text-emerald-400 font-mono text-sm px-2 focus:outline-none placeholder-emerald-900 caret-emerald-500"
          autoComplete="off"
          spellCheck="false"
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="p-2 text-emerald-700 hover:text-emerald-400 focus:outline-none transition-colors"
        >
          <div className={`${input.trim() ? "animate-pulse" : ""}`}>
            <Send size={16} />
          </div>
        </button>
      </form>

    </div>
  );
}
