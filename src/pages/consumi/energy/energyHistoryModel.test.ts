import { describe, expect, it } from 'vitest';
import { dayStarts, historyResult, hourStarts, monthStarts, series } from './energyHistory.fixtures';
import { availableSeries, bucketLabels, historyState, missingSeries, offsetName, readPoint } from './energyHistoryModel';

describe('Energy history presentation', () => {
  it('lists only the series the backend returned, consumption first', () => {
    const starts = hourStarts(2);
    const result = historyResult({
      starts,
      series: {
        wallbox_consumption: series(starts, [1, 2]),
        grid_import: series(starts, [1, 2]),
        battery_discharge: series(starts, [1, 2]),
        battery_charge: series(starts, [1, 2]),
        consumption: series(starts, [1, 2], { source: 'derived' }),
      },
    });

    expect(availableSeries(result).map((meta) => meta.label)).toEqual(['Consumi', 'Prelievo', 'Carica batteria', 'Scarica batteria', 'Ricarica auto']);
  });

  it('reads a real zero as 0 kWh and a missing bucket as not available, never 0', () => {
    expect(readPoint({ start: 'x', value: 0 }, false)).toEqual({ text: '0 kWh', note: null, incomplete: false });
    expect(readPoint({ start: 'x', value: 1.234 }, false).text).toBe('1,23 kWh');
    expect(readPoint({ start: 'x', value: null, missing: ['sensor.f2'] }, false)).toEqual({ text: 'Non disponibile', note: 'Dati incompleti', incomplete: true });
    expect(readPoint(undefined, false).text).toBe('Non disponibile');
  });

  it('labels a partial value as partial and never as the value', () => {
    const reading = readPoint({ start: 'x', value: null, missing: ['sensor.f2'], partial_value: 0.4 }, false);

    expect(reading.text).toBe('Non disponibile');
    expect(reading.note).toBe('Dati incompleti · parziale 0,4 kWh');
    expect(readPoint({ start: 'x', value: null, reason: 'incoherent_balance' }, false).note).toBe('Dati incompleti · contatori non coerenti');
  });

  it('does not call the bucket in progress incomplete while it has no hour yet', () => {
    expect(readPoint({ start: 'x', value: null, missing: ['sensor.grid'] }, true)).toEqual({ text: 'Non disponibile', note: null, incomplete: false });
  });

  it.each([
    ['no meter', { grid_import: { reason: 'no_energy_meter' as const, statistic_ids: [] } }, 'no_meter'],
    ['no data', { grid_import: { reason: 'no_data' as const, statistic_ids: ['sensor.grid'] }, production: { reason: 'no_energy_meter' as const, statistic_ids: [] } }, 'no_data'],
    ['recorder unavailable', { grid_import: { reason: 'recorder_unavailable' as const, statistic_ids: ['sensor.grid'] } }, 'recorder_unavailable'],
    ['incompatible meters', { grid_import: { reason: 'incompatible_configuration' as const, statistic_ids: ['sensor.grid'] } }, 'incompatible'],
  ])('tells %s apart', (_, unavailable, kind) => {
    expect(historyState(historyResult({ unavailable })).kind).toBe(kind);
  });

  it('marks partial data and the bucket in progress, and names the series without history', () => {
    const starts = hourStarts(3);
    const result = historyResult({
      starts,
      series: { grid_import: series(starts, [1, null, 2], { in_progress_last: true }) },
      unavailable: { production: { reason: 'no_energy_meter', statistic_ids: [] } },
    });

    expect(historyState(result)).toEqual({ kind: 'data', partial: true, inProgress: true });
    expect(missingSeries(result).map((item) => `${item.label}: ${item.reason}`)).toEqual(['Fotovoltaico: nessun contatore di energia']);
    expect(historyState(historyResult({ configured: false })).kind).toBe('not_configured');
  });

  it('labels hours in the backend time zone, not the browser one', () => {
    const starts = ['2026-10-05T08:00:00-04:00', '2026-10-05T09:00:00-04:00'];
    const labels = bucketLabels(historyResult({ starts, timezone: 'America/New_York', series: { grid_import: series(starts, [1, 2]) } }));

    expect(labels.map((label) => label.short)).toEqual(['08', '09']);
    expect(labels[0].long).toBe('lun 5 ott · 08:00');
  });

  it('keeps the 25 hours of the change to winter time and names the repeated hour', () => {
    const starts = [
      '2026-10-25T01:00:00+02:00',
      '2026-10-25T02:00:00+02:00',
      '2026-10-25T02:00:00+01:00',
      '2026-10-25T03:00:00+01:00',
    ];
    const labels = bucketLabels(historyResult({ starts, series: { grid_import: series(starts, [1, 2, 3, 4]) } }));

    expect(labels.map((label) => label.short)).toEqual(['01', '02', '02', '03']);
    expect(labels[1].long).toBe('dom 25 ott · 02:00 (GMT+2)');
    expect(labels[2].long).toBe('dom 25 ott · 02:00 (GMT+1)');
    expect(new Set(labels.map((label) => label.long)).size).toBe(4);
    expect(offsetName('2026-10-25T02:00:00Z')).toBe('GMT');
  });

  it('keeps the 23 hours of the change to summer time as returned', () => {
    const starts = ['2026-03-29T01:00:00+01:00', '2026-03-29T03:00:00+02:00'];

    expect(bucketLabels(historyResult({ starts, series: { grid_import: series(starts, [1, 2]) } })).map((label) => label.short)).toEqual(['01', '03']);
  });

  it('labels days across a month and the day in progress as today', () => {
    const starts = dayStarts(7);
    const labels = bucketLabels(historyResult({ bucket: 'day', starts, series: { grid_import: series(starts, [1, 2, 3, 4, 5, 6, 7], { in_progress_last: true }) } }));

    expect(labels.map((label) => label.short)).toEqual(['29/09', '30/09', '01/10', '02/10', '03/10', '04/10', '05/10']);
    expect(labels[1].long).toBe('mercoledì 30 settembre 2026');
    expect(labels[6]).toEqual({ short: '05/10', long: 'Oggi · in corso', inProgress: true });
  });

  it('labels twelve months with the year where it changes', () => {
    const starts = monthStarts();
    const labels = bucketLabels(historyResult({ bucket: 'month', starts, series: { grid_import: series(starts, Array.from({ length: 12 }, () => 1), { in_progress_last: true }) } }));

    expect(labels[0].short).toBe('nov 2025');
    expect(labels[1].short).toBe('dic');
    expect(labels[2].short).toBe('gen 2026');
    expect(labels[0].long).toBe('novembre 2025');
    expect(labels[11].long).toBe('Questo mese · in corso');
  });

  it('falls back to the offset of each start when the browser does not know the time zone', () => {
    const starts = ['2026-10-05T08:00:00+05:30'];

    expect(bucketLabels(historyResult({ starts, timezone: 'Mars/Olympus_Mons', series: { grid_import: series(starts, [1]) } }))[0].short).toBe('08');
  });
});
