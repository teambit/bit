import { BitError } from '@teambit/bit-error';
import type { EnvAutoDetectPeersPolicyConfigEntryValue, EnvPolicyEnvJsoncConfigObject, EnvPolicyLegacyConfigObject } from './env-policy';

export function validateEnvPolicyLegacyConfigObject(configObject: EnvPolicyLegacyConfigObject) {
  if (configObject.peers) {
    validateEnvPeers(configObject.peers);
  }
}

export function validateEnvPolicyJsoncConfigObject(configObject: EnvPolicyEnvJsoncConfigObject) {
  if (configObject.env.peers) {
    validateEnvPeers(configObject.env.peers);
  }

}

function validateEnvPeers(peers: EnvAutoDetectPeersPolicyConfigEntryValue[]){
  for (const peer of peers) {
    if (peer.supportedRange === '') {
      throw new BitError(`Peer "${peer.name}" has an empty supportedRange`);
    }
    if (peer.supportedRange == null) {
      throw new BitError(`Peer "${peer.name}" has no supportedRange set`);
    }
    if (peer.version === '') {
      throw new BitError(`Peer "${peer.name}" has an empty version`);
    }
    if (peer.version == null) {
      throw new BitError(`Peer "${peer.name}" has no version set`);
    }
  }
}
