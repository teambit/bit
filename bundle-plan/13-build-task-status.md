# 9e. The build task — status as of 2026-08-10

[← back to bundle-plan index](../bundle-plan.md)

`BundleCliAppTask` is wired to `@teambit/bit` via `teambit.harmony/envs/bit-cli-app-env` and **runs
green**: `bd build teambit.harmony/bit --reuse-capsules --tasks BundleCliApp` exits 0 in ~5 s and
produces a 69 MB bundle, 107 shims, 107 locators, 105 runtime assets and 1722 `.d.ts` files.

### What the first runs exposed

The bundler located every package by path-joining onto `packagesRoot`. That holds for this repo and
is wrong everywhere else: **capsules hoist most dependencies to a shared capsule root**, and pnpm
puts a package's own dependencies inside its store slot. The first real run therefore found 71 of 106
core aspects, 70 of them "without a main runtime", copied 0 of 4 asset patterns and resolved 3 of 11
external versions — **all silently**, because a missing main runtime is legitimate for a UI-only
aspect and a missing asset only surfaces at runtime.

Fixed by `resolve-package-dir.ts`, which walks the `node_modules` chain the way node does and returns
the **realpath** (returning the symlink instead broke pnpm resolution for transitive deps). Alongside
it: `findRuntimeAndAspectFiles` now looks in `dist/` and prefers it (a bare `@teambit/x` resolves to
`dist/index.js`, so a deep import to the top-level `.ts` would put the same aspect in the bundle
twice — §6.2 again); specifiers keep the extension under `dist/` and drop it at the top level, since
the two take different branches of the `exports` map and neither extension-probes; and the dist
resolver keys off `componentId` rather than `_bit_local`, which a capsule's copies do not carry.

### Freshness — checked, and correct

Most aspects resolve to _published_ packages in the capsule-root store rather than to the workspace's
just-compiled components, which looked alarming. The rule is right: **new or modified components are
built into sibling capsules and linked fresh; unmodified ones install from the registry**, where the
published package _is_ the current code. Confirmed by counting — the capsule root held 53 capsules
against a `bit status` of 2 new + 51 modified — and it only gets more correct at tag time.

### Types

Shims now carry the aspect's `.d.ts` tree, copied verbatim rather than regenerated so that type
identity is preserved across packages: declarations re-export their siblings and other `@teambit/*`
packages, and those resolve through the sibling shims. Verified in an external workspace under
`noImplicitAny`, with a negative control proving the types are enforced rather than silently `any` —
`ws.path` resolves as `string`, `cm.toArray()` as `[Component, string][]` with `Component` coming
from a sibling shim. Capsules always carry declarations; this repo needs
`bit compile --generate-types` (~11 min).

### Still open on the task

- **4 externals are undeclared dependencies of `@teambit/bit`** — `webpack`, `@babel/core`,
  `bufferutil`, `utf-8-validate` — so their versions cannot be resolved and they are dropped from the
  generated package.json. They are marked external, i.e. _not in the bundle_, so this is a runtime
  `Cannot find module` waiting to happen. The bundler now warns loudly. Fix is `bit deps set`, and it
  belongs with §9b. ~~`@teambit/mcp.mcp-config-writer` is likewise undeclared, so its runtime template
  asset is not copied.~~ No longer applicable (2026-08-11): its templates are now inlined into the
  bundle at build time instead of copied as a runtime asset — see §18.
- **`CoreExporterTask` still writes the same locators** for a non-bundled build; superseding it for
  `@teambit/bit` is not done.
- **`main` still points at `dist/index.js`**, the compiled component source, so `require('@teambit/bit')`
  loads bit's own code _outside_ the bundle while the same code is also inside it. The CLI path is
  unaffected (`bin/bit` requires the bundle directly) and `linkCoreAspect` goes through the locator to
  the shim, so nothing observed is broken — but pointing `main` at the `bit` shim would remove a
  duplicate module instance. Deliberate decision, not yet taken.

### The published shape is now built in place (§9b) — done

`outDir` is the capsule itself rather than `<capsule>/app-bundle`, so the build emits the §9b layout
directly instead of a prototype dir something would later have to lift out:

```
<capsule>/                              ← @teambit/bit, exactly as published
├── package.json                        ← 7 externals only, + bin
├── bin/bit
└── dist/
    ├── <aspect-name>/index.js          ← 107 locators
    └── core-aspects/
        ├── bundle/bit.app.js
        └── node_modules/@teambit/…     ← 107 shims, with their .d.ts
```

`inPlace` also stops `cleanOutDir` running (it would delete the capsule's own sources and dist) and
skips the `.npmrc`, which exists only for the prototype's local `npm install`.

**The dependency surface is pruned to the externals alone — 168 declarations replaced by 7.** This is
not tidiness: those ~160 packages are _inside_ `bit.app.js`, so leaving them declared would make a
consumer's install re-download the very 1.2 GB tree the bundle replaces, and would put a second copy
of every core aspect next to the shims — where `@teambit/workspace` could resolve to a published
package instead of the bundle slice. `devDependencies`, `peerDependencies`, `optionalDependencies`
and `peerDependenciesMeta` are dropped too; identity fields are untouched.

Verified: the capsule's sources and `dist` survive the run, and the built package runs `--version`,
`init`, `status` and `list` from a fresh workspace.

One trap this surfaced: in place, `@teambit/bit`'s source dir _is_ the capsule, whose `dist/` now
contains the generated shims — so the `.d.ts` copy globbed its own output and put all 106 shims'
declarations inside the `bit` shim (1158 files instead of 18). `dist/core-aspects` is now excluded.

- **The task's output is not yet consumed by the e2e runners**, which still test the hand-built
  `/tmp/bit-bundle`. Pointing them at the task's artefact is what proves the two paths cannot drift.
