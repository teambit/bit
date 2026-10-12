const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const { installed, source } = require('./load-source.cjs');
const compiled = process.env.BIT_TEST_CHECKOUT_TRANSITION_COMPILED === '1';
const adapter = compiled
  ? require(path.join(path.dirname(installed.resolve('@teambit/checkout')), 'rust-checkout-files.js'))
  : source('scopes/component/checkout/rust-checkout-files.ts');
const definingEol = installed('@teambit/toolbox.string.eol/dist/eol.js');
const definingPath = installed('@teambit/toolbox.path.path/dist/path.js');
const definingGit = installed('@teambit/git.modules.git-executable/dist/git-executable.js');
const binary = createRequire(installed.resolve('@teambit/toolbox.string.eol'))('isbinaryfile');
adapter.registerRustCheckoutFileFunctions();

test('ordinary Babel re-export guards remain eligible after repeated defining registration', () => {
  assert.equal(adapter.canUseRustCheckoutFileFunctions(), true);
  adapter.registerRustCheckoutFileFunctions();
  adapter.registerRustCheckoutFileFunctions();
  assert.equal(adapter.canUseRustCheckoutFileFunctions(), true);
});

test('defining accessors are rejected without evaluating speculative export getters', () => {
  for (const [object, key] of [
    [definingEol, 'lf'],
    [definingEol, 'captureDefaultEolLf'],
    [definingPath, 'pathNormalizeToLinux'],
    [definingGit, 'canUseDefaultGitNatively'],
  ]) {
    const original = Object.getOwnPropertyDescriptor(object, key);
    let reads = 0;
    try {
      Object.defineProperty(object, key, {
        configurable: true,
        enumerable: original.enumerable,
        get() {
          reads++;
          return original.value;
        },
      });
      assert.equal(adapter.canUseRustCheckoutFileFunctions(), false, key);
      adapter.registerRustCheckoutFileFunctions();
      assert.equal(adapter.canUseRustCheckoutFileFunctions(), false, `${key} registration must retain its baseline`);
      assert.equal(reads, 0, key);
    } finally {
      Object.defineProperty(object, key, original);
    }
    assert.equal(adapter.canUseRustCheckoutFileFunctions(), true, `${key} restored`);
  }
});

test('LF eligibility preserves the defining binary classifier without invoking a replacement', () => {
  const original = Object.getOwnPropertyDescriptor(binary, 'isBinaryFileSync');
  let calls = 0;
  try {
    Object.defineProperty(binary, 'isBinaryFileSync', {
      ...original,
      value() {
        calls++;
        return false;
      },
    });
    assert.equal(adapter.canUseRustCheckoutFileFunctions(), false);
    assert.equal(calls, 0);
  } finally {
    Object.defineProperty(binary, 'isBinaryFileSync', original);
  }
  assert.equal(adapter.canUseRustCheckoutFileFunctions(), true);
});

test('Apply eligibility initializes real lazy defining exports and rejects replaced defining callbacks', () => {
  const helper = installed('@teambit/component.modules.merge-helper');
  const defining = installed('@teambit/component.modules.merge-helper/dist/apply-version.js');
  const eligible = helper.hasRustCheckoutApplyFunctions;
  assert.equal(typeof eligible, 'function');
  assert.equal(eligible(), true);
  const original = Object.getOwnPropertyDescriptor(defining, 'applyModifiedVersionWithPlan');
  let reads = 0;
  try {
    Object.defineProperty(defining, 'applyModifiedVersionWithPlan', {
      configurable: true,
      enumerable: original.enumerable,
      get() {
        reads++;
        return original.value;
      },
    });
    assert.equal(eligible(), false);
    assert.equal(reads, 0);
  } finally {
    Object.defineProperty(defining, 'applyModifiedVersionWithPlan', original);
  }
  assert.equal(eligible(), true);
});

