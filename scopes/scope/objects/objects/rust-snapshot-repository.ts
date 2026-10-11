import type Repository from './repository';
import { hasRustSnapshotMethods } from './rust-snapshot-guards';
import { isRustSnapshotTransaction, requestRustSnapshotTransaction } from './rust-snapshot-transaction';

type Phase =
  | 'deleteObjects'
  | 'validateObjects'
  | 'writeObjects'
  | 'writeIndex'
  | 'remoteLanesWrite'
  | 'unmergedWrite'
  | 'clearObjects'
  | 'postPersist'
  | 'done';
type Journal = { token: string; revision: number; directive: { kind: Phase; index: number; count: number } };
const phases: Phase[] = [
  'deleteObjects',
  'validateObjects',
  'writeObjects',
  'writeIndex',
  'remoteLanesWrite',
  'unmergedWrite',
  'clearObjects',
  'postPersist',
  'done',
];

function ordinaryCount(value: unknown): number | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null && prototype !== Array.prototype) return undefined;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (typeof key !== 'string' || !('value' in descriptors[key])) return undefined;
  }
  const count = Array.isArray(value) ? descriptors.length.value : Object.keys(descriptors).length;
  return Number.isSafeInteger(count) && count >= 0 && count <= 4096 ? count : undefined;
}

/** Receipts never repeat a completed public action, including after helper loss. */
export class RustSnapshotRepositoryJournal {
  private constructor(private journal: Journal | undefined) {}

  static async begin(repository: Repository): Promise<RustSnapshotRepositoryJournal | undefined> {
    if (!isRustSnapshotTransaction() || !hasRustSnapshotMethods(repository, 'SnapshotRepositoryJournal'))
      return undefined;
    const removals = Object.getOwnPropertyDescriptor(repository, 'objectsToRemove');
    const objects = Object.getOwnPropertyDescriptor(repository, 'objects');
    if (!removals || !('value' in removals) || !objects || !('value' in objects)) return undefined;
    const count = ordinaryCount(removals.value);
    if (count === undefined || ordinaryCount(objects.value) === undefined) return undefined;
    const journal = await requestRustSnapshotTransaction<Journal>({ kind: 'snapshotRepositoryBegin', count }, (data) =>
      valid(data, 'deleteObjects', count)
    );
    return journal ? new RustSnapshotRepositoryJournal(journal) : undefined;
  }

  async completed(nextCount = 1): Promise<void> {
    const previous = this.journal;
    if (!previous) return;
    // Advance the local cursor before waiting: the completed action is authoritative.
    this.journal = undefined;
    const next = phases[phases.indexOf(previous.directive.kind) + 1];
    const count = next === 'done' ? 0 : nextCount;
    this.journal = await requestRustSnapshotTransaction<Journal>(
      {
        kind: 'snapshotRepositoryReceipt',
        token: previous.token,
        revision: previous.revision,
        completed: previous.directive.count,
        failed: false,
        nextCount: count,
      },
      (data) => valid(data, next, count, previous.token, previous.revision + 1)
    );
  }

  async failed(): Promise<void> {
    const previous = this.journal;
    this.journal = undefined;
    if (!previous) return;
    await requestRustSnapshotTransaction(
      {
        kind: 'snapshotRepositoryReceipt',
        token: previous.token,
        revision: previous.revision,
        completed: 0,
        failed: true,
      },
      (data) =>
        data?.token === previous.token &&
        data.revision === previous.revision + 1 &&
        data.directive?.kind === 'failed' &&
        data.directive.phase === previous.directive.kind &&
        data.directive.index === 0 &&
        data.directive.completed === 0
    ).catch(() => undefined);
  }
}

function valid(data: any, phase: Phase, count: number, token?: string, revision = 0): boolean {
  return Boolean(
    typeof data?.token === 'string' &&
      /^[a-f0-9]{40}$/.test(data.token) &&
      (!token || data.token === token) &&
      data.revision === revision &&
      data.directive?.kind === phase &&
      data.directive.index === 0 &&
      data.directive.count === count
  );
}
