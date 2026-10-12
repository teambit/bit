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
