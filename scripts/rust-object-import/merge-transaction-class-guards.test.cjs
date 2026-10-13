const { test } = require('node:test');
const assert = require('node:assert/strict');
const { installed, source } = require('./load-source.cjs');
const guards =
  process.env.BIT_TEST_MERGE_TRANSACTION_COMPILED === '1'
    ? installed('@teambit/objects/dist/objects/rust-snapshot-guards.js')
    : source('scopes/scope/objects/objects/rust-snapshot-guards.ts');

test('class guards detect descriptor and prototype changes without calling accessors', () => {
  class Parent {
    method() {}
  }
  class Example extends Parent {
    static mutable = 1;
    field = 2;
  }
  const name = 'MergeGuardFixture';
  guards.registerRustSnapshotTransactionClass(name, Example, ['mutable', 'optional']);
  const value = new Example();
  const valid = () => guards.hasRustSnapshotTransactionClassFields(value, name, ['field']);
  assert.equal(valid(), true);
  Example.mutable = 3;
  Example.optional = 4;
  assert.equal(valid(), true);
  let calls = 0;
  const getter = () => {
    calls++;
    return 2;
  };
  const mutations = [
    [Example, 'mutable', { get: getter, configurable: true }],
    [Example, 'optional', { get: getter, configurable: true }],
    [Example, Symbol('extra'), { value: 1, configurable: true }],
    [Example.prototype, Symbol('extra'), { value: 1, configurable: true }],
    [Parent.prototype, 'method', { value() {}, configurable: true, writable: true }],
    [value, 'field', { get: getter, configurable: true }],
    [value, 'method', { value() {}, configurable: true }],
  ];
  for (const [object, key, descriptor] of mutations) {
    const before = Object.getOwnPropertyDescriptor(object, key);
    Object.defineProperty(object, key, descriptor);
    try {
      assert.equal(valid(), false, String(key));
    } finally {
      if (before) Object.defineProperty(object, key, before);
      else delete object[key];
    }
    assert.equal(valid(), true);
  }
  const method = Object.getOwnPropertyDescriptor(Parent.prototype, 'method');
  delete Parent.prototype.method;
  assert.equal(valid(), false);
  Object.defineProperty(Parent.prototype, 'method', method);
  Object.setPrototypeOf(Example.prototype, {});
  assert.equal(valid(), false);
  Object.setPrototypeOf(Example.prototype, Parent.prototype);
  assert.equal(valid(), true);
  Object.defineProperty(value, 'unread', { get: getter, configurable: true });
  assert.equal(valid(), true);
  assert.equal(guards.hasRustSnapshotTransactionClass(value, name), false);
  assert.equal(calls, 0);
});

test('batched class guards retain per-instance checks and recheck shared prototypes on every call', () => {
  class Example {
    field = 2;
    method() {}
  }
  const name = 'MergeBatchGuardFixture';
  guards.registerRustSnapshotTransactionClass(name, Example);
  const values = Array.from({ length: 64 }, () => new Example());
  const valid = () => guards.hasRustSnapshotTransactionClassFieldsBatch(values, name, ['field']);
  assert.equal(valid(), true);
  let calls = 0;
  const getter = () => {
    calls++;
    throw new Error('unobserved getter');
  };
  for (const [object, key, descriptor] of [
    [values[37], 'field', { get: getter, configurable: true }],
    [values[37], 'method', { get: getter, configurable: true }],
    [Example.prototype, 'method', { get: getter, configurable: true }],
    [Example, Symbol('extra'), { get: getter, configurable: true }],
    [values, '37', { get: getter, configurable: true }],
  ]) {
    const previous = Object.getOwnPropertyDescriptor(object, key);
    Object.defineProperty(object, key, descriptor);
    assert.equal(valid(), false);
    if (previous) Object.defineProperty(object, key, previous);
    else delete object[key];
    assert.equal(valid(), true);
  }
  const previous = values[37];
  values[37] = new Proxy(previous, { getPrototypeOf: getter, ownKeys: getter, getOwnPropertyDescriptor: getter });
  assert.equal(valid(), false);
  values[37] = previous;
  assert.equal(
    guards.hasRustSnapshotTransactionClassFieldsBatch(new Proxy(values, { getPrototypeOf: getter }), name, ['field']),
    false
  );
  delete values[37];
  assert.equal(valid(), false);
  values[37] = previous;
  Object.defineProperty(previous, 'unread', { get: getter });
  assert.equal(valid(), true);
  assert.equal(guards.hasRustSnapshotTransactionClassBatch(values, name), false);
  assert.equal(calls, 0);
  assert.equal(guards.hasRustSnapshotTransactionClassFieldsBatch([], 'unregistered', []), false);
});

