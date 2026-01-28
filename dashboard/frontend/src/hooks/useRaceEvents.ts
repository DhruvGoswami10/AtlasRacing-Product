import { useState, useEffect, useRef } from 'react';
import { RaceEvent } from '../types/telemetry';

const EVENTS_ENDPOINT = 'http://localhost:8080/events';
const MAX_RETRIES = 5;
const BASE_BACKOFF_MS = 2000;
const MAX_BACKOFF_MS = 10000;

export const useRaceEvents = () => {
  const [events, setEvents] = useState<RaceEvent[]>([]);
  const eventIdCounterRef = useRef(0);
  const retryRef = useRef(0);
  const sourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const connectingRef = useRef(false);

  useEffect(() => {
    return () => {
      connectingRef.current = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (sourceRef.current) {
        sourceRef.current.close();
        sourceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const connect = () => {
      if (connectingRef.current) {
        return;
      }
      if (retryRef.current >= MAX_RETRIES) {
        console.warn('[RaceEvents] Max retries reached, giving up on SSE stream');
        return;
      }

      connectingRef.current = true;

      if (sourceRef.current) {
        sourceRef.current.close();
        sourceRef.current = null;
      }

      try {
        const source = new EventSource(EVENTS_ENDPOINT);
        sourceRef.current = source;

        source.onopen = () => {
          console.log('[RaceEvents] SSE connected');
          retryRef.current = 0;
          connectingRef.current = false;
        };

        source.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'race_event') {
              const raceEvent: RaceEvent = {
                id: `${Date.now()}-${++eventIdCounterRef.current}`,
                type: data.eventCode,
                message: formatEventMessage(data.eventCode, data),
                timestamp: data.timestamp || Date.now(),
                severity: getEventSeverity(data.eventCode),
                data,
              };
              setEvents((prev) => [raceEvent, ...prev.slice(0, 19)]);
            }
          } catch (error) {
            console.error('[RaceEvents] Failed to parse event payload', error);
          }
        };

        source.onerror = () => {
          console.warn('[RaceEvents] SSE connection error, scheduling reconnect');
          connectingRef.current = false;

          if (sourceRef.current) {
            sourceRef.current.close();
            sourceRef.current = null;
          }

          retryRef.current += 1;
          const backoff = Math.min(
            BASE_BACKOFF_MS * Math.pow(2, retryRef.current - 1),
            MAX_BACKOFF_MS,
          );

          if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
          }

          reconnectTimerRef.current = setTimeout(() => {
            reconnectTimerRef.current = null;
            connect();
          }, backoff);
        };
      } catch (error) {
        console.error('[RaceEvents] Failed to open SSE stream', error);
        connectingRef.current = false;
        retryRef.current += 1;

        if (retryRef.current < MAX_RETRIES) {
          reconnectTimerRef.current = setTimeout(() => {
            reconnectTimerRef.current = null;
            connect();
          }, BASE_BACKOFF_MS);
        }
      }
    };

    connect();
  }, []);

  return events;
};

const formatEventMessage = (eventCode: string, eventData?: any): string => {
  switch (eventCode) {
    case 'FTLP': {
      if (eventData?.driverName) {
        const timeStr = eventData.formattedTime || `${eventData.lapTime}s`;
        return `${eventData.driverName} set new fastest lap (${timeStr})`;
      }
      return 'New fastest lap set';
    }
    case 'RTMT': {
      if (eventData?.driverName) {
        return `${eventData.driverName} retired`;
      }
      return 'Car retirement';
    }
    case 'PENA': {
      if (eventData?.driverName) {
        return `${eventData.driverName} received penalty (${eventData.time}s)`;
      }
      return 'Penalty applied';
    }
    case 'OVTK': {
      if (eventData?.overtakingDriver && eventData?.beingOvertakenDriver) {
        return `${eventData.overtakingDriver} overtook ${eventData.beingOvertakenDriver}`;
      }
      return 'Overtake detected';
    }
    case 'SSTA': return 'Session started';
    case 'STLG': return 'Start lights sequence';
    case 'LGOT': return 'Lights out!';
    case 'DRSE': return 'DRS enabled by race control';
    case 'DRSD': return 'DRS disabled by race control';
    case 'CHQF': return 'Chequered flag';
    case 'RDFL': return 'Red flag shown';
    case 'DTSV': return 'Drive through penalty served';
    case 'SGSV': return 'Stop go penalty served';
    case 'FLBK': return 'Flashback activated';
    case 'SCAR': return 'Safety car event';
    case 'COLL': {
      if (eventData?.vehicle1Name && eventData?.vehicle2Name) {
        return `${eventData.vehicle1Name} collided with ${eventData.vehicle2Name}`;
      }
      return 'Collision detected';
    }
    case 'TMPT': return 'Team mate in pits';
    case 'RCWN': {
      if (eventData?.winner && eventData?.p2 && eventData?.p3) {
        let message = `🏆 Top 3: 1️⃣${eventData.winner} 2️⃣${eventData.p2} 3️⃣${eventData.p3}`;
        if (eventData.playerPosition && eventData.playerName && eventData.playerPosition > 3) {
          message += ` | You: P${eventData.playerPosition} ${eventData.playerName}`;
        }
        return message;
      } else if (eventData?.winner) {
        return `🏆 Race winner: ${eventData.winner}`;
      }
      return 'Race finished';
    }
    case 'YFLAG': return 'Yellow flags deployed';
    case 'YFEND': return 'Yellow flags cleared';
    case 'SCFULL': return 'Full safety car deployed';
    case 'SCVIR': return 'Virtual safety car deployed';
    case 'SCEND': return 'Safety car period ended';
    case 'SCFORM': return 'Formation lap safety car';
    case 'SEND': return 'Session ended';
    case 'DSQ': {
      if (eventData?.driverName) {
        return `${eventData.driverName} disqualified`;
      }
      return 'Driver disqualified';
    }
    case 'DNF': {
      if (eventData?.driverName) {
        return `${eventData.driverName} did not finish`;
      }
      return 'Driver did not finish';
    }
    default: return `Race event: ${eventCode}`;
  }
};

const getEventSeverity = (eventCode: string): 'info' | 'warning' | 'critical' => {
  switch (eventCode) {
    case 'RTMT':
    case 'PENA':
    case 'DSQ':
    case 'DNF':
    case 'RDFL':
    case 'COLL':
      return 'critical';
    case 'OVTK':
    case 'DRSE':
    case 'DRSD':
    case 'YFLAG':
    case 'SCFULL':
    case 'SCVIR':
    case 'SCAR':
      return 'warning';
    case 'YFEND':
    case 'SCEND':
    case 'SSTA':
    case 'SEND':
    case 'STLG':
    case 'LGOT':
    case 'CHQF':
    case 'RCWN':
    case 'DTSV':
    case 'SGSV':
    case 'FLBK':
    case 'TMPT':
      return 'info';
    default:
      return 'info';
  }
};
