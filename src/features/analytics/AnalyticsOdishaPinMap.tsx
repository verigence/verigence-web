import { useEffect, useMemo, useState } from 'react';
import * as echarts from 'echarts';
import ReactECharts from 'echarts-for-react';

import type { AnalyticsBusinessReportPayload } from '../../services/analytics/businessClient';

type GeographyRow = Extract<AnalyticsBusinessReportPayload, { kind: 'geography' }>['data']['rows'][number];
type PinMetricKey = 'journey_count' | 'actual_deliveries' | 'finance_journeys' | 'insurance_journeys' | 'accessory_journeys';

const MAP_NAME = 'verigence-odisha-pincodes';
const MAP_URL = `${import.meta.env.BASE_URL}analytics/odisha-pincode-boundaries.json.gz.b64`;
const chartFont = 'Inter, Arial, Helvetica, sans-serif';

const metrics: Array<{ key: PinMetricKey; label: string }> = [
  { key: 'journey_count', label: 'Booked journeys' },
  { key: 'actual_deliveries', label: 'Deliveries' },
  { key: 'finance_journeys', label: 'Finance journeys' },
  { key: 'insurance_journeys', label: 'Insurance journeys' },
  { key: 'accessory_journeys', label: 'Accessory journeys' },
];

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-IN').format(value);
}

