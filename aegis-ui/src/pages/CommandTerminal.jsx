import useTerminalEngine from '../hooks/useTerminalEngine';
import TerminalFilters from '../components/CommandTerminal/LeftPanel/TerminalFilters';
import ConsoleScreen from '../components/CommandTerminal/CenterPanel/ConsoleScreen';
import NodeHealthMonitor from '../components/CommandTerminal/RightPanel/NodeHealthMonitor';

export default function CommandTerminal() {
  const { 
    logs, 
    filters, 
    toggleFilter, 
    setTargetFilter, 
    executeTerminalCommand,
    activeDrones,
    metrics
  } = useTerminalEngine();

  return (
    <div className="flex h-[calc(100vh-96px)] w-full bg-slate-950 text-slate-200">
      
      <TerminalFilters 
        filters={filters} 
        toggleFilter={toggleFilter} 
        setTargetFilter={setTargetFilter} 
        activeDrones={activeDrones}
        logs={logs}
      />

      <ConsoleScreen 
        logs={logs} 
        executeTerminalCommand={executeTerminalCommand} 
      />

      {/* Right panel metrics */}
      <NodeHealthMonitor metrics={metrics} /> 

    </div>
  );
}
