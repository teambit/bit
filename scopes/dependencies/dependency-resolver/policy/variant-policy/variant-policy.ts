import R from 'ramda';
import { DependenciesOverridesData } from 'bit-bin/dist/consumer/config/component-overrides';
import { Policy, PolicyConfigKeys, PolicyEntry, SemverVersion } from '../policy';
import { KEY_NAME_BY_LIFECYCLE_TYPE } from '../../dependencies';

export type VariantPolicyConfigObject = Partial<Record<keyof PolicyConfigKeys, VariantPolicyLifecycleConfigObject>>;

type VariantPolicyLifecycleConfigObject = {
  [dependencyId: string]: VariantPolicyConfigEntryValue;
};

export type VariantPolicyConfigEntryValue = VariantPolicyEntryValue | VariantPolicyEntryVersion;

/**
 * Allowed values are valid semver values, git urls, fs path.
 */
export type VariantPolicyEntryVersion = SemverVersion;

export type VariantPolicyEntryValue = {
  version: VariantPolicyEntryVersion;
  resolveFromEnv?: boolean;
};

export type VariantPolicyEntry = PolicyEntry & {
  value: VariantPolicyEntryValue;
};

export type SerializedVariantPolicyEntry = VariantPolicyEntry;
export type SerializedVariantPolicy = SerializedVariantPolicyEntry[];

export class VariantPolicy implements Policy<VariantPolicyConfigObject> {
  constructor(private _policiesEntries: VariantPolicyEntry[]) {
    this._policiesEntries = uniqEntries(_policiesEntries);
  }

  get entries(): VariantPolicyEntry[] {
    return this._policiesEntries;
  }

  get length(): number {
    return this.entries.length;
  }

  find(depId: string): VariantPolicyEntry | undefined {
    const matchedEntry = this.entries.find((entry) => {
      return entry.dependencyId === depId;
    });
    return matchedEntry;
  }

  filter(predicate: (dep: VariantPolicyEntry, index?: number) => boolean): VariantPolicy {
    const filtered = this.entries.filter(predicate);
    return new VariantPolicy(filtered);
  }

  /**
   * Filter only deps which should be resolved from the env
   */
  getResolvedFromEnv() {
    return this.filter((dep) => {
      return !!dep.value.resolveFromEnv;
    });
  }

  getDepVersion(depId: string): VariantPolicyEntryVersion | undefined {
    const entry = this.find(depId);
    if (!entry) {
      return undefined;
    }
    return entry.value.version;
  }

  serialize(): SerializedVariantPolicy {
    return this.entries;
  }

  toConfigObject(): VariantPolicyConfigObject {
    const res: VariantPolicyConfigObject = {
      dependencies: {},
      devDependencies: {},
      peerDependencies: {},
    };
    this._policiesEntries.reduce((acc, entry) => {
      const keyName = KEY_NAME_BY_LIFECYCLE_TYPE[entry.lifecycleType];
      const value = entry.value.resolveFromEnv ? entry.value : entry.value.version;
      acc[keyName][entry.dependencyId] = value;
      return acc;
    }, res);
    return res;
  }

  toLegacyDepsOverrides(): DependenciesOverridesData {
    // TODO: once we support DetailedDependencyPolicy in the object we should do here something
    // TODO: it might be that we will have to return it as is, and handle it in the legacy
    // TODO: since we don't have enough info about handle force here
    return this.toConfigObject();
  }

  static mergePolices(policies: VariantPolicy[]): VariantPolicy {
    let allEntries: VariantPolicyEntry[] = [];
    allEntries = policies.reduce((acc, curr) => {
      return acc.concat(curr.entries);
    }, allEntries);
    // We reverse it to make sure the latest policy will be stronger in case of conflict
    allEntries = allEntries.reverse();
    return new VariantPolicy(allEntries);
  }
}

function uniqEntries(entries: Array<VariantPolicyEntry>): Array<VariantPolicyEntry> {
  const uniq = R.uniqWith((entry1: VariantPolicyEntry, entry2: VariantPolicyEntry) => {
    return entry1.dependencyId === entry2.dependencyId && entry1.lifecycleType === entry2.lifecycleType;
  }, entries);
  return uniq;
}
