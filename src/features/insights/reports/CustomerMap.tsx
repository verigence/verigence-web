import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as echarts from 'echarts';
import ReactECharts from 'echarts-for-react';

import {
  getMapBoundary, type CustomerMapData, type ProductInfo,
} from '../../../services/audit-core/uc03Insights';
import { useProjectContextStore } from '../../../store/projectContextStore';
import { useSessionStore } from '../../../store/sessionStore';
import {
  centreOf, directoryDistrict, inflateGeoJson, isCount, mapAreas, mapModels, mapSellers, type MapArea, type MapView,
} from '../customerMap';
import { count, downloadCsv, percent, shortOutlet } from '../insightFormat';
import { Section, Tiles } from '../InsightParts';

/** Carbon's categorical colours, in their order: a seller takes the next one and keeps it. */
const SELLER_COLOURS = [
  '#0f62fe', '#ba4e00', '#6929c4', '#009d9a', '#9f1853', '#198038', '#002d9c', '#b28600', '#ee538b', '#012749',
  '#8a3800', '#a56eff',
];
const OTHER_COLOUR = '#8d8d8d';
/** Carbon blue, light to dark: the share of deals that took a product. */
const SHARE_STEPS: { from: number; to: number; colour: string; label: string }[] = [
  { from: 0, to: 10, colour: '#d0e2ff', label: 'Under 10%' },
  { from: 10, to: 25, colour: '#a6c8ff', label: '10–25%' },
  { from: 25, to: 50, colour: '#78a9ff', label: '25–50%' },
  { from: 50, to: 75, colour: '#4589ff', label: '50–75%' },
  { from: 75, to: 101, colour: '#0043ce', label: '75% and above' },
];
const EMPTY_AREA = '#f4f4f4';
const FONT = "'IBM Plex Sans', 'Helvetica Neue', Arial, sans-serif";
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

type Geo = Awaited<ReturnType<typeof inflateGeoJson>>;

/** Where the customers live, on the map: by PIN code or district, coloured by the
 *  dealership (or, within one dealership, the outlet) with the most customers there, or
 *  shaded by how many deals there took a product. Outlets are drawn at their own PIN code. */
