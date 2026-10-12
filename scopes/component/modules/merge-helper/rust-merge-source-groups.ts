import type { Repository, Source, SourceFileModel, HistorySourceCapsule } from '@teambit/objects';
import { types } from 'util';
import { loadRustCapturedSourceCapsule, hasRustSnapshotTransactionClassFields } from '@teambit/objects';
import { SourceFile } from '@teambit/component.sources';
import {
  copyRustMergeBuffer,
  hasRustMergeBufferProperties,
  hasRustMergeBufferPrototypes,
  type RustMergeRow,
} from './rust-merge-body-plan';
const bufferProperties = hasRustMergeBufferProperties;
const copyBuffer = copyRustMergeBuffer;
const bufferPrototypes = hasRustMergeBufferPrototypes;

export type MergeSourceReference = { source: number; ref: { side: 'base' | 'other'; index: number } };
export type MergeSourceGroup = {
  stage: 'currentUpdated' | 'added' | 'deletedConflict' | 'modified';
  loads: Array<{
    row: number;
    source?: number;
    ref?: MergeSourceReference['ref'];
    base?: MergeSourceReference;
    other?: MergeSourceReference;
  }>;
};
export type MergeSourceObservation = {
  sources: Map<
    number,
    { base?: Source; other: Source; file?: SourceFile; baseContents?: Buffer; otherContents: Buffer }
  >;
  groups: Array<{ stage: MergeSourceGroup['stage']; order: number[] }>;
  fresh: () => boolean;
  continuation: {
    load: (file: SourceFileModel) => Promise<Source>;
    file: (file: SourceFileModel) => Promise<SourceFile>;
    contents: (file: SourceFileModel, source: Source) => Buffer;
  };
};
const sourceBufferEquals = Buffer.prototype.equals;
const sourceBufferFrom = Buffer.from;

/** Logical public loads retain their original concurrency and completion order; only bytes come from verified capsules. */
export async function observeRustMergeSourceGroups(
  repository: Repository,
  capsules: HistorySourceCapsule[],
  groups: MergeSourceGroup[],
  baseFiles: SourceFileModel[],
  otherFiles: SourceFileModel[]
): Promise<MergeSourceObservation> {
  const sources: MergeSourceObservation['sources'] = new Map();
  const orders: MergeSourceObservation['groups'] = [];
  const loaded = new Map<SourceFileModel, Source[]>();
  const constructed = new Map<SourceFileModel, SourceFile[]>();
  const contents = new Map<SourceFileModel, Buffer[]>();
  const snapshots: Array<{ source: Source; descriptor: PropertyDescriptor | undefined; body: Buffer; copy?: Buffer }> =
    [];
  const remember = <T>(map: Map<SourceFileModel, T[]>, model: SourceFileModel, value: T) => {
    const values = map.get(model) || [];
    values.push(value);
    map.set(model, values);
  };
  const modelFor = (reference: MergeSourceReference): SourceFileModel =>
    (reference.ref.side === 'base' ? baseFiles : otherFiles)[reference.ref.index];
  const load = async (reference: MergeSourceReference): Promise<{ source: Source; body: Buffer }> => {
    const model = modelFor(reference);
    // A helper loss changes only the private byte provider; the original public load occurs once.
    const source =
      (await loadRustCapturedSourceCapsule(repository, capsules[reference.source], model.file)) ||
      ((await model.file.load(repository)) as Source);
    // This is the canonical post-load contents observation, retained for any later fallback suffix.
    const body = source.contents;
    const descriptor = Object.getOwnPropertyDescriptor(source, 'contents');
    const copy =
      bufferProperties(body) && Object.getOwnPropertyDescriptor(Buffer, 'from')?.value === sourceBufferFrom
        ? copyBuffer(body)
        : undefined;
    snapshots.push({ source, descriptor, body, copy });
    remember(loaded, model, source);
    remember(contents, model, body);
    return { source, body };
  };
  for (const group of groups) {
    const order: number[] = [];
    orders.push({ stage: group.stage, order });
    await Promise.all(
      group.loads.map(async (entry) => {
        if (group.stage === 'modified') {
          // Canonical workers start base and other loads synchronously, then await both.
          const base = entry.base ? load(entry.base) : Promise.resolve(undefined);
          const other = load(entry.other!);
          const [baseSource, otherSource] = await Promise.all([base, other]);
          sources.set(entry.row, {
            base: baseSource?.source,
            baseContents: baseSource?.body,
            other: otherSource.source,
            otherContents: otherSource.body,
          });
        } else {
          const reference = { source: entry.source!, ref: entry.ref! };
          const other = await load(reference);
          let file: SourceFile | undefined;
          if (group.stage !== 'currentUpdated') {
            const model = modelFor(reference);
            file = new SourceFile({ base: '.', path: model.relativePath, contents: other.body, test: model.test });
            remember(constructed, model, file);
          }
          sources.set(entry.row, { other: other.source, otherContents: other.body, file });
          order.push(entry.row);
        }
      })
    );
    if (group.stage === 'modified') order.push(...group.loads.map((entry) => entry.row));
  }
  return {
    sources,
    groups: orders,
    fresh: () =>
      bufferPrototypes() &&
      snapshots.every(({ source, descriptor, body, copy }) => {
        if (
          !copy ||
          !bufferProperties(body) ||
          types.isProxy(source) ||
          !hasRustSnapshotTransactionClassFields(source, 'Source', ['contents']) ||
          !descriptor ||
          !('value' in descriptor)
        )
          return false;
        const live = Object.getOwnPropertyDescriptor(source, 'contents');
        return Boolean(
          live &&
            'value' in live &&
            live.value === body &&
            live.writable === descriptor.writable &&
            live.enumerable === descriptor.enumerable &&
            live.configurable === descriptor.configurable &&
            Object.getOwnPropertyDescriptor(Buffer.prototype, 'equals')?.value === sourceBufferEquals &&
            sourceBufferEquals.call(body, copy)
        );
      }),
    continuation: {
      load: async (model) => loaded.get(model)?.shift() || ((await model.file.load(repository)) as Source),
      file: async (model) => {
        const retained = constructed.get(model)?.shift();
        if (retained) {
          // Construction already consumed this occurrence's Source load.
          loaded.get(model)?.shift();
          contents.get(model)?.shift();
          return retained;
        }
        return SourceFile.loadFromSourceFileModel(model, repository);
      },
      contents: (model, source) => contents.get(model)?.shift() || source.contents,
    },
  };
}

