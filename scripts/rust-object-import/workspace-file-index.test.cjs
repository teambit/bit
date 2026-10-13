const { test } = require('node:test');
const assert = require('node:assert/strict');
const { installed, source } = require('./load-source.cjs');
const { SourceFile } = installed('@teambit/component.sources');
const { indexRustWorkspaceFiles } =
  process.env.BIT_TEST_WORKSPACE_INSPECTION_COMPILED === '1'
    ? installed('@teambit/component.sources/dist/rust-workspace-file-index.js')
    : source('scopes/component/sources/rust-workspace-file-index.ts');
const file = (name) => new SourceFile({ base: '.', path: name, contents: Buffer.from(name) });
test('ordinary file index retains first duplicates, path order and original aliases', () => {
  const files = [file('b.js'), file('a.js'), file('b.js')];
  const result = indexRustWorkspaceFiles(
    files,
    files.map((f) => f.relative)
  );
  assert.ok(result);
  assert.deepEqual([...result.keys()], ['b.js', 'a.js']);
  assert.equal(result.get('b.js'), files[0]);
  assert.equal(result.get('a.js'), files[1]);
});
test('lazy model contents are never inspected while indexing ordinary paths', () => {
  const value = file('lazy.js');
  let calls = 0;
  Object.defineProperty(value, 'contents', {
    get() {
      calls++;
      throw Error('body read');
    },
    configurable: true,
  });
  assert.equal(indexRustWorkspaceFiles([value], ['lazy.js']).get('lazy.js'), value);
  assert.equal(calls, 0);
});
test('custom path readers and history accessors decline without extra getter or proxy calls', () => {
  for (const key of ['relative', 'path', 'base', 'cwd', 'history', '_base', '_cwd']) {
    const value = file('custom.js');
    let calls = 0;
    Object.defineProperty(value, key, {
      get() {
        calls++;
        throw Error('getter');
      },
      configurable: true,
    });
    assert.equal(indexRustWorkspaceFiles([value], ['custom.js']), undefined, key);
    assert.equal(calls, 0, key);
  }
  const value = file('proxy.js');
  let calls = 0;
  value.history = new Proxy(value.history, {
    get() {
      calls++;
      throw Error('proxy');
    },
  });
  assert.equal(indexRustWorkspaceFiles([value], ['proxy.js']), undefined);
  assert.equal(calls, 0);
});
test('changed defining path accessors keep the original lookup path', () => {
  const value = file('changed.js');
  let proto = Object.getPrototypeOf(value);
  const original = Object.getOwnPropertyDescriptor(proto, 'relative');
  let calls = 0;
  try {
    Object.defineProperty(proto, 'relative', {
      configurable: true,
      get() {
        calls++;
        return 'changed.js';
      },
    });
    assert.equal(indexRustWorkspaceFiles([value], ['changed.js']), undefined);
    assert.equal(calls, 0);
  } finally {
    if (original) Object.defineProperty(proto, 'relative', original);
    else Reflect.deleteProperty(proto, 'relative');
  }
});

test('proxy file prototypes decline without descriptor traps', () => {
  const value = file('proxy-prototype.js');
  let calls = 0;
  Object.setPrototypeOf(
    value,
    new Proxy(Object.getPrototypeOf(value), {
      getOwnPropertyDescriptor() {
        calls++;
        throw Error('prototype trap');
      },
    })
  );
  assert.equal(indexRustWorkspaceFiles([value], ['proxy-prototype.js']), undefined);
  assert.equal(calls, 0);
});
