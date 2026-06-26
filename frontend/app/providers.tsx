"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState } from "react";
import { SileoToaster } from "@/components/ui/Toast";
import { RealtimeSyncProvider } from "@/components/providers/RealtimeSyncProvider";
import { GoalCelebrationProvider } from "@/components/providers/GoalCelebrationProvider";
import { HelpProvider } from "@/components/providers/HelpProvider";
import { PaymentFlowProvider } from "@/components/providers/PaymentFlowProvider";
import { ToastDevPanel } from "@/components/dev/ToastDevPanel";
import "sileo/styles.css";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        retry: false,
      },
    },
  }));

  const showDevtools = process.env.NODE_ENV === "development";

  return (
    <QueryClientProvider client={queryClient}>
      <HelpProvider>
        <RealtimeSyncProvider>
          <GoalCelebrationProvider>
            <PaymentFlowProvider>
              {children}
              <SileoToaster />
              <ToastDevPanel />
            </PaymentFlowProvider>
          </GoalCelebrationProvider>
        </RealtimeSyncProvider>
      </HelpProvider>
      {showDevtools && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
