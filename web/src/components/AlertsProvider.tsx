import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import { Toaster, toast } from "sonner";
import { API_URL, USE_MOCKS } from "@/lib/api";
import { mockFindings } from "@/mocks";
import { MODULE_LABEL } from "@/lib/utils";
import type { AlertPayload } from "@/types";

interface AlertsContextValue {
  newCount: number;
  resetCount: () => void;
  simulateAlert: () => void;
  mockMode: boolean;
}

const AlertsContext = createContext<AlertsContextValue | null>(null);

export function useAlerts(): AlertsContextValue {
  const ctx = useContext(AlertsContext);
  if (!ctx) throw new Error("AlertsProvider missing");
  return ctx;
}

export function AlertsProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [newCount, setNewCount] = useState(0);
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  const handleAlert = useCallback(
    (alert: AlertPayload) => {
      setNewCount((n) => n + 1);
      void queryClient.invalidateQueries({ queryKey: ["findings"] });
      void queryClient.invalidateQueries({ queryKey: ["summary"] });
      void queryClient.invalidateQueries({ queryKey: ["trend"] });
      toast.error(`Wysokie ryzyko · ${MODULE_LABEL[alert.module]}`, {
        description: alert.title ?? alert.label,
        duration: 10000,
        action: { label: "Zobacz", onClick: () => navigateRef.current(`/findings/${alert.findingId}`) },
      });
    },
    [queryClient],
  );

  useEffect(() => {
    if (USE_MOCKS) return;
    const socket = io(API_URL, { transports: ["websocket"] });
    socket.on("alert:new", handleAlert);
    socket.on("finding:updated", (payload: { id?: number }) => {
      void queryClient.invalidateQueries({ queryKey: ["findings"] });
      if (payload?.id) void queryClient.invalidateQueries({ queryKey: ["finding", payload.id] });
    });
    socket.on("crawl:status", () => {
      void queryClient.invalidateQueries({ queryKey: ["sources"] });
    });
    return () => {
      socket.disconnect();
    };
  }, [handleAlert, queryClient]);

  const value = useMemo<AlertsContextValue>(
    () => ({
      newCount,
      resetCount: () => setNewCount(0),
      mockMode: USE_MOCKS,
      simulateAlert: () => {
        const high = mockFindings.filter((f) => f.riskLevel === "high");
        const f = high[Math.floor(Math.random() * high.length)];
        handleAlert({
          findingId: f.id,
          documentId: f.documentId,
          module: f.module,
          score: f.score,
          riskLevel: "high",
          label: f.label,
          title: f.document.title,
          url: f.document.url,
          firm: f.firm ? { id: f.firm.id, name: f.firm.name } : null,
          createdAt: new Date().toISOString(),
        });
      },
    }),
    [newCount, handleAlert],
  );

  return (
    <AlertsContext.Provider value={value}>
      {children}
      <Toaster position="top-right" richColors closeButton />
    </AlertsContext.Provider>
  );
}
