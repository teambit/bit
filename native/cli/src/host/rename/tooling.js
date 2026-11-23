/** Only registered on-add/compiler tooling; native Rust owns rename state and filesystem paths. */
async function renameTooling({ action, ids, components, message, progress = true, defaultScoped = true }) {
  // Scope rename captures and validates the added class before this frame. Seed
  // it at the same boundary, before changing loader progress or running on-add.
  if (action === 'onAdd' && components) await identityUseCached({ components });
  const loaded = await loadHarmony();
  const workspace = loaded.get('teambit.workspace/workspace');
  if (action === 'installFailure') {
    const logger = loaded.get('teambit.logger/logger').createLogger('teambit.component/renaming');
    logger.consoleFailure(`failed installing dependencies. error: ${message}. run "bit install" to retry.`);
    return {};
  }

  captureBootstrapProgress(workspace);
  const previous = snapshotBootstrapProgress;
  snapshotBootstrapProgress = progress;
  try {
    const { ComponentID } = bitRequire('@teambit/component-id');
    const componentIds = action === 'onAdd'
      ? ids.map(id => {
          const parsed = ComponentID.fromString(id);
          return defaultScoped ? ComponentID.fromObject({ name: parsed.fullName }, parsed.scope) : parsed;
        })
      : await workspace.resolveMultipleComponentIds(ids);
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
