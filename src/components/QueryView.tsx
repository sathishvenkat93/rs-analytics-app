import { useEffect, useMemo, useRef, useState } from 'react';
import type { Database } from 'sql.js';
import type { Dataset } from '../types';
import { buildQueryDb, runQuery, type QueryResult, type QueryTable } from '../lib/sqlEngine';
import { ai, aiReady, AiRequestError, useAiStatus } from '../ai/api';
import { DataTable } from './DataTable';
import { IconSparkle } from './icons';

interface Props {
  datasets: Dataset[];
  /** Saves the result as a new dataset; `chart` = open the chart editor on it afterwards. */
  onSave: (name: string, sql: string, result: QueryResult, chart: boolean) => void;
}

const HISTORY_KEY = 'rs-analytics:sql-history';
const SHOW_ROWS = 1000;

function loadHistory(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}
function saveHistory(h: string[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, 15)));
  } catch {
    /* per-viewer convenience only */
  }
}

export function QueryView({ datasets, onSave }: Props) {
  const status = useAiStatus();
  const [db, setDb] = useState<{ db: Database; tables: QueryTable[] } | null>(null);
  const [building, setBuilding] = useState(true);
  const [sql, setSql] = useState('');
  const [result, setResult] = useState<QueryResult | null>(null);
  const [lastSql, setLastSql] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>(loadHistory);
  const [question, setQuestion] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const editor = useRef<HTMLTextAreaElement>(null);

  // Rebuild the in-memory database whenever the datasets change.
  const signature = useMemo(() => datasets.map((d) => `${d.id}:${d.rows.length}:${d.columns.map((c) => c.name).join(',')}`).join('|'), [datasets]);
  useEffect(() => {
    let live = true;
    let built: Database | null = null;
    setBuilding(true);
    buildQueryDb(datasets)
      .then((res) => {
        built = res.db;
        if (!live) return res.db.close();
        setDb(res);
        setSql((s) => s || (res.tables[0] ? `SELECT *\nFROM "${res.tables[0].name}"\nLIMIT 100;` : ''));
      })
      .catch((e) => live && setError(`Couldn’t load the data into SQL: ${(e as Error).message}`))
      .finally(() => live && setBuilding(false));
    return () => {
      live = false;
      built?.close();
    };
    // Rebuild only when the data itself changes (signature), not on every render.
  }, [signature]);

  const run = (text = sql) => {
    if (!db || !text.trim()) return;
    try {
      const res = runQuery(db.db, text);
      setResult(res);
      setLastSql(text.trim());
      setError(null);
      const h = [text.trim(), ...history.filter((x) => x !== text.trim())];
      setHistory(h);
      saveHistory(h);
    } catch (e) {
      setError((e as Error).message);
      setResult(null);
    }
  };

  const insert = (snippet: string) => {
    const el = editor.current;
    if (!el) return setSql((s) => s + snippet);
    const { selectionStart: a, selectionEnd: b } = el;
    const next = sql.slice(0, a) + snippet + sql.slice(b);
    setSql(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(a + snippet.length, a + snippet.length);
    });
  };

  const askAi = async () => {
    if (!db || !question.trim()) return;
    setAiBusy(true);
    setAiNote(null);
    try {
      const tables = db.tables.map((t) => {
        const ds = datasets.find((d) => d.id === t.datasetId)!;
        const sample = ds.rows.slice(0, 3).map((r) => Object.fromEntries(t.columns.map((c) => [c.name, typeof r[c.name] === 'string' ? String(r[c.name]).slice(0, 30) : (r[c.name] ?? null)])));
        return { name: t.name, dataset: t.datasetName, columns: t.columns, sample };
      });
      const res = await ai.sql({ tables, question: question.trim() });
      setSql(res.sql);
      setAiNote(res.explanation);
      run(res.sql);
    } catch (e) {
      setAiNote(e instanceof AiRequestError ? e.message : String(e));
    } finally {
      setAiBusy(false);
    }
  };

  const save = (chart: boolean) => {
    if (!result) return;
    const name = prompt('Name for the new dataset', `Query ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
    if (name?.trim()) onSave(name.trim(), lastSql, result, chart);
  };

  return (
    <div className="query-view">
      <aside className="query-schema" aria-label="Tables">
        <h3 className="picker-group">Tables</h3>
        {building && <p className="muted small">Loading data…</p>}
        {db?.tables.map((t) => (
          <div key={t.name} className="schema-table">
            <button type="button" className="schema-name" aria-expanded={open === t.name} onClick={() => setOpen(open === t.name ? null : t.name)}>
              <code>{t.name}</code>
              <span className="muted small">{t.rows.toLocaleString()} rows</span>
            </button>
            <div className="muted small schema-src" title={t.fileName}>
              {t.datasetName}
            </div>
            {open === t.name && (
              <ul className="schema-cols">
                <li>
                  <button type="button" className="link-btn small" onClick={() => setSql(`SELECT *\nFROM "${t.name}"\nLIMIT 100;`)}>
                    SELECT * FROM {t.name}
                  </button>
                </li>
                {t.columns.map((c) => (
                  <li key={c.name}>
                    <button type="button" className="schema-col" onClick={() => insert(`"${c.name}"`)} title="Insert into query">
                      <span>{c.name}</span>
                      <span className={`type-badge type-${c.type}`}>{c.type}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
        <p className="muted small">Queries run on an in-browser copy, so your datasets aren’t changed.</p>
      </aside>

      <section className="query-main">
        <div className="query-ask">
          <input
            type="text"
            placeholder={aiReady(status) ? 'Describe what you want, e.g. “total revenue per month in 2025, highest first”' : 'AI unavailable. Write SQL below.'}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && askAi()}
            disabled={!aiReady(status)}
            aria-label="Describe the query"
          />
          <button type="button" className="btn btn-ai" onClick={askAi} disabled={!aiReady(status) || aiBusy || !question.trim() || !db}>
            <IconSparkle size={16} />
            {aiBusy ? 'Writing…' : 'Write SQL'}
          </button>
        </div>
        {aiNote && <p className="muted small">{aiNote}</p>}

        <div className="query-editor">
          <textarea
            ref={editor}
            value={sql}
            spellCheck={false}
            onChange={(e) => setSql(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                run();
              }
            }}
            aria-label="SQL query"
            placeholder='SELECT "Region", SUM("Revenue") AS revenue FROM sales GROUP BY 1 ORDER BY 2 DESC'
          />
          <div className="query-bar">
            <button type="button" className="btn btn-primary" onClick={() => run()} disabled={!db || building || !sql.trim()}>
              Run query
            </button>
            <span className="muted small">Ctrl/⌘ + Enter</span>
            {history.length > 0 && (
              <select className="query-history" value="" onChange={(e) => e.target.value && setSql(e.target.value)} aria-label="Recent queries">
                <option value="">Recent queries…</option>
                {history.map((h) => (
                  <option key={h} value={h}>
                    {h.replace(/\s+/g, ' ').slice(0, 80)}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {error && (
          <div className="check-error" role="alert">
            <strong>SQL error:</strong> {error}
          </div>
        )}
        {result && (
          <div className="query-results">
            <div className="query-results-head">
              <span className="muted small">
                {result.columns.length ? `${result.rows.length.toLocaleString()} row${result.rows.length === 1 ? '' : 's'} · ${result.columns.length} columns · ${result.ms} ms` : 'Statement ran; it returned no rows.'}
                {result.rows.length > SHOW_ROWS && ` · showing the first ${SHOW_ROWS.toLocaleString()}`}
              </span>
              {result.rows.length > 0 && (
                <span className="query-actions">
                  <button type="button" className="btn btn-small" onClick={() => save(false)}>
                    Save as dataset
                  </button>
                  <button type="button" className="btn btn-small btn-primary" onClick={() => save(true)}>
                    Chart this result
                  </button>
                </span>
              )}
            </div>
            {result.columns.length > 0 && (
              <DataTable columns={result.columns.map((c, i) => ({ key: String(i), label: c, numeric: result.rows.some((r) => typeof r[i] === 'number') }))} rows={result.rows.slice(0, SHOW_ROWS).map((r) => Object.fromEntries(r.map((v, i) => [String(i), v])))} limit={SHOW_ROWS} maxHeight={480} />
            )}
          </div>
        )}
      </section>
    </div>
  );
}
