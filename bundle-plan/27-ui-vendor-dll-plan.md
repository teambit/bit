# 27. Implementation plan: UI vendor DLL (bit-bundle3 side)

[← back to bundle-plan index](../bundle-plan.md)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a small, additive "UI vendor DLL" artifact alongside the existing UI/preview
pre-bundle, so a consumer building its _own_ UI root (any app, any bit workspace) can reference
already-compiled core-aspect browser code via rspack's `DllReferencePlugin` instead of recompiling it
from source — which is impossible for a bundled `bit` today (core aspects resolve to shims pointing
into `bit.app.js`).

**Architecture:** `BundleUiTask` gains one more step after its existing rspack build: a tiny,
separate rspack compilation using `DllPlugin`, entry-generated from every core aspect package that
ships a `.ui.runtime`/`.preview.runtime` file (computed dynamically, not hand-listed) plus `react`/
`react-dom`. Output is a manifest + a chunk exposing `window.__bitUiVendor__`, shipped inside the same
`artifacts/ui-bundle/` the existing pre-bundle already uses. A new public `UiMain.getUiVendorDllPaths()`
method lets any consumer (in-repo or external) discover the artifact and get `undefined` cleanly when
it doesn't exist (older bundle, artifact stripped, etc.) — this is the sole point of external contact,
and it's purely additive.

**Tech Stack:** TypeScript, rspack (`@rspack/core@2.1.10` — confirms `DllPlugin`/`DllReferencePlugin`
present), Mocha/Chai (existing `.spec.ts` convention in this repo), the existing `e2e/harmony/`
Mocha e2e suite.

**Spec:** [bundle-plan/26-ui-vendor-dll-design.md](26-ui-vendor-dll-design.md)

## Global Constraints

- No change to the existing workspace/scope pre-bundle's own output, `.hash` file, or
  `shouldServeBundleUi`/`buildUI` logic — every existing e2e/spec test for that path must keep
  passing unmodified.
- The new artifact must be small: it should not meaningfully grow `total shipped distribution`
  (currently ~159 MB / 2,812 files — [bundle-plan/01-goal-and-results.md](01-goal-and-results.md)),
  since it's built from packages _already_ compiled into the existing pre-bundle, not new code.
  `bundleSizeMb` reported by `npm run bundle` must not grow by more than 5 MB.
- The new public API (`UiMain.getUiVendorDllPaths()`) must return `undefined` — never throw — when
  the artifact is missing, so an external consumer (e.g. `bit-cloud`, see the sibling plan in
  `/Users/giladshoham/dev/temp/bit-cloud-bundle/`) can defensively feature-detect it.
- Follow this repo's existing patterns exactly: `.spec.ts` next to source, `chai`'s `expect`, the
  `e2e/harmony/*.e2e.ts` + `BIT_E2E_UI_MODE` gating convention already used by `ui-start.e2e.ts`.

---

### Task 1: `resolveUiVendorDllPackages()` — which packages the vendor DLL covers

**Files:**

- Create: `scopes/ui-foundation/ui/ui-vendor-dll.ts`
- Test: `scopes/ui-foundation/ui/ui-vendor-dll.spec.ts`

**Interfaces:**

- Produces: `export function resolveUiVendorDllPackages(coreAspectIds: string[], resolvePackageDir: (packageName: string) => string | undefined): string[]` — pure, dependency-injected for testability (real callers pass `getAllCoreAspectsIds()` and a real `require.resolve`-based resolver; Task 3 wires the real callers in).
- Produces: `export const UI_VENDOR_DLL_EXTRA_PACKAGES = ['react', 'react-dom']`

- [ ] **Step 1: Write the failing test**

