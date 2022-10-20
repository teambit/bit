import { BitError } from '@teambit/bit-error';
import { EnvPolicyConfigObject } from './env-policy';

export function validateEnvPolicy(envPolicy: EnvPolicyConfigObject) {
  if (envPolicy.peers) {
    for (const peer of envPolicy.peers) {
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
}
