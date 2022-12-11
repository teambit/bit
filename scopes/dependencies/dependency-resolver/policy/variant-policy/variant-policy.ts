import { sha1 } from '@teambit/legacy/dist/utils';
import { sortBy, uniqWith } from 'lodash';
import { snapToSemver } from '@teambit/component-package-version';
import { DependenciesOverridesData } from '@teambit/legacy/dist/consumer/config/component-overrides';
import { Policy, PolicyConfigKeys, PolicyEntry, SemverVersion } from '../policy';
import { DependencyLifecycleType, KEY_NAME_BY_LIFECYCLE_TYPE } from '../../dependencies';

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

export type DependencySource = 'auto' | 'env' | 'env-own' | 'slots' | 'config';

export type VariantPolicyEntry = PolicyEntry & {
  value: VariantPolicyEntryValue;
  source?: DependencySource; // determines where the dependency was resolved from, e.g. from its env, or config
    /**
   * hide the dependency from the component's package.json / dependencies list
   */
  hidden?: boolean;
  /**
  * add to component dependencies only if it's used by the component.
  */
  usedOnly?: boolean;
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

  get names(): string[] {
    return this.entries.map((e) => e.dependencyId);
  }

  get length(): number {
    return this.entries.length;
  }

  find(depId: string, lifecycleType?: DependencyLifecycleType): VariantPolicyEntry | undefined {
    const matchedEntry = this.entries.find((entry) => {
      const idEqual = entry.dependencyId === depId;
      const lifecycleEqual = lifecycleType ? entry.lifecycleType === lifecycleType : true;
      return idEqual && lifecycleEqual;
    });
    return matchedEntry;
  }

  byLifecycleType(lifecycleType: DependencyLifecycleType): VariantPolicy {
    const filtered = this._policiesEntries.filter((entry) => entry.lifecycleType === lifecycleType);
    return new VariantPolicy(filtered);
  }

  sortByName(): VariantPolicy {
    const sorted = sortBy(this.entries, ['dependencyId']);
    return new VariantPolicy(sorted);
  }

  /**
   * Return a hash of all the peers names and their version
   * This useful when you want to compare 2 envs
   */
  hashNameVersion(): string {
    const sorted = this.sortByName();
    const toHash = sorted.entries.map(({ dependencyId, value }) => `${dependencyId}::${value.version}`).join(':::');
    return sha1(toHash);
  }

  filter(predicate: (dep: VariantPolicyEntry, index?: number) => boolean): VariantPolicy {
    const filtered = this.entries.filter(predicate);
    return new VariantPolicy(filtered);
  }

  hiddenOnly(): VariantPolicy {
    return this.filter((dep) => !!dep.hidden);
  }

  /**
   * Filter only deps which should be resolved from the env
   */
  getResolvedFromEnv() {
    return this.filter((dep) => {
      return !!dep.value.resolveFromEnv;
    });
  }

  getDepVersion(depId: string, lifecycleType?: DependencyLifecycleType): VariantPolicyEntryVersion | undefined {
    const entry = this.find(depId, lifecycleType);
    if (!entry) {
      return undefined;
    }
    return entry.value.version;
  }

  getValidSemverDepVersion(
    depId: string,
    lifecycleType?: DependencyLifecycleType
  ): VariantPolicyEntryVersion | undefined {
    const version = this.getDepVersion(depId, lifecycleType);
    if (!version) return undefined;
    return snapToSemver(version);
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

  /**
   * This used in in the legacy to apply env component policy on stuff that were auto detected
   * it will take used only entries (which means entries that component are really uses)
   * and in case of hidden deps it will mark them as removed using the "-" value to remove them from the component
   * @returns
   */
  toLegacyAutoDetectOverrides(): DependenciesOverridesData {
    const res: DependenciesOverridesData = {
      dependencies: {},
      devDependencies: {},
      peerDependencies: {},
    };
    this._policiesEntries.reduce((acc, entry) => {
      if (!entry.usedOnly) return acc;
      const keyName = KEY_NAME_BY_LIFECYCLE_TYPE[entry.lifecycleType];
      // if (entry.hidden){
      //   acc[keyName][entry.dependencyId] = '-';
      // } else {
      //   acc[keyName][entry.dependencyId] = entry.value.version;
      // }
      acc[keyName][entry.dependencyId] = entry.value.version;
      return acc;
    }, res);
    return res;
  }

  toLegacyDepsOverrides(): DependenciesOverridesData {
    const res: DependenciesOverridesData = {
      dependencies: {},
      devDependencies: {},
      peerDependencies: {},
    };
    this._policiesEntries.reduce((acc, entry) => {
      // entries that marked with used only, will be handled by the legacy deps resolver and will not be added to the overrides
      // if (entry.usedOnly || entry.hidden) return acc;
      if (entry.usedOnly) return acc;
      const keyName = KEY_NAME_BY_LIFECYCLE_TYPE[entry.lifecycleType];
      acc[keyName][entry.dependencyId] = entry.value.version;
      return acc;
    }, res);
    return res;
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
  const uniq = uniqWith(entries, (entry1: VariantPolicyEntry, entry2: VariantPolicyEntry) => {
    return entry1.dependencyId === entry2.dependencyId && entry1.lifecycleType === entry2.lifecycleType;
  });
  return uniq;
}
