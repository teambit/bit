import { validateEnvPolicyConfigObject } from './validate-env-policy';
import {
  createVariantPolicyEntry,
  DependencySource,
  VariantPolicyEntry,
  VariantPolicy,
  VariantPolicyConfigObject,
} from '../variant-policy';
import { DependencyLifecycleType } from '../../dependencies';

type EnvJsoncPolicyEntry = {
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

export type EnvJsoncPolicyPeerEntry = EnvJsoncPolicyEntry & {
  supportedRange: string;
};

export type VersionKeyName = 'version' | 'supportedRange';

export type EnvJsoncPolicyConfigKey = 'peers' | 'dev' | 'runtime';

export type EnvPolicyEnvJsoncConfigObject = {
  peers?: EnvJsoncPolicyPeerEntry[];
  dev?: EnvJsoncPolicyEntry[];
  runtime?: EnvJsoncPolicyEntry[];
};

/**
 * Config that is used before the new env.jsonc format was introduced.
 */
export type EnvPolicyLegacyConfigObject = Pick<EnvPolicyEnvJsoncConfigObject, 'peers'> & VariantPolicyConfigObject;

export type EnvPolicyConfigObject = EnvPolicyEnvJsoncConfigObject | EnvPolicyLegacyConfigObject;

export class EnvPolicy extends VariantPolicy {
  constructor(_policiesEntries: VariantPolicyEntry[], readonly selfPolicy: VariantPolicy) {
    super(_policiesEntries);
  }

  static fromConfigObject(configObject): EnvPolicy {
    validateEnvPolicyConfigObject(configObject);

    /**
     * Calculate the policy for the env itself.
     */
    const selfPeersEntries = entriesFromKey(configObject, 'peers', 'version', 'peer', 'env-own');

    const selfPolicy = VariantPolicy.fromArray(selfPeersEntries);

    /**
     * Legacy policy used by the old getDependencies function on the env aspect.
     * when we used to configure dependencies, devDependencies, peerDependencies as objects of dependencyId: version
     * Those were always forced on the components as visible dependencies.
     */
    const legacyPolicy = VariantPolicy.fromConfigObject(configObject, 'env', false, false);
    const componentPeersEntries = entriesFromKey(configObject, 'peers', 'supportedRange', 'peer', 'env');
    const otherKeyNames: EnvJsoncPolicyConfigKey[] = ['dev', 'runtime'];
    const otherEntries: VariantPolicyEntry[] = otherKeyNames.reduce(
      (acc: VariantPolicyEntry[], keyName: EnvJsoncPolicyConfigKey) => {
        const currEntries = entriesFromKey(configObject, keyName, 'version', keyName as DependencyLifecycleType, 'env');
        return acc.concat(currEntries);
      },
      []
    );
    const newPolicy = VariantPolicy.fromArray(componentPeersEntries.concat(otherEntries));
    const finalComponentPolicy = VariantPolicy.mergePolices([legacyPolicy, newPolicy]);
    return new EnvPolicy(finalComponentPolicy.entries, selfPolicy);
  }

  static getEmpty(): EnvPolicy {
    return new EnvPolicy([], VariantPolicy.getEmpty());
  }
}

function entriesFromKey(
  configObject: VariantPolicyConfigObject,
  keyName: EnvJsoncPolicyConfigKey,
  versionKey: VersionKeyName = 'version',
  lifecycleType: DependencyLifecycleType,
  source: DependencySource = 'env'
): VariantPolicyEntry[] {
  const configEntries: Array<EnvJsoncPolicyPeerEntry | EnvJsoncPolicyEntry> = configObject[keyName];
  if (!configEntries) {
    return [];
  }
  const entries = configEntries.map((entry) => {
    return createVariantPolicyEntry(entry.name, entry[versionKey], lifecycleType, source, entry.hidden, !entry.force);
  });
  return entries;
}
