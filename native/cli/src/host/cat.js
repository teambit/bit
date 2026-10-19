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
    const { FsCache } = bitRequire('@teambit/workspace.modules.fs-cache');
    const { fileContentsForVersioning } = bitRequire('@teambit/legacy.bit-map');
    if (typeof SourceFile?.load !== 'function' || typeof parser !== 'function' ||
        typeof FsCache !== 'function' ||
        typeof FsCache.prototype.getDocsFromCache !== 'function' ||
        typeof FsCache.prototype.saveDocsInCache !== 'function' ||
        typeof fileContentsForVersioning !== 'function') return null;
    return { SourceFile, parser, FsCache, fileContentsForVersioning };
  } catch {
    return null;
  }
}

function catSemanticDocsSupport() {
  return catSemanticModules() !== null;
}

async function catSemanticDocs({ components, scopePath }) {
  const modules = catSemanticModules();
  if (!modules || !Array.isArray(components) || components.length !== 1 ||
      typeof scopePath !== 'string' || !path.isAbsolute(scopePath)) {
    throw new Error('published cat semantic parser unavailable');
  }
  const component = components[0];
  if (typeof component.directory !== 'string' || !Array.isArray(component.files) ||
      component.files.length > 16384) {
    throw new Error('published cat semantic source descriptor');
  }
  const directory = path.join(root, component.directory);
  const componentMap = { rootDir: component.directory };
  const files = [];
  try {
    // ConsumerComponent.getLoadedFiles loads every SourceFile before it starts any parser.
    for (const entry of component.files) {
      if (typeof entry.relativePath !== 'string') {
        throw new Error('published cat semantic source descriptor');
      }
      const filename = path.join(directory, entry.relativePath);
      const file = modules.SourceFile.load(filename, directory, root, {test:entry.test || false});
      file.contents = modules.fileContentsForVersioning(componentMap, entry.relativePath, file.contents);
      files.push(file);
    }
  } catch (error) {
    return { published: true, error: error?.message ?? String(error) };
  }
  const cache = new modules.FsCache(scopePath);
  const docs = files.map(file => file.test ? Promise.resolve([]) : modules.parser(file, cache));
  try {
    await Promise.all(docs);
    return { published: true, error: null };
  } catch (error) {
    // Published loadFromFileSystem observes Promise.all's first rejection.
    // Its remaining parser promises may still be active when the CLI exits.
    return { published: true, error: error?.message ?? String(error) };
  }
}
