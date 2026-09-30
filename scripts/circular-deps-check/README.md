# Circular dependencies check

`workspace.jsonc` ignores the `CircularDependencies` issue because many aspects are still in cycles. Until those are removed, this check makes sure no new ones are added.

## The CI check

`ci-check.sh` runs `check-cycles.js` on every PR (CircleCI job `check_circular_dependencies`). It builds the component graph with `bit graph --json`, which is the same graph `bit deps circular` uses, finds every group of components that depend on each other in a cycle, and compares the result with `cycles-baseline.json`.

| Change                                          | Result                              |
| ----------------------------------------------- | ----------------------------------- |
| A component joins any cycle                     | fails                               |
| A new dependency between two members of a cycle | fails                               |
| A component leaves every cycle                  | fails until the baseline is lowered |
| A dependency inside a cycle is removed          | fails until the baseline is lowered |

When it fails, the output lists the offending components and dependencies. Usually the fix is to drop the new import or move the imported code into a component both sides can depend on. If a new edge is intentional, or you removed cycles, update the baseline and commit it with your change:

```bash
node scripts/circular-deps-check/check-cycles.js --update
```

Set `BIT_BIN` to use a different bit binary, or pass `--graph <file>` to read saved `bit graph --json` output.

## How the graph is built

- Bit records every import as a dependency, including `import type`, test files and UI files.
- For components that aren't core aspects, imports of core-aspect packages are dropped (`processCoreAspects` in `auto-detect-deps.ts`), because the bit binary provides them. Core aspects keep all of their dependencies.

## Analysis tooling

`analysis/run.sh [bit-binary]` parses every source file and classifies each cross-component import: type-only or runtime, main, UI, test or docs, and whether it follows the Harmony DI direction (`static dependencies`). It writes its results to `analysis/out/`, including a minimal set of import edges whose removal makes the graph acyclic (`cuts.txt`), grouped into phases. `analysis/path.js a/b:c/d` prints the shortest dependency path in each direction between two components.

## Findings (September 2026)

80 components are in 4 cycle groups: 60 aspects, 16 legacy components, `cli ↔ logger` and `lanes ↔ merge-lanes`.

- Type-only imports aren't the main cause. Ignoring all of them shrinks the aspect group from 60 to 50. Type and runtime imports each close the loop for the other.
- DI is acyclic for each runtime (main, UI, preview), but a component ships all of its runtimes in one package, and the union has cycles. For example, `component-compare`'s main runtime depends on `tester` while `tester`'s UI runtime registers into `component-compare`.
- Removing 73 import edges makes the graph acyclic. The main patterns:
  - `envs/environment.ts` imports types from 13 aspects that depend on `envs` (`Compiler`, `Tester`, `Bundler`, …).
  - `UIRuntime`, `PreviewRuntime` and `MainRuntime` live in the heavy `ui`, `preview` and `cli` aspects. The whole `cli ↔ logger` cycle is `logger` importing `MainRuntime`.
  - `component` imports types and UI values from aspects above it.
  - `generator` fetches aspects with `harmony.get()` instead of declaring them as DI dependencies.
  - Utilities live in the wrong place (webpack `fallbacks`, `getAspectDirFromBvm`, `incrementPathRecursively`).
  - The legacy group is held together mostly by shared error classes.
- Prefer moving shared types and utilities to a lower component, with re-exports at the old location, over replacing types with `any`.
