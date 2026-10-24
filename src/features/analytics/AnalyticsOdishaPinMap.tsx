import { useEffect, useMemo, useRef, useState } from 'react';
import * as echarts from 'echarts';
import ReactECharts from 'echarts-for-react';

import SectionCard from '../../components/SectionCard';
import type { AnalyticsBusinessReportPayload } from '../../services/analytics/businessClient';
import { AnalyticsBarChart, AnalyticsStackedBarChart } from './AnalyticsCharts';

type GeographyData = Extract<AnalyticsBusinessReportPayload, { kind: 'geography' }>['data'];
type GeographyRow = GeographyData['rows'][number];
type MeasureKey = 'journey_count' | 'actual_deliveries';
type ViewMode = 'PIN' | 'DISTRICT';
type Feature = { properties?: { name?: string; [key: string]: unknown }; geometry?: { type?: string; coordinates?: unknown } };

const PIN_MAP = 'verigence-odisha-pins-analytics';
const DISTRICT_MAP = 'verigence-odisha-districts-analytics';
const postalDistrictNames: Record<string, string> = {
  Angul: 'Anugul', Baleswar: 'Balasore', Bolangir: 'Balangir', Jajpur: 'Jajapur',
  Keonjhar: 'Keonjhar (Kendujhar)', Nawarangapur: 'Nabarangapur', Nuapada: 'Nuaparha',
  Rayagada: 'Rayagarha', Sonepur: 'Subarnapur',
};
const chartFont = 'Inter, Arial, Helvetica, sans-serif';
const dealerPalette = ['#1769aa', '#e07a22', '#238b64', '#8053a6', '#b34a62', '#598a9b'];
const rangeLabels = ['1–2', '3–5', '6–10', '11–20', '21+'];

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-IN').format(value);
}

function countBand(value: number): number {
  if (value <= 2) return 0.8;
  if (value <= 5) return 1.2;
  if (value <= 10) return 1.6;
  if (value <= 20) return 2;
  return 2.6;
}

function safeCsv(value: unknown): string {
  const text = String(value ?? '');
  return `"${text.replaceAll('"', '""')}"`;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] || character);
}