export default function AnalyticsOdishaPinMap({ rows }: { rows: GeographyRow[] }) {
  const [selectedDealer, setSelectedDealer] = useState('All dealerships');
  const [selectedMetric, setSelectedMetric] = useState<PinMetricKey>('journey_count');
  const [mapPins, setMapPins] = useState<Set<string> | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch(MAP_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`PIN boundary file returned ${response.status}`);
        return response.text();
      })
      .then(async (encoded) => {
        const compressed = Uint8Array.from(atob(encoded.trim()), (character) => character.charCodeAt(0));
        const gzipStream = new Blob([compressed.buffer as ArrayBuffer])
          .stream()
          .pipeThrough(new DecompressionStream('gzip'));
        return new Response(gzipStream).json();
      })
      .then((geoJson) => {
        const features = Array.isArray(geoJson.features) ? geoJson.features : [];
        const pins = new Set<string>(
          features.map((feature: { properties?: { name?: string } }) => String(feature.properties?.name || '')),
        );
        echarts.registerMap(MAP_NAME, geoJson);
        if (active) setMapPins(pins);
      })
      .catch((error: unknown) => {
        if (active) setMapError(error instanceof Error ? error.message : 'PIN map could not be loaded.');
      });
    return () => { active = false; };
  }, []);

  const dealers = useMemo(
    () => Array.from(new Set(rows.map((row) => row.dealer_name).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [rows],
  );
  const scopedRows = useMemo(
    () => selectedDealer === 'All dealerships' ? rows : rows.filter((row) => row.dealer_name === selectedDealer),
    [rows, selectedDealer],
  );
  const pinTotals = useMemo(() => {
    const totals = new Map<string, number>();
    scopedRows.forEach((row) => {
      const pin = String(row.customer_pincode || '').trim();
      if (pin) totals.set(pin, (totals.get(pin) || 0) + Number(row[selectedMetric] || 0));
    });
    return totals;
  }, [scopedRows, selectedMetric]);
  const mappedRows = useMemo(
    () => Array.from(pinTotals.entries()).filter(([pin]) => mapPins?.has(pin)),
    [pinTotals, mapPins],
  );
  const unmappedRows = useMemo(
    () => Array.from(pinTotals.entries()).filter(([pin]) => !mapPins?.has(pin)).sort((a, b) => b[1] - a[1]),
    [pinTotals, mapPins],
  );
  const totalValue = mappedRows.reduce((sum, [, value]) => sum + value, 0);
  const maxValue = Math.max(...mappedRows.map(([, value]) => value), 1);
  const topPin = [...mappedRows].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  const activeMetric = metrics.find((metric) => metric.key === selectedMetric)?.label || 'Bookings';

  const option = useMemo(() => ({
    textStyle: { fontFamily: chartFont },
    tooltip: {
      trigger: 'item',
      formatter: (params: { name?: string; value?: number | string }) =>
        `${params.name || 'PIN'}<br/>${activeMetric}: ${formatNumber(Number(params.value || 0))}`,
      backgroundColor: '#ffffff',
      borderColor: '#d7e3ed',
      textStyle: { color: '#173b5b', fontFamily: chartFont },
    },
    visualMap: {
      min: 0,
      max: maxValue,
      calculable: false,
      orient: 'horizontal',
      left: 'center',
      bottom: 8,
      text: ['Higher volume', 'Lower volume'],
      textStyle: { color: '#58718d', fontFamily: chartFont, fontSize: 11 },
      inRange: { color: ['#dceaf4', '#9ec5dc', '#4c91bd', '#07477d'] },
    },
    series: [{
      name: activeMetric,
      type: 'map',
      map: MAP_NAME,
      roam: true,
      zoom: 1.05,
      layoutCenter: ['50%', '47%'],
      layoutSize: '95%',
      itemStyle: { areaColor: '#eef3f7', borderColor: '#ffffff', borderWidth: 0.65 },
      emphasis: { itemStyle: { areaColor: '#f2ba6b', borderColor: '#173b5b', borderWidth: 1.2 } },
      data: mappedRows.map(([name, value]) => ({ name, value })),
    }],
  }), [activeMetric, mappedRows, maxValue]);

  return (
    <section className="analytics-pin-map" aria-label="Odisha customer PIN sales map">
      <div className="analytics-pin-map__controls">
        <label>
          Dealership
          <select value={selectedDealer} onChange={(event) => setSelectedDealer(event.target.value)}>
            <option>All dealerships</option>
            {dealers.map((dealer) => <option key={dealer}>{dealer}</option>)}
          </select>
        </label>
        <label>
          Map measure
          <select value={selectedMetric} onChange={(event) => setSelectedMetric(event.target.value as PinMetricKey)}>
            {metrics.map((metric) => <option key={metric.key} value={metric.key}>{metric.label}</option>)}
          </select>
        </label>
      </div>

      <div className="analytics-pin-map__metrics">
        <div><span>{activeMetric} in Odisha PINs</span><strong>{formatNumber(totalValue)}</strong></div>
        <div><span>PIN areas reached</span><strong>{formatNumber(mappedRows.filter(([, value]) => value > 0).length)}</strong></div>
        <div><span>Leading PIN</span><strong>{topPin?.[0] || 'Unavailable'}</strong></div>
        <div><span>Outside / unmatched PINs</span><strong>{mapPins ? formatNumber(unmappedRows.length) : '…'}</strong></div>
      </div>

      {mapError ? (
        <p className="analytics-pin-map__error">Odisha PIN boundaries could not be loaded ({mapError}). The dealer and PIN detail below is still available.</p>
      ) : mapPins ? (
        <ReactECharts option={option} notMerge lazyUpdate style={{ height: 'clamp(380px, 70vh, 600px)', width: '100%' }} />
      ) : (
        <p className="analytics-pin-map__loading">Loading the bundled Odisha PIN boundaries…</p>
      )}

      {mapPins && unmappedRows.length > 0 && (
        <div className="analytics-pin-map__unmapped">
          <h4>PINs outside the Odisha map / not matched to a boundary</h4>
          <p className="analytics-pin-map__note">{formatNumber(unmappedRows.length)} captured PINs are excluded from the Odisha map total. These can include out-of-state PINs and codes absent from the boundary source.</p>
          <div className="data-table-wrap analytics-table-wrap">
            <table className="data-table">
              <thead><tr><th>Customer PIN</th><th>{activeMetric}</th></tr></thead>
              <tbody>{unmappedRows.map(([pin, value]) => <tr key={pin}><td>{pin}</td><td>{formatNumber(value)}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      )}
      <p className="analytics-pin-map__note">
        Customer address PIN is used as a sales influence indicator, not a verified dealer catchment or travel area. PIN boundaries are bundled from the public{' '}
        <a href="https://livingatlas.esri.in/server1/rest/services/India/Pincode_Boundary_2025/MapServer/0" target="_blank" rel="noreferrer">Odisha PIN boundary layer</a>.
      </p>
    </section>
  );
}
