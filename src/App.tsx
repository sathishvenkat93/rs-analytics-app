import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChartConfig, Dataset } from './types';
import { DEFAULT_OPTIONS } from './types';
import { parseFile, type ParsedTable } from './lib/parsers';
import { sampleSalesData } from './lib/sample';
import { loadWorkspace, saveWorkspace, type ThemePref } from './lib/storage';
import { useTheme } from './lib/theme';
import { uid } from './lib/id';
import { AddChartModal } from './components/AddChartModal';
import { Dashboard } from './components/Dashboard';
import { DatasetPreview } from './components/DatasetPreview';
import { FileDrop } from './components/FileDrop';
import { IconEye, IconFile, IconMonitor, IconMoon, IconPlus, IconSun, IconTrash, IconUpload } from './components/icons';
import { ACCEPT_ATTR } from './lib/parsers';

type ModalState = { kind: 'add' } | { kind: 'edit'; cfg: ChartConfig } | { kind: 'preview'; id: string } | null;
interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'error';
  action?: { label: string; run: () => void };
}

function toDataset(t: ParsedTable, fileName: string): Dataset {
  return { id: uid('d_'), name: t.name, fileName, columns: t.columns, rows: t.rows, createdAt: Date.now() };
}

function starterCharts(ds: Dataset): ChartConfig[] {
  const base = { datasetId: ds.id, includeCategories: null, dateBucket: 'none' as const, aggregation: 'sum' as const };
  return [
    { ...base, id: uid('c_'), type: 'kpi', title: 'Total revenue', xField: null, yFields: ['Revenue'], options: { ...DEFAULT_OPTIONS, width: 'third' } },
    { ...base, id: uid('c_'), type: 'kpi', title: 'Total profit', xField: null, yFields: ['Profit'], options: { ...DEFAULT_OPTIONS, width: 'third' } },
    { ...base, id: uid('c_'), type: 'kpi', title: 'Orders', xField: null, yFields: [], aggregation: 'count', options: { ...DEFAULT_OPTIONS, width: 'third' } },
    { ...base, id: uid('c_'), type: 'line', title: 'Revenue & profit by month', xField: 'Order Date', dateBucket: 'month', yFields: ['Revenue', 'Profit'], options: { ...DEFAULT_OPTIONS, width: 'full' } },
    { ...base, id: uid('c_'), type: 'bar', title: 'Revenue & profit by region', xField: 'Region', yFields: ['Revenue', 'Profit'], options: { ...DEFAULT_OPTIONS, sort: 'desc', showLabels: false } },
    { ...base, id: uid('c_'), type: 'pie', title: 'Revenue share by category', xField: 'Category', yFields: ['Revenue'], options: { ...DEFAULT_OPTIONS } },
  ];
}

