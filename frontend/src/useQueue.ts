import { useCallback, useEffect, useRef, useState } from "react";

import { api, socketUrl } from "@/src/api";
import { storage } from "@/src/utils/storage";
import { TOKEN_KEY } from "@/src/api";

export type QueueMe = {
  in_queue: boolean;
  my_token?: number;
  status?: string;
  now_serving?: number;
  people_ahead?: number;
  estimated_wait_mins?: number;
  doctor?: { name: string; specialization: string };
  doctor_status?: string;
  events?: { type: string; message: string; token_number: number | null; created_at: string }[];
};

export function useQueue(active = true) {
  const [data, setData] = useState<QueueMe | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const pollRef = useRef<any>(null);

  const refresh = useCallback(async () => {
    try { setData(await api.queueMe()); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    refresh();
    pollRef.current = setInterval(refresh, 8000);

    (async () => {
      const token = await storage.secureGet<string>(TOKEN_KEY, "");
      if (!token || cancelled) return;
      try {
        const ws = new WebSocket(socketUrl(token));
        wsRef.current = ws;
        ws.onopen = () => setConnected(true);
        ws.onclose = () => setConnected(false);
        ws.onerror = () => setConnected(false);
        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(ev.data);
            if (msg.event === "queue.updated" || msg.event === "notification.new") refresh();
          } catch { /* ignore */ }
        };
      } catch { /* ignore */ }
    })();

    return () => {
      cancelled = true;
      clearInterval(pollRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [active, refresh]);

  return { data, connected, refresh };
}
