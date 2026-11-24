import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChartConfig, DashboardDoc, Dataset } from './types';
import { needsValidation, parseFile } from './lib/parsers';
import { checkFile, toDataset, type FileReport } from './lib/validate';
import { SAMPLES, starterChartsFor, type SampleDef } from './lib/sample';
import { normalizeConfig } from './charts/config';
import { loadWorkspace, saveWorkspace, type ThemePref } from './lib/storage';
import { useTheme } from './lib/theme';
import { uid } from './lib/id';
import { buildTable } from './lib/infer';
import { applyColumnChanges, remapChart, type ColumnChanges } from './lib/columns';
import { buildQueryDb, runQuery, type QueryResult } from './lib/sqlEngine';
import { aiReady, useAiStatus } from './ai/api';
import { AddChartModal } from './components/AddChartModal';
import { Dashboard } from './components/Dashboard';
import { DatasetPreview } from './components/DatasetPreview';
import { FileDrop } from './components/FileDrop';
import { FileCheckDialog } from './components/FileCheckDialog';
import { ColumnToolsDialog } from './components/ColumnToolsDialog';
import { AiSuggestDialog } from './components/AiSuggestDialog';
import { ChatPanel, newChatSession, type ChatLink, type ChatSession } from './components/ChatPanel';
import { QueryView } from './components/QueryView';
import { Segmented } from './components/Segmented';
import { IconColumns, IconDashboard, IconEye, IconFile, IconMonitor, IconMoon, IconPlus, IconRefresh, IconSparkle, IconSun, IconTrash, IconUpload } from './components/icons';
import { ACCEPT_ATTR } from './lib/parsers';

type ModalState =
  | { kind: 'add'; datasetId?: string }
  | { kind: 'edit'; cfg: ChartConfig }
  | { kind: 'chatEdit'; cfg: ChartConfig; save: (cfg: ChartConfig) => void }
  | { kind: 'preview'; id: string }
  | { kind: 'check'; reports: FileReport[] }
  | { kind: 'columns'; id: string }
  | { kind: 'suggest' }
  | { kind: 'generate' }
  | null;

interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'error';
  action?: { label: string; run: () => void };
  duration?: number;
}

const newDashboard = (name: string, charts: ChartConfig[] = [], origin: DashboardDoc['origin'] = 'manual'): DashboardDoc => ({ id: uid('db_'), name, charts, createdAt: Date.now(), updatedAt: Date.now(), origin });

