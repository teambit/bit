// Remove hidden lane entries through the released scope API for export fixtures.
const path = require('path');
const [nodeCli, scopePath, laneId] = process.argv.slice(2);
const modules = path.dirname(path.dirname(path.dirname(path.dirname(nodeCli))));
const { loadScope } = require(path.join(modules, '@teambit/legacy.scope'));
const { LaneId } = require(path.join(modules, '@teambit/lane-id'));
(async () => {
  const scope = await loadScope(scopePath, false);
  if (!await scope.lanes.removeUpdateDependents(LaneId.parse(laneId))) {
    throw new Error('fixture did not remove hidden lane entries');
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
