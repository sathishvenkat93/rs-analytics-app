import type { AiChartSpec, AiChartType, ChatRequest, ChatResult, ColumnAdvice, ColumnSummary, DatasetSummary, SqlRequest, SqlResult, SuggestRequest, SuggestResult } from '../shared/ai.ts';

/**
 * AI_PROVIDER=mock: deterministic heuristics with the same response shapes as
 * the model, so the UI can be developed and tested without AWS access.
 * Not a substitute for the model's judgement.
 */

const ABBR: Record<string, string> = { qty: 'Quantity', amt: 'Amount', dt: 'Date', num: 'Number', no: 'Number', desc: 'Description', cust: 'Customer', prod: 'Product', cat: 'Category', avg: 'Average', pct: 'Percent', rev: 'Revenue', id: 'ID' };

function titleCase(name: string): string {
  const words = name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[\s_.\-]+/)
    .filter(Boolean)
    .map((w) => ABBR[w.toLowerCase()] ?? w[0].toUpperCase() + w.slice(1).toLowerCase());
  return words.join(' ');
}

export function mockColumns(d: DatasetSummary): ColumnAdvice {
  const used = new Set<string>();
  const renames: ColumnAdvice['renames'] = [];
  for (const c of d.columns) {
    // Drop dotted prefixes when the last segment alone is unique.
    const last = c.name.split('.').pop()!;
    const lastUnique = d.columns.filter((o) => o.name.split('.').pop() === last).length === 1;
    let next = titleCase(lastUnique ? last : c.name);
    while (used.has(next)) next += ' 2';
    used.add(next);
    if (next !== c.name) renames.push({ original: c.name, suggested: next, reason: lastUnique && last !== c.name ? 'Removed a redundant prefix and tidied the wording.' : 'Tidied spacing, capitalisation and abbreviations.' });
  }
  const discard = d.columns
    .filter((c) => c.missing >= 0.95 || c.distinct <= 1 || (/(^|[_\s.])(uuid|hash|guid)$/i.test(c.name) && c.distinct >= d.rows * 0.9))
    .map((c) => ({ column: c.name, reason: c.missing >= 0.95 ? 'Almost entirely empty.' : c.distinct <= 1 ? 'Same value in every row.' : 'Technical identifier with a unique value per row.' }));
  return { reportType: guessReport(d), renames, discard };
}

function guessReport(d: DatasetSummary): string {
  const names = d.columns.map((c) => c.name.toLowerCase()).join(' ');
  if (/revenue|sales|order|profit/.test(names)) return 'Sales / orders report';
  if (/open|close|high|low/.test(names)) return 'Price history';
  if (/start|end|task/.test(names)) return 'Project plan';
  if (/lat|lon/.test(names)) return 'Location data';
  return 'Tabular dataset';
}

function blank(type: AiChartType, title: string): AiChartSpec {
  return {
    type,
    title,
    x: null,
    y: [],
    group: null,
    size: null,
    extra: { open: null, high: null, low: null, close: null, start: null, end: null, lat: null, lon: null },
    aggregation: 'sum',
    dateBucket: 'none',
    topN: null,
    sort: 'none',
    stacked: false,
    horizontal: false,
    showLabels: false,
    includeCategories: null,
    rationale: 'Suggested by the offline mock provider.',
  };
}

const measures = (d: DatasetSummary) => d.columns.filter((c) => c.type === 'number' && !/(^|[_\s.])id$|price|rate|pct|percent|rating/i.test(c.name));
const cats = (d: DatasetSummary) => d.columns.filter((c) => c.type === 'string' && c.distinct >= 2 && c.distinct <= 30);
const dates = (d: DatasetSummary) => d.columns.filter((c) => c.type === 'date');

export function mockSuggest(req: SuggestRequest): SuggestResult {
  const d = req.dataset;
  const m = measures(d);
  const c = cats(d);
  const t = dates(d);
  const out: AiChartSpec[] = [];
  const y = m[0] ? [m[0].name] : [];
  const what = m[0]?.name ?? 'Rows';
  if (m[0]) out.push({ ...blank('kpi', `Total ${m[0].name}`), y });
  if (t[0]) out.push({ ...blank('line', `${what} over time`), x: t[0].name, y: m.slice(0, 2).map((x) => x.name), dateBucket: 'month', aggregation: y.length ? 'sum' : 'count' });
  if (c[0]) out.push({ ...blank('bar', `${what} by ${c[0].name}`), x: c[0].name, y, horizontal: true, sort: 'desc', aggregation: y.length ? 'sum' : 'count' });
  if (c[1] ?? c[0]) out.push({ ...blank('donut', `${what} share by ${(c[1] ?? c[0]).name}`), x: (c[1] ?? c[0]).name, y, aggregation: y.length ? 'sum' : 'count' });
  if (c[0] && c[1]) out.push({ ...blank('stacked', `${what} by ${c[0].name} and ${c[1].name}`), x: c[0].name, group: c[1].name, y, aggregation: y.length ? 'sum' : 'count' });
  if (m[1]) out.push({ ...blank('scatter', `${m[1].name} vs ${m[0].name}`), x: m[0].name, y: [m[1].name] });
  if (m[0]) out.push({ ...blank('histogram', `Distribution of ${m[0].name}`), y });
  const existing = new Set((req.existing ?? []).map((s) => s.toLowerCase()));
  const charts = out.filter((s) => !existing.has(s.title.toLowerCase())).slice(0, req.count);
  return { reportType: guessReport(d), summary: `A starter dashboard for ${d.name} (${d.rows} rows). Generated offline by the mock provider.`, dashboardName: `${d.name} overview`, charts };
}

