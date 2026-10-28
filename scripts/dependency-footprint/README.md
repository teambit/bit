# Dependency footprint

Installing a single aspect package, e.g. `npm install @teambit/builder`, currently brings in about 2,000 packages, because aspects depend on each other and each one carries its UI, CLI and legacy dependencies. `footprint.js` measures this locally, so a change that reduces it can show the before/after numbers without publishing.

## How it works

- The dependencies of each workspace component come from Bit's own dependency model (`DependencyList.toDependenciesManifest()`), which is what the published `package.json` is generated from. The script loads Bit in-process from `node_modules/@teambit/bit`, so it reflects the current source.
- Third-party packages, and `@teambit` packages that aren't in this workspace, are resolved through `pnpm-lock.yaml`.
- Dev dependencies and optional peers are not counted. Other peers are, because npm 7+ and pnpm install them.

Each target is measured in two modes:

| Mode           | Meaning                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------- |
| `as-is`        | what consumers install today                                                                  |
| `host-aspects` | core aspects are provided by the host, as if they were optional peers, so they aren't counted |

The counts are close to a real install but not exact: the lockfile was resolved for this repo, while a fresh install resolves against the registry. For `@teambit/builder`, the script reports 2,083 packages, and a real `npm install` brought in 2,030.

## Usage

```bash
# every set in sets.json
node scripts/dependency-footprint/footprint.js

# specific packages or sets
node scripts/dependency-footprint/footprint.js @teambit/component env-facing

# compare with the committed baseline
node scripts/dependency-footprint/footprint.js --baseline=scripts/dependency-footprint/baseline.json
```

| Option              | Description                                                        |
| ------------------- | ------------------------------------------------------------------ |
| `--top=<n>`         | top direct dependencies to list per target (default 15, 0 to hide) |
| `--list`            | print every package in the closure                                 |
| `--json=<path>`     | write the full results as JSON                                     |
| `--baseline=<path>` | compare the totals with a baseline file                            |
| `--update-baseline` | write the totals of the measured targets to `baseline.json`        |

For each direct dependency, the output shows its closure (everything it brings in) and its exclusive part (what would no longer be installed if that dependency were dropped). An exclusive count of 0 with a large closure means other dependencies bring in the same packages, so the dependency only stops costing anything once those are fixed too.

## Sets

`sets.json` defines named groups of packages:

- `builder`: `@teambit/builder` alone.
- `env-facing`: the aspects that envs and their tasks import (builder, envs, component, compiler, tester, pkg, generator, …). This is what an env would install if aspects were installed as real packages instead of being linked from Bit.

When a change reduces a number, run with `--update-baseline` and commit `baseline.json` with the change.
