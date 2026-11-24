import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChatTurn } from '../../shared/ai';
import type { ChartConfig, Dataset } from '../types';
import { ai, aiReady, AiRequestError, useAiStatus } from '../ai/api';
import { chartCatalog, summarizeDataset } from '../ai/summary';
import { configToSpec, specToConfig } from '../ai/spec';
import { profileDataset } from '../charts/profile';
import { uid } from '../lib/id';
import { ChartRenderer } from './ChartRenderer';
import { IconSend, IconSparkle } from './icons';

export interface ChatLink {
  dashboardId: string;
  chartId: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  chart?: { config: ChartConfig; issues: string[]; edited?: boolean };
  /** The dashboard widget this chart is tied to (added from chat, or opened via "Refine with AI"). */
  link?: ChatLink;
  error?: boolean;
}

export interface ChatSession {
  id: string;
  messages: ChatMessage[];
  /** Message whose chart the next request refines. */
  focusId: string | null;
}

export const newChatSession = (): ChatSession => ({ id: uid('chat_'), messages: [], focusId: null });

interface Props {
  session: ChatSession;
  onSession: (fn: (s: ChatSession) => ChatSession) => void;
  datasets: Dataset[];
  activeDatasetId: string | null;
  dashboardName: string;
  onClose: () => void;
  /** Adds the chart to the open dashboard and returns where it went. */
  onAddChart: (cfg: ChartConfig) => ChatLink;
  onUpdateChart: (link: ChatLink, cfg: ChartConfig) => boolean;
  /** Opens the manual chart editor; calls back with the edited chart. */
  onEditChart: (cfg: ChartConfig, save: (cfg: ChartConfig) => void) => void;
}

const MAX_DATASETS = 6;

