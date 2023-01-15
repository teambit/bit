import { sha1 } from '@teambit/legacy/dist/utils';
import { compact, sortBy, uniqWith } from 'lodash';
import { snapToSemver } from '@teambit/component-package-version';
import { DependenciesOverridesData } from '@teambit/legacy/dist/consumer/config/component-overrides';
import { Policy, PolicyConfigKeys, PolicyConfigKeysNames, PolicyEntry, SemverVersion } from '../policy';
import { DependencyLifecycleType, KEY_NAME_BY_LIFECYCLE_TYPE, LIFECYCLE_TYPE_BY_KEY_NAME } from '../../dependencies';

export type VariantPolicyConfigObject = Partial<Record<keyof PolicyConfigKeys, VariantPolicyLifecycleConfigObject>>;

type VariantPolicyLifecycleConfigObject = {
  [dependencyId: string]: VariantPolicyConfigEntryValue;
};

type VariantPolicyLifecycleConfigEntryObject = {
  name: string;
  version: string;
  /**
   * hide the dependency from the component's package.json / dependencies list
   */
  hidden?: boolean;
  /**
   * force add to component dependencies even if it's not used by the component.
   */
  force?: boolean;
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
   * force add to component dependencies even if it's not used by the component.
   */
  force?: boolean;
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
   * Create a manifest object in the form of a package.json entries
   * a.k.a { [depId]: version }
   * @returns
   */
  toVersionManifest(): { [name: string]: string } {
    return this.entries.reduce((acc, entry) => {
      acc[entry.dependencyId] = entry.value.version;
      return acc;
    }, {});
  }

  toNameVersionTuple(): [string, string][] {
    return this.entries.map((entry) => {
      return [entry.dependencyId, entry.value.version];
    });
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
      if (entry.force) return acc;
      const keyName = KEY_NAME_BY_LIFECYCLE_TYPE[entry.lifecycleType];
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
    const used: string[] = [];
    this._policiesEntries.reduce((acc, entry) => {
      // entries that not marked with force, will be handled by the legacy deps resolver and will not be added to the overrides
      if (!entry.force) return acc;
      const keyName = KEY_NAME_BY_LIFECYCLE_TYPE[entry.lifecycleType];
      // We don't want the same entry to appear many times in different lifecycle types
      // this is important for example when a peer is configured by an env (on itself) which will make it a runtime dep of the env
      // but the env of the env is configure the same dep as peer in general (like with react)
      if (!used.includes(entry.dependencyId) || entry.value.version === '-') {
        acc[keyName][entry.dependencyId] = entry.value.version;
        if (entry.value.version !== '-') {
          used.push(entry.dependencyId);
        }
      }
      return acc;
    }, res);
    return res;
  }

  static fromConfigObject(configObject, source?: DependencySource, hidden?: boolean, force?: boolean): VariantPolicy {
    const runtimeEntries = entriesFromKey(configObject, 'dependencies', source, hidden, force);
    const devEntries = entriesFromKey(configObject, 'devDependencies', source, hidden, force);
    const peerEntries = entriesFromKey(configObject, 'peerDependencies', source, hidden, force);
    const entries = runtimeEntries.concat(devEntries).concat(peerEntries);
    return new VariantPolicy(entries);
  }

  static fromArray(entries: VariantPolicyEntry[]): VariantPolicy {
    return new VariantPolicy(entries);
  }

  static parse(serializedEntries: SerializedVariantPolicy): VariantPolicy {
    return new VariantPolicy(serializedEntries);
  }

  static getEmpty(): VariantPolicy {
    return new VariantPolicy([]);
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

function entriesFromKey(
  configObject: VariantPolicyConfigObject,
  keyName: PolicyConfigKeysNames,
  source?: DependencySource,
  hidden?: boolean,
  force?: boolean
): VariantPolicyEntry[] {
  const obj = configObject[keyName];
  if (!obj) {
    return [];
  }
  const lifecycleType = LIFECYCLE_TYPE_BY_KEY_NAME[keyName];
  if (Array.isArray(obj)) {
    return entriesFromArrayKey(obj, lifecycleType, source, hidden, force);
  }
  return entriesFromObjectKey(obj, lifecycleType, source, hidden, force);
}

function entriesFromObjectKey(
  obj: Record<string, VariantPolicyConfigEntryValue> | undefined,
  lifecycleType: DependencyLifecycleType,
  source?: DependencySource,
  hidden?: boolean,
  force = true
): VariantPolicyEntry[] {
  if (!obj) {
    return [];
  }
  const entries = Object.entries(obj).map(([depId, value]: [string, VariantPolicyConfigEntryValue]) => {
    if (value) {
      return createVariantPolicyEntry(depId, value, lifecycleType, source, hidden, force);
    }
    return undefined;
  });
  return compact(entries);
}

function entriesFromArrayKey(
  configEntries: Array<VariantPolicyLifecycleConfigEntryObject> | undefined,
  lifecycleType: DependencyLifecycleType,
  source: DependencySource = 'config',
  hidden?: boolean,
  force?: boolean
): VariantPolicyEntry[] {
  if (!configEntries) {
    return [];
  }
  const entries = configEntries.map((entry) => {
    return createVariantPolicyEntry(
      entry.name,
      entry.version,
      lifecycleType,
      source,
      hidden ?? !!entry.hidden,
      // allow override the entry's force value (used for the env itself)
      force ?? !!entry.force
    );
  });
  return entries;
}

export function createVariantPolicyEntry(
  depId: string,
  value: VariantPolicyConfigEntryValue,
  lifecycleType: DependencyLifecycleType,
  source?: DependencySource,
  hidden?: boolean,
  force?: boolean
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
    hidden,
    force,
  };
  return entry;
}
