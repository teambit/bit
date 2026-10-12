const { test } = require('node:test');
const assert = require('node:assert/strict');
const { comparableMergeStdout, comparableVersionHistory } = require('./merge-transaction-report.cjs');

test('canonical main-to-lane history insertion order preserves every row and ordered edge', () => {
  const value = {
    name: 'component',
    scope: 'scope',
    versions: [
      { hash: 'a', parents: ['b', 'c'] },
      { hash: 'b', parents: ['c'] },
    ],
    graphCompleteRefs: ['a', 'b'],
  };
  const encode = (data, type = 'VersionHistory') => {
    const body = JSON.stringify(data);
    return Buffer.from(`${type} identity ${Buffer.byteLength(body)}\0${body}`).toString('hex');
  };
  const original = comparableVersionHistory(encode(value));
  assert.equal(original, comparableVersionHistory(encode({ ...value, versions: [...value.versions].reverse() })));
  for (const changed of [
    { ...value, name: 'other' },
    { ...value, versions: [value.versions[0]] },
    { ...value, versions: [value.versions[0], value.versions[0]] },
    { ...value, versions: [{ ...value.versions[0], parents: ['c', 'b'] }, value.versions[1]] },
    { ...value, graphCompleteRefs: ['b', 'a'] },
  ])
    assert.notEqual(original, comparableVersionHistory(encode(changed)));
  const component = encode(value, 'Component');
  assert.equal(comparableVersionHistory(component), component);
  const malformed = Buffer.from('VersionHistory identity 3\0bad').toString('hex');
  assert.equal(comparableVersionHistory(malformed), malformed);
});

test('concurrent canonical Source additions may complete in either order', () => {
  const first = 'component\n\tremoved removed.js \n\tadded added.js \n\tadded case.js \n\nMerge Summary\n';
  const second = 'component\n\tremoved removed.js \n\tadded case.js \n\tadded added.js \n\nMerge Summary\n';
  assert.equal(comparableMergeStdout(first), comparableMergeStdout(second));
  assert.equal(
    comparableMergeStdout(first.replaceAll('added ', 'updated ')),
    comparableMergeStdout(second.replaceAll('added ', 'updated '))
  );
});

test('report comparison retains row bytes, duplicates and status/component boundaries', () => {
  const original = 'component\n\tadded a.js \n\tadded b.js \n\tupdated c.js \n\nSummary\n';
  for (const changed of [
    original.replace('a.js', 'wrong.js'),
    original.replace('\tadded b.js \n', ''),
    original.replace('\tadded b.js \n', '\tadded a.js \n'),
    original.replace('\tupdated c.js \n', '\tadded c.js \n'),
    original.replace('\tadded b.js \n\tupdated c.js \n', '\tupdated c.js \n\tadded b.js \n'),
    original.replace('component', 'other component'),
    original.replace('Summary', 'Wrong summary'),
    original.replace('a.js ', 'a.js'),
    original.replace('\n', '\r\n'),
  ])
    assert.notEqual(comparableMergeStdout(original), comparableMergeStdout(changed));
  assert.equal(comparableMergeStdout(''), '');
  assert.equal(comparableMergeStdout('plain text without a newline'), 'plain text without a newline');
});

test('synchronous statuses and arbitrary output remain ordered', () => {
  for (const status of ['removed', 'auto-merged', 'CONFLICT', 'unchanged', 'overridden']) {
    const first = `\t${status} a.js \n\t${status} b.js \n`;
    const second = `\t${status} b.js \n\t${status} a.js \n`;
    assert.notEqual(comparableMergeStdout(first), comparableMergeStdout(second));
  }
  assert.notEqual(comparableMergeStdout('added a.js\nadded b.js\n'), comparableMergeStdout('added b.js\nadded a.js\n'));
});
