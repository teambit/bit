// Bounded CatCmd metadata adapter. The published class owns dependency and env projection;
// Source bodies are never returned by this handler.
function catClass() {
  try {
    const { CatCmd } = bitRequire('@teambit/component/dist/cat/cat.cmd.js');
    if (typeof CatCmd !== 'function' ||
        typeof CatCmd.prototype.getComponent !== 'function' ||
        typeof CatCmd.prototype.getConfig !== 'function') return null;
    return CatCmd;
  } catch {
    return null;
  }
}

function catSupport() {
  return catClass() !== null;
}

async function catMetadata({ id }) {
  const CatCmd = catClass();
  if (!CatCmd || typeof id !== 'string' || !id || id.length > 4096) {
    throw new Error('published CatCmd metadata adapter unavailable');
  }
  const componentMain = (await loadHarmony()).get('teambit.component/component');
  const command = new CatCmd(componentMain);
  const component = await command.getComponent(id);
  return {
    id: component.id.toStringWithoutVersion(),
    version: component.id.version,
    config: command.getConfig(component),
  };
}