test('real native preparation accepts a separate equivalent Version hydration and rejects metadata changes', async (t) => {
  // The command's defining module registers its canonical JSON transport before any file phase.
  if (compiled) installed('@teambit/checkout/dist/checkout.main.runtime.js');
  else source('scopes/component/checkout/checkout.main.runtime.ts');
  const fs = require('node:fs/promises');
  const os = require('node:os');
  const { Repository, Source, Version, Ref } = installed('@teambit/objects');
  const sources = installed('@teambit/component.sources');
  const previousFlag = process.env.BIT_RUST_CLIENT_VCS;
  const previousHelper = process.env.BIT_RUST_OBJECT_IMPORT;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-checkout-hydration-'));
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  process.env.BIT_RUST_OBJECT_IMPORT =
    process.env.BIT_TEST_OBJECT_IMPORT ||
    path.join(
      require('./load-source.cjs').root,
      'native/target/debug/bit-object-import' + (process.platform === 'win32' ? '.exe' : '')
    );
  t.after(async () => {
    if (previousFlag === undefined) delete process.env.BIT_RUST_CLIENT_VCS;
    else process.env.BIT_RUST_CLIENT_VCS = previousFlag;
    if (previousHelper === undefined) delete process.env.BIT_RUST_OBJECT_IMPORT;
    else process.env.BIT_RUST_OBJECT_IMPORT = previousHelper;
    await fs.rm(directory, { recursive: true, force: true });
  });
  const repository = new Repository(path.join(directory, 'scope'), {});
  const sourceObject = Source.from(Buffer.from('ordinary target source\n'));
  const version = new Version({
    mainFile: 'index.js',
    files: [{ name: 'index.js', relativePath: 'index.js', file: sourceObject.hash(), test: false }],
    log: { message: 'hydration', date: '123', username: 'qualification', email: 'q@example.com' },
    hash: 'a'.repeat(40),
    dependencies: [],
    devDependencies: [],
  });
  for (const object of [sourceObject, version]) {
    const filename = repository.objectPath(object.hash());
    await fs.mkdir(path.dirname(filename), { recursive: true });
    await fs.writeFile(filename, await object.compress());
  }
  const serializedObject = version.serialize();
  const serialized = serializedObject.subarray(serializedObject.indexOf(0) + 1).toString();
  await sources.withWorkspacePersistence(() =>
    sources.withRustWorkspaceEngine(() =>
      adapter.withRustCheckoutPlans(async () => {
        const prepared = await adapter.prepareRustCheckoutFiles(repository, version);
        assert.ok(prepared, 'default repository and real metadata must actually produce a native plan');
        const fresh = () => Version.parse(serialized, version.hash().toString());
        const equivalent = fresh();
        assert.notEqual(equivalent.files[0], version.files[0]);
        assert.notEqual(equivalent.files[0].file, version.files[0].file);
        assert.equal(adapter.checkoutPlanMatchesVersion(prepared, equivalent), true);
        for (const [name, mutate] of [
          [
            'version hash',
            (v) => {
              v._hash = 'b'.repeat(40);
            },
          ],
          [
            'relative path',
            (v) => {
              v.files[0].relativePath = 'other.js';
            },
          ],
          [
            'file name',
            (v) => {
              v.files[0].name = 'other.js';
            },
          ],
          [
            'test metadata',
            (v) => {
              v.files[0].test = true;
            },
          ],
          [
            'Source ref',
            (v) => {
              v.files[0].file = new Ref('b'.repeat(40));
            },
          ],
        ]) {
          const changed = fresh();
          mutate(changed);
          assert.equal(adapter.checkoutPlanMatchesVersion(prepared, changed), false, name);
        }
        const custom = fresh();
        let reads = 0;
        Object.defineProperty(custom.files[0], 'relativePath', {
          get() {
            reads++;
            return 'index.js';
          },
        });
        assert.equal(adapter.checkoutPlanMatchesVersion(prepared, custom), false);
        assert.equal(reads, 0);
        assert.equal(prepared.valid(), true, 'fresh projections must not mutate original live metadata');
      })
    )
  );
});
