import type BitObject from './object';
import { hasRustSnapshotFunctions, hasRustSnapshotTransactionClass } from './rust-snapshot-guards';
import { projectRustSnapshotFields } from './rust-snapshot-projection';
import { projectRustSnapshotValue, type RustCompactSnapshotValue } from './rust-snapshot-values';

const componentFields = [
  'name',
  'scope',
  'versions',
  'lang',
  'deprecated',
  'bindingPrefix',
  'scopesList',
  'schema',
  'detachedHeads',
  'local',
  'state',
  'orphanedVersions',
  'head',
];
const laneFields = [
  'name',
  'scope',
  'components',
  'log',
  'readmeComponent',
  'forkedFrom',
  'schema',
  'updateDependents',
  'overrideUpdateDependents',
];
const historyFields = ['name', 'scope', 'versions', 'graphCompleteRefs'];
const laneHistoryFields = ['name', 'scope', 'laneHash', 'history'];
type SnapshotMetadataType = 'Component' | 'Lane' | 'VersionHistory' | 'LaneHistory';

/** Pass raw model state, retaining Rust ownership of model ordering, omission and identity rules. */
export function prepareRustSnapshotMetadata(
  object: BitObject
): { type: SnapshotMetadataType; fields: RustCompactSnapshotValue } | undefined {
  let type: SnapshotMetadataType;
  let names: string[];
  if (hasRustSnapshotTransactionClass(object, 'ModelComponent')) {
    if (!hasRustSnapshotFunctions(['SnapshotComponentLodash'])) return undefined;
    type = 'Component';
    names = componentFields;
  } else if (hasRustSnapshotTransactionClass(object, 'Lane')) {
    if (!hasRustSnapshotFunctions(['SnapshotLaneLodash'])) return undefined;
    type = 'Lane';
    names = laneFields;
  } else if (hasRustSnapshotTransactionClass(object, 'VersionHistory')) {
    if (!hasRustSnapshotFunctions(['SnapshotHistoryObject'])) return undefined;
    type = 'VersionHistory';
    names = historyFields;
  } else if (hasRustSnapshotTransactionClass(object, 'LaneHistory')) {
    type = 'LaneHistory';
    names = laneHistoryFields;
  } else return undefined;
  const descriptors = Object.getOwnPropertyDescriptors(object);
  const raw: Record<string, unknown> = {};
  for (let index = 0; index < names.length; index += 1) raw[names[index]] = descriptors[names[index]]?.value;
  if (type === 'VersionHistory') {
    // The defining getter projects the live record map; validate it before executing Object.values.
    if (!projectRustSnapshotFields(descriptors.versionsObj?.value)) return undefined;
    raw.versions = (object as any).versions;
  }
  const plain =
    type === 'Component'
      ? ['scopesList', 'state']
      : type === 'Lane'
        ? ['log']
        : type === 'LaneHistory'
          ? ['history']
          : ['graphCompleteRefs'];
  for (let index = 0; index < plain.length; index += 1) {
    if (!projectRustSnapshotValue(raw[plain[index]])) return undefined;
  }
  if (type === 'Lane' && raw.updateDependents) {
    // Capture the ordinary public ID primitive at its canonical evaluation boundary.
    if (!projectRustSnapshotFields(raw.updateDependents)) return undefined;
    const ids = raw.updateDependents as any[];
    const values: string[] = [];
    for (let index = 0; index < ids.length; index += 1) {
      if (!hasRustSnapshotTransactionClass(ids[index], 'ComponentID')) return undefined;
      values[index] = ids[index].toString();
    }
    raw.updateDependents = values;
  }
  const fields = projectRustSnapshotFields(raw);
  return fields ? { type, fields } : undefined;
}
