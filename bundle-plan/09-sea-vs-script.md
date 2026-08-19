# 9. Script bundle vs. single executable (SEA)

[← back to bundle-plan index](../bundle-plan.md)

`npm run bundle -- --sea` runs the full Node SEA pipeline: esbuild a self-starting variant →
`node --experimental-sea-config` → copy the node binary → `codesign --remove-signature` →
`npx postject` → `codesign --sign -`. Result: `/tmp/bit-bundle/bit-app`, **179 MB**, verified working
for the whole `init → create → status → build` flow and for e2e specs.

### 9.1 Timings

Averaged over 5 runs each, same machine (macOS arm64, node 22.22.0), warm caches, in a real
workspace. "script" = `bundle/bit.app.js` loaded by the `bin/bit` launcher; "SEA" = the executable
with the bundle embedded.

|                            | `bit --version` | `bit --help` | `bit list`  |
| -------------------------- | --------------- | ------------ | ----------- |
| bvm bit 2.0.72 (unbundled) | **0.254 s**     | 0.662 s      | 0.914 s     |
| bundle, script launcher    | 0.400 s         | **0.642 s**  | **0.848 s** |
| bundle, SEA (embedded)     | 0.414 s         | 1.324 s      | 1.574 s     |

Per-command cost in the e2e suite (same 8-test spec): **script 0.78 s/command, SEA 2.0 s/command**
(27 s vs 47 s wall clock).

`--version` short-circuits before the aspect graph is evaluated, which is why all three are close
there and why bvm wins — it never parses 67 MB. Once real work starts, the bundle is slightly ahead
of bvm and the SEA is ~2× behind both.

### 9.2 Why the SEA is slower — measured, not guessed

Not the bundle size, and not (as first suspected) the wrapper I had to add. The cause is that
**Node's compile cache does not apply to the main entry script.**

| experiment                                                                  | `bit --help` |
| --------------------------------------------------------------------------- | ------------ |
| evaluate `bit.app.js` **as the main script**, cache on                      | 0.813 s      |
| evaluate the _same file_ **via `require()`** from a 1-line main, cache on   | **0.390 s**  |
| SEA with the 67 MB bundle embedded                                          | 1.312 s      |
| SEA whose embedded script is a **stub that `require`s `bundle/bit.app.js`** | **0.642 s**  |
| script launcher (`bin/bit` → `require`)                                     | 0.618 s      |

A SEA's embedded script is _always_ the main script, so it can never benefit from the module compile
cache; `useCodeCache: true` helps (2.10 s → 1.31 s) but cannot close the gap. The moment the same
binary loads the bundle through `require()` from disk, it matches the script launcher exactly.

(An earlier hypothesis — that wrapping the bundle in an IIFE to rebind `require`/`__dirname` was the
cost — was tested and rejected: removing the IIFE in favour of `var` re-binding changed nothing. The
`var` form is kept anyway, it is simpler.)

### 9.3 Pros and cons

**SEA — pros**

- One file to distribute and to put on `PATH`; no `node` on the user's machine, no version skew
  between bit and the runtime.
- The node version is pinned into the artefact, so "works on my node" problems disappear.
- The JavaScript is embedded, so it cannot be casually edited or partially deleted.
- Natural fit for a future `bvm`-less install (curl one binary).

**SEA — cons**

- **~2× slower on every command** (§9.1–9.2), and there is no configuration that fixes it — the
  limitation is structural.
- **It is not actually self-contained.** It still needs `bundle/` next to it: the externals are
  native/per-platform packages that no bundler can inline, and bit reads data files
  (`workspace-template.jsonc`, `lib.*.d.ts`, the jest worker) off disk via `__dirname`.
  So you ship a 179 MB binary _and_ a 230 MB directory.
- Build is per-platform and needs `postject` + `codesign`; every OS/arch is a separate artefact.
- 179 MB vs the 67 MB script — the binary carries a full node copy.
- Debugging is worse: no source paths, no `NODE_OPTIONS` niceties, harder stack traces.

**Script bundle — pros**

- Fastest of the three on real commands, and faster than today's bit.
- Platform-independent artefact; the same `bundle/` works anywhere the externals install.
- Ordinary node debugging, `--inspect`, source maps if enabled.

**Script bundle — cons**

- Requires a node runtime of a compatible version on the user's machine (as bit does today).
- The launcher must call `module.enableCompileCache()` (node ≥ 22.1) to get the good number.

**Recommendation.** The script bundle is the one to ship. A SEA only becomes attractive if the goal
is specifically "no node on the machine", and even then the _stub_ form (binary = node + a 1 KB
launcher that requires `bundle/bit.app.js`) gives the same startup as the script while still being a
single executable on `PATH` — it just doesn't embed the JS. That is the shape to pick if a binary is
wanted; embedding the 67 MB buys tamper-resistance and costs 2× startup.
