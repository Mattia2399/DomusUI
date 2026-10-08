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
