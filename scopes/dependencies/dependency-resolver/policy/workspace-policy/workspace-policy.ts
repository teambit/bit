import { uniqWith } from 'ramda';
import { sortObject } from '@teambit/legacy/dist/utils';
import { Policy, PolicyEntry, SemverVersion, GitUrlVersion, FileSystemPath, PolicyConfigKeys } from '../policy';
import { KEY_NAME_BY_LIFECYCLE_TYPE, DependencyLifecycleType } from '../../dependencies';
import { EntryAlreadyExist } from './exceptions';

export type WorkspacePolicyConfigKeys = Omit<PolicyConfigKeys, 'devDependencies'>;
export type WorkspacePolicyConfigKeysNames = keyof WorkspacePolicyConfigKeys;

export type WorkspacePolicyConfigObject = Partial<
  Record<WorkspacePolicyConfigKeysNames, WorkspacePolicyLifecycleConfigObject>
>;
export type WorkspacePolicyManifest = Partial<
  Record<WorkspacePolicyConfigKeysNames, WorkspacePolicyLifecycleManifestObject>
>;

type WorkspacePolicyLifecycleConfigObject = {
  [dependencyId: string]: WorkspacePolicyConfigEntryValue;
};

type WorkspacePolicyLifecycleManifestObject = {
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

  forEach(predicate: (dep: WorkspacePolicyEntry, index?: number) => void): void {
    this.entries.forEach(predicate);
  }

  filter(predicate: (dep: WorkspacePolicyEntry, index?: number) => boolean): WorkspacePolicy {
    const filtered = this.entries.filter(predicate);
    return new WorkspacePolicy(filtered);
  }

  find(depId: string, lifecycleType?: DependencyLifecycleType): WorkspacePolicyEntry | undefined {
    const matchedEntry = this.entries.find((entry) => {
      const idEqual = entry.dependencyId === depId;
      const lifecycleEqual = lifecycleType ? entry.lifecycleType === lifecycleType : true;
      return idEqual && lifecycleEqual;
    });
    return matchedEntry;
  }

  remove(depId: string): WorkspacePolicy {
    const entries = this.entries.filter((entry) => {
      return entry.dependencyId !== depId;
    });
    return new WorkspacePolicy(entries);
  }

  getDepVersion(depId: string, lifecycleType?: DependencyLifecycleType): WorkspacePolicyEntryVersion | undefined {
    const entry = this.find(depId, lifecycleType);
    if (!entry) {
      return undefined;
    }
    return entry.value.version;
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
    if (res.dependencies) {
      res.dependencies = sortObject(res.dependencies);
    }
    if (res.peerDependencies) {
      res.peerDependencies = sortObject(res.peerDependencies);
    }
    return res;
  }

  /**
   * Create an object ready for package manager installation
   * this is similar to "toConfigObject" but it will make the value of a specific dep always a string (the version / url)
   */
  toManifest(): WorkspacePolicyManifest {
    const res: WorkspacePolicyManifest = {
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

  static mergePolices(policies: WorkspacePolicy[]): WorkspacePolicy {
    let allEntries: WorkspacePolicyEntry[] = [];
    allEntries = policies.reduce((acc, curr) => {
      return acc.concat(curr.entries);
    }, allEntries);
    // We reverse it to make sure the latest policy will be stronger in case of conflict
    allEntries = allEntries.reverse();
    return new WorkspacePolicy(allEntries);
  }
}

function uniqEntries(entries: Array<WorkspacePolicyEntry>): Array<WorkspacePolicyEntry> {
  const uniq = uniqWith((entry1: WorkspacePolicyEntry, entry2: WorkspacePolicyEntry) => {
    return entry1.dependencyId === entry2.dependencyId && entry1.lifecycleType === entry2.lifecycleType;
  }, entries);
  return uniq;
}
