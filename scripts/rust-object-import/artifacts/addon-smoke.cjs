// Separate process keeps Windows addon mappings out of the installer's cleanup lifecycle.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
function frame(magic, id, input) {
  const body = Buffer.from(JSON.stringify(input)),
    header = Buffer.alloc(12);
  header.write(magic);
  header.writeUInt32BE(id, 4);
  header.writeUInt32BE(body.length, 8);
  return Buffer.concat([header, body]);
}
(async () => {
  const [addon, executable, directory] = process.argv.slice(2);
  const { WorkspaceEngine, ImportStreamEngine, install } = require(addon);
  assert.equal(typeof install, 'function', 'workspace addon has no install export');
  const filename = path.join(directory, 'addon-source.txt');
  fs.writeFileSync(filename, '\ufeffstandalone addon\r\n');
  const inputs = [1, 2].map((id) => frame('BWS1', id, { kind: 'read', files: [filename], binary: true, retain: true }));
  const expected = execFileSync(executable, [], { input: Buffer.concat(inputs), timeout: 30000 });
  const engine = new WorkspaceEngine(2);
  try {
    assert.deepEqual(Buffer.concat([await engine.request(inputs[0]), await engine.request(inputs[1])]), expected);
  } finally {
    engine.close();
  }
  assert.throws(() => engine.request(inputs[0]), /closed/);
  const objects = WorkspaceEngine.forObjects(2, directory);
  try {
    assert.deepEqual(
      JSON.parse(await objects.request(frame('BOP1', 3, [{ kind: 'version', existing: '9', incoming: '10' }]))),
      { version: 1, id: 3, results: [true] }
    );
  } finally {
    objects.close();
  }
  const received = [];
  await new Promise((resolve, reject) => {
    const stream = new ImportStreamEngine((event) => {
      if (event.kind === 'output') received.push(event.data);
      if (event.kind === 'closed') event.error ? reject(Error(event.error)) : resolve();
    }, 2, directory);
    stream.write(frame('BOP1', 4, [{kind:'version',existing:'9',incoming:'10'}]));
    stream.end();
  });
  assert.deepEqual(JSON.parse(Buffer.concat(received)), {version:1,id:4,results:[true]});

})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