const TYPE_WORDS: [RegExp, AiChartType][] = [
  [/\bline\b|trend/, 'line'],
  [/\bstep\b/, 'step'],
  [/\barea\b/, 'area'],
  [/\bdonut\b|doughnut/, 'donut'],
  [/\bpie\b|share|composition/, 'pie'],
  [/\bstack/, 'stacked'],
  [/\bcolumn/, 'column'],
  [/\bbar\b|\bbars\b|compare/, 'bar'],
  [/scatter|correlat/, 'scatter'],
  [/histogram|distribution/, 'histogram'],
  [/heat ?map/, 'heatmap'],
  [/\bmap\b|geo/, 'geo'],
  [/\bkpi\b|total|headline/, 'kpi'],
  [/treemap/, 'treemap'],
  [/funnel/, 'funnel'],
  [/box ?plot/, 'boxplot'],
];

function mentioned(msg: string, cols: ColumnSummary[]): ColumnSummary[] {
  const m = msg.toLowerCase();
  return cols.filter((c) => m.includes(c.name.toLowerCase())).sort((a, b) => m.indexOf(a.name.toLowerCase()) - m.indexOf(b.name.toLowerCase()));
}

export function mockChat(req: ChatRequest): ChatResult {
  const msg = req.message.toLowerCase();
  const typeHit = TYPE_WORDS.find(([re]) => re.test(msg))?.[1];
  const topN = /top\s+(\d+)/.exec(msg);
  const cur = req.current;
  if (cur) {
    const d = req.datasets.find((x) => x.id === cur.datasetId) ?? req.datasets[0];
    const spec: AiChartSpec = { ...cur.spec, extra: { ...cur.spec.extra } };
    const changes: string[] = [];
    if (typeHit && typeHit !== spec.type) {
      spec.type = typeHit;
      changes.push(`switched to a ${typeHit} chart`);
    }
    if (topN) {
      spec.topN = Number(topN[1]);
      changes.push(`kept the top ${topN[1]}`);
    }
    if (/horizontal/.test(msg)) (spec.horizontal = true), changes.push('made it horizontal');
    if (/descending|high(est)? to low/.test(msg)) (spec.sort = 'desc'), changes.push('sorted high to low');
    if (/label|values/.test(msg)) (spec.showLabels = true), changes.push('turned on value labels');
    const split = /split by ([\w .]+)/.exec(msg);
    const splitCol = split && d ? mentioned(split[1], d.columns)[0] : undefined;
    if (splitCol) (spec.group = splitCol.name), (spec.type = spec.type === 'bar' || spec.type === 'column' ? 'stacked' : spec.type), changes.push(`split by ${splitCol.name}`);
    if (changes.length) return { reply: `Done: I ${changes.join(', ')}.`, datasetId: cur.datasetId, chart: spec };
  }
  for (const d of req.datasets) {
    const cols = mentioned(req.message, d.columns);
    if (!cols.length && req.datasets.length > 1) continue;
    const num = cols.filter((c) => c.type === 'number');
    const label = cols.find((c) => c.type !== 'number') ?? cats(d)[0] ?? dates(d)[0];
    const y = num.length ? num.map((c) => c.name) : measures(d).slice(0, 1).map((c) => c.name);
    const type: AiChartType = typeHit ?? (label?.type === 'date' ? 'line' : 'bar');
    const spec: AiChartSpec = {
      ...blank(type, `${y.join(' & ') || 'Rows'} by ${label?.name ?? ''}`.trim()),
      x: type === 'kpi' ? null : (label?.name ?? null),
      y,
      aggregation: y.length ? 'sum' : 'count',
      dateBucket: label?.type === 'date' ? 'month' : 'none',
      topN: topN ? Number(topN[1]) : null,
      sort: type === 'bar' ? 'desc' : 'none',
      horizontal: type === 'bar',
    };
    return { reply: `Here’s a ${type} chart of ${spec.title.toLowerCase()} from ${d.name}.`, datasetId: d.id, chart: spec };
  }
  return { reply: 'I couldn’t match that to a chart. Mention a column name, for example “revenue by region as bars”.', datasetId: null, chart: null };
}

export function mockSql(req: SqlRequest): SqlResult {
  const t = req.tables[0];
  if (!t) return { sql: 'SELECT 1;', explanation: 'No tables are loaded.' };
  return { sql: `SELECT *\nFROM "${t.name}"\nLIMIT 100;`, explanation: 'Mock provider: shows the first 100 rows of the first table.' };
}
