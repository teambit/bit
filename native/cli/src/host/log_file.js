/** `ComponentLogMain.getFileLog` loads every visible historical Component through workspace.get.
 * Keep its dependency-cache and on-load effects while Rust owns the Version/Source history and report.
 * The loaded Component and its Source bodies never cross the host protocol.
 */
async function logFileLoad({ filePath, identity, versions }) {
  if (typeof filePath !== 'string' || typeof identity !== 'string' || !Array.isArray(versions) || versions.length > 4096) {
    throw new Error('invalid log-file loader request');
  }
  if (!versions.length) return true;
  const workspace = (await loadHarmony()).get('teambit.workspace/workspace');
  const componentId = await workspace.getComponentIdByPath(filePath);
  if (!componentId || componentId.toStringWithoutVersion() !== identity) {
    throw new Error('log-file component changed after history selection');
  }
  for (const version of versions) {
    if (typeof version !== 'string' || !version || version.length > 256) {
      throw new Error('invalid log-file historical version');
    }
    await workspace.get(componentId.changeVersion(version));
  }
  return true;
}
