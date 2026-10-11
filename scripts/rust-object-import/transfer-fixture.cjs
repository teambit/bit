// Genuine editable components and empty bare destinations, confined to disposable roots.
const fs = require('node:fs/promises');
const path = require('node:path');
const zlib = require('node:zlib');
const { createRequire } = require('node:module');
let parseBitmap;
async function createTransferRemotes(cli, directory) {
  const load = createRequire(path.join(cli, 'package.json'));
  const { Scope } = load('@teambit/legacy.scope');
  parseBitmap = load('comment-json').parse;
  const paths = {};
  for (const name of ['qualification.alpha', 'qualification.beta']) {
    const target = path.join(directory, name);
    await fs.mkdir(target, { recursive: true });
    const scope = await Scope.ensure(target, name);
    await scope.ensureDir();
    paths[name] = target;
  }
  Scope.scopeCache = {};
  return paths;
}
async function writeTransferComponents(directory, extraFiles = 0, stage = 0) {
  for (const name of ['alpha', 'beta']) {
    const root = path.join(directory, name);
    await fs.mkdir(root, { recursive: true });
    await fs.writeFile(path.join(root, 'index.js'), `\ufeffexports.value = "${name}:${stage}";\r\n`);
    await fs.writeFile(path.join(root, 'binary.bin'), Buffer.from([0, 255, 13, 10, 254, stage]));
    // Identical bodies in different components exercise transfer deduplication.
    await fs.writeFile(path.join(root, 'shared.js'), 'exports.shared = true;\n');
    for (let index = 0; index < extraFiles; index++) {
      const body = `${name}:${index}:${index % 2 ? 0 : stage}\n`.padEnd(4095, String(index % 10)) + '\n';
      await fs.writeFile(path.join(root, `extra-${String(index).padStart(4, '0')}.txt`), body);
    }
  }
}
async function snapshotScope(directory, workspace = false) {
  const scopeRoot = workspace ? path.join(directory, '.bit') : directory;
  const objects = {};
  for (const shard of (await fs.readdir(path.join(scopeRoot, 'objects'))).sort()) {
    if (!/^[a-f0-9]{2}$/.test(shard)) continue;
    for (const suffix of (await fs.readdir(path.join(scopeRoot, 'objects', shard))).sort()) {
      if (!/^[a-f0-9]{38}$/.test(suffix)) continue;
      const inflated = zlib.inflateSync(await fs.readFile(path.join(scopeRoot, 'objects', shard, suffix)));
      const header = inflated.subarray(0, inflated.indexOf(0)).toString().split(' ');
      if (header[1] !== shard + suffix) throw new Error('stored object header/ref mismatch');
      objects[shard + suffix] = inflated.toString('hex');
    }
  }
  async function tree(root) {
    const result = {};
    async function walk(current, relative = '') {
      let entries;
      try {
        entries = await fs.readdir(current, { withFileTypes: true });
      } catch (error) {
        if (error.code === 'ENOENT') return;
        throw error;
      }
      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        const name = path.join(relative, entry.name);
        if (entry.isDirectory()) await walk(path.join(current, entry.name), name);
        else result[name] = (await fs.readFile(path.join(current, entry.name))).toString('hex');
      }
    }
    await walk(root);
    return result;
  }
  async function optional(filename) {
    try {
      return await fs.readFile(filename, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }
  const bitmap = workspace ? await optional(path.join(directory, '.bitmap')) : undefined;
  const files = {};
  if (bitmap) {
    for (const [id, row] of Object.entries(parseBitmap(bitmap))) {
      if (!row?.rootDir) continue;
      const target = path.resolve(directory, row.rootDir);
      if (!target.startsWith(directory + path.sep)) throw new Error('fixture component root escapes workspace');
      files[id] = await tree(target);
    }
  }
  return {
    objects,
    index: await optional(path.join(scopeRoot, 'index.json')),
    pending: await tree(path.join(scopeRoot, 'pending-objects')),
    bitmap,
    files,
    workspace: workspace ? await optional(path.join(directory, 'workspace.jsonc')) : undefined,
  };
}
module.exports = { createTransferRemotes, writeTransferComponents, snapshotScope };
