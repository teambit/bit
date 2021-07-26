import { PolicyConfigKeysNames } from '../policy';
import {
  VariantPolicy,
  VariantPolicyConfigObject,
  VariantPolicyEntryValue,
  VariantPolicyEntry,
  VariantPolicyConfigEntryValue,
  SerializedVariantPolicy,
  DependencySource,
} from './variant-policy';
import { LIFECYCLE_TYPE_BY_KEY_NAME, DependencyLifecycleType } from '../../dependencies';

export class VariantPolicyFactory {
  fromConfigObject(configObject, source?: DependencySource): VariantPolicy {
    const runtimeEntries = entriesFromKey(configObject, 'dependencies', source);
    const devEntries = entriesFromKey(configObject, 'devDependencies', source);
    const peerEntries = entriesFromKey(configObject, 'peerDependencies', source);
    const entries = runtimeEntries.concat(devEntries).concat(peerEntries);
    return new VariantPolicy(entries);
  }

  parse(serializedEntries: SerializedVariantPolicy) {
    return new VariantPolicy(serializedEntries);
  }

  getEmpty(): VariantPolicy {
    return new VariantPolicy([]);
  }
}

function entriesFromKey(
  configObject: VariantPolicyConfigObject,
  keyName: PolicyConfigKeysNames,
  source?: DependencySource
): VariantPolicyEntry[] {
  const obj = configObject[keyName];
  if (!obj) {
    return [];
  }
  const lifecycleType = LIFECYCLE_TYPE_BY_KEY_NAME[keyName];
  const entries = Object.entries(obj).map(([depId, value]: [string, VariantPolicyConfigEntryValue]) => {
    return createEntry(depId, value, lifecycleType, source);
  });
  return entries;
}

function createEntry(
  depId: string,
  value: VariantPolicyConfigEntryValue,
  lifecycleType: DependencyLifecycleType,
  source?: DependencySource
): VariantPolicyEntry {
  const version = typeof value === 'string' ? value : value.version;
  const resolveFromEnv = typeof value === 'string' ? false : value.resolveFromEnv;

  const entryValue: VariantPolicyEntryValue = {
    version,
    resolveFromEnv,
  };
  const entry: VariantPolicyEntry = {
    dependencyId: depId,
    value: entryValue,
    lifecycleType,
    source,
  };
  return entry;
}
