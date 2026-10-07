import GlassSegmentSelect from '../../../components/ui/GlassSegmentSelect';
import type { EnergyTariff, EnergyTariffScheme } from '../../../services/energyCoreClient';
import { ERROR_TEXT } from './EnergyModuleEditor';
import { UI } from './energyModel';

/* Tariff form shared by the setup wizard and the Energy settings. */

const SCHEMES: Array<{ value: EnergyTariffScheme; label: string; bands: Array<[string, string, string]> }> = [
  { value: 'single', label: 'Monoraria', bands: [['single', 'Prezzo unico', 'Tutte le ore']] },
  {
    value: 'two_band',
    label: 'Bioraria',
    bands: [
      ['f1', 'F1', 'Lun–ven 8–19'],
      ['f23', 'F23', 'Lun–ven 19–8, weekend e festivi'],
    ],
  },
  {
    value: 'three_band',
    label: 'Trioraria',
    bands: [
      ['f1', 'F1', 'Lun–ven 8–19'],
      ['f2', 'F2', 'Lun–ven 7–8 e 19–23, sabato 7–23'],
      ['f3', 'F3', 'Notte 23–7, domenica e festivi'],
    ],
  },
];

export const TARIFF_HINT = 'Prezzi del tuo contratto, IVA esclusa se indichi l’aliquota. Le fasce seguono gli orari ARERA.';
export const GROUP = 'overflow-hidden rounded-[1.65rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-primary)] shadow-[var(--ui-shadow-card)]';
export const ROW = 'flex flex-wrap items-center gap-3 border-t border-[color:var(--ui-separator)] px-4 py-3.5 first:border-t-0 sm:px-5';
const FIELD = 'liquid-glass-control min-h-10 w-28 rounded-xl px-3 text-right text-sm';

export type TariffForm = { scheme: EnergyTariffScheme; prices: Record<string, string>; fixed: string; vat: string; export: string };

const text = (value: number | null | undefined) => (value === null || value === undefined ? '' : String(value).replace('.', ','));
const parse = (value: string) => (value.trim() ? Number(value.trim().replace(',', '.')) : null);
const schemeOf = (value: EnergyTariffScheme) => SCHEMES.find((scheme) => scheme.value === value) ?? SCHEMES[2];

export function tariffForm(tariff: EnergyTariff | null | undefined): TariffForm {
  return {
    scheme: tariff?.scheme ?? 'three_band',
    prices: Object.fromEntries(Object.entries(tariff?.prices ?? {}).map(([key, value]) => [key, text(value)])),
    fixed: text(tariff?.fixed_monthly),
    vat: text(tariff?.vat_percent),
    export: text(tariff?.export_price),
  };
}

/** True while nothing has been typed: an untouched form is skipped, not flagged. */
export const isBlankTariff = (form: TariffForm) =>
  [...Object.values(form.prices), form.fixed, form.vat, form.export].every((value) => !value.trim());

/** Client-side mirror of the backend limits for immediate feedback. The export price only counts with a grid. */
export function tariffFromForm(form: TariffForm, withExport: boolean): { tariff?: EnergyTariff; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const read = (key: string, value: string, max: number, required: boolean) => {
    const number = parse(value);
    if (number === null) {
      if (required) errors[key] = 'Obbligatorio';
      return null;
    }
    if (!Number.isFinite(number) || number < 0 || number > max) errors[key] = `Tra 0 e ${max}`;
    return number;
  };
  const prices = Object.fromEntries(schemeOf(form.scheme).bands.map(([key]) => [key, read(key, form.prices[key] ?? '', 10, true) ?? 0]));
  const tariff: EnergyTariff = {
    scheme: form.scheme,
    prices,
    fixed_monthly: read('fixed', form.fixed, 10000, false),
    vat_percent: read('vat', form.vat, 100, false),
    export_price: withExport ? read('export', form.export, 10, false) : null,
  };
  return Object.keys(errors).length ? { errors } : { tariff, errors };
}

/** One line such as "Trioraria · F1 0,31 · F2 0,27 · F3 0,22 €/kWh". */
export function tariffSummary(tariff: EnergyTariff) {
  const scheme = schemeOf(tariff.scheme);
  const prices = scheme.bands.map(([key, label]) => `${tariff.scheme === 'single' ? '' : `${label} `}${text(tariff.prices[key])}`);
  return `${scheme.label} · ${prices.join(' · ')} €/kWh`;
}

/** Scheme selector and price rows, laid out as rows of a settings group. */
export function TariffFields({ form, onChange, withExport }: { form: TariffForm; onChange: (form: TariffForm) => void; withExport: boolean }) {
  const scheme = schemeOf(form.scheme);
  const errors = isBlankTariff(form) ? {} : tariffFromForm(form, withExport).errors;
  const rows: Array<[string, string, string, string, (value: string) => void]> = [
    ...scheme.bands.map(([key, label, hours]): [string, string, string, string, (value: string) => void] => [
      key,
      `${label} · €/kWh`,
      hours,
      form.prices[key] ?? '',
      (value) => onChange({ ...form, prices: { ...form.prices, [key]: value } }),
    ]),
    ['fixed', 'Quota fissa · €/mese', 'Canoni e oneri fissi in bolletta', form.fixed, (value) => onChange({ ...form, fixed: value })],
    ['vat', 'IVA · %', 'Facoltativa', form.vat, (value) => onChange({ ...form, vat: value })],
  ];
  if (withExport) {
    rows.push(['export', 'Energia immessa · €/kWh', 'Ritiro dedicato o scambio sul posto', form.export, (value) => onChange({ ...form, export: value })]);
  }
  return (
    <>
      <div className={ROW}>
        <p className="min-w-0 flex-1 text-sm font-medium text-[color:var(--ui-text-primary)]">Struttura tariffaria</p>
        <GlassSegmentSelect
          value={form.scheme}
          onChange={(value) => onChange({ ...form, scheme: value as EnergyTariffScheme })}
          options={SCHEMES.map(({ value, label }) => ({ value, label }))}
          ariaLabel="Struttura tariffaria"
          className="w-full sm:w-[20rem]"
          optionClassName="!h-9 !px-2"
        />
      </div>
      {rows.map(([key, label, hint, value, change]) => (
        <label key={key} className={ROW}>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-[color:var(--ui-text-primary)]">{label}</span>
            <span className={errors[key] ? ERROR_TEXT : UI.muted}>{errors[key] ?? hint}</span>
          </span>
          <input
            inputMode="decimal"
            value={value}
            placeholder="0,00"
            aria-invalid={Boolean(errors[key])}
            onChange={(event) => change(event.target.value)}
            className={FIELD}
          />
        </label>
      ))}
    </>
  );
}