```ts
// scopes/ui-foundation/ui/ui-vendor-dll.spec.ts
import { expect } from 'chai';
import * as fs from 'fs';
import { resolveUiVendorDllPackages, UI_VENDOR_DLL_EXTRA_PACKAGES } from './ui-vendor-dll';

describe('resolveUiVendorDllPackages', () => {
  it('includes react/react-dom plus any core aspect package with a ui or preview runtime file', () => {
    const fakeDirs: Record<string, string> = {
      'teambit.ui-foundation/ui': '/fake/ui',
      'teambit.preview/preview': '/fake/preview',
      'teambit.component/component-sizer': '/fake/component-sizer',
      'teambit.scope/scope': '/fake/scope', // main-runtime only, no ui/preview runtime
    };
    const distFiles: Record<string, string[]> = {
      '/fake/ui/dist': ['ui.aspect.js', 'ui.main.runtime.js', 'ui.ui.runtime.js'],
      '/fake/preview/dist': ['preview.aspect.js', 'preview.main.runtime.js', 'preview.preview.runtime.js'],
      '/fake/component-sizer/dist': ['component-sizer.aspect.js', 'component-sizer.main.runtime.js'],
      '/fake/scope/dist': ['scope.aspect.js', 'scope.main.runtime.js'],
    };
    const readdirSyncStub = (dir: string) => distFiles[dir] || [];
    const existsSyncStub = (p: string) => p in distFiles;

    const resolvePackageDir = (packageName: string) => {
      const toPackageName = (aspectId: string) => {
        const [scope, ...nameParts] = aspectId.split('/');
        return `@${scope.replace('.', '/')}.${nameParts.join('.')}`;
      };
      const id = Object.keys(fakeDirs).find((aspectId) => toPackageName(aspectId) === packageName);
      return id ? fakeDirs[id] : undefined;
    };

    const result = resolveUiVendorDllPackages(
      [
        'teambit.ui-foundation/ui',
        'teambit.preview/preview',
        'teambit.component/component-sizer',
        'teambit.scope/scope',
      ],
      resolvePackageDir,
      { readdirSync: readdirSyncStub, existsSync: existsSyncStub }
    );

    expect(result).to.include.members(['react', 'react-dom']);
    expect(result).to.include('@teambit/ui-foundation.ui');
    expect(result).to.include('@teambit/preview.preview');
    expect(result).to.not.include('@teambit/scope.scope');
  });

  it('always includes UI_VENDOR_DLL_EXTRA_PACKAGES even with an empty core aspect list', () => {
    const result = resolveUiVendorDllPackages([], () => undefined, {
      readdirSync: () => [],
      existsSync: () => false,
    });
    expect(result).to.deep.equal(UI_VENDOR_DLL_EXTRA_PACKAGES);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bit test scopes/ui-foundation/ui` (or `npx mocha --require ts-node/register scopes/ui-foundation/ui/ui-vendor-dll.spec.ts` if running the file in isolation)
Expected: FAIL — `Cannot find module './ui-vendor-dll'`

- [ ] **Step 3: Write minimal implementation**

```ts
// scopes/ui-foundation/ui/ui-vendor-dll.ts
import { readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';

export const UI_VENDOR_DLL_DIR = 'ui-vendor-dll';
export const UI_VENDOR_DLL_MANIFEST_FILENAME = 'vendor-manifest.json';
export const UI_VENDOR_DLL_CHUNK_FILENAME = 'vendor.js';
export const UI_VENDOR_DLL_GLOBAL_NAME = '__bitUiVendor__';
export const UI_VENDOR_DLL_EXTRA_PACKAGES = ['react', 'react-dom'];

type FsDeps = { readdirSync: (dir: string) => string[]; existsSync: (p: string) => boolean };
const realFsDeps: FsDeps = { readdirSync, existsSync };

/**
 * every core aspect package that ships browser (ui or preview) runtime code, plus react/react-dom.
 * these are exactly the packages a bundled bit's shims redirect into `bit.app.js` for - the ones a
 * third-party UI root's rspack build cannot compile from source. computed dynamically (not
 * hand-listed) from bit's own installation at the time `BundleUiTask` runs, so it never drifts from
 * what the existing pre-bundle actually covers.
 */
export function resolveUiVendorDllPackages(
  coreAspectIds: string[],
  resolvePackageDir: (packageName: string) => string | undefined,
  fsDeps: FsDeps = realFsDeps
): string[] {
  const corePackages = coreAspectIds
    .map((id) => {
      const [scope, ...nameParts] = id.split('/');
      return `@${scope.replace('.', '/')}.${nameParts.join('.')}`;
    })
    .filter((packageName) => {
      const packageDir = resolvePackageDir(packageName);
      if (!packageDir) return false;
      const distDir = join(packageDir, 'dist');
      if (!fsDeps.existsSync(distDir)) return false;
      return fsDeps.readdirSync(distDir).some((f) => f.endsWith('.ui.runtime.js') || f.endsWith('.preview.runtime.js'));
    });
  return [...new Set([...UI_VENDOR_DLL_EXTRA_PACKAGES, ...corePackages])];
}
```