export function ChatPanel({ session, onSession, datasets, activeDatasetId, dashboardName, onClose, onAddChart, onUpdateChart, onEditChart }: Props) {
  const status = useAiStatus();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abort = useRef<AbortController | null>(null);
  const focus = session.messages.find((m) => m.id === session.focusId && m.chart);
  const byId = (id: string) => datasets.find((d) => d.id === id);

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [session.messages.length, busy]);

  const examples = useMemo(() => {
    const ds = datasets.find((d) => d.id === activeDatasetId) ?? datasets[0];
    if (!ds) return [];
    const p = profileDataset(ds);
    const m = p.measures[0]?.name;
    const c = p.categories[0]?.name;
    const c2 = p.categories[1]?.name ?? c;
    const d = p.dates[0]?.name;
    return [m && c && `${m} by ${c} as a bar chart, top 5`, m && d && `Monthly ${m} trend`, m && c2 && `Share of ${m} by ${c2} as a donut`, p.geo && m && `Map of ${m} by ${p.geo.column}`].filter((x): x is string => !!x).slice(0, 4);
  }, [datasets, activeDatasetId]);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    const userMsg: ChatMessage = { id: uid('m_'), role: 'user', text: message };
    const prior = session.messages.filter((m) => !m.error);
    onSession((s) => ({ ...s, messages: [...s.messages, userMsg] }));
    setInput('');
    setBusy(true);

    // Context: the conversation (charts as they stand now, manual edits included) + the chart being refined.
    const history: ChatTurn[] = prior.map((m) => ({ role: m.role, text: m.text, chart: m.chart ? { datasetId: m.chart.config.datasetId, spec: configToSpec(m.chart.config) } : null }));
    const current = focus?.chart ? { datasetId: focus.chart.config.datasetId, spec: configToSpec(focus.chart.config) } : null;
    const order = [current?.datasetId, activeDatasetId, ...datasets.map((d) => d.id)].filter((x): x is string => !!x);
    const scope = [...new Set(order)].map(byId).filter((d): d is Dataset => !!d).slice(0, MAX_DATASETS);

    abort.current?.abort();
    const ctl = (abort.current = new AbortController());
    try {
      const res = await ai.chat({ conversationId: session.id, datasets: scope.map(summarizeDataset), catalog: chartCatalog(), history, message, current }, ctl.signal);
      const ds = res.datasetId ? byId(res.datasetId) : undefined;
      let reply: ChatMessage = { id: uid('m_'), role: 'assistant', text: res.reply };
      if (res.chart && ds) {
        const base = focus?.chart && focus.chart.config.datasetId === ds.id ? focus.chart.config : undefined;
        const r = specToConfig(res.chart, ds, base);
        const issues = r.error ? [...r.issues, r.error] : r.issues;
        // A refinement of a dashboard chart stays linked to that widget.
        reply = { ...reply, chart: { config: r.config, issues }, link: base ? focus?.link : undefined };
      } else if (res.chart && !ds) {
        reply.text += ' (I couldn’t find the dataset it referred to.)';
      }
      onSession((s) => ({ ...s, messages: [...s.messages, reply], focusId: reply.chart ? reply.id : s.focusId }));
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      const msg = e instanceof AiRequestError ? e.message : String(e);
      onSession((s) => ({ ...s, messages: [...s.messages, { id: uid('m_'), role: 'assistant', text: msg, error: true }] }));
    } finally {
      setBusy(false);
    }
  };

  const patch = (id: string, fn: (m: ChatMessage) => ChatMessage) => onSession((s) => ({ ...s, messages: s.messages.map((m) => (m.id === id ? fn(m) : m)) }));

  return (
    <aside className="chat-panel" aria-label="Chart assistant">
      <header className="chat-head">
        <IconSparkle size={18} />
        <div className="chat-title">
          <strong>Chart assistant</strong>
          <span className="muted small">Ask for a chart, then refine it</span>
        </div>
        {session.messages.length > 0 && (
          <button type="button" className="link-btn small" onClick={() => onSession(() => newChatSession())}>
            New chat
          </button>
        )}
        <button type="button" className="icon-btn" aria-label="Close chart assistant" onClick={onClose}>
          ✕
        </button>
      </header>

      <div className="chat-list" ref={listRef}>
        {status && !aiReady(status) && <div className="check-error">AI unavailable: {status.message}</div>}
        {session.messages.length === 0 && (
          <div className="chat-empty">
            <p className="muted">Describe the chart you want in plain words. You can then ask for changes (“make it a line”, “only the top 5”, “split by channel”) or edit it by hand.</p>
            <div className="chat-examples">
              {examples.map((x) => (
                <button key={x} type="button" className="chip" onClick={() => send(x)} disabled={!aiReady(status)}>
                  {x}
                </button>
              ))}
            </div>
          </div>
        )}
        {session.messages.map((m) => {
          const ds = m.chart ? byId(m.chart.config.datasetId) : undefined;
          const focused = m.id === session.focusId;
          return (
            <div key={m.id} className={`chat-msg ${m.role}${m.error ? ' error' : ''}`}>
              <div className="chat-bubble">{m.text}</div>
              {m.chart && (
                <div className={`chat-chart${focused ? ' focused' : ''}`}>
                  <div className="chat-chart-head">
                    <strong className="truncate">{m.chart.config.title}</strong>
                    {m.chart.edited && <span className="ai-tag">edited</span>}
                    {focused && <span className="ai-tag focus">refining</span>}
                  </div>
                  {ds ? <ChartRenderer dataset={ds} config={m.chart.config} height={200} /> : <div className="chart-empty">Dataset removed.</div>}
                  {m.chart.issues.length > 0 && <p className="muted small">Adjusted: {m.chart.issues.join(' ')}</p>}
                  <div className="chat-actions">
                    {m.link ? (
                      <button
                        type="button"
                        className="btn btn-small btn-primary"
                        onClick={() => {
                          if (!onUpdateChart(m.link!, m.chart!.config)) patch(m.id, (x) => ({ ...x, link: undefined }));
                        }}
                      >
                        Update on dashboard
                      </button>
                    ) : null}
                    <button type="button" className={`btn btn-small${m.link ? '' : ' btn-primary'}`} onClick={() => patch(m.id, (x) => ({ ...x, link: onAddChart(x.chart!.config) }))}>
                      {m.link ? 'Add as new' : `Add to ${dashboardName}`}
                    </button>
                    <button type="button" className="btn btn-small" onClick={() => onEditChart(m.chart!.config, (cfg) => patch(m.id, (x) => ({ ...x, chart: { config: cfg, issues: [], edited: true } })))}>
                      Edit
                    </button>
                    {!focused && (
                      <button type="button" className="link-btn small" onClick={() => onSession((s) => ({ ...s, focusId: m.id }))}>
                        Refine this
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {busy && (
          <div className="chat-msg assistant">
            <div className="chat-bubble typing" aria-label="Thinking">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}
      </div>

      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        {focus?.chart && (
          <div className="chat-focus">
            <span className="truncate">
              Refining <strong>{focus.chart.config.title}</strong>
              {focus.link ? ' · linked to dashboard' : ''}
            </span>
            <button type="button" className="link-btn small" onClick={() => onSession((s) => ({ ...s, focusId: null }))}>
              Start a new chart
            </button>
          </div>
        )}
        <div className="chat-compose">
          <textarea
            ref={inputRef}
            rows={2}
            placeholder={focus ? 'Describe a change, e.g. “show it as a line by month”' : 'e.g. “Revenue by region as bars, top 5”'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            disabled={!aiReady(status)}
            aria-label="Message the chart assistant"
          />
          <button type="submit" className="btn btn-primary btn-icon" disabled={!input.trim() || busy || !aiReady(status)} aria-label="Send">
            <IconSend size={16} />
          </button>
        </div>
      </form>
    </aside>
  );
}
