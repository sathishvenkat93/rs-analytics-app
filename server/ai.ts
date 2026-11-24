import { z } from 'zod';
import { BetaFallbackState } from '@anthropic-ai/sdk';
import {
  AGGREGATIONS,
  CHART_TYPE_IDS,
  DATE_BUCKETS,
  SORTS,
  type ChatRequest,
  type ChatResult,
  type ColumnAdvice,
  type DatasetSummary,
  type SqlRequest,
  type SqlResult,
  type SuggestRequest,
  type SuggestResult,
} from '../shared/ai.ts';
import type { LlmProvider } from './llm.ts';

/* ---------- output schemas (structured outputs) ---------- */

const nullableCol = z.string().nullable();
export const ChartSpecSchema = z.object({
  type: z.enum(CHART_TYPE_IDS),
  title: z.string(),
  x: nullableCol,
  y: z.array(z.string()),
  group: nullableCol,
  size: nullableCol,
  extra: z.object({ open: nullableCol, high: nullableCol, low: nullableCol, close: nullableCol, start: nullableCol, end: nullableCol, lat: nullableCol, lon: nullableCol }),
  aggregation: z.enum(AGGREGATIONS),
  dateBucket: z.enum(DATE_BUCKETS),
  topN: z.number().int().nullable(),
  sort: z.enum(SORTS),
  stacked: z.boolean(),
  horizontal: z.boolean(),
  showLabels: z.boolean(),
  includeCategories: z.array(z.string()).nullable(),
  rationale: z.string(),
});

const ColumnAdviceSchema = z.object({
  reportType: z.string(),
  renames: z.array(z.object({ original: z.string(), suggested: z.string(), reason: z.string() })),
  discard: z.array(z.object({ column: z.string(), reason: z.string() })),
});

const SuggestSchema = z.object({
  reportType: z.string(),
  summary: z.string(),
  dashboardName: z.string(),
  charts: z.array(ChartSpecSchema),
});

const ChatSchema = z.object({
  reply: z.string(),
  datasetId: z.string().nullable(),
  chart: ChartSpecSchema.nullable(),
});

const SqlSchema = z.object({ sql: z.string(), explanation: z.string() });

/* ---------- prompts ---------- */

const SPEC_RULES = `Chart spec rules:
- "type" must be one of the catalog types, and every column you name must be an exact column name from the dataset (case and punctuation included).
- Put columns in the slots the catalog lists for that type: x = label/category/X axis (or the numeric X for scatter/bubble, the task for gantt, the location for geo charts), y = value columns, group = the type's secondary column (stack split, heatmap rows, Sankey target, treemap second level, gantt colour), size = bubble/dot size, extra = open/high/low/close, start/end dates, lat/lon. Leave unused slots null (or y empty).
- Respect each slot's accepted column types. Use aggregation "count" with y empty to count rows.
- For a date X axis pick dateBucket from the column's min/max span (a few weeks → day, up to ~3 years → month, longer → quarter or year); otherwise "none".
- Never sum prices, rates, percentages, ratings or IDs; average them or use another measure.
- topN (or null) limits categories for bar/column/pareto/treemap/radar/pictograph/dotplot and slices for pie/donut.
- Titles are short and plain ("Revenue by region"), and rationale is one sentence a business user would find useful.`;

const COLUMNS_SYSTEM = `You help people clean up the column names of an uploaded dataset so they are easy to pick from when building charts.

Look at the column names, types and example values, decide what kind of report this is, then propose:
1. Renames: clear, concise names in Title Case (ideally under 30 characters). Expand cryptic abbreviations (qty → Quantity, amt → Amount, dt → Date), add a unit when the values make it obvious ("Price (USD)", "Duration (min)"), and remove redundancy: drop prefixes shared by many columns (customer.address.city → City), repeated words, and table names baked into column names — but keep enough context to stay unambiguous. Every final name must be unique across the dataset. Only list columns whose name should actually change.
2. Discards: columns with no value for charts or analysis — internal surrogate IDs and hashes, URLs, technical metadata, empty or constant columns, exact duplicates of another column. Be conservative: never discard measures, dates, categories or human-readable identifiers people would filter by.

Give each rename and discard a short reason.`;

const SUGGEST_SYSTEM = `You are a data visualisation expert. Given a dataset summary and a catalog of chart types the app supports, work out what kind of report this is and propose the charts that would make the most useful dashboard for it.

Pick charts that answer the questions someone reading this report would ask first (totals and headline KPIs, trends over time, comparisons across key categories, composition, distributions, relationships, geography when there are location columns). Prefer variety over near-duplicates, prefer the clearest chart type for each question, and skip chart types the data can't support. If a goal is given, focus on it. Avoid repeating charts that already exist.

Also return a short dashboard name, a one-line description of the report type, and a two-sentence summary of what the dashboard shows.

${SPEC_RULES}`;

