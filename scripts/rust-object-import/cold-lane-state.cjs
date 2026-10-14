const fs = require('node:fs/promises');
const path = require('node:path');
const { createRequire } = require('node:module');
const { capture, readTree } = require('./checkout-transition-fixture.cjs');

async function captureColdLane(cli, directory) {
  const load = createRequire(path.join(cli, 'package.json'));
  const bitmap = load('comment-json').parse(await fs.readFile(path.join(directory, '.bitmap'), 'utf8'));
  const roots = Object.values(bitmap)
    .filter((entry) => entry?.rootDir)
    .map((entry) => entry.rootDir);
  const result = await capture(directory, roots);
  result.remoteRefs = await readTree(path.join(directory, '.bit/refs/remotes'));
  result.packageJson = (await fs.readFile(path.join(directory, 'package.json'))).toString('hex');
  result.generatedPackages = await readTree(path.join(directory, 'node_modules'));
  const cacache = createRequire(load.resolve('@teambit/workspace.modules.fs-cache'))('cacache');
  const cache = path.join(directory, '.bit/cache/components/deps');
  cacache.clearMemoized();
  result.dependenciesCache = {};
  for (const key of Object.keys(await cacache.ls(cache)).sort())
    result.dependenciesCache[key] = (await cacache.get(cache, key)).data.toString();
  const readOptional = async (name) =>
    fs.readFile(path.join(directory, '.bit', name), 'utf8').catch((error) => {
      if (error.code === 'ENOENT') return '';
      throw error;
    });
  result.commandHistory = (await readOptional('command-history')).replace(/^\S+ \d+ /gm, '');
  result.bitmapHistoryReasons = (await readOptional('bitmap-history-metadata.txt')).replace(/^\S+ /gm, '');
  result.bitmapHistory = [
    ...new Set(
      Object.values(await readTree(path.join(directory, '.bit/bitmap-history'))).map((value) => JSON.stringify(value))
    ),
  ].sort();
  return result;
}
module.exports = { captureColdLane };
