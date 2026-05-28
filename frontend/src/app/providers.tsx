'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ── Theme ─────────────────────────────────────────────────────────────────────

type Theme = 'dark' | 'light';

const ThemeCtx = createContext<{ theme: Theme; setTheme: (t: Theme) => void; toggle: () => void }>({
  theme: 'dark', setTheme: () => {}, toggle: () => {},
});

export const useTheme = () => useContext(ThemeCtx);

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark');

  useEffect(() => {
    const stored = localStorage.getItem('wabot-theme') as Theme | null;
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initial: Theme = stored ?? (systemDark ? 'dark' : 'light');
    applyTheme(initial);
    setThemeState(initial);
  }, []);

  const applyTheme = (t: Theme) => {
    document.documentElement.classList.toggle('dark', t === 'dark');
  };

  const setTheme = (t: Theme) => {
    setThemeState(t);
    localStorage.setItem('wabot-theme', t);
    applyTheme(t);
  };

  return (
    <ThemeCtx.Provider value={{ theme, setTheme, toggle: () => setTheme(theme === 'dark' ? 'light' : 'dark') }}>
      {children}
    </ThemeCtx.Provider>
  );
}

// ── Root Provider ─────────────────────────────────────────────────────────────

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } });

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </ThemeProvider>
  );
}
