import { ExtensionDataList } from '@teambit/legacy/dist/consumer/config/extension-data';
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
import { DEV_DEP_LIFECYCLE_TYPE } from '../../dependencies/constants';
import { compact } from 'lodash';

export class VariantPolicyFactory {
  fromConfigObject(configObject, source?: DependencySource): VariantPolicy {
    const runtimeEntries = entriesFromKey(configObject, 'dependencies', source);
    const devEntries = entriesFromKey(configObject, 'devDependencies', source);
    const peerEntries = entriesFromKey(configObject, 'peerDependencies', source);
    const entries = runtimeEntries.concat(devEntries).concat(peerEntries);
    return new VariantPolicy(entries);
  }

  /**
   * This will return the policy of the extension themselves, not for the config inside of them
   * @param configuredExtensions
   */
  fromExtensionDataList(configuredExtensions: ExtensionDataList): VariantPolicy {
    const entries = configuredExtensions.map((extEntry) => {
      if (extEntry.extensionId) {
        const version =
          extEntry.extensionId.version === 'latest' || !extEntry.extensionId.version
            ? '*'
            : extEntry.extensionId.version;
        return createEntry(extEntry.stringId, version, DEV_DEP_LIFECYCLE_TYPE, 'extensionEntry');
      }
      return undefined;
    });
    return new VariantPolicy(compact(entries));
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
