import type { SVGProps } from 'react';
import type { ChartType } from '../types';

type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 18, children, ...rest }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...rest}>
      {children}
    </svg>
  );
}

export const IconPlus = (p: P) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>;
export const IconGrip = (p: P) => (
  <Svg {...p}>
    {[6, 12, 18].map((y) => (
      <g key={y}>
        <circle cx="9" cy={y} r="1" fill="currentColor" stroke="none" />
        <circle cx="15" cy={y} r="1" fill="currentColor" stroke="none" />
      </g>
    ))}
  </Svg>
);
export const IconEdit = (p: P) => <Svg {...p}><path d="M4 20h4L19 9l-4-4L4 16v4z" /><path d="M13.5 6.5l4 4" /></Svg>;
export const IconCopy = (p: P) => <Svg {...p}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></Svg>;
export const IconTrash = (p: P) => <Svg {...p}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></Svg>;
export const IconTable = (p: P) => <Svg {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M3 15h18M9 10v10" /></Svg>;
export const IconSliders = (p: P) => <Svg {...p}><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></Svg>;
export const IconWidth = (p: P) => <Svg {...p}><path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4" /></Svg>;
export const IconEye = (p: P) => <Svg {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></Svg>;
export const IconFile = (p: P) => <Svg {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></Svg>;
export const IconUpload = (p: P) => <Svg {...p}><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></Svg>;
export const IconSun = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Svg>;
export const IconMoon = (p: P) => <Svg {...p}><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></Svg>;
export const IconMonitor = (p: P) => <Svg {...p}><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></Svg>;
export const IconBack = (p: P) => <Svg {...p}><path d="M15 6l-6 6 6 6" /></Svg>;
export const IconSparkle = (p: P) => <Svg {...p}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></Svg>;
export const IconSend = (p: P) => <Svg {...p}><path d="M4 12l16-8-6 16-2.5-6.5z" /><path d="M11.5 13.5L20 4" /></Svg>;
export const IconColumns = (p: P) => <Svg {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16M15 4v16" /><path d="M5.5 8h1.5M11 8h2M17 8h1.5" /></Svg>;
export const IconDatabase = (p: P) => <Svg {...p}><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6" /><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></Svg>;
export const IconRefresh = (p: P) => <Svg {...p}><path d="M20 11a8 8 0 0 0-14.6-4.5L4 8" /><path d="M4 4v4h4" /><path d="M4 13a8 8 0 0 0 14.6 4.5L20 16" /><path d="M20 20v-4h-4" /></Svg>;
export const IconDashboard = (p: P) => <Svg {...p}><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="5" rx="1.5" /><rect x="13" y="10" width="8" height="11" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /></Svg>;

const dot = (x: number, y: number, r = 1.6) => <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill="currentColor" stroke="none" />;
const soft = { fill: 'currentColor', fillOpacity: 0.2 } as const;

export function ChartTypeIcon({ type, ...p }: P & { type: ChartType }) {
  switch (type) {
    case 'bar':
      return <Svg {...p}><path d="M4 5h9M4 10h15M4 15h6M4 20h12" strokeWidth="2.5" /></Svg>;
    case 'column':
      return <Svg {...p}><path d="M5 20V12M10 20V6M15 20V10M20 20V4" strokeWidth="2.5" /></Svg>;
    case 'histogram':
      return <Svg {...p}><path d="M3 20V14h4v6M7 20V8h4v12M11 20V5h4v15M15 20V11h4v9" {...soft} /><path d="M3 20h18" /></Svg>;
    case 'line':
      return <Svg {...p}><path d="M3 17l5-5 4 3 8-9" strokeWidth="2" /><path d="M3 21h18" /></Svg>;
    case 'step':
      return <Svg {...p}><path d="M3 17h4v-5h5v3h4V7h5" strokeWidth="2" /><path d="M3 21h18" /></Svg>;
    case 'area':
      return <Svg {...p}><path d="M3 18l5-6 4 3 8-8v12H3z" {...soft} /><path d="M3 18l5-6 4 3 8-8" strokeWidth="2" /></Svg>;
    case 'pie':
      return <Svg {...p}><path d="M12 3a9 9 0 1 0 9 9h-9z" /><path d="M15 3.5A9 9 0 0 1 20.5 9H15z" {...soft} /></Svg>;
    case 'donut':
      return <Svg {...p}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4" /><path d="M12 3.5V8M20.5 12H16" /></Svg>;
    case 'kpi':
      return <Svg {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 15V9M11 15V9l3 6V9" /></Svg>;
    case 'sparkline':
      return <Svg {...p}><path d="M3 15l3-3 3 2 4-6 3 4 5-3" strokeWidth="2" />{dot(21, 9, 1.8)}</Svg>;
    case 'treemap':
      return <Svg {...p}><rect x="3" y="4" width="18" height="16" rx="1.5" /><path d="M12 4v16M12 12h9M16 12v8" /><rect x="3.5" y="4.5" width="8" height="15" {...soft} stroke="none" /></Svg>;
    case 'pareto':
      return <Svg {...p}><path d="M5 20V6M9 20V10M13 20V14M17 20V17" strokeWidth="2.5" /><path d="M4 12l5-4 4-2 4-1 4-1" /></Svg>;
    case 'radar':
      return <Svg {...p}><path d="M12 3l8.5 6.2-3.2 10H6.7l-3.2-10z" /><path d="M12 7l4.5 3.5-1.6 5.5H9.1L7.5 10.5z" {...soft} /></Svg>;
    case 'funnel':
      return <Svg {...p}><path d="M3 5h18M6 10h12M9 15h6M11 20h2" strokeWidth="2.5" /></Svg>;
    case 'waterfall':
      return <Svg {...p}><path d="M4 20v-8h3v8zM9 12V7h3v5zM14 7v4h3V7zM19 20V11h2" /><path d="M9 12V7h3v5z" {...soft} /></Svg>;
    case 'stacked':
      return <Svg {...p}><path d="M6 20v-6M6 14V9M12 20v-9M12 11V5M18 20v-4M18 16v-5" strokeWidth="3" /><path d="M4 14h4M10 11h4M16 16h4" stroke="var(--surface)" strokeWidth="1.5" /></Svg>;
    case 'scatter':
      return <Svg {...p}>{[[6, 16], [9, 11], [12, 14], [15, 8], [18, 6], [8, 18], [16, 12]].map(([x, y]) => dot(x, y))}<path d="M3 3v18h18" /></Svg>;
    case 'bubble':
      return <Svg {...p}><circle cx="8" cy="14" r="3" {...soft} /><circle cx="15" cy="8" r="4.5" {...soft} /><circle cx="17" cy="17" r="2" {...soft} /><path d="M3 3v18h18" /></Svg>;
    case 'sankey':
      return <Svg {...p}><path d="M4 5h2M4 13h2M18 7h2M18 17h2" strokeWidth="3" /><path d="M6 5c6 0 6 2 12 2M6 6c6 0 6 10 12 10M6 13c6 0 6-5 12-5M6 14c6 0 6 3 12 3" /></Svg>;
    case 'candlestick':
      return <Svg {...p}><path d="M7 3v18M17 5v14" /><rect x="5" y="7" width="4" height="8" rx="1" /><rect x="15" y="9" width="4" height="6" rx="1" fill="currentColor" /></Svg>;
    case 'geo':
      return <Svg {...p}><path d="M3 7l5-2 8 2 5-2v12l-5 2-8-2-5 2z" /><path d="M8 5v12M16 7v12" /><path d="M8 5l8 2v12l-8-2z" {...soft} stroke="none" /></Svg>;
    case 'scattermap':
      return <Svg {...p}><path d="M3 7l5-2 8 2 5-2v12l-5 2-8-2-5 2z" />{dot(7, 10)}{dot(12, 13)}{dot(17, 9)}{dot(14, 15)}</Svg>;
    case 'geobubble':
      return <Svg {...p}><path d="M3 7l5-2 8 2 5-2v12l-5 2-8-2-5 2z" /><circle cx="9" cy="11" r="2.5" {...soft} /><circle cx="15.5" cy="12" r="3.5" {...soft} /></Svg>;
    case 'heatmap':
      return <Svg {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18M15 3v18M3 9h18M3 15h18" /><path d="M9 9h6v6H9zM3 3h6v6H3zM15 15h6v6h-6z" {...soft} stroke="none" /></Svg>;
    case 'boxplot':
      return <Svg {...p}><path d="M7 3v4M7 15v6M17 6v3M17 15v4M5 3h4M5 21h4M15 6h4M15 19h4" /><rect x="4.5" y="7" width="5" height="8" rx="1" {...soft} /><rect x="14.5" y="9" width="5" height="6" rx="1" {...soft} /><path d="M4.5 11h5M14.5 12h5" strokeWidth="2" /></Svg>;
    case 'pictograph':
      return <Svg {...p}>{[4, 10, 16].map((x) => <g key={x}><circle cx={x + 2} cy="8" r="2" /><path d={`M${x - 1} 17c0-3 1.3-5 3-5s3 2 3 5z`} /></g>)}</Svg>;
    case 'gantt':
      return <Svg {...p}><path d="M3 3v18" /><path d="M5 6h8M9 11h9M7 16h7" strokeWidth="3" /></Svg>;
    case 'dotplot':
      return <Svg {...p}><path d="M3 6h18M3 12h18M3 18h18" strokeOpacity="0.35" />{dot(15, 6, 2.2)}{dot(9, 12, 2.2)}{dot(18, 18, 2.2)}</Svg>;
  }
}
