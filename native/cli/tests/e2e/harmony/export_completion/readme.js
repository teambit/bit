// Retain a lane readme with the same published Lane and LaneHistory writers as add-readme.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
(async () => {
  const [cli, workspace, scopePath, missing] = process.argv.slice(2);
  const req = createRequire(cli);
  const { loadScope } = req('@teambit/legacy.scope');
  const { LaneId } = req('@teambit/lane-id');
  const { ComponentID } = req('@teambit/component-id');
  const bitmap = req('comment-json').parse(fs.readFileSync(path.join(workspace, '.bitmap'), 'utf8'));
  const scope = await loadScope(scopePath, false);
  const lane = await scope.loadLane(LaneId.from(bitmap._bit_lane.id.name, bitmap._bit_lane.id.scope));
  lane.setReadmeComponent(missing === 'true' ? ComponentID.fromString(`${lane.scope}/missing`) : lane.components[0].id);
  await scope.lanes.saveLane(lane, { laneHistoryMsg: 'add readme' });
})().catch(error => { console.error(error); process.exitCode = 1; });
