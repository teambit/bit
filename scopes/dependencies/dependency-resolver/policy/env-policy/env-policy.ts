import { validateEnvPolicyConfigObject } from './validate-env-policy';
import {
  createVariantPolicyEntry,
  VariantPolicyEntry,
  VariantPolicy,
  VariantPolicyConfigObject,
  VariantPolicyFromConfigObjectOptions,
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
  optional?: boolean;
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
  constructor(
    _policiesEntries: VariantPolicyEntry[],
    readonly selfPolicy: VariantPolicy
  ) {
    super(_policiesEntries);
  }

  static fromConfigObject(
    configObject: EnvPolicyConfigObject,
    { includeLegacyPeersInSelfPolicy }: VariantPolicyFromConfigObjectOptions = {}
  ): EnvPolicy {
    validateEnvPolicyConfigObject(configObject);

    /**
     * Calculate the policy for the env itself.
     * Always force it for the env itself
     */
    let selfPeersEntries: VariantPolicyEntry[];
    // @ts-ignore TODO: need to fix this, the | confusing the compiler
    if (includeLegacyPeersInSelfPolicy && !configObject.peers && configObject.peerDependencies) {
      // @ts-ignore TODO: need to fix this, the | confusing the compiler
      selfPeersEntries = handleLegacyPeers(configObject);
    } else {
      // @ts-ignore TODO: need to fix this, the | confusing the compiler
      selfPeersEntries = entriesFromKey(configObject, 'peers', 'version', 'runtime', {
        source: 'env-own',
        force: true,
      });
    }
    const selfPolicy = VariantPolicy.fromArray(selfPeersEntries);

    /**
     * Legacy policy used by the old getDependencies function on the env aspect.
     * when we used to configure dependencies, devDependencies, peerDependencies as objects of dependencyId: version
     * Those were always forced on the components as visible dependencies.
     */
    const legacyPolicy = VariantPolicy.fromConfigObject(configObject, { source: 'env', force: true, hidden: false });
    // @ts-ignore TODO: need to fix this, the | confusing the compiler
    const componentPeersEntries = entriesFromKey(configObject, 'peers', 'supportedRange', 'peer', { source: 'env' });
    const otherKeyNames: EnvJsoncPolicyConfigKey[] = ['dev', 'runtime'];
    const otherEntries: VariantPolicyEntry[] = otherKeyNames.reduce(
      (acc: VariantPolicyEntry[], keyName: EnvJsoncPolicyConfigKey) => {
        // @ts-ignore TODO: need to fix this, the | confusing the compiler
        const currEntries = entriesFromKey(configObject, keyName, 'version', keyName as DependencyLifecycleType, {
          source: 'env',
        });
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

function handleLegacyPeers(configObject: VariantPolicyConfigObject): VariantPolicyEntry[] {
  if (!configObject.peerDependencies) {
    return [];
  }
  const entries = Object.entries(configObject.peerDependencies).map(([packageName, version]) => {
    return createVariantPolicyEntry(packageName, version, 'runtime', {
      source: 'env-own',
      hidden: false,
      force: true,
    });
  });
  return entries;
}

function entriesFromKey(
  configObject: VariantPolicyConfigObject,
  keyName: EnvJsoncPolicyConfigKey,
  versionKey: VersionKeyName = 'version',
  lifecycleType: DependencyLifecycleType,
  options: VariantPolicyFromConfigObjectOptions
): VariantPolicyEntry[] {
  const configEntries: Array<EnvJsoncPolicyPeerEntry | EnvJsoncPolicyEntry> = configObject[keyName];
  if (!configEntries) {
    return [];
  }
  const entries = configEntries.map((entry) => {
    return createVariantPolicyEntry(entry.name, entry[versionKey], lifecycleType, {
      ...options,
      source: options.source ?? 'env',
      hidden: entry.hidden,
      // allow override the entry's force value (used for the env itself)
      force: options.force ?? !!entry.force,
      optional: options.optional ?? !!entry.optional,
    });
  });
  return entries;
}
