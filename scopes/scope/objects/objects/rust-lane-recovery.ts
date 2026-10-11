import type * as Sources from '@teambit/component.sources';
import { isRustSnapshotOperation } from './rust-snapshot';

export type RustRecoveryOperation =
  | { kind: 'copy'; source: string; destination: string }
  | { kind: 'remove'; path: string }
  | { kind: 'ensureDir'; path: string };

// eslint-disable-next-line no-var
var scopeDefaults:
  | {
      constructor: any;
      lastPath: PropertyDescriptor | undefined;
      constructorDescriptor: PropertyDescriptor | undefined;
      path: PropertyDescriptor | undefined;
    }
  | undefined;
export function registerRustRecoveryScope(constructor: any): void {
  scopeDefaults ||= {
    constructor,
    lastPath: Object.getOwnPropertyDescriptor(constructor.prototype, 'getLastMergedPath'),
    constructorDescriptor: Object.getOwnPropertyDescriptor(constructor.prototype, 'constructor'),
    path: Object.getOwnPropertyDescriptor(constructor.prototype, 'path'),
  };
}
export function hasRustRecoveryScope(scope: any): boolean {
  return Boolean(
    scopeDefaults &&
      scope &&
      Object.getPrototypeOf(scope) === scopeDefaults.constructor.prototype &&
      !Object.getOwnPropertyDescriptor(scope, 'getLastMergedPath') &&
      sameProperty(
        Object.getOwnPropertyDescriptor(scopeDefaults.constructor.prototype, 'getLastMergedPath'),
        scopeDefaults.lastPath
      ) &&
      sameProperty(
        Object.getOwnPropertyDescriptor(scopeDefaults.constructor.prototype, 'constructor'),
        scopeDefaults.constructorDescriptor
      ) &&
      !Object.getOwnPropertyDescriptor(scope, 'path') &&
      sameProperty(Object.getOwnPropertyDescriptor(scopeDefaults.constructor.prototype, 'path'), scopeDefaults.path) &&
      typeof Object.getOwnPropertyDescriptor(Object.getOwnPropertyDescriptor(scope, 'legacyScope')?.value || {}, 'path')
        ?.value === 'string'
  );
}

function sameProperty(actual: PropertyDescriptor | undefined, expected: PropertyDescriptor | undefined): boolean {
  return Boolean(actual && expected && Object.keys(expected).every((key) => actual[key] === expected[key]));
}

function metadata(value: any, seen = new Set<object>(), depth = 0): boolean {
  if (depth > 64) return false;
  if (value === null || value === undefined || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || seen.has(value) || Object.getOwnPropertySymbols(value).length) return false;
  const array = Array.isArray(value);
  if (
    array
      ? Object.getPrototypeOf(value) !== Array.prototype
      : ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    return false;
  const properties = Object.getOwnPropertyDescriptors(value);
  if (array && Object.keys(properties).length !== value.length + 1) return false;
  if (Object.keys(properties).length > 4097) return false;
  seen.add(value);
  const valid = Object.entries(properties).every(([name, property]) => {
    if (array && name === 'length') return true;
    if (array && (!/^(0|[1-9][0-9]*)$/.test(name) || Number(name) >= value.length || property.value === undefined))
      return false;
    return 'value' in property && property.enumerable && metadata(property.value, seen, depth + 1);
  });
  seen.delete(value);
  return valid;
}

/** Keep each acknowledged recovery prefix authoritative before canonical replay. */
export async function requestRustRecovery<T>(
  input: object,
  validate: (data: any) => boolean,
  retainSession?: (dispose: () => Promise<void>) => void
): Promise<T | undefined> {
  if (!isRustSnapshotOperation()) return undefined;
  if (!metadata(input)) return undefined;
  const bytes = Buffer.from(JSON.stringify(input));
  if (!bytes.length || bytes.length > 4 * 1024 * 1024) return undefined;
  const { withWorkspaceSession } = require('@teambit/component.sources') as typeof Sources;
  return withWorkspaceSession(async (session) => {
    retainSession?.(() => session.dispose());
    let result: T | undefined;
    await session.request(
      (id) => {
        const header = Buffer.alloc(12);
        header.write('BMT1');
        header.writeUInt32BE(id, 4);
        header.writeUInt32BE(bytes.length, 8);
        return Buffer.concat([header, bytes]);
      },
      1,
      (response) => {
        if (response.failed) return response.completed === 0 && response.data === undefined;
        if (response.completed !== 1 || !response.data || !validate(response.data)) return false;
        result = response.data as T;
        return true;
      },
      4 * 1024 * 1024
    );
    if (!result || (result as any).failed === true) await session.dispose();
    return result;
  });
}

export async function advanceRustRecovery(
  operations: RustRecoveryOperation[],
  eligible: () => boolean = () => true
): Promise<number> {
  if (!operations.length || operations.length > 4096 || !isRustSnapshotOperation()) return 0;
  let dispose: (() => Promise<void>) | undefined;
  const plan = await requestRustRecovery<{ token: string }>(
    { kind: 'recoveryInitialize', operations },
    (data) => eligible() && typeof data.token === 'string' && /^[a-f0-9]{40}$/.test(data.token),
    (reap) => {
      dispose = reap;
    }
  );
  if (!plan) return 0;
  if (!eligible()) {
    await dispose?.();
    return 0;
  }
  const result = await requestRustRecovery<{ completed: number; nextIndex: number; failed: boolean }>(
    { kind: 'recoveryAdvance', token: plan.token, count: operations.length },
    (data) =>
      Number.isInteger(data.completed) &&
      data.completed >= 0 &&
      data.completed <= operations.length &&
      data.nextIndex === data.completed &&
      typeof data.failed === 'boolean' &&
      (data.failed ? data.completed < operations.length : data.completed === operations.length)
  );
  return result?.completed || 0;
}
