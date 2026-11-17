import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FIT_LABEL, type ChartTypeDef, type FitLevel, type Suggestion } from '../charts/registry';

export function FitBadge({ level, compact }: { level: FitLevel; compact?: boolean }) {
  return (
    <span className={`fit-badge fit-${level}`}>
      <span className="fit-icon" aria-hidden>
        {level === 'good' ? '✓' : level === 'possible' ? '~' : '✕'}
      </span>
      {!compact && FIT_LABEL[level]}
    </span>
  );
}

export function ChartInfoContent({ def, suggestion, datasetName }: { def: ChartTypeDef; suggestion?: Suggestion; datasetName?: string }) {
  return (
    <div className="info-content">
      <div className="info-title">{def.name}</div>
      <p className="info-what">{def.what}</p>
      <div className="info-section">
        <div className="info-head">Use it when</div>
        <ul>
          {def.when.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      </div>
      <div className="info-section">
        <div className="info-head">Avoid when</div>
        <ul className="avoid">
          {def.avoid.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      </div>
      <div className="info-section">
        <div className="info-head">Data it needs</div>
        <p>{def.needs}</p>
      </div>
      {suggestion && (
        <div className={`info-fit fit-bg-${suggestion.level}`}>
          <div className="info-head">
            For {datasetName ? `“${datasetName}”` : 'this dataset'}: <FitBadge level={suggestion.level} />
          </div>
          <p>{suggestion.reason}</p>
        </div>
      )}
    </div>
  );
}

/**
 * (i) button that opens the chart-type guidance in a popover. Positioned with
 * `fixed` so it isn't clipped by scrolling modal bodies or widget cards.
 */
export function InfoButton({ def, suggestion, datasetName, size = 16 }: { def: ChartTypeDef; suggestion?: Suggestion; datasetName?: string; size?: number }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !btn.current || !pop.current) return;
    const b = btn.current.getBoundingClientRect();
    const p = pop.current.getBoundingClientRect();
    const margin = 12;
    let left = b.left + b.width / 2 - p.width / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - p.width - margin));
    let top = b.bottom + 8;
    if (top + p.height > window.innerHeight - margin) top = Math.max(margin, b.top - p.height - 8);
    setPos({ top, left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!pop.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Close only the popover, not the dialog underneath.
        e.stopPropagation();
        setOpen(false);
        btn.current?.focus();
      }
    };
    const onScroll = (e: Event) => {
      if (!pop.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btn}
        type="button"
        className="info-btn"
        aria-label={`When to use a ${def.name.toLowerCase()}`}
        aria-expanded={open}
        title="When to use this chart"
        onClick={(e) => {
          e.stopPropagation();
          setPos(null);
          setOpen((o) => !o);
        }}
      >
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5.5" />
          <circle cx="12" cy="7.8" r="0.6" fill="currentColor" />
        </svg>
      </button>
      {open && (
        <div ref={pop} className="info-popover" role="dialog" aria-label={`${def.name} guidance`} style={pos ? { top: pos.top, left: pos.left } : { top: -9999, left: -9999 }} onClick={(e) => e.stopPropagation()}>
          <ChartInfoContent def={def} suggestion={suggestion} datasetName={datasetName} />
        </div>
      )}
    </>
  );
}
