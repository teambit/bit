const { test } = require('node:test');
const assert = require('node:assert/strict');
const { installed, source } = require('./load-source.cjs');
const moduleApi =
  process.env.BIT_TEST_MERGE_TRANSACTION_COMPILED === '1'
    ? installed('@teambit/component.sources/dist/source-file.js')
    : source('scopes/component/sources/source-file.ts');
const SourceFile = moduleApi.default;
const vinyl = installed('vinyl-file');
test('default SourceFile read eligibility rejects static loader accessors without invoking them', (t) => {
  assert.equal(moduleApi.canReadWorkspaceFilesNatively(), true, 'actual defining defaults must start eligible');
  let reads = 0;
  for (const key of ['load', 'loadFromSourceFileModel']) {
    const original = Object.getOwnPropertyDescriptor(SourceFile, key);
    Object.defineProperty(SourceFile, key, {
      configurable: true,
      get() {
        reads++;
        return original.value;
      },
    });
    try {
      assert.equal(moduleApi.canReadWorkspaceFilesNatively(), false);
    } finally {
      Object.defineProperty(SourceFile, key, original);
    }
  }
  assert.equal(reads, 0);
  assert.equal(moduleApi.canReadWorkspaceFilesNatively(), true);
});
test('default SourceFile read eligibility rejects the defining vinyl readSync accessor without reading it', () => {
  const original = Object.getOwnPropertyDescriptor(vinyl, 'readSync');
  let reads = 0;
  Object.defineProperty(vinyl, 'readSync', {
    configurable: true,
    get() {
      reads++;
      return original.value;
    },
  });
  try {
    assert.equal(moduleApi.canReadWorkspaceFilesNatively(), false);
    assert.equal(reads, 0);
  } finally {
    Object.defineProperty(vinyl, 'readSync', original);
  }
});
test('defining SourceFile path function domain rejects accessors without evaluating their values', () => {
  const objects = installed('@teambit/objects');
  const paths = installed('node:path');
  assert.equal(objects.hasRustSnapshotFunctions(['MergeSourceFilePaths']), true);
  let reads = 0;
  for (const key of ['relative', 'normalize']) {
    const descriptor = Object.getOwnPropertyDescriptor(paths, key);
    Object.defineProperty(paths, key, {
      configurable: true,
      get() {
        reads++;
        return descriptor.value;
      },
    });
    try {
      assert.equal(objects.hasRustSnapshotFunctions(['MergeSourceFilePaths']), false);
    } finally {
      Object.defineProperty(paths, key, descriptor);
    }
  }
  assert.equal(reads, 0);
});
