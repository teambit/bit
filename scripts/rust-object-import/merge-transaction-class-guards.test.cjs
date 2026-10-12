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
  assert.equal(calls, 0);
  assert.equal(guards.hasRustSnapshotTransactionClassFieldsBatch([], 'unregistered', []), false);
});
