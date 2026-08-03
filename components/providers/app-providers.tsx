"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";

import { ApiRequestError } from "@/lib/api/client";

export function AppProviders({ children }: { children: ReactNode }) {
  // Created in state, not at module scope: a module-level client would be
  // shared across requests during SSR and leak one user's cache into another.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry(failureCount, error) {
              // Retrying a validation error or a 404 just repeats the failure;
              // only transient problems are worth a second attempt.
              if (error instanceof ApiRequestError && error.status < 500) {
                return false;
              }
              return failureCount < 2;
            },
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {/* Dark by default rather than following the system: the brand is a lit
          mark on near-black, and that is the design the app is drawn for.
          Light remains a properly-tuned option behind the toggle. */}
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        enableSystem
        disableTransitionOnChange
      >
        {children}
        <Toaster richColors closeButton position="top-center" />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
