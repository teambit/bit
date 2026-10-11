import { AsyncLocalStorage } from 'async_hooks';

const reads = new AsyncLocalStorage<boolean>();

/** Enable deferred repository Sources only inside the supported status/diff operation. */
export function withRustSourceReads<T>(action: () => Promise<T>): Promise<T> {
  if (process.env.BIT_RUST_CLIENT_VCS !== 'on') return action();
  return reads.run(true, action);
}

export function isRustSourceReadScope(): boolean {
  return process.env.BIT_RUST_CLIENT_VCS === 'on' && reads.getStore() === true;
}
