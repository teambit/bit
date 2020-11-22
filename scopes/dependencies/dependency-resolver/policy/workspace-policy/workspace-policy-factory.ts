import {
  WorkspacePolicy,
  WorkspacePolicyConfigObject,
  WorkspacePolicyConfigKeysNames,
  WorkspacePolicyEntry,
  WorkspacePolicyConfigEntryValue,
  WorkspacePolicyEntryValue,
} from './workspace-policy';
import { LIFECYCLE_TYPE_BY_KEY_NAME, DependencyLifecycleType } from '../../dependencies';

export class WorkspacePolicyFactory {
  fromConfigObject(configObject: WorkspacePolicyConfigObject): WorkspacePolicy {
    if (!configObject) {
      return new WorkspacePolicy([]);
    }
    const runtimeEntries = entriesFromKey(configObject, 'dependencies');
    const peerEntries = entriesFromKey(configObject, 'peerDependencies');
    const entries = runtimeEntries.concat(peerEntries);
    return new WorkspacePolicy(entries);
  }

  fromPackageJson(packageJson: Record<string, any>) {
    const obj = {
      dependencies: {
        ...(packageJson.devDependencies || {}),
        ...(packageJson.dependencies || {}),
      },
      peerDependencies: {
        ...(packageJson.peerDependencies || {}),
      },
    };
    return this.fromConfigObject(obj);
  }
}

function entriesFromKey(
  configObject: WorkspacePolicyConfigObject,
  keyName: WorkspacePolicyConfigKeysNames
): WorkspacePolicyEntry[] {
  const obj = configObject[keyName];
  if (!obj) {
    return [];
  }
  const lifecycleType = LIFECYCLE_TYPE_BY_KEY_NAME[keyName];
  const entries = Object.entries(obj).map(([depId, value]: [string, WorkspacePolicyConfigEntryValue]) => {
    return createEntry(depId, value, lifecycleType);
  });
  return entries;
}

function createEntry(
  depId: string,
  value: WorkspacePolicyConfigEntryValue,
  lifecycleType: DependencyLifecycleType
): WorkspacePolicyEntry {
  const version = typeof value === 'string' ? value : value.version;
  const preserve = typeof value === 'string' ? false : value.preserve;
  const entryValue: WorkspacePolicyEntryValue = {
    version,
    preserve,
  };
  const entry: WorkspacePolicyEntry = {
    dependencyId: depId,
    value: entryValue,
    lifecycleType,
  };
  return entry;
}
