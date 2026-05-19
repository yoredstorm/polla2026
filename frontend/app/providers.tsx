"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState } from "react";
import { ToastContainer } from "@/components/ui/Toast";
import { RealtimeSyncProvider } from "@/components/RealtimeSyncProvider";
import { HelpProvider } from "@/components/help/HelpProvider";

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
          {children}
          <ToastContainer />
        </RealtimeSyncProvider>
      </HelpProvider>
      {showDevtools && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
