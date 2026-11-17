import { useCallback, useState, type MouseEvent, type ReactNode } from 'react';
import type { ChartTheme } from '../../lib/palette';

export function Empty({ height, message = 'No data for this selection.' }: { height: number; message?: string }) {
  return (
    <div className="chart-empty" style={{ height }}>
      {message}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; shape?: 'line' | 'hollow' }[] }) {
  return (
    <ul className="legend" aria-label="Legend">
      {items.map((it) => (
        <li key={it.label}>
          <span
            className={`swatch${it.shape ? ` swatch-${it.shape}` : ''}`}
            style={it.shape === 'hollow' ? { borderColor: it.color } : { background: it.color }}
            aria-hidden
          />
          {it.label}
        </li>
      ))}
    </ul>
  );
}

export interface TipRow {
  label: string;
  value: string;
  color?: string;
}

export function TooltipCard({ title, rows }: { title?: string; rows: TipRow[] }) {
  return (
    <div className="tooltip-card">
      {title && <div className="tooltip-title">{title}</div>}
      {rows.map((r) => (
        <div className="tooltip-row" key={r.label}>
          {r.color && <span className="swatch" style={{ background: r.color }} aria-hidden />}
          <span className="tooltip-label">{r.label}</span>
          <span className="tooltip-value">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export function axisProps(theme: ChartTheme) {
  return {
    stroke: theme.axis,
    tick: { fill: theme.muted, fontSize: 12 },
    tickLine: false,
  } as const;
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="chart-note">{children}</p>;
}

/**
 * Hover tooltip for hand-drawn SVG charts. `bind(content)` returns mouse
 * handlers for a mark; the card follows the pointer, clamped to the viewport.
 */
export function useHoverTip() {
  const [tip, setTip] = useState<{ x: number; y: number; content: ReactNode } | null>(null);
  const bind = useCallback(
    (content: ReactNode) => ({
      onMouseMove: (e: MouseEvent) => setTip({ x: e.clientX, y: e.clientY, content }),
      onMouseLeave: () => setTip(null),
    }),
    [],
  );
  const node = tip ? (
    <div
      className="floating-tip"
      style={{
        left: Math.min(tip.x + 14, window.innerWidth - 240),
        top: tip.y + 14 > window.innerHeight - 120 ? tip.y - 110 : tip.y + 14,
      }}
    >
      {tip.content}
    </div>
  ) : null;
  return { node, bind };
}
