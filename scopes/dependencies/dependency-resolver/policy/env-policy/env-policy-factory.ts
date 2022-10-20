import { pick } from 'lodash';
import { EnvPolicy, EnvPolicyConfigObject } from './env-policy';
import { VariantPolicyFactory } from '..';
import { PeersAutoDetectPolicy } from './peers-auto-detect-policy';
import { validateEnvPolicy } from './validate-env-policy';

export class EnvPolicyFactory {
  fromConfigObject(configObject: EnvPolicyConfigObject): EnvPolicy {
    validateEnvPolicy(configObject);
    const variantConfigObject = pick(configObject, ['dependencies', 'devDependencies', 'peerDependencies']);
    const variantPolicyFactory = new VariantPolicyFactory();
    const variantPolicy = variantPolicyFactory.fromConfigObject(variantConfigObject, 'env');
    const peersAutoDetectEntries = configObject.peers ?? [];
    const peersAutoDetectPolicy = new PeersAutoDetectPolicy(peersAutoDetectEntries);
    return new EnvPolicy(variantPolicy, peersAutoDetectPolicy);
  }

  getEmpty(): EnvPolicy {
    const variantPolicyFactory = new VariantPolicyFactory();
    return new EnvPolicy(variantPolicyFactory.getEmpty(), new PeersAutoDetectPolicy([]));
  }
}
