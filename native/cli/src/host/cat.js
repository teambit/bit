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

function catSemanticModules() {
  try {
    const { SourceFile } = bitRequire('@teambit/component.sources');
    const { parser } = bitRequire('@teambit/semantics.doc-parser');
    if (typeof SourceFile?.load !== 'function' || typeof parser !== 'function') return null;
    return { SourceFile, parser };
  } catch {
    return null;
  }
}

function catSemanticDocsSupport() {
  return catSemanticModules() !== null;
}

async function catSemanticDocs({ components }) {
  const modules = catSemanticModules();
  if (!modules || !Array.isArray(components) || components.length > 16384) {
    throw new Error('published cat semantic parser unavailable');
  }
  const writes = [];
  let failedAt = null;
  try {
    for (const component of components) {
      if (typeof component.directory !== 'string' || !Array.isArray(component.files)) {
        throw new Error('published cat semantic source descriptor');
      }
      const directory = path.join(root, component.directory);
      for (const entry of component.files) {
        if (entry.test) continue;
        if (typeof entry.relativePath !== 'string') {
          throw new Error('published cat semantic source path');
        }
        failedAt = path.join(directory, entry.relativePath);
        const file = modules.SourceFile.load(failedAt, directory, root);
        await modules.parser(file, {
          getDocsFromCache: () => undefined,
          saveDocsInCache: async (key, value) => { writes.push({ path: key, docs: value }); },
        });
      }
    }
    return { writes, failedAt: null, error: null };
  } catch (error) {
    return { writes, failedAt, error: error?.message ?? String(error) };
  }
}
