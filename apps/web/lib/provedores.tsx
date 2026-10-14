'use client';
import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { ErroApi } from './api';

export function Provedores({ children }: { children: ReactNode }) {
  const [qc] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        // erro de permissão ou de dado não melhora tentando de novo
        retry: (n, e) => !(e instanceof ErroApi && e.status < 500) && n < 2,
        refetchOnWindowFocus: false,
      },
    },
  }));
  return (
    <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem storageKey="gt-tema">
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </ThemeProvider>
  );
}
