import R from 'ramda';
import { Policy, PolicyEntry, SemverVersion, GitUrlVersion, FileSystemPath, PolicyConfigKeys } from '../policy';
import { KEY_NAME_BY_LIFECYCLE_TYPE, LIFECYCLE_TYPE_BY_KEY_NAME, DependencyLifecycleType } from '../../dependencies';
import { EntryAlreadyExist } from './exceptions';
import { sortObject } from 'bit-bin/dist/utils';

export type WorkspacePolicyConfigKeys = Omit<PolicyConfigKeys, 'devDependencies'>;
export type WorkspacePolicyConfigKeysNames = keyof WorkspacePolicyConfigKeys;

export type WorkspacePolicyConfigObject = Partial<
  Record<WorkspacePolicyConfigKeysNames, WorkspacePolicyLifecycleConfigObject>
>;
export type WorkspacePolicyLegacyConfig = Partial<
  Record<WorkspacePolicyConfigKeysNames, WorkspacePolicyLifecycleLegacyConfigObject>
>;

type WorkspacePolicyLifecycleConfigObject = {
  [dependencyId: string]: WorkspacePolicyConfigEntryValue;
};

type WorkspacePolicyLifecycleLegacyConfigObject = {
  [dependencyId: string]: WorkspacePolicyEntryVersion;
};

export type WorkspacePolicyConfigEntryValue = WorkspacePolicyEntryValue | WorkspacePolicyEntryVersion;

export type AddEntryOptions = {
  updateExisting: boolean;
};
/**
 * Allowed values are valid semver values, git urls, fs path.
 */
export type WorkspacePolicyEntryVersion = SemverVersion | GitUrlVersion | FileSystemPath;

export type WorkspacePolicyEntryValue = {
  version: WorkspacePolicyEntryVersion;
  preserve?: boolean;
};

export type WorkspacePolicyEntry = PolicyEntry & {
  value: WorkspacePolicyEntryValue;
};

export class WorkspacePolicy implements Policy<WorkspacePolicyConfigObject> {
  constructor(private _policiesEntries: WorkspacePolicyEntry[]) {
    this._policiesEntries = uniqEntries(_policiesEntries);
  }

  get entries() {
    return this._policiesEntries;
  }

  add(entry: WorkspacePolicyEntry, options?: AddEntryOptions): void {
    const defaultOptions: AddEntryOptions = {
      updateExisting: false,
    };

    const calculatedOpts = Object.assign({}, defaultOptions, options);

    const existing = this.find(entry.dependencyId);
    if (existing) {
      if (!calculatedOpts.updateExisting) {
        throw new EntryAlreadyExist(entry);
      }
      this.remove(entry.dependencyId);
    }
    this._policiesEntries.push(entry);
  }

  find(depId: string): WorkspacePolicyEntry | undefined {
    const entry = this.entries.find((entry) => {
      return entry.dependencyId === depId;
    });
    return entry;
  }

  remove(depId: string): WorkspacePolicy {
    const entries = this.entries.filter((entry) => {
      return entry.dependencyId !== depId;
    });
    return new WorkspacePolicy(entries);
  }

  toConfigObject(): WorkspacePolicyConfigObject {
    const res: WorkspacePolicyConfigObject = {
      dependencies: {},
      peerDependencies: {},
    };
    this._policiesEntries.reduce((acc, entry) => {
      const keyName = KEY_NAME_BY_LIFECYCLE_TYPE[entry.lifecycleType];
      const value = entry.value.preserve ? entry.value : entry.value.version;
      acc[keyName][entry.dependencyId] = value;
      return acc;
    }, res);
    res.dependencies = sortObject(res.dependencies);
    res.peerDependencies = sortObject(res.peerDependencies);
    return res;
  }

  // Legacy doesn't support the preserve key
  toLegacyConfig(): WorkspacePolicyLegacyConfig {
    const res: WorkspacePolicyLegacyConfig = {
      dependencies: {},
      peerDependencies: {},
    };
    this._policiesEntries.reduce((acc, entry) => {
      const keyName = KEY_NAME_BY_LIFECYCLE_TYPE[entry.lifecycleType];
      acc[keyName][entry.dependencyId] = entry.value.version;
      return acc;
    }, res);
    return res;
  }

  byLifecycleType(lifecycleType: DependencyLifecycleType): WorkspacePolicy {
    const filtered = this._policiesEntries.filter((entry) => entry.lifecycleType === lifecycleType);
    return new WorkspacePolicy(filtered);
  }
}

function uniqEntries(entries: Array<WorkspacePolicyEntry>): Array<WorkspacePolicyEntry> {
  const uniq = R.uniqBy(R.prop('dependencyId'), entries);
  return uniq;
}
