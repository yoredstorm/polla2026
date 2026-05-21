"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/ui/Toast";
import {
  connectNotificationsWs,
  disconnectNotificationsWs,
  setNotificationWsCallbacks,
} from "@/lib/notificationsWs";
import { registerServiceWorker } from "@/lib/pushNotifications";
import { PushNotificationPrompt } from "@/components/notifications/PushNotificationPrompt";

const RealtimeContext = createContext({ wsConnected: false });

export function useRealtimeSync() {
  return useContext(RealtimeContext);
}

export function RealtimeSyncProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast((s) => s.add);
  const [wsConnected, setWsConnected] = useState(false);
  const toastRef = useRef(toast);
  toastRef.current = toast;

  useEffect(() => {
    if (!user) {
      setWsConnected(false);
      return;
    }
    void registerServiceWorker();
    setNotificationWsCallbacks({
      onConnected: () => setWsConnected(true),
      onDisconnected: () => setWsConnected(false),
      onStale: () => setWsConnected(false),
    });
    const disconnect = connectNotificationsWs(qc, (msg, type) => toastRef.current(msg, type));
    return () => {
      disconnect();
      setNotificationWsCallbacks({});
      setWsConnected(false);
    };
  }, [user, qc]);

  return (
    <RealtimeContext.Provider value={{ wsConnected }}>
      {children}
      <PushNotificationPrompt />
    </RealtimeContext.Provider>
  );
}
