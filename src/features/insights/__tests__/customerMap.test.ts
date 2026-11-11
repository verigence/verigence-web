import { describe, expect, it } from 'vitest';

import { centreOf, directoryDistrict, mapAreas, mapModels, mapSellers } from '../customerMap';
import { catchment } from './fixtures';

const cells = catchment.map.cells;

describe('the customer map adds its rows up by area', () => {
  it('counts bookings by PIN code, names the leading dealership and marks a shared area', () => {
    const areas = mapAreas(cells, { view: 'PIN', measure: 'journeys', model: '', by: 'dealer' });
    expect(areas.map((area) => [area.key, area.value, area.leader, area.shared])).toEqual([
      ['751010', 16, 'Utkal Mahindra', true], ['753014', 9, 'Utkal Mahindra', false], ['831001', 2, 'Utkal Mahindra', false],
    ]);
    expect([...areas[0].sellers.entries()]).toEqual([['Utkal Mahindra', 12], ['Aditya Motors', 4]]);
  });

  it('takes rows without a PIN code into the district view', () => {
    const areas = mapAreas(cells, { view: 'DISTRICT', measure: 'journeys', model: '', by: 'dealer' });
    expect(areas.map((area) => [area.key, area.value, area.shared])).toEqual([
      ['Khordha', 16, true], ['Cuttack', 12, true], ['West Singhbhum', 2, false]]);
  });

  it('counts deliveries, and leaves out an area with none', () => {
    const areas = mapAreas(cells, { view: 'DISTRICT', measure: 'delivered', model: 'MAXX HD', by: 'dealer' });
    expect(areas.map((area) => [area.key, area.value])).toEqual([['Khordha', 5], ['West Singhbhum', 1]]);
  });

  it('shows a product as the share of the area\'s statement deals that took it', () => {
    const areas = mapAreas(cells, { view: 'DISTRICT', measure: 'fastag', model: '', by: 'dealer' });
    const khordha = areas.find((area) => area.key === 'Khordha')!;
    expect([khordha.deals, khordha.taken, khordha.value]).toEqual([10, 4, 40]);
    const cuttack = areas.find((area) => area.key === 'Cuttack')!;
    expect([cuttack.deals, cuttack.taken, cuttack.value]).toEqual([7, 2, 28.6]);
  });

  it('follows one model', () => {
    const areas = mapAreas(cells, { view: 'PIN', measure: 'journeys', model: 'XUV3XO', by: 'outlet' });
    expect(areas.map((area) => [area.key, area.value, area.leader])).toEqual([
      ['753014', 9, 'Utkal Mahindra - CDA'], ['751010', 4, 'Aditya Motors - Jajpur']]);
  });

  it('orders the sellers by customers, so each keeps its colour', () => {
    expect(mapSellers(cells, 'dealer')).toEqual(['Utkal Mahindra', 'Aditya Motors']);
    expect(mapSellers(cells, 'outlet')[0]).toBe('Utkal Mahindra - CDA');
    expect(mapModels(cells)).toEqual(['MAXX HD', 'XUV3XO']);
  });
});

describe('outlines', () => {
  it('finds the middle of an outline, however deep its rings are nested', () => {
    expect(centreOf({ geometry: { coordinates: [[[85, 20], [87, 20], [87, 22], [85, 22]]] } })).toEqual([86, 21]);
    expect(centreOf({ geometry: { coordinates: [[[[85, 20], [86, 21]]], [[[87, 22], [89, 24]]]] } })).toEqual([87, 22]);
    expect(centreOf({})).toBeNull();
  });

  it('gives a district outline the postal directory\'s name for it', () => {
    expect(directoryDistrict({ properties: { district: 'Keonjhar' } })).toBe('Keonjhar (Kendujhar)');
    expect(directoryDistrict({ properties: { name: 'Angul' } })).toBe('Anugul');
    expect(directoryDistrict({ properties: { name: 'Puri' } })).toBe('Puri');
  });
});
