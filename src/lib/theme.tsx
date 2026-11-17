import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CHART_THEMES, type ChartTheme, type ThemeMode } from './palette';
import { loadThemePref, saveThemePref, type ThemePref } from './storage';

interface ThemeCtx {
  pref: ThemePref;
  mode: ThemeMode;
  chart: ChartTheme;
  setPref: (p: ThemePref) => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

function systemMode(): ThemeMode {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(loadThemePref);
  const [sys, setSys] = useState<ThemeMode>(systemMode);

  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = () => setSys(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const mode: ThemeMode = pref === 'system' ? sys : pref;

  useEffect(() => {
    const root = document.documentElement;
    if (pref === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', pref);
  }, [pref]);

  const value = useMemo<ThemeCtx>(
    () => ({
      pref,
      mode,
      chart: CHART_THEMES[mode],
      setPref: (p) => {
        setPrefState(p);
        saveThemePref(p);
      },
    }),
    [pref, mode],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTheme outside ThemeProvider');
  return v;
}
