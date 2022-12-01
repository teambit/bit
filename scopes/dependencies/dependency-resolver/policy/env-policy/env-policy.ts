import { pick } from 'lodash';
import { PeersAutoDetectPolicy, PeersAutoDetectPolicyEntry } from './peers-auto-detect-policy';
import { VariantPolicy, VariantPolicyConfigObject, VariantPolicyFactory } from '..';
import { validateEnvPolicyLegacyConfigObject, validateEnvPolicyJsoncConfigObject } from './validate-env-policy';
import { SemverVersion } from '../policy';

export type EnvAutoDetectPeersPolicyConfigEntryValue = PeersAutoDetectPolicyEntry;

export type EnvAutoDetectPeersPolicy = {
  peers?: EnvAutoDetectPeersPolicyConfigEntryValue[];
};

export type EnvHiddenDevPolicy = {
  dev?: {[dependencyId: string]: SemverVersion};
};

/**
 * Config that is used before the new env.jsonc format was introduced.
 */
export type EnvPolicyLegacyConfigObject = EnvAutoDetectPeersPolicy & VariantPolicyConfigObject;


export type EnvPolicyEnvJsoncConfigObject = {
  env: EnvAutoDetectPeersPolicy & EnvHiddenDevPolicy;
  components: VariantPolicyConfigObject
};
export type EnvPolicyConfigObject = EnvPolicyEnvJsoncConfigObject | EnvPolicyLegacyConfigObject;

export class EnvPolicy {
  constructor(readonly variantPolicy: VariantPolicy, readonly peersAutoDetectPolicy: PeersAutoDetectPolicy) {}

  static fromConfigObject(configObject: EnvPolicyConfigObject): EnvPolicy {
    if (!configObject) return this.getEmpty();
    if ('env' in configObject || 'components' in configObject) {
      return this.fromEnvJsoncConfigObject(configObject as EnvPolicyEnvJsoncConfigObject);
    }
    return this.fromLegacyConfigObject(configObject as EnvPolicyLegacyConfigObject);
  }

  static fromEnvJsoncConfigObject(configObject: EnvPolicyEnvJsoncConfigObject): EnvPolicy {
    validateEnvPolicyJsoncConfigObject(configObject);
    const {env, components: componentsPolicy} = configObject;
    const variantConfigObject = pick(componentsPolicy, ['dependencies', 'devDependencies', 'peerDependencies']);
    const variantPolicyFactory = new VariantPolicyFactory();
    /**
     * Set the used only, so only if component is using that dependency, it will affect it.
     */
    const componentsVariantsPolicy = variantPolicyFactory.fromConfigObject(variantConfigObject, 'env', undefined, true);
    const componentHiddenDevDeps = env.dev ? variantPolicyFactory.fromConfigObject({devDependencies:env.dev}, 'env', true, false) : variantPolicyFactory.getEmpty();
    const variantPolicy = VariantPolicy.mergePolices([componentHiddenDevDeps, componentsVariantsPolicy]);
    const peersAutoDetectEntries = env.peers ?? [];
    const peersAutoDetectPolicy = new PeersAutoDetectPolicy(peersAutoDetectEntries);
    return new EnvPolicy(variantPolicy, peersAutoDetectPolicy);
  }

  static fromLegacyConfigObject(configObject: EnvPolicyLegacyConfigObject): EnvPolicy {
    validateEnvPolicyLegacyConfigObject(configObject);
    const variantConfigObject = pick(configObject, ['dependencies', 'devDependencies', 'peerDependencies']);
    const variantPolicyFactory = new VariantPolicyFactory();
    const variantPolicy = variantPolicyFactory.fromConfigObject(variantConfigObject, 'env');
    const peersAutoDetectEntries = configObject.peers ?? [];
    const peersAutoDetectPolicy = new PeersAutoDetectPolicy(peersAutoDetectEntries);
    return new EnvPolicy(variantPolicy, peersAutoDetectPolicy);
  }

  static getEmpty(): EnvPolicy {
    const variantPolicyFactory = new VariantPolicyFactory();
    return new EnvPolicy(variantPolicyFactory.getEmpty(), new PeersAutoDetectPolicy([]));
  }
}
