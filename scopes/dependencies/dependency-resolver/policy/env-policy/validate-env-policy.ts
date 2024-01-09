import { BitError } from '@teambit/bit-error';
import type { EnvJsoncPolicyPeerEntry, EnvPolicyConfigObject } from './env-policy';

export function validateEnvPolicyConfigObject(configObject: EnvPolicyConfigObject) {
  if (configObject.peers) {
    validateEnvPeers(configObject.peers);
  }
}

function validateEnvPeers(peers: EnvJsoncPolicyPeerEntry[]) {
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
