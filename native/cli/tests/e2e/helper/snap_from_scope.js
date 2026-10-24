// Seed a hidden lane update-dependent with the installed Node.js Bit CLI.
// argv: <node-cli> <bare-seed-scope> <component-id> <lane-id>
const path = require('path');

const [nodeCli, scopePath, componentId, laneId] = process.argv.slice(2);
const modules = path.dirname(path.dirname(path.dirname(path.dirname(nodeCli))));
const { loadBit } = require(path.join(modules, '@teambit/bit'));
const { SnappingAspect } = require(path.join(modules, '@teambit/snapping'));

(async () => {
  const harmony = await loadBit(scopePath);
  const snapping = harmony.get(SnappingAspect.id);
  await snapping.snapFromScope([{ componentId, message: 'seed hidden update-dependent' }], {
    lane: laneId,
    updateDependents: true,
    push: true,
    build: false,
    disableTagAndSnapPipelines: true,
  });
  if (process.platform === 'win32') {
    const { publishObjects } = require('./publish_objects');
    const scope = await require(path.join(modules, '@teambit/legacy.scope')).loadScope(scopePath);
    const remotePath = new URL(scope.scopeJson.remotes[laneId.split('/')[0]]);
    await publishObjects(nodeCli, scopePath, require('node:url').fileURLToPath(remotePath), laneId);
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