Note: this step's package-name derivation (`@${scope.replace('.', '/')}.${nameParts.join('.')}`) is a
simplified version of the real `getAspectPackageName` rule for readability in the test fixture; Task 3
wires in the real `getAspectPackageName` from `@teambit/bit` for the production call site instead of
duplicating that logic — this function only needs _a_ mapping to exercise the filtering logic, and
Task 3's integration test is what proves the real mapping end-to-end.

- [ ] **Step 4: Run test to verify it passes**

Run: same as step 2
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scopes/ui-foundation/ui/ui-vendor-dll.ts scopes/ui-foundation/ui/ui-vendor-dll.spec.ts
git commit -m "feat(ui): resolve which packages the ui vendor dll should cover"
```

---

### Task 2: `buildUiVendorDll()` — produce the DLL artifact via rspack

**Files:**

- Modify: `scopes/ui-foundation/ui/ui-vendor-dll.ts`
- Test: `scopes/ui-foundation/ui/ui-vendor-dll.spec.ts`

**Interfaces:**

- Consumes: nothing from Task 1 directly (independent function), but shares the same file and the
  `UI_VENDOR_DLL_*` constants.
- Produces: `export async function buildUiVendorDll(outputPath: string, packages: string[]): Promise<void>` — writes `<outputPath>/ui-vendor-dll/vendor-entry.js`, `.../vendor.js`, `.../vendor-manifest.json`.

- [ ] **Step 1: Write the failing test**

Uses two tiny, always-present builtin-free npm packages already in this repo's own dependency tree
(`lodash.compact` and `chalk` — both real, small, already-installed dependencies elsewhere in this
repo) as the fixture instead of `react`, so the test compiles fast and doesn't need a DOM.

```ts
// append to scopes/ui-foundation/ui/ui-vendor-dll.spec.ts
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  buildUiVendorDll,
  UI_VENDOR_DLL_DIR,
  UI_VENDOR_DLL_MANIFEST_FILENAME,
  UI_VENDOR_DLL_CHUNK_FILENAME,
} from './ui-vendor-dll';

