/**
 * Chart palette. Categorical slots are assigned in this fixed order (validated
 * for colour-vision deficiency on adjacent pairs) and never cycled: a chart
 * caps at 8 series and folds the rest into "Other".
 */
export type ThemeMode = 'light' | 'dark';

export interface ChartTheme {
  series: string[];
  other: string;
  surface: string;
  textPrimary: string;
  textSecondary: string;
  muted: string;
  grid: string;
  axis: string;
}

export const CHART_THEMES: Record<ThemeMode, ChartTheme> = {
  light: {
    series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
    other: '#b4b2a9',
    surface: '#fcfcfb',
    textPrimary: '#0b0b0b',
    textSecondary: '#52514e',
    muted: '#898781',
    grid: '#e1e0d9',
    axis: '#c3c2b7',
  },
  dark: {
    series: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#0ca30c', '#9085e9', '#e66767'],
    other: '#5f5e59',
    surface: '#1a1a19',
    textPrimary: '#f0efec',
    textSecondary: '#c3c2b7',
    muted: '#898781',
    grid: '#2c2c2a',
    axis: '#383835',
  },
};

export function seriesColor(theme: ChartTheme, index: number): string {
  return index < 0 ? theme.other : theme.series[index] ?? theme.other;
}
