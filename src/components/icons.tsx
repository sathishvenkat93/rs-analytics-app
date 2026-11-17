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

export function ChartTypeIcon({ type, ...p }: P & { type: ChartType }) {
  switch (type) {
    case 'bar':
      return <Svg {...p}><path d="M5 20V12M10 20V6M15 20V10M20 20V4" strokeWidth="2.5" /></Svg>;
    case 'line':
      return <Svg {...p}><path d="M3 17l5-5 4 3 8-9" strokeWidth="2" /><path d="M3 21h18" /></Svg>;
    case 'area':
      return <Svg {...p}><path d="M3 18l5-6 4 3 8-8v12H3z" fill="currentColor" fillOpacity="0.2" /><path d="M3 18l5-6 4 3 8-8" strokeWidth="2" /></Svg>;
    case 'pie':
      return <Svg {...p}><path d="M12 3a9 9 0 1 0 9 9h-9z" /><path d="M15 3.5A9 9 0 0 1 20.5 9H15z" fill="currentColor" fillOpacity="0.2" /></Svg>;
    case 'scatter':
      return <Svg {...p}>{[[6, 16], [9, 11], [12, 14], [15, 8], [18, 6], [8, 18], [16, 12]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" fill="currentColor" stroke="none" />)}<path d="M3 3v18h18" /></Svg>;
    case 'kpi':
      return <Svg {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 14l3-3 2 2 5-5" /></Svg>;
  }
}
