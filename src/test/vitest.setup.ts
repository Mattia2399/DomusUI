import { configure } from '@testing-library/react';
import { vi } from 'vitest';
import { preloadAllTranslationCatalogs } from '../i18n/I18nProvider';

// Lazy parts compile on their first import, and under load that takes more than the second
// findBy and waitFor give by default: a test must fail for what it checks, not for that.
configure({ asyncUtilTimeout: 10_000 });

// A card asks for the code of its panel while the browser is free: in a test that import
// would outlive the test. panelPreload.test.ts checks the real one.
vi.mock('../components/devices/panels/panelPreload', () => ({ usePanelPreload: () => ({}), preloadPanel: () => undefined }));

await preloadAllTranslationCatalogs();

if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverStub implements ResizeObserver {
    disconnect() {}

    observe(_target: Element, _options?: ResizeObserverOptions) {}

    unobserve(_target: Element) {}
  }

  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    writable: true,
    value: ResizeObserverStub,
  });
}
