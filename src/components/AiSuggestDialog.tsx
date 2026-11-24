import { useEffect, useRef, useState } from 'react';
import type { SuggestResult } from '../../shared/ai';
import type { ChartConfig, Dataset } from '../types';
import { ai, aiReady, AiRequestError, useAiStatus } from '../ai/api';
import { chartCatalog, summarizeDataset } from '../ai/summary';
import { specToConfig, type SpecResult } from '../ai/spec';
import { CHART_DEFS } from '../charts/registry';
import { Modal } from './Modal';
import { ChartRenderer } from './ChartRenderer';
import { ChartTypeIcon, IconSparkle } from './icons';
import { Segmented } from './Segmented';

interface Props {
  mode: 'suggest' | 'dashboard';
  datasets: Dataset[];
  defaultDatasetId: string | null;
  /** Titles already on the target dashboard, so suggestions don't repeat them. */
  existingTitles: string[];
  targetName: string;
  onAdd: (charts: ChartConfig[], dashboardName?: string) => void;
  onClose: () => void;
}

interface Card extends SpecResult {
  rationale: string;
  on: boolean;
}

export function AiSuggestDialog({ mode, datasets, defaultDatasetId, existingTitles, targetName, onAdd, onClose }: Props) {
  const status = useAiStatus();
  const [datasetId, setDatasetId] = useState(defaultDatasetId ?? datasets[0]?.id ?? '');
  const [goal, setGoal] = useState('');
  const [count, setCount] = useState(mode === 'dashboard' ? '6' : '4');
  const [result, setResult] = useState<(SuggestResult & { cards: Card[] }) | null>(null);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const ds = datasets.find((d) => d.id === datasetId);
  useEffect(() => () => abort.current?.abort(), []);

  const run = async () => {
    if (!ds) return;
    abort.current?.abort();
    const ctl = (abort.current = new AbortController());
    setLoading(true);
    setError(null);
    try {
      const res = await ai.suggest({ dataset: summarizeDataset(ds), catalog: chartCatalog(), count: Number(count), goal: goal.trim() || undefined, existing: mode === 'suggest' ? existingTitles : undefined }, ctl.signal);
      const cards = res.charts.map((spec) => {
        const r = specToConfig(spec, ds);
        return { ...r, rationale: spec.rationale, on: !r.error };
      });
      setResult({ ...res, cards });
      setName(res.dashboardName);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError(e instanceof AiRequestError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const chosen = result?.cards.filter((c) => c.on && !c.error) ?? [];
  const footer = (
    <>
      {result && <span className="muted small check-summary">{chosen.length} of {result.cards.length} selected</span>}
      <button type="button" className="btn" onClick={onClose}>
        Cancel
      </button>
      {result && mode === 'suggest' && (
        <button type="button" className="btn btn-primary" disabled={!chosen.length} onClick={() => onAdd(chosen.map((c) => c.config))}>
          Add {chosen.length} chart{chosen.length === 1 ? '' : 's'} to “{targetName}”
        </button>
      )}
      {result && mode === 'dashboard' && (
        <button type="button" className="btn btn-primary" disabled={!chosen.length || !name.trim()} onClick={() => onAdd(chosen.map((c) => c.config), name.trim())}>
          Create dashboard with {chosen.length} chart{chosen.length === 1 ? '' : 's'}
        </button>
      )}
    </>
  );

  return (
    <Modal title={mode === 'dashboard' ? 'Generate a dashboard with AI' : 'AI chart suggestions'} onClose={onClose} footer={footer} wide>
      <div className="ai-suggest">
        <div className="ai-form">
          <label className="field">
            <span className="field-label">Dataset</span>
            <select value={datasetId} onChange={(e) => (setDatasetId(e.target.value), setResult(null))}>
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field grow">
            <span className="field-label">Focus (optional)</span>
            <input type="text" placeholder="e.g. profitability by region, or monthly trends" value={goal} onChange={(e) => setGoal(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !loading && run()} />
          </label>
          <div className="field">
            <span className="field-label">Charts</span>
            <Segmented small options={['3', '4', '6', '8'].map((v) => ({ value: v, label: v }))} value={count} onChange={setCount} />
          </div>
          <button type="button" className="btn btn-ai" onClick={run} disabled={loading || !ds || !aiReady(status)}>
            <IconSparkle size={16} />
            {loading ? 'Thinking…' : result ? 'Regenerate' : 'Suggest charts'}
          </button>
        </div>
        {status && !aiReady(status) && <p className="muted small">AI unavailable: {status.message}</p>}
        {error && <p className="form-error">{error}</p>}
        {!result && !loading && !error && aiReady(status) && <p className="muted small">The AI reads the column names, types, summary stats and a few sample rows, works out what kind of report this is, and proposes charts with their columns already filled in.</p>}
        {loading && (
          <div className="suggest-grid" aria-busy>
            {Array.from({ length: Number(count) }, (_, i) => (
              <div key={i} className="suggest-card skeleton" />
            ))}
          </div>
        )}
        {result && !loading && ds && (
          <>
            <div className="report-head">
              <div className="report-type">{result.reportType}</div>
              <p className="muted small">{result.summary}</p>
              {mode === 'dashboard' && (
                <label className="field">
                  <span className="field-label">Dashboard name</span>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
                </label>
              )}
            </div>
            <div className="suggest-grid">
              {result.cards.map((c, i) => (
                <div key={c.config.id} className={`suggest-card${c.on && !c.error ? ' on' : ''}${c.error ? ' broken' : ''}`}>
                  <label className="suggest-head">
                    <input type="checkbox" checked={c.on && !c.error} disabled={!!c.error} onChange={(e) => setResult((r) => r && { ...r, cards: r.cards.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)) })} />
                    <ChartTypeIcon type={c.config.type} size={16} />
                    <span className="suggest-title">{c.config.title}</span>
                    <span className="muted small">{CHART_DEFS[c.config.type].name}</span>
                  </label>
                  <div className="suggest-preview">{c.error ? <div className="chart-empty" style={{ height: 180 }}>{c.error}</div> : <ChartRenderer dataset={ds} config={c.config} height={180} />}</div>
                  {c.rationale && <p className="small suggest-why">{c.rationale}</p>}
                  {c.issues.length > 0 && <p className="muted small">Adjusted: {c.issues.join(' ')}</p>}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
