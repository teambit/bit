import R from 'ramda';
import { DependenciesOverridesData } from 'bit-bin/dist/consumer/config/component-overrides';
import { Policy, PolicyConfigKeys, PolicyEntry, SemverVersion } from '../policy';
import { KEY_NAME_BY_LIFECYCLE_TYPE, LIFECYCLE_TYPE_BY_KEY_NAME, DependencyLifecycleType } from '../../dependencies';

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
};

export type VariantPolicyEntry = PolicyEntry & {
  value: VariantPolicyEntryValue;
};

export class VariantPolicy implements Policy<VariantPolicyConfigObject> {
  constructor(private _policiesEntries: VariantPolicyEntry[]) {
    this._policiesEntries = uniqEntries(_policiesEntries);
  }

  get entries() {
    return this._policiesEntries;
  }

  toConfigObject(): VariantPolicyConfigObject {
    const res: VariantPolicyConfigObject = {
      dependencies: {},
      devDependencies: {},
      peerDependencies: {},
    };
    this._policiesEntries.reduce((acc, entry) => {
      const keyName = KEY_NAME_BY_LIFECYCLE_TYPE[entry.lifecycleType];
      acc[keyName][entry.dependencyId] = entry.value.version;
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
  const uniq = R.uniqBy(R.prop('dependencyId'), entries);
  return uniq;
}
