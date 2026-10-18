/** Only registered on-add/compiler tooling; native Rust owns rename state and filesystem paths. */
async function renameTooling({ action, ids }) {
  const loaded = await loadHarmony();
  const workspace = loaded.get('teambit.workspace/workspace');
  captureBootstrapProgress(workspace);
  const previous = snapshotBootstrapProgress;
  snapshotBootstrapProgress = true;
  try {
    const componentIds = await workspace.resolveMultipleComponentIds(ids);
    if (action === 'onAdd') {
      for (const id of componentIds) await workspace.triggerOnComponentAdd(id, { compile: true });
      return {};
    }
    if (action !== 'compile') throw new Error('unknown rename tooling action');
    try {
      await loaded.get('teambit.compilation/compiler').compileOnWorkspace(componentIds);
    } catch (error) {
      const logger = loaded.get('teambit.logger/logger').createLogger('teambit.component/renaming');
      logger.consoleFailure(`failed compiling the component(s) ${componentIds.map(id => id.toString()).join(', ')}. error: ${error.message}`);
    }
    return {};
  } finally {
    snapshotBootstrapProgress = previous;
  }
}
