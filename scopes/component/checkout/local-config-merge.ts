import { ComponentID } from '@teambit/component-id';
import { Extensions } from '@teambit/legacy.constants';

/**
 * helpers for merging the local config of a component (the "config" prop of its .bitmap entry, e.g. from
 * "bit env set" or "bit deps set") with the config of the version that gets checked out.
 */

/**
 * whether the aspect is set in the local config. versions are ignored.
 */
export function isAspectInLocalConfig(aspectId: string, localConfig: Record<string, any>): boolean {
  const target = ComponentID.getStringWithoutVersion(aspectId);
  return Object.keys(localConfig).some((key) => ComponentID.getStringWithoutVersion(key) === target);
}

/**
 * the keys to remove from the local config, so the conflicted aspects get their config from the checked out version.
 * an env is saved in two keys: "teambit.envs/envs" ({ env: <env-id> }) and the env-id itself (with or without a
 * version). a conflict of "teambit.envs/envs" removes both.
 */
export function getLocalConfigKeysToRemove(localConfig: Record<string, any>, conflictedAspectIds: string[]): string[] {
  const envId = localConfig[Extensions.envs]?.env;
  const idsToRemove = conflictedAspectIds.flatMap((aspectId) => {
    const ids = [ComponentID.getStringWithoutVersion(aspectId)];
    if (aspectId === Extensions.envs && typeof envId === 'string') ids.push(ComponentID.getStringWithoutVersion(envId));
    return ids;
  });
  return Object.keys(localConfig).filter((key) => idsToRemove.includes(ComponentID.getStringWithoutVersion(key)));
}
