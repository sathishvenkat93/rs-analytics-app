import { useEffect, useMemo, useRef, useState } from 'react';
import { geoAlbersUsa, geoNaturalEarth1, geoPath, type GeoProjection } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { Topology } from 'topojson-specification';
import worldTopo from 'world-atlas/countries-110m.json';
import usTopo from 'us-atlas/states-10m.json';
import { aggregateGeo, aggregatePoints } from '../../charts/data';
import type { GeoScope } from '../../charts/geoMatch';
import { formatCompact, formatValue } from '../../lib/format';
import { seriesColor } from '../../lib/palette';
import { useTheme } from '../../lib/theme';
import { DataTable } from '../DataTable';
import { Empty, Note, TooltipCard, useHoverTip } from './common';
import { useRamp } from './SvgCharts';
import type { ViewProps } from './MoreCharts';

type Shape = Feature<Geometry, { name: string }>;

const WORLD = (feature(worldTopo as unknown as Topology, (worldTopo as unknown as Topology).objects.countries) as unknown as FeatureCollection<Geometry, { name: string }>).features.filter(
  (f) => f.properties.name !== 'Antarctica',
) as Shape[];
const USA = (feature(usTopo as unknown as Topology, (usTopo as unknown as Topology).objects.states) as unknown as FeatureCollection<Geometry, { name: string }>).features as Shape[];

function shapesFor(scope: GeoScope): Shape[] {
  return scope === 'usa' ? USA : WORLD;
}

function projectionFor(scope: GeoScope, w: number, h: number): GeoProjection {
  const fc: FeatureCollection = { type: 'FeatureCollection', features: shapesFor(scope) };
  return (scope === 'usa' ? geoAlbersUsa() : geoNaturalEarth1()).fitSize([w, h], fc);
}

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

export function GeoView(props: ViewProps) {
  if (props.config.type === 'scattermap') return <ScatterMap {...props} />;
  return <RegionMap {...props} />;
}

/* ---------- choropleth + region bubbles ---------- */

function RegionMap({ dataset, config, theme, height }: ViewProps) {
  const agg = useMemo(() => aggregateGeo(dataset, config), [dataset, config]);
  const [ref, width] = useWidth();
  const { ramp, inkFor } = useRamp();
  const { mode } = useTheme();
  const { node: tipNode, bind } = useHoverTip();
  const bubbles = config.type === 'geobubble';
  const land = mode === 'dark' ? '#2a2a28' : '#ecebe6';

  if (!agg.values.size) return <Empty height={height} message="No values matched a country or US state." />;
  if (config.options.showTable)
    return (
      <DataTable
        columns={[
          { key: 'name', label: agg.scope === 'usa' ? 'State' : 'Country' },
          { key: 'value', label: agg.label, numeric: true },
        ]}
        rows={[...agg.values.entries()].sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }))}
        maxHeight={height}
      />
    );

  const vals = [...agg.values.values()];
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const steps = 5;
  const stepRamp = [ramp[1], ramp[2], ramp[3], ramp[4], ramp[6]];
  const stepOf = (v: number) => (max === min ? steps - 1 : Math.min(steps - 1, Math.floor(((v - min) / (max - min)) * steps)));
  const w = Math.max(width, 280);
  const h = height;
  const projection = width ? projectionFor(agg.scope, w, h) : null;
  const path = projection ? geoPath(projection) : null;
  const shapes = shapesFor(agg.scope);
  const c = seriesColor(theme, 0);
  const rMax = Math.min(32, w / 18);
  const radius = (v: number) => (max > 0 ? Math.max(3, Math.sqrt(Math.max(0, v) / max) * rMax) : 3);

  return (
    <div className="chart-body" ref={ref}>
      {path && (
        <svg width={w} height={h} role="img" aria-label={`${bubbles ? 'Bubble map' : 'Map'} of ${agg.label} by ${agg.scope === 'usa' ? 'US state' : 'country'}`}>
          {shapes.map((f) => {
            const v = agg.values.get(f.properties.name);
            const fill = !bubbles && v !== undefined ? stepRamp[stepOf(v)] : land;
            const d = path(f) ?? '';
            return (
              <path
                key={f.properties.name}
                d={d}
                fill={fill}
                stroke={theme.surface}
                strokeWidth={0.6}
                {...(!bubbles && v !== undefined ? bind(<TooltipCard title={f.properties.name} rows={[{ label: agg.label, value: formatValue(v) }]} />) : {})}
              />
            );
          })}
          {bubbles &&
            shapes
              .filter((f) => agg.values.has(f.properties.name))
              .map((f) => ({ f, v: agg.values.get(f.properties.name)!, at: path.centroid(f) }))
              .filter((b) => Number.isFinite(b.at[0]))
              .sort((a, b) => b.v - a.v)
              .map(({ f, v, at }) => (
                <circle
                  key={f.properties.name}
                  cx={at[0]}
                  cy={at[1]}
                  r={radius(v)}
                  fill={c}
                  fillOpacity={0.55}
                  stroke={theme.surface}
                  strokeWidth={1.5}
                  {...bind(<TooltipCard title={f.properties.name} rows={[{ label: agg.label, value: formatValue(v), color: c }]} />)}
                />
              ))}
        </svg>
      )}
      {!bubbles ? (
        <div className="ramp-legend steps" aria-label="Colour scale">
          {stepRamp.map((col, i) => {
            const lo = min + ((max - min) * i) / steps;
            return (
              <span key={col} className="ramp-step">
                <span className="ramp-swatch" style={{ background: col, color: inkFor(i) }} />
                {formatCompact(lo)}+
              </span>
            );
          })}
          <span className="muted">{agg.label}</span>
        </div>
      ) : (
        <Note>Bubble area is proportional to {agg.label}; largest = {formatCompact(max)}.</Note>
      )}
      {agg.unmatched.length > 0 && (
        <Note>
          Not on the map: {agg.unmatched.slice(0, 5).join(', ')}
          {agg.unmatched.length > 5 ? ` and ${agg.unmatched.length - 5} more` : ''}
        </Note>
      )}
      {tipNode}
    </div>
  );
}

