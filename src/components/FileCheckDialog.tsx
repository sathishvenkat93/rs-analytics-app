import { useMemo, useState } from 'react';
import type { Dataset } from '../types';
import type { CheckStatus, FileReport, TableReport, Verdict } from '../lib/validate';
import { Modal } from './Modal';
import { IconFile } from './icons';

interface Props {
  reports: FileReport[];
  onCancel: () => void;
  /** Adds the chosen tables and lands on the dashboard. */
  onContinue: (datasets: Dataset[]) => void;
}

const VERDICT: Record<Verdict, { label: string; tone: 'good' | 'possible' | 'no'; icon: string }> = {
  ready: { label: 'Ready to visualise', tone: 'good', icon: '✓' },
  limited: { label: 'Usable with limits', tone: 'possible', icon: '~' },
  unusable: { label: 'Can’t be visualised', tone: 'no', icon: '✕' },
};
const CHECK_ICON: Record<CheckStatus, string> = { pass: '✓', warn: '!', fail: '✕' };

function VerdictBadge({ verdict, short }: { verdict: Verdict; short?: boolean }) {
  const v = VERDICT[verdict];
  return (
    <span className={`fit-badge fit-${v.tone}`}>
      <span className="fit-icon" aria-hidden>
        {v.icon}
      </span>
      {short ? v.label.split(' ')[0] : v.label}
    </span>
  );
}

const size = (b: number) => (b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`);

export function FileCheckDialog({ reports, onCancel, onContinue }: Props) {
  const allTables = useMemo(() => reports.flatMap((r) => r.tables), [reports]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(allTables.filter((t) => t.verdict !== 'unusable').map((t) => t.dataset.id)));
  const usableCount = allTables.filter((t) => t.verdict !== 'unusable').length;
  const chosen = allTables.filter((t) => selected.has(t.dataset.id));

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const footer = (
    <>
      <span className="muted small check-summary">
        {usableCount} of {allTables.length} table{allTables.length === 1 ? '' : 's'} can be visualised
        {reports.some((r) => r.error) && ` · ${reports.filter((r) => r.error).length} file${reports.filter((r) => r.error).length === 1 ? '' : 's'} couldn’t be read`}
      </span>
      <button type="button" className="btn" onClick={onCancel}>
        {usableCount ? 'Cancel' : 'Close'}
      </button>
      {usableCount > 0 && (
        <button type="button" className="btn btn-primary" disabled={!chosen.length} onClick={() => onContinue(chosen.map((t) => t.dataset))}>
          Add {chosen.length} table{chosen.length === 1 ? '' : 's'} and open dashboard
        </button>
      )}
    </>
  );

  return (
    <Modal title="File check: can this data be visualised?" onClose={onCancel} footer={footer} wide>
      <div className="file-checks">
        {reports.map((r) => (
          <section key={r.id} className={`file-check verdict-${r.verdict}`} aria-label={r.fileName}>
            <header className="file-check-head">
              <IconFile size={22} className="source-icon" />
              <div className="file-check-title">
                <div className="source-name" title={r.fileName}>
                  {r.fileName}
                </div>
                <div className="muted small">
                  {r.format ?? 'Unknown format'} · {size(r.size)}
                  {r.tables.length > 1 && ` · ${r.tables.length} tables`}
                </div>
              </div>
              <VerdictBadge verdict={r.verdict} />
            </header>

            {r.error && (
              <div className="check-error" role="alert">
                <strong>Why not:</strong> {r.error.message}
              </div>
            )}

            {r.notes.length > 0 && (
              <ul className="check-notes">
                {r.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}

            {r.tables.length > 1 && (
              <div className="check-bulk">
                <button type="button" className="link-btn" onClick={() => setSelected((s) => new Set([...s, ...r.tables.filter((t) => t.verdict !== 'unusable').map((t) => t.dataset.id)]))}>
                  Select all usable
                </button>
                <button type="button" className="link-btn" onClick={() => setSelected((s) => new Set([...s].filter((id) => !r.tables.some((t) => t.dataset.id === id))))}>
                  Select none
                </button>
              </div>
            )}

            {r.tables.map((t) => (
              <TableRow key={t.dataset.id} report={t} single={r.tables.length === 1} checked={selected.has(t.dataset.id)} onToggle={() => toggle(t.dataset.id)} expandedByDefault={r.tables.length <= 2} />
            ))}
          </section>
        ))}
      </div>
    </Modal>
  );
}

function TableRow({ report, single, checked, onToggle, expandedByDefault }: { report: TableReport; single: boolean; checked: boolean; onToggle: () => void; expandedByDefault: boolean }) {
  const [open, setOpen] = useState(expandedByDefault || report.verdict === 'unusable');
  const { dataset: ds, verdict, checks, bestFits } = report;
  const disabled = verdict === 'unusable';
  return (
    <div className={`table-check${disabled ? ' disabled' : ''}`}>
      <div className="table-check-row">
        <label className="table-check-pick">
          <input type="checkbox" checked={checked && !disabled} disabled={disabled} onChange={onToggle} aria-label={`Add ${ds.name}`} />
          <span className="table-check-name" title={ds.name}>
            {single ? 'Table' : ds.name.split(' · ').slice(1).join(' · ') || ds.name}
          </span>
        </label>
        <span className="muted small">
          {ds.rows.length.toLocaleString()} rows · {ds.columns.length} cols
        </span>
        <VerdictBadge verdict={verdict} short />
        <button type="button" className="link-btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide checks' : 'Show checks'}
        </button>
      </div>
      {open && (
        <ul className="check-list-items">
          {checks.map((c) => (
            <li key={c.label} className={`check-item check-${c.status}`}>
              <span className="check-icon" aria-label={c.status}>
                {CHECK_ICON[c.status]}
              </span>
              <span className="check-label">{c.label}</span>
              <span className="check-detail">{c.detail}</span>
            </li>
          ))}
          {bestFits.length > 0 && (
            <li className="check-item check-fits">
              <span className="check-icon" aria-hidden>
                ★
              </span>
              <span className="check-label">Suggested charts</span>
              <span className="check-detail">{bestFits.join(', ')}</span>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
