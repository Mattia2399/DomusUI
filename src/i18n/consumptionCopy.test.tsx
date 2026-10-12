import type { ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from './I18nProvider';
import {
  translateConsumption,
  translateConsumptionLoose,
  useConsumptionCopy,
} from './consumptionCopy';

describe('Domus Energy translations', () => {
  it('interpolates English and French copy without losing placeholders', () => {
    expect(translateConsumption('en', 'Passaggio {current} di {total}', { current: 2, total: 5 }))
      .toBe('Step 2 of 5');
    expect(translateConsumption('fr', 'Passaggio {current} di {total}', { current: 2, total: 5 }))
      .toBe('Étape 2 sur 5');
  });

  it('translates dynamic validation messages produced by the plant model', () => {
    expect(translateConsumptionLoose('en', 'Sensore già usato per {holder}.', { holder: 'Grid 1' }))
      .toBe('Sensor already used by Grid 1.');
    expect(translateConsumptionLoose('fr', 'Indica un valore tra 0 e {max} kWh.', { max: 1000 }))
      .toBe('Saisissez une valeur comprise entre 0 et 1000 kWh.');
  });

  it('exposes the selected provider locale to page components', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <I18nProvider forcedLocale="en">{children}</I18nProvider>
    );
    const { result } = renderHook(() => useConsumptionCopy(), { wrapper });

    expect(result.current.locale).toBe('en');
    expect(result.current.c('Impostazioni Energia')).toBe('Energy Settings');
  });
});
