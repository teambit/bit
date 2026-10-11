import { snapshotSemverGrammar } from '@teambit/pkg.modules.semver-helper';
import { hasRustSnapshotTransactionClass, hasRustSnapshotFunctionReference } from './rust-snapshot-guards';
import { isRustSnapshotTransaction, requestRustSnapshotTransaction } from './rust-snapshot-transaction';

/** npm parses its own dependency's grammar; Rust selects versions and evaluates policy. */
export function snapshotPolicySemver(values: Iterable<string>): Record<string, object> | undefined {
  if (!hasRustSnapshotFunctionReference('SnapshotSemverGrammar', snapshotSemverGrammar)) return undefined;
  return snapshotSemverGrammar(values);
}

export async function planRustSnapshotFutureVersion(
  input: {
    components: object[];
    params: object;
  },
  versions: string[],
  unchanged: () => boolean
): Promise<string | undefined> {
  if (!isRustSnapshotTransaction()) return undefined;
  const grammar = snapshotPolicySemver(versions);
  if (!grammar || !unchanged()) return undefined;
  const result = await requestRustSnapshotTransaction<{ versions: string[] }>(
    { kind: 'snapshotFutureVersions', ...input, semver: grammar },
    (reply) => Array.isArray(reply.versions) && reply.versions.length === 1 && typeof reply.versions[0] === 'string'
  );
  return result && unchanged() ? result.versions[0] : undefined;
}

export function snapshotPolicyId(id: any): { scope: string; name: string; version?: string } | undefined {
  if (!hasRustSnapshotTransactionClass(id, 'ComponentID')) return undefined;
  const legacy = Object.getOwnPropertyDescriptor(id, '_legacy')?.value;
  if (!hasRustSnapshotTransactionClass(legacy, 'BitId')) return undefined;
  for (const field of ['scope', 'name', 'version']) {
    const value = Object.getOwnPropertyDescriptor(legacy, field)?.value;
    if (value !== undefined && value !== null && typeof value !== 'string') return undefined;
  }
  const scope = Object.getOwnPropertyDescriptor(id, '_scope')?.value;
  if (scope !== undefined && scope !== null && typeof scope !== 'string') return undefined;
  return id.serialize();
}

export function snapshotPolicyConsumerId(component: any): any | undefined {
  if (!hasRustSnapshotTransactionClass(component, 'ConsumerComponent')) return undefined;
  for (const field of ['scope', 'name', 'version', 'defaultScope']) {
    const value = Object.getOwnPropertyDescriptor(component, field)?.value;
    if (value !== undefined && value !== null && typeof value !== 'string') return undefined;
  }
  try {
    const id = component.id;
    return snapshotPolicyId(id) ? id : undefined;
  } catch {
    return undefined;
  }
}
