import { PeersAutoDetectPolicy, PeersAutoDetectPolicyEntry } from './peers-auto-detect-policy';
import { VariantPolicy, VariantPolicyConfigObject } from '..';

export type EnvAutoDetectPeersPolicyConfigEntryValue = PeersAutoDetectPolicyEntry;

export type EnvAutoDetectPeersPolicy = {
  peers?: EnvAutoDetectPeersPolicyConfigEntryValue[];
};
export type EnvPolicyConfigObject = EnvAutoDetectPeersPolicy & VariantPolicyConfigObject;

export class EnvPolicy {
  constructor(readonly variantPolicy: VariantPolicy, readonly peersAutoDetectPolicy: PeersAutoDetectPolicy) {}
}
