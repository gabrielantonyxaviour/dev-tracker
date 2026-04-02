"use client";

import { useEffect, useRef, useCallback } from "react";

interface LiveEvent {
  type: string;
  data: unknown;
}

export function useLiveUpdates(onEvent: (event: LiveEvent) => void) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    const es = new EventSource("/api/stream");

    es.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as LiveEvent;
        onEventRef.current(parsed);
      } catch {
        // Ignore malformed messages
      }
    };

    es.onerror = () => {
      es.close();
      // Reconnect after 5 seconds
      reconnectTimeout.current = setTimeout(() => {
        connect();
      }, 5000);
    };

    return es;
  }, []);

  useEffect(() => {
    const es = connect();

    return () => {
      es.close();
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
    };
  }, [connect]);
}
