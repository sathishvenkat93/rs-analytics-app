import { useEffect, useMemo, useRef, useState } from 'react';
import type { ColumnAdvice } from '../../shared/ai';
import type { ChartConfig, Dataset } from '../types';
import { ai, aiReady, AiRequestError, useAiStatus } from '../ai/api';
import { summarizeDataset } from '../ai/summary';
import { analyzeColumns, columnsUsedBy, type ColumnChanges } from '../lib/columns';
import { Modal } from './Modal';
import { IconSparkle } from './icons';

interface Props {
  dataset: Dataset;
  /** Every chart in every dashboard, to protect columns in use. */
  charts: ChartConfig[];
  onApply: (changes: ColumnChanges) => void;
  onClose: () => void;
}

interface Row {
  name: string;
  type: string;
  next: string;
  reason: string | null;
  rename: boolean;
}

export function ColumnToolsDialog({ dataset, charts, onApply, onClose }: Props) {
  const status = useAiStatus();
  const analysis = useMemo(() => analyzeColumns(dataset), [dataset]);
  const usage = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of charts) if (c.datasetId === dataset.id) for (const col of new Set(columnsUsedBy(c))) m.set(col, (m.get(col) ?? 0) + 1);
    return m;
  }, [charts, dataset.id]);

  const [rows, setRows] = useState<Row[]>(() => dataset.columns.map((c) => ({ name: c.name, type: c.type, next: c.name, reason: null, rename: false })));
  const [discard, setDiscard] = useState<Map<string, { reason: string; from: 'check' | 'ai' | 'both'; on: boolean }>>(
    () => new Map(analysis.candidates.map((c) => [c.column, { reason: c.reason, from: 'check' as const, on: !usage.has(c.column) && c.kind !== 'id' }])),
  );
  const [cleanNa, setCleanNa] = useState(analysis.naCells.length > 0);
  const [advice, setAdvice] = useState<ColumnAdvice | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const askAi = async () => {
    abort.current?.abort();
    const ctl = (abort.current = new AbortController());
    setLoading(true);
    setError(null);
    try {
      const res = await ai.columns(summarizeDataset(dataset), ctl.signal);
      setAdvice(res);
      const byName = new Map(res.renames.map((r) => [r.original, r]));
      setRows((rs) => rs.map((r) => (byName.has(r.name) ? { ...r, next: byName.get(r.name)!.suggested.trim(), reason: byName.get(r.name)!.reason, rename: true } : r)));
      setDiscard((d) => {
        const n = new Map(d);
        for (const x of res.discard) {
          if (!dataset.columns.some((c) => c.name === x.column)) continue;
          const prev = n.get(x.column);
          // Keep the concrete local reason when both flag a column; the AI tag shows it agrees.
          n.set(x.column, prev ? { ...prev, from: 'both' } : { reason: x.reason, from: 'ai', on: !usage.has(x.column) });
        }
        return n;
      });
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError(e instanceof AiRequestError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  // Final names must be unique and non-empty among kept columns.
  const dropped = new Set([...discard].filter(([, v]) => v.on).map(([k]) => k));
  const finalNames = rows.filter((r) => !dropped.has(r.name)).map((r) => (r.rename ? r.next.trim() : r.name));
  const dupes = new Set(finalNames.filter((n, i) => !n || finalNames.indexOf(n) !== i));
  const renameCount = rows.filter((r) => r.rename && r.next.trim() && r.next.trim() !== r.name && !dropped.has(r.name)).length;
  const invalid = rows.some((r) => !dropped.has(r.name) && dupes.has(r.rename ? r.next.trim() : r.name));
  const nothing = !renameCount && !dropped.size && !cleanNa;
  const naTotal = analysis.naCells.reduce((s, c) => s + c.count, 0);

  const apply = () => {
    const rename = new Map(rows.filter((r) => r.rename && r.next.trim() && r.next.trim() !== r.name && !dropped.has(r.name)).map((r) => [r.name, r.next.trim()]));
    onApply({ rename, discard: [...dropped], cleanNa });
  };

  const footer = (
    <>
      <span className={`muted small check-summary${invalid ? ' form-error' : ''}`}>
        {invalid ? 'Column names must be unique and not empty.' : nothing ? 'No changes selected.' : [renameCount && `Rename ${renameCount}`, dropped.size && `Discard ${dropped.size}`, cleanNa && 'Clean NA values'].filter(Boolean).join(' · ')}
      </span>
      <button type="button" className="btn" onClick={onClose}>
        Cancel
      </button>
      <button type="button" className="btn btn-primary" disabled={nothing || invalid} onClick={apply}>
        Apply changes
      </button>
    </>
  );

  return (
    <Modal title={`Optimise columns · ${dataset.name}`} onClose={onClose} footer={footer} wide>
      <div className="col-tools">
        <div className="ai-bar">
          <div>
            <strong>{advice ? advice.reportType : 'Suggest better names with AI'}</strong>
            <div className="muted small">
              {advice
                ? `${advice.renames.length} rename${advice.renames.length === 1 ? '' : 's'} and ${advice.discard.length} discard${advice.discard.length === 1 ? '' : 's'} suggested. Review and edit before applying.`
                : 'Clear, de-duplicated names make columns easier to pick when building charts. Only column names, types and a few example values are sent.'}
            </div>
            {status && !aiReady(status) && <div className="muted small">AI unavailable: {status.message}</div>}
            {error && <div className="form-error small">{error}</div>}
          </div>
          <button type="button" className="btn btn-ai" onClick={askAi} disabled={loading || !aiReady(status)}>
            <IconSparkle size={16} />
            {loading ? 'Analysing…' : advice ? 'Ask again' : 'Suggest names'}
          </button>
        </div>

        <section>
          <h3 className="picker-group">Column names</h3>
          <div className="table-wrap col-table">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Current</th>
                  <th scope="col">New name</th>
                  <th scope="col">Why</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const gone = dropped.has(r.name);
                  const dup = !gone && dupes.has(r.rename ? r.next.trim() : r.name);
                  return (
                    <tr key={r.name} className={gone ? 'row-dropped' : undefined}>
                      <td>
                        <span className="col-current" title={r.name}>
                          {r.name}
                        </span>
                        <span className={`type-badge type-${r.type}`}>{r.type}</span>
                      </td>
                      <td>
                        <input
                          className={`col-input${dup ? ' invalid' : ''}`}
                          value={r.rename ? r.next : r.name}
                          disabled={gone}
                          aria-label={`New name for ${r.name}`}
                          aria-invalid={dup}
                          onChange={(e) => {
                            const v = e.target.value;
                            setRows((rs) => rs.map((x, j) => (j === i ? { ...x, next: v, rename: v !== x.name } : x)));
                          }}
                        />
                      </td>
                      <td className="muted small col-reason">{gone ? 'Discarded' : r.rename && r.next !== r.name ? (r.reason ?? 'Edited') : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rows.some((r) => r.rename && r.next !== r.name) && (
            <button type="button" className="link-btn small" onClick={() => setRows((rs) => rs.map((r) => ({ ...r, next: r.name, rename: false })))}>
              Reset all names
            </button>
          )}
        </section>

        <section>
          <h3 className="picker-group">Discard columns</h3>
          {discard.size === 0 ? (
            <p className="muted small">No empty, constant, duplicate or placeholder-only columns found.</p>
          ) : (
            <ul className="discard-list">
              {[...discard].map(([col, v]) => {
                const used = usage.get(col) ?? 0;
                return (
                  <li key={col}>
                    <label className={used ? 'disabled' : undefined}>
                      <input type="checkbox" checked={v.on && !used} disabled={!!used} onChange={(e) => setDiscard((d) => new Map(d).set(col, { ...v, on: e.target.checked }))} />
                      <span className="discard-name">{col}</span>
                      <span className="muted small">{v.reason}</span>
                      {v.from !== 'check' && <span className="ai-tag" title={v.from === 'both' ? 'Also suggested by AI' : 'Suggested by AI'}>AI</span>}
                      {used > 0 && <span className="muted small">· used by {used} chart{used === 1 ? '' : 's'}, so it can’t be removed</span>}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {analysis.naCells.length > 0 && (
          <section>
            <h3 className="picker-group">Missing-value markers</h3>
            <label className="toggle">
              <input type="checkbox" role="switch" checked={cleanNa} onChange={(e) => setCleanNa(e.target.checked)} />
              <span className="toggle-track" aria-hidden>
                <span className="toggle-thumb" />
              </span>
              <span className="control-label">
                Treat {naTotal.toLocaleString()} placeholder value{naTotal === 1 ? '' : 's'} (“N/A”, “null”, “-”…) as empty in {analysis.naCells.map((c) => c.column).slice(0, 4).join(', ')}
                {analysis.naCells.length > 4 ? '…' : ''}, then re-detect column types
              </span>
            </label>
          </section>
        )}
      </div>
    </Modal>
  );
}
