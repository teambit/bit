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
- lines the measured native build did not print yet: the importer's per-phase status lines, Harmony's `loading N component(s)`, and the command runner's `running command "install"...`. Later commits on the same branch print all of them; the measurements predate that change.

## Machine

- Apple M1 Max (10 cores), 64 GB, macOS 27.0.1
- Node 22.22.0
- CLI compiled from `rust-install-followups` at 77d56b529
- The addon was built with `cargo build --release -p bit-workspace-napi` (fat LTO, `codegen-units = 1`) and `strip = "none"`. The stripped release dylib does not load on this macOS (`mis-aligned LINKEDIT string pool`), because rustc's `rust-objcopy` strip step misaligns it.

## Results

| Workspace | Scenario | TS wall ms (min–max) | Native wall ms (min–max) | Wall ratio | TS CPU ms | Native CPU ms | CPU ratio | TS peak RSS MB | Native peak RSS MB | RSS ratio | Output matched |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| small | cold | 3143 (2985–3270) | 2304 (2279–2396) | 0.733 | 2110 | 1710 | 0.810 | 321 | 313 | 0.974 | yes |
| small | repeat | 2205 (2171–2489) | 1427 (1413–1462) | 0.647 | 1720 | 1410 | 0.820 | 308 | 300 | 0.973 | yes |
| small | add | 2398 (2332–2608) | 1581 (1564–1651) | 0.660 | 1810 | 1470 | 0.812 | 309 | 302 | 0.979 | yes |
| small | cold, no compile/config | 2691 (2591–3043) | 1579 (1476–2274) | 0.587 | 1740 | 880 | 0.506 | 266 | 161 | 0.603 | yes |
| medium | cold | 5600 (5163–6094) | 4449 (4269–5139) | 0.794 | 4990 | 3820 | 0.766 | 383 | 344 | 0.899 | yes |
| medium | repeat | 3556 (3398–5112) | 2767 (2596–2852) | 0.778 | 3750 | 3450 | 0.920 | 353 | 343 | 0.973 | yes |
| medium | add | 3709 (3501–8792) | 2829 (2683–3396) | 0.763 | 3880 | 3410 | 0.879 | 357 | 346 | 0.969 | yes |
| medium | cold, no compile/config | 4545 (4148–4785) | 2797 (2317–3112) | 0.615 | 3850 | 1340 | 0.348 | 316 | 175 | 0.552 | yes |

## Observations

- **Native is faster in every scenario**, by 21–35% in wall time for a full install.
- **The JavaScript `afterInstall` step accounts for most of what native still spends.** It loads Harmony, the workspace and the envs, then compiles. Compare cold with and without compile:
  - Native: about 0.7 s (small) and 1.65 s (medium).
  - TypeScript: about 0.45 s and 1.05 s, because Harmony is already loaded there.
- **Without compile and config files, native skips Harmony entirely.** It uses 35–51% of the TypeScript CPU and about 55–60% of its peak RSS.
- **Peak RSS of a full native install is set by the Harmony load in `afterInstall`,** which is why it is close to TypeScript's.
- **Native `repeat` and `add` stay above 1.4 s on the small workspace.** About half of that is `afterInstall`, which took about 0.7 s in the cold scenario. A repeat install that skips `afterInstall` when nothing changed would be the next win.
