/*
 * A loader for React.lazy that gives a module back at once when it has already arrived.
 * React.lazy suspends on a first render even for code fetched long ago, and React then
 * holds back for 300 ms what follows the fallback: with this, what was preloaded draws
 * on the very first tap.
 */

/** Not a real Promise: a Promise would answer one tick later, and React would suspend. */
function settled<T>(value: T): Promise<T> {
  return { then: (done: (value: T) => unknown) => settled(done ? done(value) : value), catch: () => settled(value) } as unknown as Promise<T>;
}

export function onceLoaded<T>(load: () => Promise<T>): () => Promise<T> {
  let arrived: { module: T } | null = null;
  return () =>
    arrived
      ? settled(arrived.module)
      : load().then((module) => {
          arrived = { module };
          return module;
        });
}
