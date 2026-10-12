const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');

// Genuine model classes supplied by the caller's coherent namespace. This is a
// bounded adapter/differential corpus, separate from public-command fixtures.
function createTopology(objects, kind = 'diamond') {
  const { Version, Ref, ModelComponent, LaneId } = objects;
  const hashes = Array.from({ length: 6 }, (_, index) =>
    createHash('sha1').update(`query/${kind}/${index}`).digest('hex')
  );
  const rows = hashes.map((hash, index) => {
    const version = new Version({
      mainFile: 'index.js',
      files: [],
      bindingPrefix: '@qualification',
      log: { message: `history ${index} 😀\nsecond line`, date: String(1700000000000 + index), username: 'fixture' },
      parents: [],
    });
    version._hash = hash;
    return version;
  });
  const ref = (index) => new Ref(hashes[index]);
  rows[1].parents = [ref(0)];
  rows[2].parents = [ref(0)];
  rows[3].parents = [ref(1), ref(2)];
  rows[4].parents = [ref(3)];
  rows[5].parents = [ref(4)];
  if (kind === 'hidden') rows[4].hidden = true;
  if (kind === 'squashed') {
    rows[5].parents = [ref(0)];
    rows[5].squashed = { previousParents: [ref(4)], laneId: LaneId.from('lane', 'qualification.history') };
  }
  if (kind === 'unrelated') rows[5].unrelated = { head: ref(2), laneId: LaneId.from('other', 'qualification.history') };
  if (kind === 'cycle') rows[0].parents = [ref(5)];
  if (kind === 'missing-parent') rows[5].parents.push(new Ref('f'.repeat(40)));
  const model = ModelComponent.from({
    name: 'component',
    scope: 'qualification.history',
    versions: {
      '1.0.0': ref(0),
      '1.1.0': ref(3),
    },
    head: ref(5),
  });
  if (kind === 'lean-lane') model.laneHeadLocal = ref(2);
  assert.equal(new Set(hashes).size, rows.length);
  return {
    kind,
    model,
    versions: rows,
    hashes,
    head: model.head,
    aliases: rows.map((version) => ({ version, parents: version.parents, log: version.log })),
  };
}

const kinds = ['diamond', 'hidden', 'squashed', 'unrelated', 'lean-lane', 'missing-parent', 'cycle'];
module.exports = { createTopology, kinds };
