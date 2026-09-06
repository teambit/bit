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

- Produces: `export function resolveUiVendorDllPackages(coreAspectIds: string[], resolvePackageDir: (packageName: string) => string | undefined): string[]` — pure, dependency-injected for testability (the real production caller, wired in Task 3, passes `AspectLoaderMain.getCoreAspectIds()` and a real `require.resolve`-based resolver).
- Produces: `export const UI_VENDOR_DLL_EXTRA_PACKAGES = ['react', 'react-dom']`

- [ ] **Step 1: Write the failing test**

```ts
// scopes/ui-foundation/ui/ui-vendor-dll.spec.ts
import { expect } from 'chai';
import * as fs from 'fs';
import { getCoreAspectPackageName } from '@teambit/aspect-loader';
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

    // uses the REAL getCoreAspectPackageName (same function production code uses) rather than a
    // hand-rolled duplicate. imported from @teambit/aspect-loader specifically, not @teambit/bit's
    // getAspectPackageName wrapper - see the note below Step 3: importing anything from @teambit/bit
    // into this component balloons its own dependency graph and breaks the existing pre-bundle build.
    const resolvePackageDir = (packageName: string) => {
      const id = Object.keys(fakeDirs).find((aspectId) => getCoreAspectPackageName(aspectId) === packageName);
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
    expect(result).to.include('@teambit/ui'); // getCoreAspectPackageName('teambit.ui-foundation/ui')
    expect(result).to.include('@teambit/preview'); // getCoreAspectPackageName('teambit.preview/preview')
    expect(result).to.not.include('@teambit/scope'); // getCoreAspectPackageName('teambit.scope/scope')
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
import { readdirSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getCoreAspectPackageName } from '@teambit/aspect-loader';

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
    .map((id) => getCoreAspectPackageName(id))
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

**Correction 1 (found during Task 3, real bug, not just a test-fixture simplification as originally
noted here):** every id passed into this function is a core aspect id, so the correct package-name
convention is unambiguously `getCoreAspectPackageName`'s (`@teambit/<name-after-first-slash>`, e.g.
`teambit.ui-foundation/ui` → `@teambit/ui`). The original plan text here used the _non-core_
convention (`getNonCorePackageName`'s `@org/scope.name`, e.g. `@teambit/ui-foundation.ui`) inside
`resolveUiVendorDllPackages` itself, not just as a test simplification - this was wrong for 100% of
real core aspect ids (verified against all 104 ids from `getAllCoreAspectsIds()`), meaning the
production function would resolve to `react`/`react-dom` only and silently ship an empty vendor DLL
for every core aspect.

**Correction 2 (found during Task 3, also a real bug):** import `getCoreAspectPackageName` from
`@teambit/aspect-loader` specifically (as the code above now does), **not** `getAspectPackageName`
from `@teambit/bit` (an earlier version of this fix used the latter). `@teambit/bit` is bit's own
aggregator package, itself depending on nearly every core aspect - importing anything from it inside
`teambit.ui-foundation/ui`'s own source balloons that component's dependency graph to include
`teambit.harmony/envs/bit-cli-app-env`, which trips a pre-existing, unrelated isolator bug (a
seeder-resolution edge case) and breaks the existing, already-working pre-bundle build entirely -
confirmed by bisecting with `git stash` during Task 3. `@teambit/aspect-loader` is a foundational
package `teambit.ui-foundation/ui` already safely depends on today, so importing
`getCoreAspectPackageName` from there directly avoids the problem altogether. Since every id this
function receives is already guaranteed core-only by its caller's contract, there's no need for
`getAspectPackageName`'s `isCoreAspect`/`isLegacyCoreEnv` branching anyway - `getCoreAspectPackageName`
alone is correct and sufficient here.

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

describe('buildUiVendorDll with multiple packages', function () {
  // the realistic case: UI_VENDOR_DLL_EXTRA_PACKAGES alone is already 2 packages. a single-entry
  // build with only one package can hide a manifest/output collision bug that only shows up with
  // 2+ - assert on both packages so this can't regress silently.
  this.timeout(30000);

  let outputPath: string;
  before(async () => {
    outputPath = mkdtempSync(join(tmpdir(), 'ui-vendor-dll-multi-test-'));
    await buildUiVendorDll(outputPath, ['lodash.compact', 'lodash.flatten']);
  });
  after(() => rmSync(outputPath, { recursive: true, force: true }));

  it('produces one vendor.js chunk covering every package, no filename collision', () => {
    const chunkPath = join(outputPath, UI_VENDOR_DLL_DIR, UI_VENDOR_DLL_CHUNK_FILENAME);
    expect(existsSync(chunkPath)).to.equal(true);
  });

  it('manifests each package individually, correctly keyed', () => {
    const manifestPath = join(outputPath, UI_VENDOR_DLL_DIR, UI_VENDOR_DLL_MANIFEST_FILENAME);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    const keys = Object.keys(manifest.content);
    expect(keys.some((k) => k.includes('lodash.compact'))).to.equal(true);
    expect(keys.some((k) => k.includes('lodash.flatten'))).to.equal(true);
    // entryOnly:false manifests every resolved module, not just the entry - real ids only exist
    // here, never fabricated placeholders.
    keys.forEach((k) => {
      expect(manifest.content[k]).to.have.property('id');
      expect(typeof manifest.content[k].id === 'number' || typeof manifest.content[k].id === 'string').to.equal(true);
    });
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

export async function buildUiVendorDll(outputPath: string, packages: string[]): Promise<void> {
  const dllOutputDir = join(outputPath, UI_VENDOR_DLL_DIR);
  const entryFile = join(dllOutputDir, 'vendor-entry.js');
  const entryContents = packages
    .flatMap((pkg) => {
      try {
        const packageDir = join(require.resolve(`${pkg}/package.json`), '..');
        const distDir = join(packageDir, 'dist');
        const runtimeFiles = existsSync(distDir)
          ? readdirSync(distDir).filter((f) => f.endsWith('.ui.runtime.js') || f.endsWith('.preview.runtime.js'))
          : [];
        if (runtimeFiles.length === 0) {
          // a plain package with no runtime-file concept (react, react-dom) - require it directly.
          return [`exports[${JSON.stringify(pkg)}] = require(${JSON.stringify(pkg)});`];
        }
        return runtimeFiles.map(
          (f) => `exports[${JSON.stringify(`${pkg}/dist/${f}`)}] = require(${JSON.stringify(join(distDir, f))});`
        );
      } catch {
        return [`exports[${JSON.stringify(pkg)}] = require(${JSON.stringify(pkg)});`];
      }
    })
    .join('\n');
  if (!existsSync(dllOutputDir)) mkdirSync(dllOutputDir, { recursive: true });
  writeFileSync(entryFile, entryContents);

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
        // `entryOnly` defaults to true, which manifests only the entry file itself (useless here —
        // no downstream consumer literally requires `vendor-entry.js`). false makes DllPlugin
        // manifest every resolved module individually, each keyed by its own resolved path with its
        // real compiled module id - e.g. `.../lodash.compact/index.js` - which is what
        // `DllReferencePlugin` on the consuming side actually needs to intercept a `require('react')`
        // (or any covered package) wherever it's imported from. Verified directly: `entryOnly: true`
        // produces a manifest with exactly one `content` entry (`./entry.js`); `entryOnly: false`
        // produces one entry per package, correctly keyed and id'd.
        entryOnly: false,
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

**Correction 4 (found during Task 3, real bug, a fourth and separate issue - this time in `buildUiVendorDll`
itself, not the Task 3 wiring):** the original entry-generation `require()`d each package's **whole
main entry** (bare `require(pkg)`), not specifically its `.ui.runtime.js`/`.preview.runtime.js` file.
This breaks the DLL's own compilation for some packages, and is also functionally wrong for this
feature's actual purpose. Concrete failure found via a real `bd build`: `@teambit/pnpm` is correctly
matched by the filter (it ships `pnpm.ui.runtime.js`), but its main entry ALSO pulls in
`pnpm.main.runtime.js` → `@teambit/pnpm/dist/lynx.js` → `@pnpm/napi`, a native `.node` binary loader -
unbundlable for any rspack target, browser or otherwise, and unrelated to what this feature actually
needs. Separately, `@teambit/ui` itself is one of the covered packages (it ships `ui.ui.runtime.js`),
so requiring its bare package also pulls this very feature's own code (`BundleUiTask`/`ui-vendor-dll`/
`@rspack/core`) back into the DLL's own compilation. 534 rspack errors resulted, all traced to the
DLL's own entry chunk, none in the main browser/SSR chunks (confirmed unaffected by Correction 3).

This also happens to be the functionally correct fix, not just a workaround: a downstream
`DllReferencePlugin` consumer's generated root (`createRoot`/`generateRoot` in
`components/modules/harmony-root-generator`) imports each aspect via
`aspectDef.runtimePath` - an exact file path (`.../dist/<name>.ui.runtime.js`), never the bare package
specifier. For `DllReferencePlugin` to intercept that exact import, the DLL's own compilation needs to
have reached that exact file too - fixed above by requiring each matched runtime file **directly**
(`require('<packageDir>/dist/<name>.ui.runtime.js')`), never the bare package, falling back to a bare
`require(pkg)` only for packages with no runtime-file concept at all (`react`/`react-dom`).

Known, accepted duplication: this re-derives "find the dist dir, filter for `.ui.runtime.js`/
`.preview.runtime.js`" - the same logic `resolveUiVendorDllPackages` already has - rather than sharing
it, since that function's `resolvePackageDir`/`fsDeps` injection points don't cleanly compose with
`buildUiVendorDll`'s own real-filesystem usage. Flagged as a deferred minor for the final whole-branch
review, not blocking.

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
- Modify: `scopes/pipelines/builder/builder.main.runtime.ts` (one-line constructor-arg change at the
  sole `new BundleUiTask(...)` call site)
- Modify: `scopes/ui-foundation/ui/rspack/rspack.browser.config.ts` (add `@rspack/core` to
  `externals` — see the correction note after Step 3 below)
- Test: `scopes/ui-foundation/ui/ui-vendor-dll.spec.ts` (real-package integration test)

**Interfaces:**

- Consumes: `resolveUiVendorDllPackages`, `buildUiVendorDll`, `UI_VENDOR_DLL_DIR`,
  `UI_VENDOR_DLL_MANIFEST_FILENAME`, `UI_VENDOR_DLL_CHUNK_FILENAME` from Tasks 1-2.
- Consumes: `AspectLoaderMain.getCoreAspectIds(): string[]`
  (`scopes/harmony/aspect-loader/aspect-loader.main.runtime.ts:326` — the same core-aspect id list
  `getAllCoreAspectsIds()` in `@teambit/bit` derives from, just reached via dependency injection
  instead of importing `@teambit/bit`) and `getCoreAspectPackageName` from `@teambit/aspect-loader`
  (both from Tasks 1's corrected code).
  **Do not import anything from `@teambit/bit` into any file in `scopes/ui-foundation/ui/`** -
  `@teambit/bit` is bit's own aggregator package, depending on nearly every core aspect; importing
  from it here balloons `teambit.ui-foundation/ui`'s own dependency graph to include
  `teambit.harmony/envs/bit-cli-app-env`, which trips a pre-existing, unrelated isolator bug and
  breaks the existing pre-bundle build entirely (confirmed via `git stash` bisection during this
  task's original implementation attempt - see the ruling in the SDD ledger if resuming this work).
- `BundleUiTask`'s constructor gains a 3rd parameter, `AspectLoaderMain`, requiring a one-line update
  to its sole instantiation site: `scopes/pipelines/builder/builder.main.runtime.ts:650` -
  `new BundleUiTask(ui, logger)` becomes `new BundleUiTask(ui, logger, aspectLoader)`. `aspectLoader`
  is already an in-scope local variable there (passed into `BuilderMain`'s own constructor a few lines
  above, confirmed at lines 576/642 of that file) - no new plumbing needed beyond the one call site.
- Produces: `UiMain.getUiVendorDllPaths(): { manifestPath: string; chunkPath: string } | undefined` —
  **public** method (unlike the existing `private getBundleUiPath()` it mirrors), since it's the
  contract external consumers (e.g. `bit-cloud`) call.

- [ ] **Step 1: Write the failing test** (this one exercises the real production call path end to end, not fixtures — the closest thing to a unit test this task has, since the real wiring only makes sense against real core aspect packages). Uses a small, explicit, real id list rather than a full `getAllCoreAspectsIds()` call, so this test file never needs to import anything from `@teambit/bit` either (test-file imports may or may not hit the same isolator issue as production imports - not worth the risk to find out when three explicit ids prove the same thing).

```ts
// append to scopes/ui-foundation/ui/ui-vendor-dll.spec.ts
import { getCoreAspectPackageName } from '@teambit/aspect-loader';

