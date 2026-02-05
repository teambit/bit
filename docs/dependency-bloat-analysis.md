# Dependency Bloat Analysis

## Problem Statement

Bit workspaces suffer from severe dependency bloat in `node_modules`. A workspace with ~142 components can produce ~15,000 lockfile entries instead of ~2,700 unique packages — a **5.6x bloat factor**. This manifests as slow `bit install`, excessive disk usage, and long CI times.

## Root Cause

There are **two distinct, multiplicative problems**:

### Problem 1: Version Drift

Components snap at different times, each freezing its own dependency snapshot. Import 50 components snapped over 6 months → 22 different versions of the same package (e.g., `@teambit/dot-cloud.bit-cloud`), each frozen at different points in time.

This is a Bit-level problem. pnpm is just doing what Bit tells it.

### Problem 2: Peer Permutation Explosion

pnpm creates a separate `.pnpm` entry for every unique combination of peer dependency versions. So 22 versions of a package × 8 peer combos = 160 entries for a single package.

The key multi-version peers causing combinatorial explosion:

- `@types/react` (e.g., 17.0.2, 17.0.62, 17.0.87, 18.2.23, 18.3.27)
- `@babel/core` (e.g., 7.11.6, 7.12.9, 7.19.6, 7.28.6)
- `@testing-library/react` (e.g., 11.2.2, 12.1.5, 13.4.0)

Each peer with multiple versions acts as a **multiplicative factor** on every package that declares it as a peer.

## Why This Is Bit-Specific

Traditional monorepos have ONE lockfile that aligns everything. In Bit, each component carries its own dependency snapshot frozen at snap/tag time. This architectural difference means version drift is structural, not incidental.

## The `0.0.x` Semver Trap

All `@teambit/*` packages use `0.0.x` versioning because:

1. **`DEFAULT_BIT_VERSION = '0.0.1'`** — every new component starts here
2. **`DEFAULT_BIT_RELEASE_TYPE = 'patch'`** — every `bit tag` bumps patch
3. Nobody has ever run `bit tag --minor` on @teambit packages → versions go `0.0.1 → 0.0.2 → ... → 0.0.184`, forever in `0.0.x`

This creates a semver trap: `^0.0.68` means `>=0.0.68 <0.0.69` — it's **mathematically exact**. So even if you enable caret ranges, they'd be useless for dedup because `^0.0.68` and `^0.0.184` have zero overlap.

For third-party packages (React `^17.0.2`, babel `^7.19.6`), ranges would help since they're `>=1.0.0`.

## On "Making Aspects Peers"

Making aspects peers would actually **make things worse**:

- It doesn't reduce the number of versions — just moves them to the peer column
- As a peer, each aspect version becomes a new permutation factor for everything else
- With dozens of fast-moving aspects, you'd create an even larger combinatorial matrix

Aspects-as-peers only makes sense for truly shared singletons (like React). Not for `@teambit/*` packages that bump weekly.

## Recommended Fix Layers

### Layer 1: Auto-Override Peer Versions at Install Time (Biggest Bang)

Analyze manifests, detect multi-version peers, auto-generate pnpm overrides to collapse them. Same-major-version alignment by default. Manual testing showed a **50% reduction** just from this.

### Layer 2: Remove Packages That Shouldn't Be Peers (Quick Wins)

- PR #10186 for `@types/*` (should be dev, not peer)
- Verify `@testing-library/react` is dev not peer
- Audit `@apollo/client` and `subscriptions-transport-ws`
- Each peer removed is a **multiplicative** win

### Layer 3: Version Coalescing for `@teambit/*` Packages (Root Cause)

Before pnpm sees the manifests, detect `@teambit/*` packages with many versions and override all to the latest. Reduces 22 versions → 1.

### Layer 4: Fix the Versioning Scheme (Fundamental Fix)

Three things need to change:

**4a. One-time version bump** — `bit tag --minor` on all @teambit components → versions become `0.1.0`, `0.1.1`, etc. Now `^0.1.0 = >=0.1.0 <0.2.0` — ranges work!

**4b. Enable `componentRangePrefix: '^'`** — Config already exists (`dependency-resolver-workspace-config.ts:225-233`), nobody uses it. This stores `versionRange` during snap/tag.

**4c. Fix a code gap** — `toManifest()` in `base-dependency.ts` and `component-dependency.ts` ignores `versionRange` for workspace installations. It always returns the exact version. Capsules and published package.json already use `versionRange` (via `isolator.main.runtime.ts`), but the workspace manifest does not. This needs a one-line fix: `const version = this.versionRange || this.version`.

With all three: pnpm sees `^0.1.5` from one component and `^0.1.100` from another → resolves both to latest `0.1.x` → 22 versions collapse to 1.

## Diagnostic Tool

Use `bit deps diagnose` to analyze the current workspace dependency tree and identify:

- Packages with the most version spread
- Peer dependencies causing permutation explosion
- Suggested overrides to reduce bloat
- Estimated impact of applying overrides

See `bit deps diagnose --help` for usage.

## Key Code Locations

| Area                          | File                                              |
| ----------------------------- | ------------------------------------------------- |
| Component range prefix config | `dependency-resolver-workspace-config.ts:225-233` |
| `toManifest()` (workspace)    | `base-dependency.ts:90-97`                        |
| `toManifest()` (component)    | `component-dependency.ts:75-82`                   |
| Capsule versionRange usage    | `isolator.main.runtime.ts:1216,1325`              |
| Default version               | `DEFAULT_BIT_VERSION = '0.0.1'`                   |
| Default release type          | `DEFAULT_BIT_RELEASE_TYPE = 'patch'`              |
