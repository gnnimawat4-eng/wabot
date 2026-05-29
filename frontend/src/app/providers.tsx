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

// ── Accent color ──────────────────────────────────────────────────────────────

export type AccentKey = 'red' | 'green' | 'neutral';

interface AccentDef {
  label: string;
  hex: string;          // display hex for the circle swatch
  accent: string;
  hover: string;
  tintDark: string;     // --wb-bg-active in dark mode
  tintLight: string;    // --wb-bg-active in light mode
  ringDark: string;     // --wb-accent-ring in dark mode
  ringLight: string;    // --wb-accent-ring in light mode
}

export const ACCENT_DEFS: Record<AccentKey, AccentDef> = {
  red: {
    label: 'Red',     hex: '#FF0436',
    accent: '#FF0436', hover: '#cc0329',
    tintDark: 'rgba(255,4,54,0.14)',   tintLight: 'rgba(255,4,54,0.06)',
    ringDark: 'rgba(255,4,54,0.40)',   ringLight: 'rgba(255,4,54,0.40)',
  },
  green: {
    label: 'Green',   hex: '#16a34a',
    accent: '#16a34a', hover: '#15803d',
    tintDark: 'rgba(22,163,74,0.14)',  tintLight: 'rgba(22,163,74,0.06)',
    ringDark: 'rgba(22,163,74,0.40)',  ringLight: 'rgba(22,163,74,0.40)',
  },
  neutral: {
    label: 'Neutral', hex: '',          // theme-dependent, rendered specially
    accent: '',        hover: '',        // set at runtime based on resolved theme
    tintDark: 'rgba(255,255,255,0.08)', tintLight: 'rgba(0,0,0,0.05)',
    ringDark: 'rgba(240,240,240,0.30)', ringLight: 'rgba(17,17,17,0.20)',
  },
};

function applyAccent(key: AccentKey, isDark: boolean) {
  const el = document.documentElement;
  const def = ACCENT_DEFS[key];

  if (key === 'neutral') {
    el.style.setProperty('--wb-accent',       isDark ? '#f0f0f0' : '#111111');
    el.style.setProperty('--wb-accent-hover', isDark ? '#cccccc' : '#333333');
  } else {
    el.style.setProperty('--wb-accent',       def.accent);
    el.style.setProperty('--wb-accent-hover', def.hover);
  }
  el.style.setProperty('--wb-bg-active',   isDark ? def.tintDark  : def.tintLight);
  el.style.setProperty('--wb-accent-ring', isDark ? def.ringDark  : def.ringLight);
}

const AccentCtx = createContext<{
  accent: AccentKey;
  accentHex: string;   // resolved hex value for use in JS props (e.g. Recharts)
  setAccent: (k: AccentKey) => void;
}>({ accent: 'red', accentHex: '#FF0436', setAccent: () => {} });

export const useAccent = () => useContext(AccentCtx);

function AccentProvider({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();
  const [accent, setAccentState] = useState<AccentKey>('red');

  // Apply on mount (read from localStorage)
  useEffect(() => {
    const stored = (localStorage.getItem('wabot-accent-color') as AccentKey) ?? 'red';
    const valid: AccentKey[] = ['red', 'green', 'neutral'];
    const key = valid.includes(stored) ? stored : 'red';
    setAccentState(key);
    applyAccent(key, resolvedTheme === 'dark');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-apply when theme changes (neutral is theme-dependent, tints change too)
  useEffect(() => {
    applyAccent(accent, resolvedTheme === 'dark');
  }, [resolvedTheme, accent]);

  const setAccent = (key: AccentKey) => {
    setAccentState(key);
    localStorage.setItem('wabot-accent-color', key);
    applyAccent(key, resolvedTheme === 'dark');
  };

  const accentHex =
    accent === 'neutral'
      ? (resolvedTheme === 'dark' ? '#f0f0f0' : '#111111')
      : ACCENT_DEFS[accent].accent;

  return (
    <AccentCtx.Provider value={{ accent, accentHex, setAccent }}>
      {children}
    </AccentCtx.Provider>
  );
}

// ── Root Provider ─────────────────────────────────────────────────────────────

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } });

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AccentProvider>
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      </AccentProvider>
    </ThemeProvider>
  );
}
