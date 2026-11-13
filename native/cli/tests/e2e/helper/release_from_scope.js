// Release fixture components through the installed Bit API.
const { createRequire } = require('node:module');
const [nodeCli, scopePath, remotePath, scopeName, ...names] = process.argv.slice(2);
const req = createRequire(nodeCli);
(async () => {
  const { loadBit } = req('@teambit/bit');
  const { SnappingAspect } = req('@teambit/snapping');
  const { ComponentIdList } = req('@teambit/component-id');
  const harmony = await loadBit(scopePath);
  await harmony.get(SnappingAspect.id).snapFromScope(
    names.map(name => ({ componentId: `${scopeName}/${name}`, message: 'release' })),
    { tag: true, push: true, loadAspectOnlyForIds: new ComponentIdList(), build: false, disableTagAndSnapPipelines: true }
  );
  if (process.platform === 'win32') {
    await require('./publish_objects').publishObjects(nodeCli, scopePath, remotePath, null);
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
