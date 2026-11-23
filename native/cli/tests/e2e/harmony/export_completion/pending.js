// Stage a real canonical server pending directory, without completing client publication.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
(async () => {
  const [cli, sourcePath, remotePath, clientId] = process.argv.slice(2);
  const req = createRequire(cli);
  const { BitObject, ObjectList, Ref } = req('@teambit/objects');
  const { loadScope } = req('@teambit/legacy.scope');
  const bitmap = req('comment-json').parse(fs.readFileSync(path.join(sourcePath, '..', '.bitmap'), 'utf8'));
  const index = JSON.parse(fs.readFileSync(path.join(sourcePath, 'index.json'), 'utf8'));
  const lane = bitmap._bit_lane?.id;
  const laneHash = lane && index.lanes.find(row => row.id.scope === lane.scope && row.id.name === lane.name)?.hash;
  const objects = [];
  for (const prefix of fs.readdirSync(path.join(sourcePath, 'objects'))) {
    if (!/^[0-9a-f]{2}$/.test(prefix)) continue;
    for (const suffix of fs.readdirSync(path.join(sourcePath, 'objects', prefix))) {
      if (!/^[0-9a-f]{38}$/.test(suffix)) continue;
      const buffer = fs.readFileSync(path.join(sourcePath, 'objects', prefix, suffix));
      const object = await BitObject.parseObject(buffer);
      const type = object.getType();
      if (lane && type === 'Version' && !index.lanes.length) throw new Error('missing fixture lane');
      if (lane && type === 'Version') {
        const lanePath = path.join(sourcePath, 'objects', laneHash.slice(0, 2), laneHash.slice(2));
        const laneObject = await BitObject.parseObject(fs.readFileSync(lanePath));
        if (!laneObject.components.some(component => component.head.toString() === prefix + suffix)) continue;
      }
      if (type === 'VersionHistory' || type === 'ScopeMeta') continue;
      if (type === 'Lane' && prefix + suffix !== laneHash) continue;
      if (type === 'LaneHistory' && object.laneHash !== laneHash) continue;
      objects.push({ ref: new Ref(prefix + suffix), buffer });
    }
  }
  const remote = await loadScope(remotePath, false);
  await remote.writeObjectsToPendingDir(new ObjectList(objects), clientId);
})().catch(error => { console.error(error); process.exitCode = 1; });