export default function CustomerMap({ data, products, thinBelow }: { data: CustomerMapData; products: ProductInfo[]; thinBelow: number }) {
  const tenantId = useProjectContextStore((state) => state.selectedProject?.tenantId);
  const accessToken = useSessionStore((state) => state.accessToken);
  const chart = useRef<ReactECharts | null>(null);
  const [view, setView] = useState<MapView>('DISTRICT');
  const [measure, setMeasure] = useState<string>('journeys');
  const [model, setModel] = useState('');

  const pinKey = data.boundaries.find((boundary) => boundary.type === 'PIN')?.key;
  const districtKey = data.boundaries.find((boundary) => boundary.type === 'DISTRICT')?.key;
  const outline = (key: string | undefined) => ({
    queryKey: ['insight-boundary', key],
    queryFn: async () => inflateGeoJson((await getMapBoundary(tenantId!, key!, accessToken ?? undefined)).contentGzipBase64),
    enabled: Boolean(tenantId && accessToken && key),
    staleTime: Infinity, gcTime: Infinity, retry: 1,
  });
  const pins = useQuery<Geo>(outline(pinKey));
  const districts = useQuery<Geo>(outline(districtKey));

  const pinMap = `insight-pins-${pinKey}`;
  const districtMap = `insight-districts-${districtKey}`;
  const [registered, setRegistered] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (pins.data && !registered[pinMap]) {
      echarts.registerMap(pinMap, pins.data as never);
      setRegistered((state) => ({ ...state, [pinMap]: true }));
    }
    if (districts.data && !registered[districtMap]) {
      const named = { ...districts.data, features: districts.data.features.map((feature) => ({
        ...feature, properties: { ...feature.properties, name: directoryDistrict(feature) } })) };
      echarts.registerMap(districtMap, named as never);
      setRegistered((state) => ({ ...state, [districtMap]: true }));
    }
  }, [pins.data, districts.data, pinMap, districtMap, registered]);

  const dealers = useMemo(() => new Set(data.cells.map((cell) => cell.dealer)), [data.cells]);
  // Several dealerships: who leads each area. One dealership: which of its outlets does.
  const by = dealers.size > 1 ? 'dealer' : 'outlet';
  const sellers = useMemo(() => mapSellers(data.cells, by), [data.cells, by]);
  const colourOf = useMemo(() => {
    const colours = new Map(sellers.map((seller, index) => [seller, SELLER_COLOURS[index] ?? OTHER_COLOUR]));
    return (seller: string | null) => colours.get(seller ?? '') ?? OTHER_COLOUR;
  }, [sellers]);
  const models = useMemo(() => mapModels(data.cells), [data.cells]);
  const areas = useMemo(() => mapAreas(data.cells, { view, measure, model, by }), [data.cells, view, measure, model, by]);
  const byKey = useMemo(() => new Map(areas.map((area) => [area.key, area])), [areas]);
  const counting = isCount(measure);
  const product = products.find((item) => item.key === measure);
  const measureName = measure === 'journeys' ? 'Bookings' : measure === 'delivered' ? 'Deliveries' : product?.label ?? measure;
  const sellerName = (name: string) => (by === 'outlet' ? shortOutlet(name, [...dealers][0] ?? undefined) : name);

  const drawn = useMemo(() => {
    const names = new Set<string>();
    const geo = view === 'PIN' ? pins.data : districts.data;
    geo?.features.forEach((feature) => names.add(view === 'PIN' ? String(feature.properties?.name ?? '').trim() : directoryDistrict(feature)));
    return names;
  }, [view, pins.data, districts.data]);
  const onMap = areas.filter((area) => drawn.has(area.key));
  const outside = areas.filter((area) => !drawn.has(area.key));
  const shared = onMap.filter((area) => area.shared);

  const outletPoints = useMemo(() => {
    const centres = new Map<string, [number, number]>();
    pins.data?.features.forEach((feature) => {
      const centre = centreOf(feature);
      if (centre) centres.set(String(feature.properties?.name ?? '').trim(), centre);
    });
    return data.outlets.flatMap((outlet) => {
      const centre = outlet.pin ? centres.get(outlet.pin) : undefined;
      if (!centre) return [];
      return [{ name: outlet.outlet, value: [centre[0], centre[1], 1], outlet: true, dealer: outlet.dealer, pin: outlet.pin,
        itemStyle: { color: '#161616', borderColor: '#ffffff', borderWidth: 2 } }];
    });
  }, [data.outlets, pins.data]);

  const mapName = view === 'PIN' ? pinMap : districtMap;
  const ready = Boolean(registered[mapName]);
  // A stronger colour where there are more customers: 1–5, 6–20, more.
  const strength = (customers: number) => (customers <= 5 ? 0.45 : customers <= 20 ? 0.72 : 1);
  const stepOf = (value: number | null) => SHARE_STEPS.find((step) => value != null && value >= step.from && value < step.to);

  const option = useMemo(() => ({
    textStyle: { fontFamily: FONT },
    tooltip: {
      trigger: 'item', confine: true, backgroundColor: '#ffffff', borderColor: '#e0e0e0', padding: 12,
      textStyle: { color: '#161616', fontFamily: FONT, fontSize: 12 },
      formatter: (params: { name?: string; data?: { outlet?: boolean; dealer?: string; pin?: string } }) => {
        if (params.data?.outlet) {
          return `<strong>${esc(params.name)}</strong><br/>${esc(params.data.dealer)}<br/>Outlet · PIN code ${esc(params.data.pin)}`;
        }
        const key = String(params.name ?? '');
        const area = byKey.get(key);
        const title = view === 'PIN' ? `PIN code ${esc(key)}` : esc(key);
        if (!area) return `<strong>${title}</strong><br/>No customer here for these filters`;
        const place = view === 'PIN'
          ? `${esc((data.localities[key] ?? []).slice(0, 4).join(', ') || 'Locality not on file')} · ${esc(area.district ?? 'District not known')}<br/>`
          : '';
        const split = [...area.sellers.entries()].sort((a, b) => b[1] - a[1])
          .map(([seller, n]) => `<span style="display:inline-block;width:8px;height:8px;margin-right:6px;background:${colourOf(seller)}"></span>${esc(sellerName(seller))}: ${count(n)}`)
          .join('<br/>');
        const taken = counting ? '' : `${esc(measureName)}: <strong>${percent(area.value, 0)}</strong> · ${count(area.taken)} of ${count(area.deals)} deals${area.deals < thinBelow ? ' (few deals)' : ''}<br/>`;
        return `<strong>${title}</strong><br/>${place}${taken}Bookings: ${count(area.journeys)} · Deliveries: ${count(area.delivered)}<br/>${split}`;
      },
    },
    geo: {
      map: mapName, roam: true, zoom: 1.08, layoutCenter: ['50%', '50%'], layoutSize: '96%', scaleLimit: { min: 0.8, max: 24 },
      itemStyle: { areaColor: EMPTY_AREA, borderColor: '#c6c6c6', borderWidth: 0.5 },
      emphasis: { itemStyle: { borderColor: '#161616', borderWidth: 1.5 }, label: { show: false } },
      select: { disabled: true },
      // The areas are painted here: a map series laid over a geo takes its colours from the geo.
      regions: onMap.map((area) => {
        const dark = counting || (area.value ?? 0) >= 50;
        const colour = counting ? colourOf(area.leader) : area.deals ? stepOf(area.value)?.colour ?? EMPTY_AREA : EMPTY_AREA;
        return {
          name: area.key,
          itemStyle: counting
            ? { areaColor: colour, borderColor: area.shared ? '#161616' : '#ffffff', borderWidth: area.shared ? 1.2 : 0.6,
              opacity: strength(area.value ?? 0) }
            : { areaColor: colour, borderColor: '#ffffff', borderWidth: 0.6, opacity: area.deals < thinBelow ? 0.55 : 1 },
          emphasis: { itemStyle: { areaColor: colour } },
          label: {
            show: counting ? (area.value ?? 0) > 0 : area.deals > 0,
            formatter: counting ? count(area.value ?? 0) : percent(area.value, 0),
            color: dark ? '#ffffff' : '#161616', fontSize: view === 'PIN' ? 9 : 12, fontWeight: 600,
            textBorderColor: dark ? 'rgba(22,22,22,.55)' : 'rgba(255,255,255,.8)', textBorderWidth: 2,
          },
        };
      }),
    },
    series: [
      {
        name: measureName, type: 'map', map: mapName, geoIndex: 0, selectedMode: false,
        data: onMap.map((area) => ({ name: area.key, value: area.value ?? 0 })),
      },
      {
        name: 'Outlets', type: 'scatter', coordinateSystem: 'geo', data: outletPoints, symbol: 'circle', symbolSize: 9, zlevel: 4,
        emphasis: { scale: 1.4 }, label: { show: false },
      },
    ],
  }), [byKey, colourOf, counting, data.localities, mapName, measureName, onMap, outletPoints, thinBelow, view]); // eslint-disable-line react-hooks/exhaustive-deps

  // The dealer split of the busiest areas: one stacked bar per area, a segment per seller.
  const top = (counting ? onMap : [...onMap].sort((a, b) => b.journeys - a.journeys)).slice(0, 10);
  const topSellers = sellers.filter((seller) => top.some((area) => (area.sellers.get(seller) ?? 0) > 0));
  const splitOption = useMemo(() => ({
    textStyle: { fontFamily: FONT },
    grid: { left: 8, right: 24, top: 8, bottom: 8, containLabel: true },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, confine: true, textStyle: { fontFamily: FONT, fontSize: 12, color: '#161616' } },
    xAxis: { type: 'value', minInterval: 1, axisLabel: { color: '#525252' }, splitLine: { lineStyle: { color: '#e0e0e0' } } },
    yAxis: { type: 'category', inverse: true, data: top.map((area) => area.key), axisTick: { show: false },
      axisLine: { lineStyle: { color: '#8d8d8d' } }, axisLabel: { color: '#161616', fontSize: 12 } },
    ...(counting ? {} : { xAxis: { type: 'value', max: 100, axisLabel: { color: '#525252', formatter: '{value}%' }, splitLine: { lineStyle: { color: '#e0e0e0' } } } }),
    series: counting
      ? topSellers.map((seller) => ({
        name: sellerName(seller), type: 'bar', stack: 'sellers', barMaxWidth: 18,
        itemStyle: { color: colourOf(seller), borderColor: '#ffffff', borderWidth: 1 },
        data: top.map((area) => area.sellers.get(seller) ?? 0),
      }))
      : [{
        name: measureName, type: 'bar', barMaxWidth: 18, itemStyle: { color: '#0f62fe' },
        data: top.map((area) => area.value ?? 0),
        label: { show: true, position: 'right', color: '#161616', fontSize: 11,
          formatter: (params: { dataIndex: number }) => `${count(top[params.dataIndex].taken)} of ${count(top[params.dataIndex].deals)}` },
      }],
  }), [top, topSellers, colourOf, counting, measureName]); // eslint-disable-line react-hooks/exhaustive-deps

  const zoom = (factor: number) => chart.current?.getEchartsInstance().dispatchAction({ type: 'geoRoam', componentType: 'geo', zoom: factor });
  const reset = () => chart.current?.getEchartsInstance().dispatchAction({ type: 'restore' });
  const download = () => downloadCsv(
    `customers-by-${view === 'PIN' ? 'pin-code' : 'district'}`,
    [view === 'PIN' ? 'PIN code' : 'District', 'District', 'Localities', by === 'dealer' ? 'Dealership' : 'Outlet', 'Customers', 'Area bookings', 'Area deliveries',
      'Area deals with a statement', ...(counting ? [] : [`${measureName} taken`, `${measureName} %`])],
    areas.flatMap((area: MapArea) => [...area.sellers.entries()].map(([seller, n]) => [
      area.key, area.district, (data.localities[area.key] ?? []).join(' | '), seller, n, area.journeys, area.delivered, area.deals,
      ...(counting ? [] : [area.taken, area.value]),
    ])),
  );

  const failed = (view === 'PIN' ? pins : districts).isError || (!pinKey && !districtKey);
  const total = counting ? areas.reduce((sum, area) => sum + (area.value ?? 0), 0) : null;
  const deals = areas.reduce((sum, area) => sum + area.deals, 0);
  const taken = areas.reduce((sum, area) => sum + area.taken, 0);

  return (
    <Section title="Customer map"
             description={counting
               ? `Each area takes the colour of the ${by === 'dealer' ? 'dealership' : 'outlet'} with the most customers there. The colour is stronger where there are more customers; a dark outline marks an area more than one ${by === 'dealer' ? 'dealership' : 'outlet'} sells into.`
               : `Share of each area's deals with a statement that took ${measureName.toLowerCase()}. Areas with fewer than ${thinBelow} deals are faded.`}
             actions={<button type="button" className="ins-button" onClick={download}>Download CSV</button>}>
      <div className="ins-map__controls">
        <div className="ins-field">
          <label htmlFor="ins-map-view">Area</label>
          <select id="ins-map-view" value={view} onChange={(event) => setView(event.target.value as MapView)}>
            <option value="DISTRICT">District</option>
            <option value="PIN">PIN code</option>
          </select>
        </div>
        <div className="ins-field">
          <label htmlFor="ins-map-measure">Show</label>
          <select id="ins-map-measure" value={measure} onChange={(event) => setMeasure(event.target.value)}>
            <optgroup label="Who sells where">
              <option value="journeys">Bookings</option>
              <option value="delivered">Deliveries</option>
            </optgroup>
            <optgroup label="Product penetration">
              {products.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </optgroup>
          </select>
        </div>
        <div className="ins-field">
          <label htmlFor="ins-map-model">Model</label>
          <select id="ins-map-model" value={model} onChange={(event) => setModel(event.target.value)}>
            <option value="">All models</option>
            {models.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>
        <div className="ins-map__zoom" role="group" aria-label="Map zoom">
          <button type="button" onClick={() => zoom(1.4)} aria-label="Zoom in">+</button>
          <button type="button" onClick={() => zoom(1 / 1.4)} aria-label="Zoom out">−</button>
          <button type="button" onClick={reset}>Reset</button>
        </div>
      </div>

      <Tiles label="Map totals" items={[
        counting
          ? { label: measureName, value: count(total), detail: view === 'PIN' ? 'With a PIN code read' : 'With a district' }
          : { label: measureName, value: percent(deals ? (taken / deals) * 100 : null, 0), detail: `${count(taken)} of ${count(deals)} deals with a statement` },
        { label: view === 'PIN' ? 'PIN codes reached' : 'Districts reached', value: count(onMap.length),
          detail: outside.length ? `${count(outside.length)} more outside the map` : 'All on the map' },
        { label: 'Shared areas', value: count(shared.length), tone: shared.length ? 'warning' : 'default',
          detail: `More than one ${by === 'dealer' ? 'dealership' : 'outlet'} sells there` },
        { label: 'Outlets on the map', value: count(outletPoints.length), detail: `Of ${count(data.outlets.length)} outlets, at their PIN code` },
      ]} />

      <div className="ins-map">
        <div className="ins-map__canvas" role="img" aria-label={`Map of customers by ${view === 'PIN' ? 'PIN code' : 'district'}`}>
          {failed ? <p className="ins-empty">The map outlines could not be loaded. The figures are in the tables below.</p>
            : ready ? <ReactECharts ref={chart} option={option} notMerge lazyUpdate style={{ height: '100%', width: '100%' }} />
              : <p className="ins-empty" aria-busy="true">Loading the map…</p>}
        </div>
        <aside className="ins-map__side">
          <h3 className="ins-map__heading">{counting ? (by === 'dealer' ? 'Dealership' : 'Outlet') : `${measureName}, share of deals`}</h3>
          <ul className="ins-map__legend">
            {counting
              ? <>
                {sellers.slice(0, SELLER_COLOURS.length).map((seller) => (
                  <li key={seller}><i style={{ background: colourOf(seller) }} />{sellerName(seller)}</li>))}
                {sellers.length > SELLER_COLOURS.length ? <li><i style={{ background: OTHER_COLOUR }} />Other outlets</li> : null}
                <li><i className="is-shared" />Shared area</li>
              </>
              : SHARE_STEPS.map((step) => <li key={step.label}><i style={{ background: step.colour }} />{step.label}</li>)}
            <li><i className="is-outlet" />Outlet</li>
          </ul>
          <h3 className="ins-map__heading">
            {counting
              ? `Busiest ${view === 'PIN' ? 'PIN codes' : 'districts'}, by ${by === 'dealer' ? 'dealership' : 'outlet'}`
              : `${measureName} in the busiest ${view === 'PIN' ? 'PIN codes' : 'districts'}`}
          </h3>
          {top.length
            ? <ReactECharts option={splitOption} notMerge lazyUpdate style={{ height: Math.max(160, top.length * 30 + 40), width: '100%' }} />
            : <p className="ins-empty">No customer matches these filters.</p>}
        </aside>
      </div>
      {data.offMap || outside.length ? (
        <p className="ins-map__note">
          {data.offMap ? `${count(data.offMap)} bookings carry a PIN code outside the map (another state, or misread). ` : ''}
          {outside.length ? `Not drawn: ${outside.slice(0, 8).map((area) => `${area.key} (${count(area.journeys)})`).join(', ')}${outside.length > 8 ? '…' : ''}.` : ''}
        </p>
      ) : null}
    </Section>
  );
}