/** Validate every selector before starting any logical Source load. */
export function validRustMergeSourceGroups(
  value: any,
  capsules: HistorySourceCapsule[],
  rows: RustMergeRow[],
  baseFiles: SourceFileModel[],
  otherFiles: SourceFileModel[]
): value is MergeSourceGroup[] {
  if (!Array.isArray(value) || value.length !== 4) return false;
  const stages = ['currentUpdated', 'added', 'deletedConflict', 'modified'];
  const kinds = ['updatedFiles', 'addFiles', 'deletedConflictFiles', 'modifiedFiles'];
  const validReference = (reference: any): boolean => {
    if (
      !reference ||
      !Number.isInteger(reference.source) ||
      !capsules[reference.source] ||
      !reference.ref ||
      !['base', 'other'].includes(reference.ref.side) ||
      !Number.isInteger(reference.ref.index)
    )
      return false;
    const model = (reference.ref.side === 'base' ? baseFiles : otherFiles)[reference.ref.index];
    return Boolean(
      model &&
        hasRustSnapshotTransactionClassFields(model.file, 'Ref', ['hash']) &&
        Object.getOwnPropertyDescriptor(model.file, 'hash')?.value === capsules[reference.source].hash
    );
  };
  for (let index = 0; index < stages.length; index++) {
    const group = value[index];
    if (!group || group.stage !== stages[index] || !Array.isArray(group.loads) || group.loads.length > 4096)
      return false;
    const seen = new Set<number>();
    for (const entry of group.loads) {
      if (!entry || !Number.isInteger(entry.row) || entry.row < 0 || entry.row >= rows.length || seen.has(entry.row))
        return false;
      seen.add(entry.row);
      const row = rows[entry.row];
      if (row.kind !== kinds[index]) return false;
      if (group.stage === 'modified') {
        if (
          !validReference(entry.other) ||
          entry.other.ref.side !== 'other' ||
          entry.other.ref.index !== row.other ||
          (row.base === undefined
            ? entry.base !== undefined
            : !validReference(entry.base) || entry.base.ref.side !== 'base' || entry.base.ref.index !== row.base)
        )
          return false;
      } else if (!validReference(entry) || entry.ref.side !== 'other' || entry.ref.index !== row.other) return false;
    }
    const expected = rows.reduce(
      (count, row) =>
        count +
        Number(
          row.kind === kinds[index] &&
            row.other !== undefined &&
            (group.stage === 'modified' || row.bodyPlanIndex !== undefined)
        ),
      0
    );
    if (seen.size !== expected) return false;
  }
  return true;
}
