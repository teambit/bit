/** Actual producer aspect configuration only; native code owns what rename copies and publishes. */
async function renameSourceConfig({ component: row }) {
  const loaded = await loadHarmony();
  const workspace = loaded.get('teambit.workspace/workspace');
  let component = statusComponents.find(component => component.id.toStringWithoutVersion() === row.identity);
  if (!component) {
    component = await hydrateStatusComponent(row);
    await statusApplyLoadCallbacks(component, {
      workspace,
      envs: loaded.get('teambit.envs/envs'),
      resolver: loaded.get('teambit.dependencies/dependency-resolver'),
    });
  }
  // WorkspaceComponentLoader always upserts the registrar into AspectList, even
  // for undefined onLoad data. The shared status adapter omits those empty entries.
  for (const [id] of workspace.onComponentLoadSlot.toArray()) {
    if (!component.state.aspects.get(id)) {
      component.state.aspects.upsertEntry(await workspace.resolveComponentId(id));
    }
  }
  return component.state.aspects.entries.map(entry => ({ id: entry.id.toString(), config: entry.config }));
}
