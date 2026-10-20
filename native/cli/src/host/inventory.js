
/** Published `getRemoteByName` resolution only; Rust owns all inventory reads. */
async function inventoryResolve({ scope, workspace, bareScopeRoot }) {
  try {
    const { getRemoteByName, getScopeRemotes } = bitRequire('@teambit/scope.remotes');
    if (bareScopeRoot) {
      const { loadScope } = bitRequire('@teambit/legacy.scope');
      const bare = await loadScope(bareScopeRoot);
      const remote = await (await getScopeRemotes(bare)).resolve(scope);
      return { host: remote.host };
    }
    const consumer = workspace ? (await loadHarmony()).get('teambit.workspace/workspace').consumer : undefined;
    const remote = await getRemoteByName(scope, consumer);
    return { host: remote.host };
  } catch (error) {
    const { BitError } = bitRequire('@teambit/bit-error');
    return {
      error: {
        name: error?.name ?? 'Error',
        message: error instanceof BitError ? error.report() : (error?.message ?? String(error)),
        stack: error?.stack ?? String(error),
      },
    };
  }
}
