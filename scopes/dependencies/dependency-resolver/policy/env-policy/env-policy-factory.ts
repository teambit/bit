import { pick } from 'lodash';
import { EnvPolicy } from './env-policy';
import { VariantPolicyFactory } from '..';
import { PeersAutoDetectPolicy } from './peers-auto-detect-policy';

export class EnvPolicyFactory {
  fromConfigObject(configObject): EnvPolicy {
    const variantConfigObject = pick(configObject, ['dependencies', 'devDependencies', 'peerDependencies']);
    const variantPolicyFactory = new VariantPolicyFactory();
    const variantPolicy = variantPolicyFactory.fromConfigObject(variantConfigObject, 'env');
    const peersAutoDetectEntries = configObject.peers;
    const peersAutoDetectPolicy = new PeersAutoDetectPolicy(peersAutoDetectEntries);
    return new EnvPolicy(variantPolicy, peersAutoDetectPolicy);
  }

  getEmpty(): EnvPolicy {
    const variantPolicyFactory = new VariantPolicyFactory();
    return new EnvPolicy(variantPolicyFactory.getEmpty(), new PeersAutoDetectPolicy([]));
  }
}
