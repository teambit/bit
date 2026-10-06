import { EnvsAspect } from '@teambit/envs';
import { ExtensionDataList } from '@teambit/legacy.extension-data';
import type { Version } from '@teambit/objects';

/**
 * toConfigObject() drops aspect entries whose config is empty - including the env aspect
 * entry (e.g. "my-env@0.0.1": {}) that accompanies an env-set, since its only config field is
 * the internal "__specific". restoring just the versionless "teambit.envs/envs" reference is
 * not enough: env resolution during the subsequent tag anchors to the component's own aspect
 * entry (a versionless reference is never resolved by scanning the loaded envs, as another
 * component may use a different version of the same env). re-attach the version recorded in
 * the lane Version's env aspect entry, and split it back into the two .bitmap entries
 * (versionless "env" + versioned aspect entry) - the same shape "bit env set" writes.
 */
export function attachEnvVersionToLaneConfig(laneConfig: Record<string, any>, laneVersion: Version) {
  const envId: string | undefined = laneConfig[EnvsAspect.id]?.env;
  if (!envId || envId.includes('@')) return;
  const envEntry = laneVersion.extensions.findExtension(envId, true);
  const envVersion = envEntry?.extensionId?.version;
  if (!envVersion) return;
  laneConfig[EnvsAspect.id].env = `${envId}@${envVersion}`;
  ExtensionDataList.adjustEnvsOnConfigObject(laneConfig);
}
