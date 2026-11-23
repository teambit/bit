const { createRequire } = require('node:module');
const { Readable } = require('node:stream');
const path = require('node:path');
const assert = require('node:assert/strict');
const bitRequire = createRequire(path.join(process.argv[1], 'package.json'));
const { ObjectFetcher } = bitRequire('@teambit/legacy.scope/dist/objects-fetcher/objects-fetcher.js');
const scope = process.argv[2];
const cause = 'fatal: zlib.inflate has failed with an error: "incorrect header check"\ntry running bit import --all-history to fix the corrupted objects';

async function observe(ended) {
  const object = {
    ref: { toString: () => '0123456789abcdef0123456789abcdef01234567' },
    buffer: Buffer.from('invalid compressed phase-two Source'),
  };
  let sent = false;
  const stream = new Readable({ objectMode: true, read() {
    if (sent) return;
    sent = true;
    this.push(object);
    if (ended) this.push(null);
  } });
  const events = [];
  stream.on('end', () => events.push('end'));
  stream.on('error', error => {
    assert.strictEqual(error.message, cause);
    events.push('error');
  });
  let failure;
  try {
    // Parsing fails in the actual ObjectsWritable before repository persistence.
    await ObjectFetcher.prototype.writeFromSingleRemote.call({ repo: {} }, stream, scope, {}, {});
  } catch (error) {
    events.push('caught');
    failure = error.message;
  }
  assert.strictEqual(failure, ended ? cause : `remote ${scope} responded with the following error:\n${cause}`);
  assert.deepStrictEqual(events, ended ? ['end', 'caught'] : ['error', 'caught']);
  return failure;
}

(async () => {
  const variants = [await observe(true), await observe(false)];
  assert.notStrictEqual(variants[0], variants[1]);
  // ObjectsWritable retains a failure timer; it must not keep this conformance process alive.
  process.stdout.write(JSON.stringify(variants), () => process.exit(0));
})().catch(error => {
  process.stderr.write(`${error.stack}\n`, () => process.exit(1));
});