/* ---------- lat/lon points ---------- */

function ScatterMap({ dataset, config, theme, height }: ViewProps) {
  const { points, total } = useMemo(() => aggregatePoints(dataset, config), [dataset, config]);
  const [ref, width] = useWidth();
  const { mode } = useTheme();
  const { node: tipNode, bind } = useHoverTip();
  if (!points.length) return <Empty height={height} message="Choose latitude and longitude columns." />;
  if (config.options.showTable)
    return (
      <DataTable
        columns={[
          { key: 'lat', label: config.extra.lat ?? 'Latitude', numeric: true },
          { key: 'lon', label: config.extra.lon ?? 'Longitude', numeric: true },
          ...(config.sizeField ? [{ key: 'size', label: config.sizeField, numeric: true }] : []),
        ]}
        rows={points}
        maxHeight={height}
      />
    );
  const inUsa = points.every((p) => p.lat > 18 && p.lat < 72 && p.lon > -180 && p.lon < -64);
  const scope: GeoScope = inUsa ? 'usa' : 'world';
  const w = Math.max(width, 280);
  const projection = width ? projectionFor(scope, w, height) : null;
  const path = projection ? geoPath(projection) : null;
  const land = mode === 'dark' ? '#2a2a28' : '#ecebe6';
  const c = seriesColor(theme, 0);
  const sizes = points.map((p) => p.size ?? 0);
  const sMax = Math.max(...sizes, 0);
  const r = (s: number | null) => (s !== null && sMax > 0 ? Math.max(2.5, Math.sqrt(Math.max(0, s) / sMax) * 16) : 4);
  return (
    <div className="chart-body" ref={ref}>
      {path && projection && (
        <svg width={w} height={height} role="img" aria-label={`Map of ${points.length} locations`}>
          {shapesFor(scope).map((f) => (
            <path key={f.properties.name} d={path(f) ?? ''} fill={land} stroke={theme.surface} strokeWidth={0.6} />
          ))}
          {points.map((p, i) => {
            const at = projection([p.lon, p.lat]);
            if (!at) return null;
            return (
              <circle
                key={i}
                cx={at[0]}
                cy={at[1]}
                r={r(p.size)}
                fill={c}
                fillOpacity={0.7}
                stroke={theme.surface}
                strokeWidth={1}
                {...bind(
                  <TooltipCard
                    rows={[
                      { label: 'Latitude', value: p.lat.toFixed(4) },
                      { label: 'Longitude', value: p.lon.toFixed(4) },
                      ...(p.size !== null && config.sizeField ? [{ label: config.sizeField, value: formatValue(p.size) }] : []),
                    ]}
                  />,
                )}
              />
            );
          })}
        </svg>
      )}
      {total > points.length && <Note>Showing the first {points.length.toLocaleString()} of {total.toLocaleString()} points</Note>}
      {tipNode}
    </div>
  );
}
