'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ── Theme ─────────────────────────────────────────────────────────────────────

export type Theme = 'dark' | 'light' | 'system';

const ThemeCtx = createContext<{
  theme: Theme;
  resolvedTheme: 'dark' | 'light';
  setTheme: (t: Theme) => void;
  toggle: () => void;
}>({ theme: 'dark', resolvedTheme: 'dark', setTheme: () => {}, toggle: () => {} });

export const useTheme = () => useContext(ThemeCtx);

function applyTheme(t: Theme) {
  const isDark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', isDark);
  return isDark ? 'dark' : 'light';
}

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system');
  const [resolvedTheme, setResolvedTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const stored = (localStorage.getItem('wabot-theme') as Theme) ?? 'system';
    const resolved = applyTheme(stored) as 'dark' | 'light';
    setThemeState(stored);
    setResolvedTheme(resolved);

    // Watch system preference changes
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (stored === 'system') {
        const r = applyTheme('system') as 'dark' | 'light';
        setResolvedTheme(r);
      }
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    localStorage.setItem('wabot-theme', t);
    const resolved = applyTheme(t) as 'dark' | 'light';
    setResolvedTheme(resolved);
  };

  const toggle = () => {
    const next: Theme = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
    setTheme(next);
  };

  return (
    <ThemeCtx.Provider value={{ theme, resolvedTheme, setTheme, toggle }}>
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