test('instance guards reject inherited symbol and nonenumerable shadows while allowing Array length', () => {
  const symbol = Symbol('inherited');
  class Parent {
    [symbol]() {}
  }
  class Example extends Parent {
    field = 1;
  }
  const name = 'MergeInstanceKeyFixture';
  guards.registerRustSnapshotTransactionClass(name, Example);
  const value = new Example();
  const valid = () => guards.hasRustSnapshotTransactionClassFields(value, name, ['field']);
  assert.equal(valid(), true);
  let calls = 0;
  for (const key of [symbol, 'constructor']) {
    Object.defineProperty(value, key, {
      configurable: true,
      get() {
        calls++;
        throw new Error('unread');
      },
    });
    assert.equal(valid(), false);
    delete value[key];
    assert.equal(valid(), true);
  }
  guards.registerRustSnapshotTransactionClass('MergeArrayLengthFixture', Array);
  assert.equal(guards.hasRustSnapshotTransactionClassFields([1, 2, 3], 'MergeArrayLengthFixture', []), true);
  assert.equal(calls, 0);
});

test('merge Source selectors validate every Ref and reject proxy traps and late prototype changes', () => {
  const { Ref } = installed('@teambit/objects');
  installed('@teambit/objects/dist/models/index.js');
  const groups =
    process.env.BIT_TEST_MERGE_TRANSACTION_COMPILED === '1'
      ? installed('@teambit/component.modules.merge-helper/dist/rust-merge-source-groups.js')
      : source('scopes/component/modules/merge-helper/rust-merge-source-groups.ts');
  const hash = 'a'.repeat(40);
  const files = Array.from({ length: 513 }, (_, index) => ({ file: new Ref(hash), relativePath: `${index}.js` }));
  const rows = files.map((_, index) => ({ kind: 'modifiedFiles', other: index }));
  const selectors = ['currentUpdated', 'added', 'deletedConflict', 'modified'].map((stage) => ({
    stage,
    loads:
      stage === 'modified'
        ? files.map((_, index) => ({ row: index, other: { source: 0, ref: { side: 'other', index } } }))
        : [],
  }));
  const valid = () => groups.validRustMergeSourceGroups(selectors, [{ hash }], rows, [], files);
  assert.equal(valid(), true);
  const ordinary = files[512].file;
  let reads = 0;
  files[512].file = new Proxy(ordinary, {
    getOwnPropertyDescriptor() {
      reads++;
      throw new Error('unexpected proxy trap');
    },
  });
  assert.equal(valid(), false);
  assert.equal(reads, 0);
  files[512].file = ordinary;
  const descriptor = Object.getOwnPropertyDescriptor(ordinary, 'hash');
  Object.defineProperty(ordinary, 'hash', {
    configurable: true,
    get() {
      reads++;
      return hash;
    },
  });
  assert.equal(valid(), false);
  assert.equal(reads, 0);
  Object.defineProperty(ordinary, 'hash', descriptor);
  const marker = Symbol('changed Ref prototype');
  try {
    Object.defineProperty(Ref.prototype, marker, { configurable: true, value: true });
    assert.equal(valid(), false);
  } finally {
    delete Ref.prototype[marker];
  }
  assert.equal(valid(), true);
});

test('heterogeneous cache batches preserve class-specific field guards and recheck shared definitions', () => {
  class First {
    constructor() {
      this.value = 1;
    }
  }
  class Second {
    constructor() {
      this.other = 2;
    }
  }
  guards.registerRustSnapshotTransactionClass('BatchFirst', First);
  guards.registerRustSnapshotTransactionClass('BatchSecond', Second);
  const values = [new First(), new Second(), new First()];
  const schemas = { BatchFirst: ['value'], BatchSecond: ['other'] };
  const classify = () => guards.classifyRustSnapshotTransactionClasses(values, schemas);
  assert.deepEqual(classify(), ['BatchFirst', 'BatchSecond', 'BatchFirst']);
  let reads = 0;
  Object.defineProperty(values[2], 'value', {
    configurable: true,
    get() {
      reads++;
      return 1;
    },
  });
  assert.equal(classify(), undefined);
  assert.equal(reads, 0);
  Object.defineProperty(values[2], 'value', { configurable: true, writable: true, value: 1 });
  const marker = Symbol('changed batch class');
  try {
    First.prototype[marker] = true;
    assert.equal(classify(), undefined);
  } finally {
    delete First.prototype[marker];
  }
  const instance = values[1];
  values[1] = new Proxy(instance, {
    getPrototypeOf() {
      reads++;
      throw new Error('unexpected prototype trap');
    },
  });
  assert.equal(classify(), undefined);
  assert.equal(reads, 0);
  values[1] = instance;
  assert.deepEqual(classify(), ['BatchFirst', 'BatchSecond', 'BatchFirst']);
});