const CHAT_SYSTEM = `You build and refine charts in an analytics app from natural-language requests. You see summaries of the loaded datasets (columns, types, stats and a few sample rows — not the full data), the chart catalog, the conversation so far, and the chart currently being worked on.

- When the user asks for a chart, choose the best dataset and chart type and return a complete chart spec.
- When the user asks to change the current chart ("make it a line", "only 2025", "split by channel", "top 5"), return the full updated spec: apply exactly the change requested and keep everything else as it was. The current chart may include manual edits the user made — treat it as the source of truth.
- Filters on category values go in includeCategories, using exact values from the examples where possible.
- If the request isn't about a chart, or can't be done with these datasets, answer briefly in reply and return chart null. You can't see the full data, so don't state exact figures.
- reply is one or two friendly sentences describing what you built or changed.

${SPEC_RULES}`;

const SQL_SYSTEM = `You write SQLite queries for an in-browser data viewer. The user describes what they want to see; you return one read-only SELECT statement over the given tables, plus a one-sentence explanation.

Use only the listed tables and columns, quote every identifier with double quotes ("Order Date"), use SQLite functions (strftime for dates stored as ISO text 'YYYY-MM-DD'), and add ORDER BY and a LIMIT (default 100) when the result could be large.`;

/* ---------- payload shaping ---------- */

const json = (v: unknown) => JSON.stringify(v);

function datasetBlock(d: DatasetSummary): string {
  return `Dataset "${d.name}" (id ${d.id}, file ${d.fileName}, ${d.rows} rows)\nColumns: ${json(d.columns)}\nSample rows: ${json(d.sample)}`;
}

/* ---------- tasks ---------- */

export function adviseColumns(llm: LlmProvider, dataset: DatasetSummary): Promise<ColumnAdvice> {
  return llm.generate({ system: COLUMNS_SYSTEM, schema: ColumnAdviceSchema, messages: [{ role: 'user', content: datasetBlock(dataset) }] });
}

export function suggestCharts(llm: LlmProvider, req: SuggestRequest): Promise<SuggestResult> {
  const count = Math.max(1, Math.min(10, req.count));
  const parts = [
    `Chart catalog: ${json(req.catalog)}`,
    datasetBlock(req.dataset),
    req.goal ? `Goal: ${req.goal}` : '',
    req.existing?.length ? `Charts already on the dashboard: ${json(req.existing)}` : '',
    `Propose ${count} chart${count === 1 ? '' : 's'}.`,
  ];
  return llm.generate({ system: SUGGEST_SYSTEM, schema: SuggestSchema, messages: [{ role: 'user', content: parts.filter(Boolean).join('\n\n') }] });
}

/** One fallback-pinning state per chat conversation, keyed by the client's conversation id. */
const chatStates = new Map<string, BetaFallbackState>();

export function chartChat(llm: LlmProvider, req: ChatRequest, conversationId?: string): Promise<ChatResult> {
  // Earlier turns go in as real user/assistant messages; the assistant side carries the chart it returned.
  const messages: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const t of req.history.slice(-16)) {
    messages.push({ role: t.role, content: t.role === 'assistant' && t.chart ? `${t.text}\n[chart on dataset ${t.chart.datasetId}: ${json(t.chart.spec)}]` : t.text });
  }
  const context = [
    `Chart catalog: ${json(req.catalog)}`,
    req.datasets.map(datasetBlock).join('\n\n'),
    req.current ? `Current chart (dataset ${req.current.datasetId}), including any manual edits: ${json(req.current.spec)}` : 'There is no current chart yet.',
    `Request: ${req.message}`,
  ].join('\n\n');
  messages.push({ role: 'user', content: context });
  // The API needs the first message to be from the user.
  while (messages.length && messages[0].role !== 'user') messages.shift();

  let state: BetaFallbackState | undefined;
  if (conversationId) {
    state = chatStates.get(conversationId) ?? new BetaFallbackState();
    chatStates.set(conversationId, state);
    if (chatStates.size > 500) chatStates.delete(chatStates.keys().next().value!);
  }
  return llm.generate({ system: CHAT_SYSTEM, schema: ChatSchema, messages, fallbackState: state });
}

export function writeSql(llm: LlmProvider, req: SqlRequest): Promise<SqlResult> {
  const content = `Tables: ${json(req.tables)}\n\nWhat the user wants: ${req.question}`;
  return llm.generate({ system: SQL_SYSTEM, schema: SqlSchema, maxTokens: 4000, messages: [{ role: 'user', content }] });
}
