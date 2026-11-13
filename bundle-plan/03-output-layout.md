# 3. Output layout

[← back to bundle-plan index](../bundle-plan.md)

```
/tmp/bit-bundle/                       ← the distribution
├── bit-app                            ← the SEA executable (only with --sea)
├── node_modules/@teambit/             ← 108 generated SHIM packages (2.5 MB)
│   ├── bit/
│   │   ├── package.json               ← real version → `bit --version`; `bin` field
│   │   ├── bin/bit                    ← launcher: enableCompileCache() + runBitApp()
│   │   └── dist/{index.js, esm.mjs, bit.aspect.js, bit.main.runtime.js}
│   ├── workspace/  … one per core aspect …
│   └── harmony/ , legacy/             ← non-aspect packages users import
└── bundle/
    ├── bit.app.js                     ← THE bundle, 67 MB, one CJS file
    ├── bit.app.sea.js + .blob         ← SEA variant + its blob (only with --sea)
    ├── package.json + .npmrc          ← the externals; `npm install` runs HERE
    ├── node_modules/                  ← installed externals (161 MB)
    ├── workers/jest.worker.js         ← self-contained child-process entry
    ├── sea-config.json
    ├── metafile.json                  ← local/CI builds only (2026-08-18) - NOT written for `inPlace`
    │                                     builds, i.e. not shipped in the published package (§14)
    ├── workspace-template.jsonc, agents-template*.md, bit-*-template.md
    └── lib.*.d.ts                     ← typescript lib files (102 of them)
```

### Why there are two `node_modules`

They hold two different kinds of thing, and mixing them is unsafe:

- **`<out>/node_modules/@teambit/*` — generated, 2.5 MB.** Not dependencies at all: 108 two-line
  shim packages that re-export slices of `bit.app.js`. They are the _public API surface_ — what a
  user's `bit install` symlinks into their workspace, and what `getAspectDir` / `getAspectDef`
  discover.
- **`<out>/bundle/node_modules` — installed, 161 MB.** Real npm packages, the output of
  `npm install` against `bundle/package.json`.

They are kept apart because a package manager run in a directory prunes whatever its `package.json`
doesn't reference — a single root tree would mean `npm install` deleting the generated shims. Node
resolves both from `bit.app.js` anyway: `bundle/node_modules` first, then one level up.

**This split is a property of the prototype, not of the design.** A published package's own files are
never pruned, so the shipping layout has one `node_modules` — the consumer's — with the externals as
ordinary `dependencies` of `@teambit/bit`. See §9b.
