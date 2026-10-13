const { test } = require('node:test');
const assert = require('node:assert/strict');
const { source } = require('./load-source.cjs');
const { registerRustConfigClass, registerRustConfigStaticData, hasRustConfigClass, hasRustConfigConstructor } = source(
  'scopes/workspace/config-merger/rust-config-guards.ts'
);

test('config guards recheck inherited definitions and instance overrides without invoking accessors', () => {
  class Parent {
    method() {
      return 'parent';
    }
  }
  class Child extends Parent {
    own() {
      return 'child';
    }
  }
  registerRustConfigClass(Child);
  const value = new Child();
  assert.equal(hasRustConfigClass(value), true);
  let calls = 0;
  const prior = Object.getOwnPropertyDescriptor(Parent.prototype, 'method');
  Object.defineProperty(Parent.prototype, 'method', {
    configurable: true,
    get() {
      calls++;
      return prior.value;
    },
  });
  assert.equal(hasRustConfigClass(value), false);
  assert.equal(calls, 0);
  Object.defineProperty(Parent.prototype, 'method', prior);
  assert.equal(hasRustConfigClass(value), true);
  value.method = prior.value;
  assert.equal(hasRustConfigClass(value), false, 'an own method still declines even when its value matches');
  delete value.method;
  const key = Symbol('new method');
  Child.prototype[key] = () => {};
  assert.equal(hasRustConfigClass(value), false);
  delete Child.prototype[key];
  assert.equal(hasRustConfigClass(value), true);
});

test('config guards distinguish permitted static data from changed methods and accessors', () => {
  class Config {
    static build() {}
  }
  registerRustConfigClass(Config);
  registerRustConfigStaticData(Config, 'validationHook');
  Config.validationHook = () => {};
  assert.equal(hasRustConfigConstructor(Config), true);
  let calls = 0;
  Object.defineProperty(Config, 'validationHook', {
    configurable: true,
    get() {
      calls++;
      return undefined;
    },
  });
  assert.equal(hasRustConfigConstructor(Config), false);
  assert.equal(calls, 0);
  delete Config.validationHook;
  const prior = Config.build;
  Config.build = () => {};
  assert.equal(hasRustConfigConstructor(Config), false);
  Config.build = prior;
  assert.equal(hasRustConfigConstructor(Config), true);
  Config.unregistered = 1;
  assert.equal(hasRustConfigConstructor(Config), false);
});

test('constructor and prototype lookup reject replacements and unregistered subclasses', () => {
  function Config() {}
  registerRustConfigClass(Config);
  const original = new Config();
  assert.equal(hasRustConfigClass(original), true);
  class Derived extends Config {}
  assert.equal(hasRustConfigClass(new Derived()), false);
  const prototype = Config.prototype;
  Config.prototype = {};
  assert.equal(hasRustConfigClass(original), false);
  assert.equal(hasRustConfigClass(new Config()), false);
  Config.prototype = prototype;
  assert.equal(hasRustConfigClass(original), true);
  registerRustConfigClass(Derived);
  assert.equal(hasRustConfigClass(new Derived()), true);
});
