// Fixture-only bypass of the pinned Windows pending-object glob bug. The released
// server's saveObjects still owns all mutable model/lane merging and index publication.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

async function publishObjects(nodeCli, sourcePath, remotePath, laneId, componentIds) {
  const req = createRequire(nodeCli);
  const { loadScope } = req('@teambit/legacy.scope');
  const { BitObject, ObjectList, Ref } = req('@teambit/objects');
  const { saveObjects } = req('@teambit/export');
  if (laneId === undefined) throw new Error('fixture publication requires an explicit lane or null');
  if (typeof laneId === 'string') {
    if (laneId === 'null' || laneId.startsWith('{')) laneId = JSON.parse(laneId);
    else {
      const slash = laneId.indexOf('/');
      if (slash < 1) throw new Error('fixture lane must include its scope');
      laneId = { scope: laneId.slice(0, slash), name: laneId.slice(slash + 1) };
    }
  }
  const index = JSON.parse(fs.readFileSync(path.join(sourcePath, 'index.json'), 'utf8'));
  const laneHash = laneId && index.lanes.find(row => row.id.scope === laneId.scope && row.id.name === laneId.name)?.hash;
  if (laneId && !laneHash) throw new Error('fixture current Lane missing from local index');
  const requested = componentIds ? JSON.parse(componentIds) : [];
  const selected = requested.length ? new Set(requested) : undefined;
  const objects = [];
  const directory = path.join(sourcePath, 'objects');
  for (const prefix of fs.readdirSync(directory)) {
    if (!/^[0-9a-f]{2}$/.test(prefix)) continue;
    for (const suffix of fs.readdirSync(path.join(directory, prefix))) {
      if (!/^[0-9a-f]{38}$/.test(suffix)) continue;
      const buffer = fs.readFileSync(path.join(directory, prefix, suffix));
      const object = await BitObject.parseObject(buffer);
      const type = object.getType();
      if (selected && (type === 'Component' || type === 'Symlink') &&
          !selected.has(`${object.scope}/${object.name}`)) continue;
      if (type === 'VersionHistory' || type === 'ScopeMeta') continue;
      if (type === 'Lane' && prefix + suffix !== laneHash) continue;
      if (type === 'LaneHistory' && object.laneHash !== laneHash) continue;
      objects.push({ ref: new Ref(prefix + suffix), buffer });
    }
  }
  const remote = await loadScope(remotePath, false);
  await saveObjects(remote, new ObjectList(objects));
}

module.exports = { publishObjects };
if (require.main === module) {
  publishObjects(...process.argv.slice(2)).catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
