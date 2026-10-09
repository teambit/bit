import { AsyncLocalStorage } from 'async_hooks';
import { resolveRustDependencyScannerExecutable } from './discovery';
import { RustDependencyScannerSession } from './session';

type Slot = { session: RustDependencyScannerSession; busy: boolean };
export type RustScannerLease = { session: RustDependencyScannerSession; release: () => void };

// Preserve the component loader's concurrency policy. Concurrent/nested graph builds
// borrow separate helpers; excess native work falls back without waiting for a lease.
const MAX_HELPERS = 4;

class ScannerScope {
  private readonly slots = new Map<string, Slot[]>();
  private readonly failed = new Set<string>();
  private helpers = 0;
  closed = false;

  acquire(executable: string, cwd: string): RustScannerLease | undefined {
    if (this.closed) return undefined;
    const key = JSON.stringify([executable, cwd]);
    if (this.failed.has(key)) return undefined;
    const pool = this.slots.get(key) || [];
    let slot = pool.find((candidate) => !candidate.busy);
    if (!slot) {
      if (this.helpers >= MAX_HELPERS) {
        require('debug')('precinct')('Rust extraction fallback: operation helper lease limit reached');
        return undefined;
      }
      slot = { session: new RustDependencyScannerSession({ executable, cwd }), busy: false };
      pool.push(slot);
      this.slots.set(key, pool);
      this.helpers++;
    }
    slot.busy = true;
    const leased = slot;
    let released = false;
    return {
      session: leased.session,
      release: () => {
        if (released) return;
        released = true;
        leased.busy = false;
        if (this.closed) return;
        if (!leased.session.clearCache()) {
          // A transport failure is terminal for this executable/cwd within the
          // operation. Do not repeatedly start a broken helper for each component.
          this.failed.add(key);
          leased.session.dispose();
        }
      },
    };
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const pool of this.slots.values()) {
      for (const slot of pool) slot.session.dispose();
    }
    this.slots.clear();
    this.failed.clear();
  }
}

const scopes = new AsyncLocalStorage<ScannerScope>();

/** The outer component-load operation owns helper lifetimes, including nested loads. */
export async function withRustDependencyScannerScope<T>(operation: () => Promise<T>): Promise<T> {
  // Reentrant loads retain their original owner. A context can outlive its owner
  // (e.g. a callback scheduled during loading), so a closed store does not count:
  // the new operation owns a fresh scope and disposes it in its own finally.
  if (scopes.getStore()?.closed === false) return operation();
  const executable = resolveRustDependencyScannerExecutable();
  if (!executable) return operation();
  const scope = new ScannerScope();
  try {
    return await scopes.run(scope, operation);
  } finally {
    scope.close();
  }
}

/** Every tree owns an exclusive cache snapshot; only the underlying process is reused. */
export function acquireRustDependencyScannerSession(executable: string): RustScannerLease | undefined {
  const cwd = process.cwd();
  const scope = scopes.getStore();
  if (scope) return scope.acquire(executable, cwd);
  const session = new RustDependencyScannerSession({ executable, cwd });
  return { session, release: () => session.dispose() };
}