export function App() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [dashboards, setDashboards] = useState<DashboardDoc[]>([]);
  const [activeDashId, setActiveDashId] = useState<string | null>(null);
  const [view, setView] = useState<'dashboard' | 'query'>('dashboard');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [chat, setChat] = useState<ChatSession>(newChatSession);
  const uploadRef = useRef<HTMLInputElement>(null);
  const aiStatus = useAiStatus();
  const canAi = aiReady(aiStatus);

  const active = dashboards.find((d) => d.id === activeDashId) ?? dashboards[0];
  const charts = active?.charts ?? [];
  const allCharts = useMemo(() => dashboards.flatMap((d) => d.charts), [dashboards]);

  const toast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random();
    setToasts((ts) => [...ts.slice(-2), { ...t, id }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), t.duration ?? (t.action ? 6000 : 4000));
  }, []);

  /** Update the charts of one dashboard (the open one by default). */
  const setChartsOf = useCallback((dashId: string | undefined, fn: (cs: ChartConfig[]) => ChartConfig[]) => {
    setDashboards((ds) => ds.map((d) => (d.id === dashId ? { ...d, charts: fn(d.charts), updatedAt: Date.now() } : d)));
  }, []);
  const setCharts = (fn: (cs: ChartConfig[]) => ChartConfig[]) => setChartsOf(active?.id, fn);

  // Restore the last workspace from this browser (v1 had one implicit dashboard).
  useEffect(() => {
    loadWorkspace().then((ws) => {
      let dash = ws?.dashboards?.length ? ws.dashboards : [newDashboard('My dashboard', ws?.charts ?? [])];
      dash = dash.map((d) => ({ ...d, charts: d.charts.map(normalizeConfig) }));
      if (ws) {
        setDatasets(ws.datasets);
        setActiveId(ws.datasets[0]?.id ?? null);
      }
      setDashboards(dash);
      setActiveDashId(ws?.activeDashboardId && dash.some((d) => d.id === ws.activeDashboardId) ? ws.activeDashboardId : dash[0].id);
      setLoaded(true);
    });
  }, []);

  // Autosave (debounced).
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      saveWorkspace({ datasets, dashboards, activeDashboardId: active?.id ?? null }).then((ok) => {
        if (!ok) toast({ message: 'Couldn’t save the workspace in this browser. Your charts will last until you close the tab.', tone: 'error' });
      });
    }, 400);
    return () => clearTimeout(t);
  }, [datasets, dashboards, active?.id, loaded, toast]);

  /* ---------- data in ---------- */

  const handleFiles = async (files: File[]) => {
    setBusy(true);
    // CSV and Excel are tabular already and load directly. Every other format
    // (TSV, JSON, XML, SQL, SQLite, unknown) is checked for visualisable data first.
    const toCheck = files.filter((f) => needsValidation(f.name));
    const direct = files.filter((f) => !needsValidation(f.name));
    if (toCheck.length) {
      const reports = await Promise.all(toCheck.map(checkFile));
      setModal({ kind: 'check', reports });
    }
    const added: Dataset[] = [];
    const notes: string[] = [];
    for (const f of direct) {
      try {
        const tables = await parseFile(f);
        added.push(...tables.map((t) => toDataset(t, f.name)));
        const fileNotes = tables.flatMap((t) => t.notes ?? []);
        const nested = tables.filter((t) => t.name.includes(' › '));
        if (nested.length) fileNotes.push(`Nested lists became linked tables: ${nested.map((t) => t.name.split(' › ').slice(1).join(' › ')).join(', ')}.`);
        if (fileNotes.length) notes.push(files.length > 1 ? `${f.name}: ${fileNotes.join(' ')}` : fileNotes.join(' '));
      } catch (e) {
        toast({ message: (e as Error).message, tone: 'error' });
      }
    }
    setBusy(false);
    if (added.length) {
      setDatasets((d) => [...d, ...added]);
      setActiveId(added[added.length - 1].id);
      const rows = added.reduce((s, d) => s + d.rows.length, 0);
      toast({
        message: `Loaded ${added.length === 1 ? added[0].name : `${added.length} tables`} · ${rows.toLocaleString()} rows`,
        tone: 'info',
        action: { label: 'Add chart', run: () => setModal({ kind: 'add' }) },
      });
      if (notes.length) toast({ message: notes.join(' '), tone: 'info', duration: 9000 });
    }
  };

  /** After the file check: add the chosen tables and land on the dashboard with the chart picker open. */
  const acceptChecked = (picked: Dataset[]) => {
    setDatasets((d) => [...d, ...picked]);
    setActiveId(picked[0].id);
    setView('dashboard');
    toast({ message: `Added ${picked.length === 1 ? picked[0].name : `${picked.length} tables`}. Pick a chart to start your dashboard.`, tone: 'info' });
    setModal({ kind: 'add' });
    requestAnimationFrame(() => document.querySelector('[aria-label="Dashboard"]')?.scrollIntoView({ block: 'start' }));
  };

  const loadSample = (sample: SampleDef = SAMPLES[0]) => {
    const ds = toDataset(sample.build(), sample.file);
    const starters = starterChartsFor(sample, ds);
    setDatasets((d) => [...d, ds]);
    setActiveId(ds.id);
    if (active && active.charts.length === 0) setCharts(() => starters);
    else {
      const dash = newDashboard(`${sample.label} sample`, starters, 'sample');
      setDashboards((d) => [...d, dash]);
      setActiveDashId(dash.id);
    }
  };

  const removeDataset = (ds: Dataset) => {
    const dependent = allCharts.filter((c) => c.datasetId === ds.id).length;
    if (dependent && !confirm(`Remove “${ds.name}”? This also deletes ${dependent} chart${dependent > 1 ? 's' : ''} built from it, across all dashboards.`)) return;
    setDatasets((d) => d.filter((x) => x.id !== ds.id));
    setDashboards((dbs) => dbs.map((d) => ({ ...d, charts: d.charts.filter((c) => c.datasetId !== ds.id) })));
    if (activeId === ds.id) setActiveId(datasets.find((d) => d.id !== ds.id)?.id ?? null);
  };

  /** Renames/discards/NA cleanup, applied to the dataset, every dashboard and the chat history. */
  const applyColumns = (dsId: string, changes: ColumnChanges) => {
    setDatasets((list) => list.map((d) => (d.id === dsId ? applyColumnChanges(d, changes) : d)));
    if (changes.rename.size) {
      setDashboards((dbs) => dbs.map((d) => ({ ...d, charts: d.charts.map((c) => (c.datasetId === dsId ? remapChart(c, changes.rename) : c)) })));
      setChat((s) => ({ ...s, messages: s.messages.map((m) => (m.chart && m.chart.config.datasetId === dsId ? { ...m, chart: { ...m.chart, config: remapChart(m.chart.config, changes.rename) } } : m)) }));
    }
    setModal(null);
    const parts = [changes.rename.size && `renamed ${changes.rename.size}`, changes.discard.length && `discarded ${changes.discard.length}`, changes.cleanNa && 'cleaned missing values'].filter(Boolean);
    toast({ message: `Columns updated: ${parts.join(', ')}.`, tone: 'info' });
  };

  /* ---------- SQL query datasets ---------- */

  const saveQuery = (name: string, sql: string, result: QueryResult, chart: boolean) => {
    const table = buildTable(result.columns, result.rows);
    const ds: Dataset = { id: uid('d_'), name, fileName: 'SQL query', columns: table.columns, rows: table.rows, createdAt: Date.now(), source: { kind: 'query', sql } };
    setDatasets((d) => [...d, ds]);
    setActiveId(ds.id);
    if (chart) {
      setView('dashboard');
      setModal({ kind: 'add', datasetId: ds.id });
    } else toast({ message: `Saved “${name}” as a dataset (${ds.rows.length.toLocaleString()} rows).`, tone: 'info', action: { label: 'Chart it', run: () => (setView('dashboard'), setModal({ kind: 'add', datasetId: ds.id })) } });
  };

  /** Re-runs a query dataset against the current data; its charts update in place. */
  const refreshQuery = async (ds: Dataset) => {
    if (!ds.source) return;
    try {
      const { db } = await buildQueryDb(datasets.filter((d) => d.id !== ds.id));
      try {
        const res = runQuery(db, ds.source.sql);
        const table = buildTable(res.columns, res.rows);
        setDatasets((list) => list.map((d) => (d.id === ds.id ? { ...d, columns: table.columns, rows: table.rows } : d)));
        toast({ message: `Re-ran “${ds.name}”: ${table.rows.length.toLocaleString()} rows.`, tone: 'info' });
      } finally {
        db.close();
      }
    } catch (e) {
      toast({ message: `Couldn’t re-run “${ds.name}”: ${(e as Error).message}`, tone: 'error', duration: 8000 });
    }
  };

  /* ---------- charts ---------- */

  const submitChart = (cfg: ChartConfig) => {
    setCharts((cs) => (cs.some((c) => c.id === cfg.id) ? cs.map((c) => (c.id === cfg.id ? cfg : c)) : [...cs, cfg]));
    setModal(null);
  };
  const updateChart = (cfg: ChartConfig) => setCharts((cs) => cs.map((c) => (c.id === cfg.id ? cfg : c)));
  const duplicateChart = (cfg: ChartConfig) =>
    setCharts((cs) => {
      const i = cs.findIndex((c) => c.id === cfg.id);
      return [...cs.slice(0, i + 1), { ...cfg, id: uid('c_'), title: `${cfg.title} (copy)` }, ...cs.slice(i + 1)];
    });
  const deleteChart = (cfg: ChartConfig) => {
    const before = charts;
    const dashId = active?.id;
    setCharts((cs) => cs.filter((c) => c.id !== cfg.id));
    toast({ message: `Deleted “${cfg.title}”`, tone: 'info', action: { label: 'Undo', run: () => setChartsOf(dashId, () => before) } });
  };

  /* ---------- dashboards ---------- */

  const createDashboard = (name: string, cs: ChartConfig[] = [], origin: DashboardDoc['origin'] = 'manual') => {
    const d = newDashboard(name, cs, origin);
    setDashboards((list) => [...list, d]);
    setActiveDashId(d.id);
    setView('dashboard');
    return d;
  };
  const renameDashboard = () => {
    if (!active) return;
    const name = prompt('Rename dashboard', active.name)?.trim();
    if (name) setDashboards((list) => list.map((d) => (d.id === active.id ? { ...d, name, updatedAt: Date.now() } : d)));
  };
  const deleteDashboard = () => {
    if (!active) return;
    if (!confirm(`Delete the dashboard “${active.name}” and its ${active.charts.length} chart${active.charts.length === 1 ? '' : 's'}? Datasets are kept.`)) return;
    const rest = dashboards.filter((d) => d.id !== active.id);
    const next = rest.length ? rest : [newDashboard('My dashboard')];
    setDashboards(next);
    setActiveDashId(next[0].id);
  };

  /* ---------- chat ⇄ dashboard ---------- */

  const chatAdd = (cfg: ChartConfig): ChatLink => {
    const copy = { ...cfg, id: uid('c_') };
    setCharts((cs) => [...cs, copy]);
    toast({ message: `Added “${cfg.title}” to ${active?.name}.`, tone: 'info' });
    return { dashboardId: active!.id, chartId: copy.id };
  };
  const chatUpdate = (link: ChatLink, cfg: ChartConfig): boolean => {
    const dash = dashboards.find((d) => d.id === link.dashboardId);
    const existing = dash?.charts.find((c) => c.id === link.chartId);
    if (!dash || !existing) {
      toast({ message: 'That chart is no longer on the dashboard. Use “Add” to place it again.', tone: 'error' });
      return false;
    }
    setChartsOf(dash.id, (cs) => cs.map((c) => (c.id === link.chartId ? { ...cfg, id: link.chartId, options: { ...cfg.options, width: existing.options.width } } : c)));
    if (dash.id !== active?.id) setActiveDashId(dash.id);
    toast({ message: `Updated “${cfg.title}” on ${dash.name}.`, tone: 'info' });
    return true;
  };
  const refineWithAi = (cfg: ChartConfig) => {
    if (!active) return;
    const msg = { id: uid('m_'), role: 'assistant' as const, text: `Let’s refine “${cfg.title}”. Tell me what to change, or edit it by hand.`, chart: { config: cfg, issues: [] }, link: { dashboardId: active.id, chartId: cfg.id } };
    setChat((s) => ({ ...s, messages: [...s.messages, msg], focusId: msg.id }));
    setChatOpen(true);
  };

  const hasData = datasets.length > 0;
  const activeDataset = datasets.find((d) => d.id === activeId);

  return (
    <div className={`app${chatOpen && hasData ? ' chat-open' : ''}`}>
      <header className="topbar">
        <div className="brand">
          <img src="/favicon.svg" alt="" width={26} height={26} />
          <span className="brand-name">RS Analytics</span>
        </div>
        {hasData && (
          <Segmented
            options={[
              { value: 'dashboard', label: 'Dashboards' },
              { value: 'query', label: 'SQL query' },
            ]}
            value={view}
            onChange={(v) => setView(v as 'dashboard' | 'query')}
          />
        )}
        <div className="topbar-actions">
          <ThemeSwitch />
          {hasData && (
            <>
              <button type="button" className="btn" onClick={() => uploadRef.current?.click()} disabled={busy}>
                <IconUpload size={16} />
                <span className="hide-sm">Upload</span>
              </button>
              <button type="button" className={`btn btn-ai${chatOpen ? ' on' : ''}`} onClick={() => setChatOpen((o) => !o)} aria-pressed={chatOpen} title={aiStatus?.message}>
                <IconSparkle size={16} />
                <span className="hide-sm">Ask AI</span>
                <span className={`status-dot ${canAi ? 'ok' : 'off'}`} aria-label={canAi ? 'AI available' : 'AI unavailable'} />
              </button>
              <button type="button" className="btn btn-primary" onClick={() => (setView('dashboard'), setModal({ kind: 'add' }))}>
                <IconPlus size={16} />
                <span className="hide-sm">Add chart</span>
              </button>
            </>
          )}
          <input
            ref={uploadRef}
            type="file"
            accept={ACCEPT_ATTR}
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files?.length) handleFiles([...e.target.files]);
              e.target.value = '';
            }}
          />
        </div>
      </header>

      <main className="main">
        {!loaded ? null : !hasData ? (
          <section className="hero">
            <h1>Turn a spreadsheet into a dashboard</h1>
            <p className="muted">Upload sales or any tabular data, pick the columns to plot, and arrange chart widgets by dragging them.</p>
            <FileDrop onFiles={handleFiles} busy={busy}>
              <SampleMenu onPick={loadSample} label="Try sample data" />
            </FileDrop>
            <p className="muted small">Files are read in your browser. AI features send only column names, summary stats and a few sample rows to your configured Amazon Bedrock model.</p>
          </section>
        ) : (
          <>
            <section className="sources" aria-label="Data sources">
              <div className="section-head">
                <h2>Data sources</h2>
                <SampleMenu onPick={loadSample} label="Add sample" small />
              </div>
              <div className="source-list">
                {datasets.map((d) => (
                  <div key={d.id} className={`source-card${d.id === activeId ? ' active' : ''}`} onClick={() => setActiveId(d.id)}>
                    <IconFile size={20} className="source-icon" />
                    <div className="source-text">
                      <div className="source-name" title={d.source ? d.source.sql : d.name}>
                        {d.source && <span className="ai-tag">SQL</span>} {d.name}
                      </div>
                      <div className="muted small">
                        {d.rows.length.toLocaleString()} rows · {d.columns.length} cols
                      </div>
                    </div>
                    {d.source && (
                      <CardButton label={`Re-run query for ${d.name}`} title="Re-run query on the current data" onClick={() => refreshQuery(d)}>
                        <IconRefresh size={16} />
                      </CardButton>
                    )}
                    <CardButton label={`Optimise columns of ${d.name}`} title="Optimise columns (rename, discard, clean)" onClick={() => setModal({ kind: 'columns', id: d.id })}>
                      <IconColumns size={16} />
                    </CardButton>
                    <CardButton label={`Preview ${d.name}`} title="Preview data" onClick={() => setModal({ kind: 'preview', id: d.id })}>
                      <IconEye size={16} />
                    </CardButton>
                    <CardButton label={`Remove ${d.name}`} title="Remove dataset" danger onClick={() => removeDataset(d)}>
                      <IconTrash size={16} />
                    </CardButton>
                  </div>
                ))}
              </div>
            </section>

            {view === 'query' ? (
              <section aria-label="SQL query">
                <div className="section-head">
                  <h2>SQL query</h2>
                  <span className="muted small hide-sm">Every dataset is a table. Save a result as a dataset to chart it on any dashboard.</span>
                </div>
                <QueryView datasets={datasets} onSave={saveQuery} />
              </section>
            ) : (
              <section aria-label="Dashboard">
                <div className="section-head dash-head">
                  <IconDashboard size={18} className="source-icon" />
                  <DashboardMenu dashboards={dashboards} active={active} onSwitch={setActiveDashId} onNew={() => createDashboard(`Dashboard ${dashboards.length + 1}`)} onGenerate={() => setModal({ kind: 'generate' })} onRename={renameDashboard} onDelete={deleteDashboard} canAi={canAi} />
                  {charts.length > 1 && <span className="muted small hide-sm">Drag the ⠿ handle to rearrange widgets</span>}
                  <span className="spacer" />
                  <button type="button" className="btn btn-ai btn-small" onClick={() => setModal({ kind: 'suggest' })} disabled={!canAi} title={canAi ? 'Let AI propose charts for this dashboard' : aiStatus?.message}>
                    <IconSparkle size={14} />
                    Suggest charts
                  </button>
                </div>
                {charts.length === 0 ? (
                  <div className="empty-dash">
                    <p>No charts on “{active?.name}” yet.</p>
                    <div className="empty-actions">
                      <button type="button" className="btn btn-primary" onClick={() => setModal({ kind: 'add' })}>
                        <IconPlus size={16} />
                        Add a chart
                      </button>
                      <button type="button" className="btn btn-ai" onClick={() => setModal({ kind: 'suggest' })} disabled={!canAi}>
                        <IconSparkle size={16} />
                        Suggest charts with AI
                      </button>
                    </div>
                  </div>
                ) : (
                  <Dashboard
                    charts={charts}
                    datasets={datasets}
                    onReorder={(next) => setCharts(() => next)}
                    onChange={updateChart}
                    onEdit={(cfg) => setModal({ kind: 'edit', cfg })}
                    onDuplicate={duplicateChart}
                    onDelete={deleteChart}
                    onRefine={canAi ? refineWithAi : undefined}
                  />
                )}
                <button type="button" className="add-tile" onClick={() => setModal({ kind: 'add' })}>
                  <IconPlus size={18} />
                  Add chart
                </button>
              </section>
            )}
          </>
        )}
      </main>

      {chatOpen && hasData && (
        <ChatPanel
          session={chat}
          onSession={setChat}
          datasets={datasets}
          activeDatasetId={activeId}
          dashboardName={active?.name ?? 'dashboard'}
          onClose={() => setChatOpen(false)}
          onAddChart={chatAdd}
          onUpdateChart={chatUpdate}
          onEditChart={(cfg, save) => setModal({ kind: 'chatEdit', cfg, save })}
        />
      )}

      {modal?.kind === 'add' && <AddChartModal datasets={datasets} defaultDatasetId={modal.datasetId ?? activeId} onSubmit={submitChart} onClose={() => setModal(null)} />}
      {modal?.kind === 'edit' && <AddChartModal datasets={datasets} defaultDatasetId={activeId} initial={modal.cfg} onSubmit={submitChart} onClose={() => setModal(null)} />}
      {modal?.kind === 'chatEdit' && (
        <AddChartModal
          datasets={datasets}
          defaultDatasetId={modal.cfg.datasetId}
          initial={modal.cfg}
          onSubmit={(cfg) => {
            modal.save(cfg);
            setModal(null);
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.kind === 'check' && <FileCheckDialog reports={modal.reports} onCancel={() => setModal(null)} onContinue={acceptChecked} />}
      {modal?.kind === 'preview' && datasets.find((d) => d.id === modal.id) && <DatasetPreview dataset={datasets.find((d) => d.id === modal.id)!} onClose={() => setModal(null)} />}
      {modal?.kind === 'columns' && datasets.find((d) => d.id === modal.id) && (
        <ColumnToolsDialog dataset={datasets.find((d) => d.id === modal.id)!} charts={allCharts} onApply={(ch) => applyColumns(modal.id, ch)} onClose={() => setModal(null)} />
      )}
      {(modal?.kind === 'suggest' || modal?.kind === 'generate') && (
        <AiSuggestDialog
          mode={modal.kind === 'generate' ? 'dashboard' : 'suggest'}
          datasets={datasets}
          defaultDatasetId={activeDataset?.id ?? null}
          existingTitles={charts.map((c) => c.title)}
          targetName={active?.name ?? 'dashboard'}
          onAdd={(cs, name) => {
            if (name) {
              createDashboard(name, cs, 'ai');
              toast({ message: `Created “${name}” with ${cs.length} charts. Keep adding or editing charts as usual.`, tone: 'info' });
            } else {
              setCharts((list) => [...list, ...cs]);
              toast({ message: `Added ${cs.length} chart${cs.length === 1 ? '' : 's'} to ${active?.name}.`, tone: 'info' });
            }
            setModal(null);
          }}
          onClose={() => setModal(null)}
        />
      )}

      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone}`}>
            <span>{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  t.action!.run();
                  setToasts((ts) => ts.filter((x) => x.id !== t.id));
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function CardButton({ label, title, onClick, danger, children }: { label: string; title: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      className={`icon-btn${danger ? ' danger' : ''}`}
      aria-label={label}
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {children}
    </button>
  );
}

function useOutsideClose(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);
  return ref;
}

function DashboardMenu({
  dashboards,
  active,
  onSwitch,
  onNew,
  onGenerate,
  onRename,
  onDelete,
  canAi,
}: {
  dashboards: DashboardDoc[];
  active: DashboardDoc | undefined;
  onSwitch: (id: string) => void;
  onNew: () => void;
  onGenerate: () => void;
  onRename: () => void;
  onDelete: () => void;
  canAi: boolean;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useOutsideClose(open, close);
  const pick = (fn: () => void) => () => {
    fn();
    setOpen(false);
  };
  return (
    <div className="menu-wrap" ref={ref}>
      <button type="button" className="dash-switch" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <h2>{active?.name ?? 'Dashboard'}</h2>
        <span className="muted">▾</span>
      </button>
      {open && (
        <div className="menu dash-menu" role="menu">
          <div className="menu-section">Saved dashboards</div>
          {dashboards.map((d) => (
            <button key={d.id} type="button" role="menuitemradio" aria-checked={d.id === active?.id} className={`menu-item${d.id === active?.id ? ' current' : ''}`} onClick={pick(() => onSwitch(d.id))}>
              <span className="menu-label">
                {d.origin === 'ai' && <span className="ai-tag">AI</span>} {d.name}
              </span>
              <span className="menu-hint">
                {d.charts.length} chart{d.charts.length === 1 ? '' : 's'} · updated {new Date(d.updatedAt).toLocaleDateString()}
              </span>
            </button>
          ))}
          <div className="menu-divider" />
          <button type="button" role="menuitem" className="menu-item" onClick={pick(onNew)}>
            <span className="menu-label">＋ New empty dashboard</span>
          </button>
          <button type="button" role="menuitem" className="menu-item" onClick={pick(onGenerate)} disabled={!canAi}>
            <span className="menu-label">✦ Generate a dashboard with AI</span>
            <span className="menu-hint">{canAi ? 'Analyses a dataset and builds a set of charts' : 'AI unavailable'}</span>
          </button>
          <div className="menu-divider" />
          <button type="button" role="menuitem" className="menu-item" onClick={pick(onRename)}>
            <span className="menu-label">Rename “{active?.name}”</span>
          </button>
          <button type="button" role="menuitem" className="menu-item danger" onClick={pick(onDelete)}>
            <span className="menu-label">Delete “{active?.name}”</span>
          </button>
        </div>
      )}
    </div>
  );
}

function ThemeSwitch() {
  const { pref, setPref } = useTheme();
  const opts: { v: ThemePref; label: string; icon: JSX.Element }[] = [
    { v: 'system', label: 'System theme', icon: <IconMonitor size={16} /> },
    { v: 'light', label: 'Light theme', icon: <IconSun size={16} /> },
    { v: 'dark', label: 'Dark theme', icon: <IconMoon size={16} /> },
  ];
  return (
    <div className="segmented icons" role="radiogroup" aria-label="Theme">
      {opts.map((o) => (
        <button key={o.v} type="button" role="radio" aria-checked={pref === o.v} aria-label={o.label} title={o.label} className={pref === o.v ? 'on' : undefined} onClick={() => setPref(o.v)}>
          {o.icon}
        </button>
      ))}
    </div>
  );
}

function SampleMenu({ onPick, label, small }: { onPick: (s: SampleDef) => void; label: string; small?: boolean }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useOutsideClose(open, close);
  return (
    <div className="menu-wrap" ref={ref}>
      <button type="button" className={small ? 'link-btn' : 'btn'} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {label} ▾
      </button>
      {open && (
        <div className="menu" role="menu">
          {SAMPLES.map((s) => (
            <button
              key={s.id}
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={() => {
                onPick(s);
                setOpen(false);
              }}
            >
              <span className="menu-label">{s.label}</span>
              <span className="menu-hint">{s.hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
