import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChartConfig, Dataset } from './types';
import { parseFile, type ParsedTable } from './lib/parsers';
import { SAMPLES, starterChartsFor, type SampleDef } from './lib/sample';
import { normalizeConfig } from './charts/config';
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
  duration?: number;
}

function toDataset(t: ParsedTable, fileName: string): Dataset {
  return { id: uid('d_'), name: t.name, fileName, columns: t.columns, rows: t.rows, createdAt: Date.now() };
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
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), t.duration ?? (t.action ? 6000 : 4000));
  }, []);

  // Restore the last workspace from this browser.
  useEffect(() => {
    loadWorkspace().then((ws) => {
      if (ws) {
        setDatasets(ws.datasets);
        setCharts(ws.charts.map(normalizeConfig));
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
    const notes: string[] = [];
    for (const f of files) {
      try {
        const tables = await parseFile(f);
        added.push(...tables.map((t) => toDataset(t, f.name)));
        notes.push(...tables.flatMap((t) => t.notes ?? []));
        const nested = tables.filter((t) => t.name.includes(' › '));
        if (nested.length) notes.push(`Nested lists became linked tables: ${nested.map((t) => t.name.split(' › ').slice(1).join(' › ')).join(', ')}.`);
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

  const loadSample = (sample: SampleDef = SAMPLES[0]) => {
    const ds = toDataset(sample.build(), sample.file);
    setDatasets((d) => [...d, ds]);
    setCharts((c) => [...c, ...starterChartsFor(sample, ds)]);
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
              <SampleMenu onPick={loadSample} label="Try sample data" />
            </FileDrop>
            <p className="muted small">Files are read in your browser and never uploaded to a server.</p>
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

function SampleMenu({ onPick, label, small }: { onPick: (s: SampleDef) => void; label: string; small?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
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