function csvDownload(filename: string, rows: unknown[][]): void {
  const body = `\uFEFF${rows.map((row) => row.map(safeCsv).join(',')).join('\r\n')}`;
  const url = URL.createObjectURL(new Blob([body], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function inflateBase64GeoJson(encoded: string): Promise<{ features: Feature[] }> {
  const binary = Uint8Array.from(atob(encoded.replace(/\s/g, '')), (character) => character.charCodeAt(0));
  const stream = new Blob([binary.buffer as ArrayBuffer]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).json();
}

function centerOfFeature(feature: Feature): [number, number] | null {
  const points: number[][] = [];
  const collect = (value: unknown): void => {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
      points.push(value as number[]);
      return;
    }
    value.forEach(collect);
  };
  collect(feature.geometry?.coordinates);
  if (!points.length) return null;
  const bounds = points.reduce(([minX, minY, maxX, maxY], point) => [
    Math.min(minX, point[0]), Math.min(minY, point[1]), Math.max(maxX, point[0]), Math.max(maxY, point[1]),
  ], [Infinity, Infinity, -Infinity, -Infinity]);
  return [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2];
}

function dateInRange(value: string | null, from: string, to: string): boolean {
  if (!from && !to) return true;
  if (!value) return false;
  return (!from || value >= from) && (!to || value <= to);
}

export default function AnalyticsOdishaPinMap({ data }: { data: GeographyData }) {
  const rows = data.rows;
  const mapBoundaries = data.map_boundaries || [];
  const outletLocations = data.outlet_locations || [];
  const chartRef = useRef<ReactECharts | null>(null);
  const [selectedDealer, setSelectedDealer] = useState('All dealerships');
  const [selectedModel, setSelectedModel] = useState('All models');
  const [selectedMeasure, setSelectedMeasure] = useState<MeasureKey>('journey_count');
  const [viewMode, setViewMode] = useState<ViewMode>('PIN');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [pinGeo, setPinGeo] = useState<{ features: Feature[] } | null>(null);
  const [districtGeo, setDistrictGeo] = useState<{ features: Feature[] } | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const pinBoundary = mapBoundaries.find((boundary) => boundary.boundary_key === 'odisha-pin');
    const districtBoundary = mapBoundaries.find((boundary) => boundary.boundary_key === 'odisha-district');
    if (!pinBoundary || !districtBoundary) {
      setMapError('PIN and district boundaries are not available in the Analytics geography master.');
      return () => { active = false; };
    }
    Promise.all([inflateBase64GeoJson(pinBoundary.content_gzip_base64), inflateBase64GeoJson(districtBoundary.content_gzip_base64)])
      .then(([pins, districts]) => {
        if (!active) return;
        const normalizedDistricts = {
          ...districts,
          features: districts.features.map((feature) => {
            const district = String(feature.properties?.district || feature.properties?.name || '').trim();
            return { ...feature, properties: { ...feature.properties, name: postalDistrictNames[district] || district } };
          }),
        };
        echarts.registerMap(PIN_MAP, pins as never);
        echarts.registerMap(DISTRICT_MAP, normalizedDistricts as never);
        setPinGeo(pins);
        setDistrictGeo(normalizedDistricts);
      })
      .catch((error: unknown) => {
        if (active) setMapError(error instanceof Error ? error.message : 'Geographic master data could not be loaded.');
      });
    return () => { active = false; };
  }, [mapBoundaries]);

  const dealers = useMemo(() => Array.from(new Set(rows.map((row) => row.dealer_name)).values()).sort(), [rows]);
  const models = useMemo(() => Array.from(new Set(rows.map((row) => row.model_name).filter(Boolean)).values()).sort(), [rows]);
  const filteredRows = useMemo(() => rows.filter((row) => {
    if (selectedDealer !== 'All dealerships' && row.dealer_name !== selectedDealer) return false;
    if (selectedModel !== 'All models' && row.model_name !== selectedModel) return false;
    const date = selectedMeasure === 'journey_count' ? row.booking_date : row.delivery_date;
    return dateInRange(date, dateFrom, dateTo);
  }), [rows, selectedDealer, selectedModel, selectedMeasure, dateFrom, dateTo]);

  const dealerColors = useMemo(
    () => new Map(dealers.map((dealer, index) => [dealer, dealerPalette[index % dealerPalette.length]])),
    [dealers],
  );
  const locationTotals = useMemo(() => {
    const byArea = new Map<string, { name: string; district: string; locality: string; total: number; dealers: Map<string, number>; bookings: number; deliveries: number }>();
    filteredRows.forEach((row) => {
      const area = viewMode === 'PIN' ? row.customer_pincode : row.district_name;
      if (!area) return;
      const key = String(area);
      const current = byArea.get(key) || {
        name: key,
        district: row.district_name || 'District not mapped',
        locality: (row.locality_names || []).join(', ') || 'Locality not available in postal master',
        total: 0,
        dealers: new Map<string, number>(),
        bookings: 0,
        deliveries: 0,
      };
      const amount = Number(row[selectedMeasure] || 0);
      current.total += amount;
      current.bookings += Number(row.journey_count || 0);
      current.deliveries += Number(row.actual_deliveries || 0);
      current.dealers.set(row.dealer_name, (current.dealers.get(row.dealer_name) || 0) + amount);
      if (row.locality_names?.length) {
        current.locality = viewMode === 'PIN'
          ? row.locality_names.join(', ')
          : Array.from(new Set([...current.locality.split(', '), ...row.locality_names])).filter(Boolean).join(', ');
      }
      byArea.set(key, current);
    });
    return byArea;
  }, [filteredRows, selectedMeasure, viewMode]);

  const pinCenters = useMemo(() => {
    const centers = new Map<string, [number, number]>();
    pinGeo?.features.forEach((feature) => {
      const pin = String(feature.properties?.name || '').trim();
      const center = centerOfFeature(feature);
      if (pin && center) centers.set(pin, center);
    });
    return centers;
  }, [pinGeo]);

  const topAreas = useMemo(() => Array.from(locationTotals.values())
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)).slice(0, 10), [locationTotals]);
  const dealerSplitSeries = dealers.map((dealer, index) => ({
    key: `dealer_${index}`,
    name: dealer,
    color: dealerColors.get(dealer) || dealerPalette[index % dealerPalette.length],
  })).filter((series) => topAreas.some((area) => (area.dealers.get(series.name) || 0) > 0));
  const dealerSplitRows = topAreas.map((area) => {
    const split: Record<string, string | number> & { label: string } = { label: area.name };
    dealerSplitSeries.forEach((series) => { split[series.key] = area.dealers.get(series.name) || 0; });
    return split;
  });
  const overlapAreas = useMemo(() => Array.from(locationTotals.values()).filter((area) => Array.from(area.dealers.values()).filter((count) => count > 0).length > 1), [locationTotals]);
  const chartMapReady = (viewMode === 'PIN' ? pinGeo : districtGeo) != null;
  const mapName = viewMode === 'PIN' ? PIN_MAP : DISTRICT_MAP;
  const measureLabel = selectedMeasure === 'journey_count' ? 'Bookings' : 'Deliveries (Retail)';

  const outletPoints = useMemo(() => outletLocations
    .filter((outlet) => selectedDealer === 'All dealerships' || outlet.dealer_name === selectedDealer)
    .map((outlet) => {
      const pincode = String(outlet.pincode || '').trim();
      const fallback = pinCenters.get(pincode);
      const lon = outlet.longitude == null ? fallback?.[0] : Number(outlet.longitude);
      const lat = outlet.latitude == null ? fallback?.[1] : Number(outlet.latitude);
      if (lon == null || lat == null || !Number.isFinite(lon) || !Number.isFinite(lat)) return null;
      const dealer = outlet.dealer_name || 'Dealer unspecified';
      const dealerIndex = Math.max(0, dealers.indexOf(dealer));
      return {
        name: outlet.outlet_name,
        value: [lon, lat, 1],
        dealer_name: dealer,
        pincode,
        precision: outlet.location_precision,
        symbol: ['circle', 'diamond', 'triangle', 'rect'][dealerIndex % 4],
        itemStyle: { color: dealerColors.get(dealer) || '#50677d', borderColor: '#ffffff', borderWidth: 2, shadowBlur: 5, shadowColor: '#52697d' },
        label: { show: selectedDealer !== 'All dealerships', formatter: outlet.outlet_name, position: 'right', color: '#173b5b', fontSize: 10, backgroundColor: 'rgba(255,255,255,0.92)', padding: [2, 4], borderRadius: 3 },
      };
    }).filter((point): point is NonNullable<typeof point> => point != null), [dealers, dealerColors, outletLocations, selectedDealer, pinCenters]);

  const option = useMemo(() => ({
    textStyle: { fontFamily: chartFont },
    tooltip: {
      trigger: 'item',
      formatter: (params: { name?: string; value?: number | string | number[]; data?: { dealer_name?: string; pincode?: string; precision?: string } }) => {
        if (params.data?.precision) return `<strong>${escapeHtml(params.name || 'Outlet')}</strong><br/>${escapeHtml(params.data.dealer_name || '')}<br/>PIN ${escapeHtml(params.data.pincode || 'unavailable')}<br/>Location: ${params.data.precision === 'OUTLET_COORDINATE' ? 'outlet coordinates' : 'PIN centroid'}`;
        const area = locationTotals.get(String(params.name || ''));
        if (!area) return escapeHtml(params.name || 'Area');
        const dealerRows = Array.from(area.dealers.entries()).sort((a, b) => b[1] - a[1]).map(([dealer, count]) => `${escapeHtml(dealer)}: ${formatNumber(count)}`).join('<br/>');
        return `<strong>${viewMode === 'PIN' ? `PIN ${escapeHtml(area.name)}` : escapeHtml(area.name)}</strong><br/>${escapeHtml(area.locality)}<br/>${escapeHtml(area.district)}<br/>${measureLabel}: ${formatNumber(area.total)}<br/>Bookings: ${formatNumber(area.bookings)} · Deliveries: ${formatNumber(area.deliveries)}<br/>${dealerRows}`;
      },
      backgroundColor: '#ffffff', borderColor: '#d7e3ed', textStyle: { color: '#173b5b', fontFamily: chartFont },
    },
    geo: {
      map: mapName, roam: true, zoom: 1.05, layoutCenter: ['50%', '46%'], layoutSize: '95%',
      itemStyle: { areaColor: '#edf2f6', borderColor: '#ffffff', borderWidth: 0.6 },
      emphasis: { itemStyle: { areaColor: '#f2ba6b', borderColor: '#173b5b', borderWidth: 1.2 } },
    },
    series: [
      {
        name: measureLabel, type: 'map', map: mapName, geoIndex: 0, data: Array.from(locationTotals.values()).map((area) => {
          const leader = Array.from(area.dealers.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
          const shared = Array.from(area.dealers.values()).filter((count) => count > 0).length > 1;
          const borderWidth = countBand(area.total);
          return { name: area.name, value: area.total, itemStyle: { areaColor: shared ? '#76549b' : dealerColors.get(leader || '') || '#b8c7d3', borderColor: shared ? '#a61b29' : '#ffffff', borderWidth } };
        }),
        label: {
          show: true,
          formatter: (params: { value?: number | string }) => {
            const count = Number(params.value || 0);
            return count > 0 ? formatNumber(count) : '';
          },
          color: '#ffffff',
          fontSize: viewMode === 'PIN' ? 8 : 11,
          fontWeight: 700,
          textBorderColor: '#173b5b',
          textBorderWidth: 2,
        },
        emphasis: { label: { show: true, color: '#173b5b', textBorderWidth: 0, fontWeight: 700 } },
      },
      {
        name: 'Dealer outlets', type: 'scatter', coordinateSystem: 'geo', data: outletPoints,
        symbolSize: 14, zlevel: 4,
        itemStyle: { color: '#50677d', borderColor: '#ffffff', borderWidth: 2, shadowBlur: 5, shadowColor: '#52697d' },
        emphasis: { scale: 1.35, label: { show: selectedDealer !== 'All dealerships' } },
      },
    ],
  }), [dealerColors, locationTotals, mapName, measureLabel, outletPoints, viewMode]);

  const downloadPinData = () => csvDownload(`customer-spread-${viewMode.toLowerCase()}.csv`, [
    [viewMode === 'PIN' ? 'PIN' : 'District', 'Locality / blocks', 'District', 'Dealer', 'Bookings', 'Deliveries (Retail)', 'Selected measure'],
    ...Array.from(locationTotals.values()).flatMap((area) => Array.from(area.dealers.entries()).map(([dealer, count]) => [area.name, area.locality, area.district, dealer, area.bookings, area.deliveries, count])),
  ]);
  const downloadExceptions = () => csvDownload('shared-customer-areas.csv', [
    ['PIN / District', 'Locality / blocks', 'District', 'Dealerships', 'Bookings', 'Deliveries (Retail)'],
    ...overlapAreas.map((area) => [area.name, area.locality, area.district, Array.from(area.dealers.keys()).join(' | '), area.bookings, area.deliveries]),
  ]);

  const zoom = (factor: number) => chartRef.current?.getEchartsInstance().dispatchAction({ type: 'geoRoam', componentType: 'geo', zoom: factor });

  return (
    <section className="analytics-pin-map" aria-label="Customer spread by PIN Code">
      <div className="analytics-pin-map__controls">
        <label>Dealership<select value={selectedDealer} onChange={(event) => setSelectedDealer(event.target.value)}><option>All dealerships</option>{dealers.map((dealer) => <option key={dealer}>{dealer}</option>)}</select></label>
        <label>Model<select value={selectedModel} onChange={(event) => setSelectedModel(event.target.value)}><option>All models</option>{models.map((model) => <option key={model}>{model}</option>)}</select></label>
        <label>Measure<select value={selectedMeasure} onChange={(event) => setSelectedMeasure(event.target.value as MeasureKey)}><option value="journey_count">Bookings</option><option value="actual_deliveries">Deliveries (Retail)</option></select></label>
        <label>View<select value={viewMode} onChange={(event) => setViewMode(event.target.value as ViewMode)}><option value="PIN">PIN view</option><option value="DISTRICT">District view</option></select></label>
      </div>
      <div className="analytics-pin-map__controls" aria-label="Date range filter">
        <label>Month<input type="month" value={selectedMonth} onChange={(event) => {
          const month = event.target.value;
          setSelectedMonth(month);
          if (!month) return;
          const [year, monthNumber] = month.split('-').map(Number);
          setDateFrom(`${month}-01`);
          setDateTo(`${month}-${String(new Date(year, monthNumber, 0).getDate()).padStart(2, '0')}`);
        }} /></label>
        <label>From<input type="date" value={dateFrom} onChange={(event) => { setSelectedMonth(''); setDateFrom(event.target.value); }} /></label>
        <label>To<input type="date" value={dateTo} onChange={(event) => { setSelectedMonth(''); setDateTo(event.target.value); }} /></label>
        <button type="button" onClick={() => { setSelectedMonth(''); setDateFrom(''); setDateTo(''); }}>Clear dates</button>
        <span>Choose a month or enter a custom date range.</span>
      </div>
      <div className="analytics-pin-map__metrics">
        <div><span>{measureLabel}</span><strong>{formatNumber(Array.from(locationTotals.values()).reduce((sum, area) => sum + area.total, 0))}</strong></div>
        <div><span>{viewMode === 'PIN' ? 'PINs reached' : 'Districts reached'}</span><strong>{formatNumber(locationTotals.size)}</strong></div>
        <div><span>Shared areas</span><strong>{formatNumber(overlapAreas.length)}</strong></div>
        <div><span>Outlet markers</span><strong>{formatNumber(outletPoints.length)}</strong></div>
      </div>
      <div className="analytics-pin-map__controls" aria-label="Map controls">
        <strong>{viewMode === 'PIN' ? 'Customer Spread by PIN Code' : 'Customer Spread by District'}</strong>
        <div><button type="button" onClick={() => zoom(1.25)} aria-label="Zoom in">+</button> <button type="button" onClick={() => zoom(0.8)} aria-label="Zoom out">−</button> <button type="button" onClick={() => chartRef.current?.getEchartsInstance().dispatchAction({ type: 'restore' })}>Reset map</button></div>
      </div>
      {mapError ? <p className="analytics-pin-map__error">{mapError}</p> : chartMapReady ? <ReactECharts ref={chartRef} option={option} notMerge lazyUpdate style={{ height: 'clamp(400px, 70vh, 680px)', width: '100%' }} /> : <p className="analytics-pin-map__loading">Loading PIN and district masters from Analytics…</p>}
      <div className="analytics-pin-map__legend"><strong>Dealership</strong>{dealers.map((dealer) => <span key={dealer}><i style={{ backgroundColor: dealerColors.get(dealer) }} />{dealer}</span>)}<span><i style={{ backgroundColor: '#76549b', border: '2px solid #a61b29' }} />Shared PIN / district</span><strong>Selected measure count (border weight)</strong>{rangeLabels.map((range, index) => <span key={range}><i className="analytics-pin-map__range" style={{ borderTopWidth: [0.8, 1.2, 1.6, 2, 2.6][index] }} />{range}</span>)}</div>
      <p className="analytics-pin-map__note">Fill color shows the leading dealership; shared areas use purple fill and a red border. Border weight shows the selected measure range: {rangeLabels.join(', ')}. Outlet dots use exact outlet coordinates when present; otherwise they are placed at the PIN centroid and identified as approximate in the hover details.</p>
      <div className="analytics-pin-map__controls"><button type="button" onClick={downloadPinData}>Download PIN / district data for Excel (CSV)</button><button type="button" onClick={downloadExceptions}>Download shared-area exceptions (CSV)</button></div>
      <div className="analytics-split analytics-split--overview">
        <SectionCard title={`Top 10 ${viewMode === 'PIN' ? 'PINs' : 'districts'} by ${measureLabel.toLowerCase()}`} description="Ranked footprint for the selected date, model, dealership and measure. Area colors on the map show the leading dealer; shared areas are marked separately.">
          <AnalyticsBarChart rows={topAreas.map((area) => ({ label: area.name, value: area.total }))} valueLabel={measureLabel} emptyText="No areas match the current filters." />
          <div className="analytics-area-cards">{topAreas.map((area, index) => <article className="analytics-area-card" key={area.name}>
            <span className="analytics-area-card__rank">{index + 1}</span><div><strong>{area.name}</strong><small>{area.locality} · {area.district}</small><small>Dealerships: {Array.from(area.dealers.keys()).join(', ') || 'No dealer attribution'}</small></div><b>{formatNumber(area.total)}</b>
          </article>)}</div>
        </SectionCard>
        <SectionCard title="Dealer split within each PIN / district" description="Stacked bars show each dealership’s share of the selected measure in the top 10 customer areas; hover any PIN or district on the map for the exact dealer split across every mapped area.">
          <AnalyticsStackedBarChart rows={dealerSplitRows} series={dealerSplitSeries} valueLabel={measureLabel} emptyText="No dealer split is available for the current geography filters." />
          {topAreas.length ? <div className="analytics-area-dealer-grid">{topAreas.flatMap((area) => Array.from(area.dealers.entries()).map(([dealer, count]) => <article className="analytics-area-dealer-card" key={`${area.name}-${dealer}`}>
            <span>{dealer}</span><strong>{formatNumber(count)}</strong><small>{area.name} · {area.locality}</small><small>{formatNumber(area.bookings)} bookings · {formatNumber(area.deliveries)} deliveries (retail)</small>
          </article>))}</div> : <p className="analytics-empty-copy">No dealer-area detail matches the current filters.</p>}
        </SectionCard>
      </div>
      <p className="analytics-pin-map__note">PIN and district boundaries, postal locality lookups, and outlet mapping are served from the Analytics schema. Customer PIN is a recorded sales footprint, not an exclusive dealer territory. District aggregates use the PIN’s postal master district; areas with multi-district PIN assignments may have incomplete district attribution.</p>
    </section>
  );
}