describe('resolveUiVendorDllPackages (real core aspects)', () => {
  it('covers teambit.ui-foundation/ui and teambit.preview/preview, and excludes teambit.scope/scope', () => {
    const result = resolveUiVendorDllPackages(
      ['teambit.ui-foundation/ui', 'teambit.preview/preview', 'teambit.scope/scope'],
      (packageName) => {
        try {
          return join(require.resolve(`${packageName}/package.json`), '..');
        } catch {
          return undefined;
        }
      }
    );
    expect(result).to.include(getCoreAspectPackageName('teambit.ui-foundation/ui'));
    expect(result).to.include(getCoreAspectPackageName('teambit.preview/preview'));
    // scope's own aspect has no .ui.runtime/.preview.runtime file of its own (ScopeUIRoot is
    // registered by teambit.scope/scope but its *rendering* code lives in teambit.ui-foundation/ui).
    expect(result).to.not.include(getCoreAspectPackageName('teambit.scope/scope'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bit test scopes/ui-foundation/ui`
Expected: FAIL — depends on `getCoreAspectPackageName` not yet imported in the spec, or (once imports are added) passes trivially since Task 1's implementation already handles this generically. If it already passes at this point, that's fine — it's here to lock in the real-world behavior as a regression guard, not to drive new production code.

- [ ] **Step 3: Wire `BundleUiTask.execute()` to also build the vendor DLL**

```ts
// scopes/ui-foundation/ui/bundle-ui.task.ts — add imports, a constructor param, and one call
import type { AspectLoaderMain } from '@teambit/aspect-loader';
import { resolveUiVendorDllPackages, buildUiVendorDll } from './ui-vendor-dll';

export class BundleUiTask implements BuildTask {
  // ...existing fields...

  constructor(
    private ui: UiMain,
    private logger: Logger,
    private aspectLoader: AspectLoaderMain
  ) {}

  // inside execute(), after `await this.ui.build(undefined, outputPath, { forPreBundle: true });`
  // and before `await this.generateHash(outputPath);`:
  // const vendorPackages = ... (below)
}
```

```ts
// inside execute(), after `await this.ui.build(undefined, outputPath, { forPreBundle: true });`
// and before `await this.generateHash(outputPath);`:
const vendorPackages = resolveUiVendorDllPackages(this.aspectLoader.getCoreAspectIds(), (packageName) => {
  try {
    return join(require.resolve(`${packageName}/package.json`), '..');
  } catch {
    return undefined;
  }
});
await buildUiVendorDll(outputPath, vendorPackages);
```

```ts
// scopes/pipelines/builder/builder.main.runtime.ts:650 — one-line change to the sole instantiation site
// before: builder.registerBuildTasks([new BundleUiTask(ui, logger)]);
builder.registerBuildTasks([new BundleUiTask(ui, logger, aspectLoader)]);
```

Also extend `getArtifactDef()` so the vendor DLL directory is included in the packaged artifact glob
(it already writes under `outputPath`, which is `join(capsule.path, 'artifacts', 'ui-bundle')` — same
root the existing glob covers — **check this first**: the existing glob is
`` `${BundleUiTask.getArtifactDirectory()}/**` `` which already recursively matches everything under
`artifacts/ui-bundle/`, including the new `ui-vendor-dll/` subdirectory. No change needed here — this
is a verification sub-step, not a code change: after Step 5's real build, confirm
`artifacts/ui-bundle/ui-vendor-dll/` files are present in `BuiltTaskResult.artifacts`' matched globs.

**Correction 3 (found during Task 3, real bug, a third and separate issue from Corrections 1-2):**
`scopes/ui-foundation/ui/index.ts` has a real (value, not type-only) barrel export -
`export { BUNDLE_UI_DIR, BundleUiTask } from './bundle-ui.task';` - and `@teambit/react-router`'s
`.ui.runtime.js` (real client/browser code, part of the actual browser entry graph) imports from the
bare `@teambit/ui` package specifier, which resolves to this barrel. Before this task, that was
harmless: `bundle-ui.task.ts` only used browser-tolerable `fs` calls and referenced `UiMain` as a
**type-only** import (erased by TypeScript), so nothing Node-only was actually `require()`-reachable
from the client bundle through it. This task's wiring adds a **real** (value) import chain -
`bundle-ui.task.ts` → `./ui-vendor-dll` → `@rspack/core` (a real, heavy, Node-only package using
`node:vm`/`node:worker_threads`/`node:zlib` internally) - which now genuinely is reachable from the
client entry graph via that same barrel, and rspack's own client-side pre-bundle compilation
(`createRspackBrowserConfig` in `scopes/ui-foundation/ui/rspack/rspack.browser.config.ts`) fails
trying to bundle it for the browser (confirmed via a real `bd build`: 27 errors, `node:vm`/
`node:worker_threads`/`node:zlib`/`watchpack`'s `constants`/`os`, all inside `@rspack/core`'s own
bundling machinery - not anything `ui-vendor-dll.ts`'s other dependencies, like `fs-extra`, need).

This is the same problem class `scopes/harmony/modules/cli-bundler/plugins/stub-dev-only-plugin.ts`
already exists to solve for a _different_ bundler (esbuild, for the separate `BundleCliAppTask`
feature) - but that plugin is esbuild-specific and doesn't apply to rspack's own config here. The
idiomatic fix for _this_ bundler is rspack's own `externals` option (confirmed present in the
installed `@rspack/core@2.1.10`'s own type defs: `externals?: Externals`,
`ExternalItemObjectValue = Record<string, string | string[]>`, and the classic `'commonjs <module>'`
string form is a valid value). Since `resolveUiVendorDllPackages`/`buildUiVendorDll` are only ever
_called_ by the Node-side `BundleUiTask.execute()` - never by client-rendered UI code - a
`require('@rspack/core')` left in the shipped client bundle by `externals` is genuinely dead code
there, never executed in a browser.

**Fix - add to `scopes/ui-foundation/ui/rspack/rspack.browser.config.ts`'s returned config object**
(confirmed by Task 3's implementer: 162 lines, no `externals` key currently):

```ts
externals: {
  '@rspack/core': 'commonjs @rspack/core',
},
```

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

### Task 3b: give the vendor DLL's own compilation the real UI-bundling machinery

**Why this task exists:** discovered during Task 3's own real-build verification, not anticipated in
the original design. `buildUiVendorDll`'s rspack config was bare-bones (no CSS/SCSS loader, no
JSX/TSX transform, no `resolve.fallback`, no alias table). The real production package list
(~30 core aspects with `.ui.runtime.js`/`.preview.runtime.js` files) pulls in the actual UI component
library bit's pre-bundle already handles - design-system components, `@dagrejs/dagre` (graph
rendering), `react-syntax-highlighter`, `@apollo/client`, etc. A real `bd build` with the full
production list produced 600 rspack errors, none related to Corrections 1-4 (all already independently
verified fixed) - this is a distinct, larger gap: the DLL's compilation isn't equipped to bundle real
UI code yet.

**Files:**

- Modify: `scopes/ui-foundation/ui/ui-vendor-dll.ts`

**Interfaces:**

- Consumes: `moduleFileExtensions`, `resolveAlias`, `resolveFallback`, `cssParser`, `mjsRule`,
  `swcRule`, `sourceMapRule`, `fontRule`, `styleRules`, `shouldUseSourceMap`, `imageInlineSizeLimit`
  from `./rspack/rspack.common` (confirmed already exported there, already safely imported by the
  existing `rspack.browser.config.ts` - same directory, no new isolator-graph risk, since that file's
  imports are already proven safe by the existing pre-bundle build working today).
- Consumes: `postCssConfig` from `./rspack/postcss.config`, `fallbacksProvidePluginConfig` from
  `@teambit/webpack` (also already imported by `rspack.browser.config.ts` today - same safety
  argument).
- Does **not** reuse `createRspackBrowserConfig` wholesale - that function's `plugins` array includes
  `HtmlRspackPlugin` (one per entry, generates an HTML document - not wanted for a DLL, which isn't a
  page) and `WorkboxWebpackPlugin.GenerateSW` (a service-worker generator, irrelevant here), and its
  `optimization.splitChunks`/`runtimeChunk` are tuned for the multi-root workspace/scope sharing
  scenario, not a single consolidated DLL chunk. Reuse only the `resolve`/`module` pieces (the
  genuinely expensive, real UI-bundling machinery) plus the two plugins already proven necessary for
  this class of code (`ProvidePlugin` for `process`, `IgnorePlugin` for moment locales) - keep
  `output`/`optimization`/the DLL-specific plugins as `buildUiVendorDll`'s own, as they already are.

- [ ] **Step 1: Replace `buildUiVendorDll`'s compiler config with one that reuses the real bundling machinery**

```ts
// scopes/ui-foundation/ui/ui-vendor-dll.ts — replace the existing bare `rspack({...})` call
import { rspack } from '@rspack/core';
import { fallbacksProvidePluginConfig } from '@teambit/webpack';
import {
  moduleFileExtensions,
  shouldUseSourceMap,
  imageInlineSizeLimit,
  resolveAlias,
  resolveFallback,
  cssParser,
  mjsRule,
  swcRule,
  sourceMapRule,
  fontRule,
  styleRules,
} from './rspack/rspack.common';
import { postCssConfig } from './rspack/postcss.config';

// ...inside buildUiVendorDll, after generating entryFile/entryContents as already implemented:
const compiler = rspack({
  mode: 'production',
  entry: entryFile,
  output: {
    path: dllOutputDir,
    filename: UI_VENDOR_DLL_CHUNK_FILENAME,
    library: { name: UI_VENDOR_DLL_GLOBAL_NAME, type: 'window' },
  },
  resolve: {
    extensions: moduleFileExtensions.map((ext) => `.${ext}`),
    alias: resolveAlias({ profile: false }),
    fallback: resolveFallback,
  },
  module: {
    parser: cssParser,
    rules: [
      mjsRule(),
      swcRule(),
      sourceMapRule(),
      {
        test: [/\.bmp$/, /\.gif$/, /\.jpe?g$/, /\.png$/, /\.svg$/],
        type: 'asset',
        parser: { dataUrlCondition: { maxSize: imageInlineSizeLimit } },
      },
      fontRule(),
      ...styleRules({ sourceMap: shouldUseSourceMap, postCssConfig, resolveUrlLoader: true }),
      {
        exclude: [/\.(cjs|js|mjs|jsx|ts|tsx)$/, /\.html$/, /\.json$/, /\.css$/, /\.s[ac]ss$/, /\.less$/],
        type: 'asset/resource',
      },
    ],
  },
  plugins: [
    new rspack.ProvidePlugin({ process: fallbacksProvidePluginConfig.process }),
    new rspack.IgnorePlugin({ resourceRegExp: /^\.\/locale$/, contextRegExp: /moment$/ }),
    new rspack.DllPlugin({
      path: join(dllOutputDir, UI_VENDOR_DLL_MANIFEST_FILENAME),
      name: UI_VENDOR_DLL_GLOBAL_NAME,
      type: 'window',
      entryOnly: false,
    }),
  ],
  externals: {
    '@rspack/core': 'commonjs @rspack/core',
    '@teambit/aspect-loader': 'commonjs @teambit/aspect-loader',
  },
});
```

(the `compiler.run`/`compiler.close` Promise-wrapping already implemented stays unchanged - only the
`rspack({...})` config object itself is replaced)

- [ ] **Step 2: Re-run the full real-build verification with the actual production package list**

```bash
bd compile teambit.ui-foundation/ui
bd build teambit.ui-foundation/ui --tasks BundleUI   # fresh capsule, no --reuse-capsules, per the
                                                       # implementer's own finding that a stale capsule
                                                       # can mask real errors
```

Expected: 0 errors (down from 600). If errors remain, read them carefully — they'll point at whichever
specific real-world package/loader combination still isn't covered by the reused config; do not
assume the whole approach is wrong from a handful of remaining errors, diagnose each one specifically
(this is `superpowers:systematic-debugging` territory, not a reason to abandon this design).

- [ ] **Step 3: Confirm the artifact is real**

```bash
find <ui-foundation/ui capsule path>/artifacts/ui-bundle/ui-vendor-dll -type f
```

Expected: `vendor-entry.js`, `vendor.js`, `vendor-manifest.json`, all present, `vendor.js` non-trivial
size (larger than the earlier tiny-fixture tests, since it now covers real UI component code).

- [ ] **Step 4: Run the full unit suite one more time**

```bash
bit test scopes/ui-foundation/ui
```

Expected: all tests still pass (this step only changes internal compiler config, not any test-facing
interface).

- [ ] **Step 5: Commit**

```bash
git add scopes/ui-foundation/ui/ui-vendor-dll.ts
git commit -m "fix(ui-vendor-dll): reuse the real ui-bundling rspack config for the vendor DLL"
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
