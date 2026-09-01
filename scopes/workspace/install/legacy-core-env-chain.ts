/**
 * an env that is not in the workspace is installed as a package, and one published before the core
 * envs were removed does not declare the env it is built on - back then that env was a core aspect,
 * provided by the bit installation itself, so it is a phantom require of the published package.
 *
 * such an env is invisible to the rest of the install flow: the component's own env is the custom
 * env, not the core one below it, so nothing installs the core one and the custom env fails to load
 * with its base env `null`. following the chain up from the used env is what finds it.
 */

/**
 * an env built on an env built on a core env is legitimate, so the whole chain is followed. it is
 * bounded anyway - a cyclic or corrupt chain must never hang an install - and the walk also stops
 * on the first id it has already seen.
 */
const MAX_ENV_CHAIN_DEPTH = 10;

export type EnvChainQueries = {
  /** the env the given env was tagged with. `undefined` when it cannot be determined. */
  getEnvOf: (envId: string) => Promise<string | undefined>;
  isLegacyCoreEnv: (envId: string) => boolean;
  /** an env in the workspace is built from source, and its own env is collected on its own */
  isInWorkspace: (envId: string) => boolean;
};

/**
 * walk up the env chain of `startEnvId` and return the legacy core env it ends at, without a
 * version (the pinned version is looked up from the id), or `undefined` when it ends anywhere else.
 */
export async function findLegacyCoreEnvInChain(
  startEnvId: string,
  { getEnvOf, isLegacyCoreEnv, isInWorkspace }: EnvChainQueries
): Promise<string | undefined> {
  const visited = new Set<string>();
  let currentId: string | undefined = startEnvId;
  for (let depth = 0; currentId && depth < MAX_ENV_CHAIN_DEPTH; depth += 1) {
    const idWithoutVersion = currentId.split('@')[0];
    if (visited.has(idWithoutVersion)) return undefined;
    visited.add(idWithoutVersion);
    if (isLegacyCoreEnv(idWithoutVersion)) return idWithoutVersion;
    if (isInWorkspace(currentId)) return undefined;
    // eslint-disable-next-line no-await-in-loop
    currentId = await getEnvOf(currentId);
  }
  return undefined;
}
