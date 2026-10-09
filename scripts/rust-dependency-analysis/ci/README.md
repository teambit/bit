# Isolated dependency-analysis CI tools

This directory is a standalone locked npm installation for real source extraction, resolution, traversal, and helper-pool validation. It does not install the Bit monorepo or mutate its package manifest or lockfile. It has 19 pinned direct dependencies and 105 installed npm packages.

Reproduce in a separate temporary directory:

```sh
sandbox_dir=$(mktemp -d)
cp scripts/rust-dependency-analysis/ci/package.json scripts/rust-dependency-analysis/ci/package-lock.json "$sandbox_dir/"
npm ci --prefix "$sandbox_dir" --ignore-scripts --legacy-peer-deps --no-audit --no-fund
node scripts/rust-dependency-analysis/ci/prepare.cjs "$sandbox_dir"
(cd native && cargo build --locked --workspace)
BIT_LEGACY_ROOT="$sandbox_dir" BIT_TEST_NATIVE_SCANNER="$PWD/native/target/debug/bit-dependency-scanner" \
node --test scripts/rust-dependency-analysis/compare.test.cjs scripts/rust-dependency-analysis/integration.test.cjs scripts/rust-dependency-analysis/command-scope.test.cjs
BIT_LEGACY_ROOT="$sandbox_dir" \
node scripts/rust-dependency-analysis/compare.cjs "$PWD/native/target/debug/bit-dependency-scanner"
```

The Linux workflow builds the actual checked-out Rust source and requires a native helper: CI cannot silently skip the real-backend cases. Local reproduction passed all 33 reference/integration/pool tests and 120 differential fixture comparisons with a freshly built merged helper. The unchanged transport matrix separately covers Linux, macOS, and Windows.

`prepare.cjs` exposes the actual checkout `scopes/dependencies/dependency-resolver/detector-hook.ts` through a narrow `@teambit/dependency-resolver` package boundary. It does not implement or stub a detector. Both precinct and filing-cabinet use that same real class, and the test runners supply TypeScript compilation before it is loaded. Actual detective packages and actual lookup/resolver packages come from the locked installation. Tests still run the checkout's precinct, dependency-tree, filing-cabinet, generateTree, scope, and session modules.

The facade intentionally exports only the implementation needed by this pipeline. It refuses to overwrite an installed dependency-resolver package. It is generated after `npm ci`; rerunning `npm ci` removes it, then preparation recreates it. Use `BIT_SCANNER_INTEGRATION_ROOT` during preparation and test execution when targeting another source checkout.

`--legacy-peer-deps` is required because the published TypeScript detective declares an exact TypeScript 5.5.3 peer while the existing test compiler is 5.9.2. The used PostCSS peer is installed explicitly. The lock fixes all transitive package versions and integrity values. `overrides` pin the parsers the legacy reference actually runs to the versions Bit resolves: `@typescript-eslint/typescript-estree` 8.39.0 (pinned in `workspace.jsonc`) and `@babel/parser` 7.29.8. Without them the detectives' semver ranges float to newer parsers, and CI parity would be measured against a reference Bit does not ship. Update both when Bit's versions change. Installation scripts and automatic unused peer installation are disabled; runtime behavior is validated by the real differential and pipeline checks rather than assuming the broader peer graph is available.

## Remaining full-dependency boundary

The three tests in `component-load-scope.test.cjs` require the actual legacy component loader and dependency-aspect provider graph. They remain local full-dependency validation, separate from the twelve helper-ownership cases now automated in CI. With an installed Bit checkout, run:

```sh
BIT_LEGACY_ROOT=/path/to/installed/bit BIT_TEST_NATIVE_SCANNER=/absolute/path/to/scanner \
node --test scripts/rust-dependency-analysis/component-load-scope.test.cjs
```

The small sandbox does not contain `p-map-series`, `@teambit/component-id`, the legacy consumer/component classes, object model, workspace caches, logger/loader modules, or the Harmony aspect/provider graph. Those are direct runtime imports of the actual loader/provider; the checkout's root manifest installs only lint tooling and does not declare this linked core graph. The slim package facade also does not expose `DependencyResolverAspect` or the full resolver runtime needed by that provider. These cases are not mocked or converted to passing skips: invoking the full-dependency suite with this sandbox fails at the missing imports. Recreating all core aliases or a compiled Bit workspace is a separate CI bootstrap task.