describe('buildUiVendorDll', function () {
  this.timeout(30000); // real rspack compilation

  let outputPath: string;
  before(async () => {
    outputPath = mkdtempSync(join(tmpdir(), 'ui-vendor-dll-test-'));
    await buildUiVendorDll(outputPath, ['lodash.compact']);
  });
  after(() => rmSync(outputPath, { recursive: true, force: true }));

  it('writes a manifest.json naming the covered package', () => {
    const manifestPath = join(outputPath, UI_VENDOR_DLL_DIR, UI_VENDOR_DLL_MANIFEST_FILENAME);
    expect(existsSync(manifestPath)).to.equal(true);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    expect(manifest.name).to.equal('__bitUiVendor__');
    expect(Object.keys(manifest.content).some((k) => k.includes('lodash.compact'))).to.equal(true);
  });

  it('writes a vendor.js chunk', () => {
    const chunkPath = join(outputPath, UI_VENDOR_DLL_DIR, UI_VENDOR_DLL_CHUNK_FILENAME);
    expect(existsSync(chunkPath)).to.equal(true);
    expect(readFileSync(chunkPath, 'utf-8').length).to.be.greaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bit test scopes/ui-foundation/ui`
Expected: FAIL — `buildUiVendorDll is not a function`

- [ ] **Step 3: Write minimal implementation**

```ts
// append to scopes/ui-foundation/ui/ui-vendor-dll.ts
import { rspack } from '@rspack/core';
import { outputFileSync } from 'fs-extra';

export async function buildUiVendorDll(outputPath: string, packages: string[]): Promise<void> {
  const dllOutputDir = join(outputPath, UI_VENDOR_DLL_DIR);
  const entryFile = join(dllOutputDir, 'vendor-entry.js');
  const entryContents = packages
    .map((pkg) => `exports[${JSON.stringify(pkg)}] = require(${JSON.stringify(pkg)});`)
    .join('\n');
  outputFileSync(entryFile, entryContents);

  const compiler = rspack({
    mode: 'production',
    entry: entryFile,
    output: {
      path: dllOutputDir,
      filename: UI_VENDOR_DLL_CHUNK_FILENAME,
      library: { name: UI_VENDOR_DLL_GLOBAL_NAME, type: 'window' },
    },
    plugins: [
      new rspack.DllPlugin({
        path: join(dllOutputDir, UI_VENDOR_DLL_MANIFEST_FILENAME),
        name: UI_VENDOR_DLL_GLOBAL_NAME,
        type: 'window',
      }),
    ],
  });

  await new Promise<void>((resolvePromise, reject) => {
    compiler.run((err, stats) => {
      compiler.close((closeErr) => {
        if (err) return reject(err);
        if (stats?.hasErrors()) return reject(new Error(stats.toString()));
        if (closeErr) return reject(closeErr);
        resolvePromise();
      });
    });
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: same as step 2
Expected: PASS (allow up to 30s — a real, if tiny, rspack compilation)

- [ ] **Step 5: Commit**

```bash
git add scopes/ui-foundation/ui/ui-vendor-dll.ts scopes/ui-foundation/ui/ui-vendor-dll.spec.ts
git commit -m "feat(ui): build the ui vendor dll artifact via rspack DllPlugin"
```

---

### Task 3: Wire into `BundleUiTask` + expose `UiMain.getUiVendorDllPaths()`

**Files:**

- Modify: `scopes/ui-foundation/ui/bundle-ui.task.ts`
- Modify: `scopes/ui-foundation/ui/ui.main.runtime.ts`
- Test: `scopes/ui-foundation/ui/ui-vendor-dll.spec.ts` (real-package integration test)

**Interfaces:**

- Consumes: `resolveUiVendorDllPackages`, `buildUiVendorDll`, `UI_VENDOR_DLL_DIR`,
  `UI_VENDOR_DLL_MANIFEST_FILENAME`, `UI_VENDOR_DLL_CHUNK_FILENAME` from Tasks 1-2.
- Consumes: `getAllCoreAspectsIds` from `./manifests` (bit's own core-aspect id list — confirmed used
  the same way in `scopes/harmony/bit/load-bit.ts:296`, `envs.setCoreAspectIds(getAllCoreAspectsIds())`)
  and `getAspectPackageName` from `@teambit/bit` (added this same branch, commit `35a53d63c`).
- Produces: `UiMain.getUiVendorDllPaths(): { manifestPath: string; chunkPath: string } | undefined` —
  **public** method (unlike the existing `private getBundleUiPath()` it mirrors), since it's the
  contract external consumers (e.g. `bit-cloud`) call.

- [ ] **Step 1: Write the failing test** (this one exercises the real production call path end to end, not fixtures — the closest thing to a unit test this task has, since the real wiring only makes sense against real core aspect packages)

```ts
// append to scopes/ui-foundation/ui/ui-vendor-dll.spec.ts
import { getAllCoreAspectsIds } from '@teambit/bit';
import { getAspectPackageName } from '@teambit/bit';

describe('resolveUiVendorDllPackages (real core aspects)', () => {
  it('covers teambit.ui-foundation/ui and teambit.preview/preview, and excludes teambit.scope/scope', () => {
    const result = resolveUiVendorDllPackages(getAllCoreAspectsIds(), (packageName) => {
      try {
        return join(require.resolve(`${packageName}/package.json`), '..');
      } catch {
        return undefined;
      }
    });
    expect(result).to.include(getAspectPackageName('teambit.ui-foundation/ui'));
    expect(result).to.include(getAspectPackageName('teambit.preview/preview'));
    // scope's own aspect has no .ui.runtime/.preview.runtime file of its own (ScopeUIRoot is
    // registered by teambit.scope/scope but its *rendering* code lives in teambit.ui-foundation/ui).
    expect(result).to.not.include(getAspectPackageName('teambit.scope/scope'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bit test scopes/ui-foundation/ui`
Expected: FAIL — depends on `getAllCoreAspectsIds`/`getAspectPackageName` not yet imported in the spec, or (once imports are added) passes trivially since Task 1's implementation already handles this generically. If it already passes at this point, that's fine — it's here to lock in the real-world behavior as a regression guard, not to drive new production code.

- [ ] **Step 3: Wire `BundleUiTask.execute()` to also build the vendor DLL**

```ts
// scopes/ui-foundation/ui/bundle-ui.task.ts — add imports and one call
import { getAllCoreAspectsIds, getAspectPackageName } from '@teambit/bit';
import { resolveUiVendorDllPackages, buildUiVendorDll } from './ui-vendor-dll';

// inside execute(), after `await this.ui.build(undefined, outputPath, { forPreBundle: true });`
// and before `await this.generateHash(outputPath);`:
const vendorPackages = resolveUiVendorDllPackages(getAllCoreAspectsIds(), (packageName) => {
  try {
    return join(require.resolve(`${packageName}/package.json`), '..');
  } catch {
    return undefined;
  }
});
await buildUiVendorDll(outputPath, vendorPackages);
```

Also extend `getArtifactDef()` so the vendor DLL directory is included in the packaged artifact glob
(it already writes under `outputPath`, which is `join(capsule.path, 'artifacts', 'ui-bundle')` — same
root the existing glob covers — **check this first**: the existing glob is
`` `${BundleUiTask.getArtifactDirectory()}/**` `` which already recursively matches everything under
`artifacts/ui-bundle/`, including the new `ui-vendor-dll/` subdirectory. No change needed here — this
is a verification sub-step, not a code change: after Step 5's real build, confirm
`artifacts/ui-bundle/ui-vendor-dll/` files are present in `BuiltTaskResult.artifacts`' matched globs.

- [ ] **Step 4: Add the public `getUiVendorDllPaths()` method to `UiMain`**

```ts
// scopes/ui-foundation/ui/ui.main.runtime.ts
// add to the existing imports near the top:
import { UI_VENDOR_DLL_DIR, UI_VENDOR_DLL_MANIFEST_FILENAME, UI_VENDOR_DLL_CHUNK_FILENAME } from './ui-vendor-dll';

// add as a new PUBLIC method, near the existing private `getBundleUiPath()` (~line 736):
/**
 * absolute paths to the shipped UI vendor DLL artifact (a manifest + a chunk exposing
 * `window.__bitUiVendor__`), or `undefined` if this bit installation doesn't have one - an older
 * bundle, a build with the artifact stripped, or a bit version that predates this feature. safe to
 * call unconditionally; never throws.
 */
getUiVendorDllPaths(): { manifestPath: string; chunkPath: string } | undefined {
  const bundleUiPath = getAspectArtifactDir(UIAspect.id, BundleUiTask.getArtifactDirectory());
  if (!bundleUiPath) return undefined;
  const dllDir = join(bundleUiPath, UI_VENDOR_DLL_DIR);
  const manifestPath = join(dllDir, UI_VENDOR_DLL_MANIFEST_FILENAME);
  const chunkPath = join(dllDir, UI_VENDOR_DLL_CHUNK_FILENAME);
  if (!fs.existsSync(manifestPath) || !fs.existsSync(chunkPath)) return undefined;
  return { manifestPath, chunkPath };
}
```

`fs` and `join` are already imported in this file (used by the neighboring `getBundleUiPath`/
`buildIfNoBundle` methods) — confirm rather than re-adding a duplicate import.

- [ ] **Step 5: Run the full test suite for the touched components + a real build**

```bash
bit test scopes/ui-foundation/ui
bd build teambit.ui-foundation/ui --reuse-capsules --tasks BundleUI
```

Expected: tests pass; the real build logs `Generating UI bundle at ...` as before, plus no errors from
the new `buildUiVendorDll` call. Then verify by hand:

```bash
find $(bit capsule list --json | node -e "process.stdin.resume();process.stdin.setEncoding('utf8');let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);const c=j.capsules.find(c=>c.includes('ui-foundation'));console.log(c)})")/artifacts/ui-bundle/ui-vendor-dll -type f
```

Expected output: `vendor-entry.js`, `vendor.js`, `vendor-manifest.json` all present and non-empty.

- [ ] **Step 6: Commit**

```bash
git add scopes/ui-foundation/ui/bundle-ui.task.ts scopes/ui-foundation/ui/ui.main.runtime.ts scopes/ui-foundation/ui/ui-vendor-dll.spec.ts
git commit -m "feat(ui): produce the ui vendor dll during BundleUiTask, expose getUiVendorDllPaths"
```

---

### Task 4: E2e test — a real `bit build` ships the artifact, existing pre-bundle untouched

**Files:**

- Create: `e2e/harmony/ui-vendor-dll.e2e.ts`

**Interfaces:**

- Consumes: `Helper` from `@teambit/legacy.e2e-helper` (same as `ui-start.e2e.ts`), no new production
  interfaces — this task only adds a test file.

- [ ] **Step 1: Write the e2e test, following `e2e/harmony/ui-start.e2e.ts`'s exact structure**

```ts
// e2e/harmony/ui-vendor-dll.e2e.ts
import { expect } from 'chai';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { IS_WINDOWS } from '@teambit/legacy.constants';
import { Helper } from '@teambit/legacy.e2e-helper';

(IS_WINDOWS ? describe.skip : describe)('ui vendor dll', function () {
  this.timeout(0);
  let helper: Helper;

  before(() => {
    helper = new Helper();
    helper.scopeHelper.setNewLocalAndRemoteScopes();
    helper.fixtures.populateComponents(1, false);
    helper.command.tagAllWithoutBuild();
  });
  after(() => helper.scopeHelper.destroy());

  it('produces a ui-vendor-dll artifact alongside the existing ui-bundle pre-bundle', () => {
    helper.command.build('teambit.ui-foundation/ui --tasks BundleUI');
    const capsuleOutput = helper.command.runCmd('bit capsule list --json');
    const capsules = JSON.parse(capsuleOutput).capsules as string[];
    const uiCapsule = capsules.find((c: string) => c.includes('ui-foundation'));
    expect(uiCapsule).to.not.be.undefined;

    const artifactDir = join(uiCapsule as string, 'artifacts', 'ui-bundle');
    expect(existsSync(join(artifactDir, '.hash'))).to.equal(true); // existing pre-bundle, untouched
    expect(existsSync(join(artifactDir, 'ui-vendor-dll', 'vendor-manifest.json'))).to.equal(true);
    expect(existsSync(join(artifactDir, 'ui-vendor-dll', 'vendor.js'))).to.equal(true);

    const manifest = JSON.parse(readFileSync(join(artifactDir, 'ui-vendor-dll', 'vendor-manifest.json'), 'utf-8'));
    expect(Object.keys(manifest.content).some((k: string) => k.includes('react'))).to.equal(true);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npm run e2e-test -- --grep "ui vendor dll"` (per this repo's e2e conventions — add `.only` to the
`describe` first per this repo's CLAUDE.md: _"ALWAYS add `.only` to the test before running e2e
tests"_)
Expected: PASS. If it fails, check the exact capsule-listing/`bit capsule list --json` shape against
a real run first — this is the one step in this plan relying on a CLI JSON shape not directly quoted
from source in this session's research; confirm it matches before trusting the assertion.

- [ ] **Step 3: Remove `.only`, commit**

```bash
git add e2e/harmony/ui-vendor-dll.e2e.ts
git commit -m "test(e2e): verify BundleUiTask ships the ui vendor dll artifact"
```

---

### Task 5: Real-world verification against the actual bundle

**Files:** none (verification only, no code changes)

- [ ] **Step 1: Rebuild the pre-bundle cache and the CLI bundle from this branch**

```bash
BIT_BIN=bd bd build "teambit.ui-foundation/ui, teambit.preview/preview" --reuse-capsules --tasks "BundleUI,PreBundlePreview"
BIT_BIN=bd npm run bundle:prebundle-cache:save
rm -rf /tmp/bit-bundle && npm run bundle
cd /tmp/bit-bundle/bundle && npm install
```

- [ ] **Step 2: Confirm the vendor DLL shipped inside the bundle's shim**

```bash
find /tmp/bit-bundle/dist/core-aspects/node_modules/@teambit/ui/artifacts/ui-bundle/ui-vendor-dll -type f
```

Expected: `vendor-entry.js`, `vendor.js`, `vendor-manifest.json`, all present and non-trivial size
(`vendor.js` should be on the order of a few MB given it covers React + the core UI aspect surface —
not the ~16 MB the _existing_ UI pre-bundle is, since it's sharing already-compiled code, not
duplicating it).

- [ ] **Step 3: Confirm the existing pre-bundle path is unaffected**

```bash
cd /tmp/bit-cloud && node /tmp/bit-bundle/bin/bit start
```

(any workspace with `.hash`-eligible workspace/scope roots — reuse `/tmp/bit-cloud` from this
session's earlier work, or a fresh `bit init` workspace) — expected: identical behavior to before this
plan (`shouldServeBundleUi` still finds its match, no rspack runs, `Local: http://localhost:...`).

- [ ] **Step 4: Measure and record the size delta**

```bash
du -sh /tmp/bit-bundle
find /tmp/bit-bundle -type f | wc -l
```

Compare against the 2026-09-06 baseline in
[bundle-plan/18-findings-log.md](18-findings-log.md) (159 MB / 2,812 files). Append a new dated entry
there with the result — follow the same format as the existing 2026-09-06 entries.

- [ ] **Step 5: No commit** (verification only) — but update
      `bundle-plan/14-known-gaps.md` gap 1's entry to note the vendor DLL artifact now ships, linking this
      plan and the design doc, once Task 1-4's changes are committed together in a real PR.
