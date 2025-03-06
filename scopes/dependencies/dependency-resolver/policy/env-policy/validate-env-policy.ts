import { BitError } from '@teambit/bit-error';
import type {
  EnvJsoncPolicyConfigKey,
  EnvJsoncPolicyEntry,
  EnvJsoncPolicyPeerEntry,
  EnvPolicyConfigObject,
} from './env-policy';

export function validateEnvPolicyConfigObject(configObject: EnvPolicyConfigObject) {
  if (configObject.peers) {
    validateEnvPeers(configObject.peers);
  }
  const envJsoncPolicyFields: EnvJsoncPolicyConfigKey[] = ['dev', 'runtime', 'peers'];
  envJsoncPolicyFields.forEach((key) => {
    if (!configObject[key]) {
      return;
    }
    configObject[key].forEach((policyEntry: EnvJsoncPolicyEntry) => {
      validateEnvJsoncPolicyEntry(policyEntry, key);
    });
  });
}

function validateEnvJsoncPolicyEntry(policyEntry: EnvJsoncPolicyEntry, key: string) {
  const prefix = `error: failed validating the env.jsonc file. policy.${key} entry`;
  if (typeof policyEntry !== 'object') {
    throw new BitError(`${prefix} must be an object, got type "${typeof policyEntry}" value: "${policyEntry}"`);
  }
  const mandatoryFields = ['name', 'version'];
  mandatoryFields.forEach((field) => {
    if (!policyEntry[field]) {
      throw new BitError(`${prefix} must have a "${field}" property`);
    }
  });
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
