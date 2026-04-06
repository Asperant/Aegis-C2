import { useState, useEffect, useCallback } from 'react';
import connection from '../services/signalRService';

export default function useTacticalCommand() {
  // commandStatus values: IDLE, PENDING, SUCCESS, FAILED
  const [commandStatus, setCommandStatus] = useState('IDLE');
  const [activeCommand, setActiveCommand] = useState(null); // Currently active command button

  useEffect(() => {
    // Listen for command acknowledgement emitted by the backend hub.
    const handleCommandAck = () => {
      setCommandStatus('SUCCESS');
      
      // Keep success state visible briefly before returning to idle.
      setTimeout(() => {
        setCommandStatus('IDLE');
        setActiveCommand(null);
      }, 3000);
    };

    // Backend event name: CommandDispatched
    connection.on("CommandDispatched", handleCommandAck);

    return () => {
      connection.off("CommandDispatched", handleCommandAck);
    };
  }, []);

  // Send a tactical command through SignalR.
  const sendCommand = useCallback(async (uavId, commandType, lat = null, lng = null) => {
    if (!uavId) return;
    
    try {
      // Lock command UI while dispatch is in progress.
      setCommandStatus('PENDING');
      setActiveCommand(commandType);
      
      // Invoke backend hub method.
      await connection.invoke("SendTacticalCommand", uavId, commandType, lat, lng);
      
      // Fail-safe timeout: if no ACK is received, mark as failed.
      setTimeout(() => {
        setCommandStatus((currentStatus) => {
          if (currentStatus === 'PENDING') {
            return 'FAILED';
          }
          return currentStatus;
        });
        
        // Keep error state visible briefly, then unlock UI.
        setTimeout(() => {
           setCommandStatus((status) => status === 'FAILED' ? 'IDLE' : status);
        }, 3000);

      }, 5000);

    } catch {
      setCommandStatus('FAILED');
      
      setTimeout(() => {
        setCommandStatus('IDLE');
        setActiveCommand(null);
      }, 3000);
    }
  }, []);

  // Expose command state and sender callback to components.
  return { commandStatus, activeCommand, sendCommand };
}