export function App() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [charts, setCharts] = useState<ChartConfig[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const uploadRef = useRef<HTMLInputElement>(null);

  const toast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random();
    setToasts((ts) => [...ts.slice(-2), { ...t, id }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), t.action ? 6000 : 4000);
  }, []);

  // Restore the last workspace from this browser.
  useEffect(() => {
    loadWorkspace().then((ws) => {
      if (ws) {
        setDatasets(ws.datasets);
        setCharts(ws.charts);
        setActiveId(ws.datasets[0]?.id ?? null);
      }
      setLoaded(true);
    });
  }, []);

  // Autosave (debounced).
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      saveWorkspace({ datasets, charts }).then((ok) => {
        if (!ok) toast({ message: 'Couldn’t save the workspace in this browser. Your charts will last until you close the tab.', tone: 'error' });
      });
    }, 400);
    return () => clearTimeout(t);
  }, [datasets, charts, loaded, toast]);

  const handleFiles = async (files: File[]) => {
    setBusy(true);
    const added: Dataset[] = [];
    for (const f of files) {
      try {
        const tables = await parseFile(f);
        added.push(...tables.map((t) => toDataset(t, f.name)));
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
    }
  };

  const loadSample = () => {
    const ds = toDataset(sampleSalesData(), 'sample-sales.csv');
    setDatasets((d) => [...d, ds]);
    setCharts((c) => [...c, ...starterCharts(ds)]);
    setActiveId(ds.id);
  };

  const removeDataset = (ds: Dataset) => {
    const dependent = charts.filter((c) => c.datasetId === ds.id).length;
    if (dependent && !confirm(`Remove “${ds.name}”? This also deletes ${dependent} chart${dependent > 1 ? 's' : ''} built from it.`)) return;
    setDatasets((d) => d.filter((x) => x.id !== ds.id));
    setCharts((c) => c.filter((x) => x.datasetId !== ds.id));
    if (activeId === ds.id) setActiveId(datasets.find((d) => d.id !== ds.id)?.id ?? null);
  };

  const submitChart = (cfg: ChartConfig) => {
    setCharts((cs) => (cs.some((c) => c.id === cfg.id) ? cs.map((c) => (c.id === cfg.id ? cfg : c)) : [...cs, cfg]));
    setModal(null);
  };

  const updateChart = (cfg: ChartConfig) => setCharts((cs) => cs.map((c) => (c.id === cfg.id ? cfg : c)));

  const duplicateChart = (cfg: ChartConfig) =>
    setCharts((cs) => {
      const i = cs.findIndex((c) => c.id === cfg.id);
      const copy = { ...cfg, id: uid('c_'), title: `${cfg.title} (copy)` };
      return [...cs.slice(0, i + 1), copy, ...cs.slice(i + 1)];
    });

  const deleteChart = (cfg: ChartConfig) => {
    const before = charts;
    setCharts((cs) => cs.filter((c) => c.id !== cfg.id));
    toast({ message: `Deleted “${cfg.title}”`, tone: 'info', action: { label: 'Undo', run: () => setCharts(before) } });
  };

  const hasData = datasets.length > 0;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img src="/favicon.svg" alt="" width={26} height={26} />
          <span className="brand-name">RS Analytics</span>
        </div>
        <div className="topbar-actions">
          <ThemeSwitch />
          {hasData && (
            <>
              <button type="button" className="btn" onClick={() => uploadRef.current?.click()} disabled={busy}>
                <IconUpload size={16} />
                <span className="hide-sm">Upload</span>
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setModal({ kind: 'add' })}>
                <IconPlus size={16} />
                Add chart
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
              <button type="button" className="btn" onClick={loadSample}>
                Try sample sales data
              </button>
            </FileDrop>
            <p className="muted small">Files are read in your browser and never uploaded to a server.</p>
          </section>
        ) : (
          <>
            <section className="sources" aria-label="Data sources">
              <div className="section-head">
                <h2>Data sources</h2>
              </div>
              <div className="source-list">
                {datasets.map((d) => (
                  <div key={d.id} className={`source-card${d.id === activeId ? ' active' : ''}`} onClick={() => setActiveId(d.id)}>
                    <IconFile size={20} className="source-icon" />
                    <div className="source-text">
                      <div className="source-name" title={d.name}>
                        {d.name}
                      </div>
                      <div className="muted small">
                        {d.rows.length.toLocaleString()} rows · {d.columns.length} cols
                      </div>
                    </div>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`Preview ${d.name}`}
                      title="Preview data"
                      onClick={(e) => {
                        e.stopPropagation();
                        setModal({ kind: 'preview', id: d.id });
                      }}
                    >
                      <IconEye size={16} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn danger"
                      aria-label={`Remove ${d.name}`}
                      title="Remove dataset"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeDataset(d);
                      }}
                    >
                      <IconTrash size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section aria-label="Dashboard">
              <div className="section-head">
                <h2>Dashboard</h2>
                {charts.length > 1 && <span className="muted small hide-sm">Drag the ⠿ handle to rearrange widgets</span>}
              </div>
              {charts.length === 0 ? (
                <div className="empty-dash">
                  <p>No charts yet.</p>
                  <button type="button" className="btn btn-primary" onClick={() => setModal({ kind: 'add' })}>
                    <IconPlus size={16} />
                    Add your first chart
                  </button>
                </div>
              ) : (
                <Dashboard
                  charts={charts}
                  datasets={datasets}
                  onReorder={setCharts}
                  onChange={updateChart}
                  onEdit={(cfg) => setModal({ kind: 'edit', cfg })}
                  onDuplicate={duplicateChart}
                  onDelete={deleteChart}
                />
              )}
              <button type="button" className="add-tile" onClick={() => setModal({ kind: 'add' })}>
                <IconPlus size={18} />
                Add chart
              </button>
            </section>
          </>
        )}
      </main>

      {modal?.kind === 'add' && <AddChartModal datasets={datasets} defaultDatasetId={activeId} onSubmit={submitChart} onClose={() => setModal(null)} />}
      {modal?.kind === 'edit' && <AddChartModal datasets={datasets} defaultDatasetId={activeId} initial={modal.cfg} onSubmit={submitChart} onClose={() => setModal(null)} />}
      {modal?.kind === 'preview' && datasets.find((d) => d.id === modal.id) && (
        <DatasetPreview dataset={datasets.find((d) => d.id === modal.id)!} onClose={() => setModal(null)} />
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
