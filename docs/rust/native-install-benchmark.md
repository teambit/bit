# Native `bit install` benchmark

This compares native and TypeScript `bit install` with the same compiled CLI. The two modes differ only in `BIT_NATIVE_INSTALL=off`. Raw results stay outside the checkout (see [README](README.md#benchmark-artifacts)). Reproduce with:

```sh
node scripts/rust-install/benchmark.cjs --cli <checkout>/bin/bit.js \
  --addon <path>/bit-workspace.node --out <dir outside the checkout> --rounds 5
```

## Method

The script generates each workspace once, under `--out`:

- **small**: 5 components on the default Node env, and 3 npm packages in the workspace policy.
- **medium**: 50 components. Each one imports up to two earlier components, and every fifth one imports `is-odd`.

Each workspace is tagged and exported to a local bare `file://` remote. The script then copies it into a clone-like template that keeps sources, `workspace.jsonc` and `.bitmap`, but has an empty scope and no `node_modules` or lockfile.

Each round runs four scenarios per mode on a fresh copy of the template:

| Scenario | What it runs |
| --- | --- |
| cold | `bit install`, which imports every exported component and installs from the warm pnpm store |
| repeat | `bit install` again, with nothing changed |
| add | `bit install is-number` |
| cold `--skip-compile --skip-write-config-files` | A fresh copy, to separate out the JavaScript `afterInstall` step: Harmony load, compile and config files |

Rounds alternate which mode runs first. The first round is a warm-up and is excluded, leaving five measured rounds. The pnpm store and the OS file cache are warm after the warm-up, so "cold" means a cold workspace, not a cold machine.

Wall time comes from the parent process. CPU (user plus sys) and peak RSS come from `/usr/bin/time -l`. CPU includes all children, and RSS is the largest resident set in the process tree. The tables show medians, with min–max for wall time.

"Output matched" compares the normalized console output of every measured round, TypeScript against native. Normalization removes:

- timings
- pnpm's throttled progress redraws
- transient status lines whose presence depends on what is loaded: the importer's per-phase status lines, Harmony's `loading N component(s)` (a skipped `afterInstall` loads no components), and the command runner's `running command "install"...`.

## Machine

- Apple M1 Max (10 cores), 64 GB, macOS 27.0.1
- Node 22.22.0
- CLI compiled from `rust-install-afterinstall-restore` (the repeat-install skip with content-identified outputs)
- The addon was built with `cargo build --release -p bit-workspace-napi` (fat LTO, `codegen-units = 1`) and `strip = "none"`. The stripped release dylib does not load on this macOS (`mis-aligned LINKEDIT string pool`), because rustc's `rust-objcopy` strip step misaligns it.

## Results

| Workspace | Scenario | TS wall ms (min–max) | Native wall ms (min–max) | Wall ratio | TS CPU ms | Native CPU ms | CPU ratio | TS peak RSS MB | Native peak RSS MB | RSS ratio | Output matched |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| small | cold | 3030 (3015–3057) | 2486 (2382–2717) | 0.820 | 2100 | 1780 | 0.848 | 319 | 315 | 0.985 | yes |
| small | repeat | 2211 (2189–2481) | 964 (944–999) | 0.436 | 1740 | 750 | 0.431 | 307 | 159 | 0.517 | yes |
| small | add | 2316 (2308–2369) | 1716 (1687–1890) | 0.741 | 1770 | 1510 | 0.853 | 308 | 304 | 0.987 | yes |
| small | cold, no compile/config | 2702 (2617–3219) | 1615 (1548–2015) | 0.598 | 1740 | 930 | 0.534 | 265 | 162 | 0.610 | yes |
| medium | cold | 5137 (4885–5428) | 4790 (4700–4854) | 0.932 | 4670 | 3860 | 0.827 | 392 | 355 | 0.905 | yes |
| medium | repeat | 3365 (3331–3527) | 1244 (1215–1263) | 0.370 | 3650 | 1240 | 0.340 | 355 | 174 | 0.490 | yes |
| medium | add | 3472 (3447–3570) | 2798 (2777–2859) | 0.806 | 3670 | 3340 | 0.910 | 358 | 350 | 0.979 | yes |
| medium | cold, no compile/config | 4327 (4256–5212) | 2711 (2650–2933) | 0.627 | 3650 | 1500 | 0.411 | 316 | 175 | 0.554 | yes |

## Observations

- **A repeat install that changed nothing skips `afterInstall`** (see [Repeat installs skip `afterInstall`](native-install.md#repeat-installs-skip-afterinstall)). It takes 37–44% of the TypeScript wall time, and about half its peak RSS, because Harmony is not loaded. The previous measurement, which ran `afterInstall` every time, took 1427 ms (small) and 2767 ms (medium). Now the same installs take 964 ms and 1244 ms.
- **Native is faster in every scenario.** A cold install or an added package still runs `afterInstall` and takes 7–26% less wall time than TypeScript.
- **In those scenarios, the JavaScript `afterInstall` step accounts for most of what native still spends.** It loads Harmony, the workspace and the envs, then compiles. Without compile and config files, native skips Harmony entirely. It then uses 41–53% of the TypeScript CPU and about 55–61% of its peak RSS.
- **The peak RSS of a cold native install is set by the Harmony load in `afterInstall`,** which is why it is close to TypeScript's.
