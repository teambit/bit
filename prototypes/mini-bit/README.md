# mini-bit

Runnable prototype of the architecture proposed in
[`../../docs/rfc-esm-lazy-aspects.md`](../../docs/rfc-esm-lazy-aspects.md):
a Harmony-style aspect system on **native ESM** with **lazy dynamic-import** of
aspect runtimes, driven by a static command index.

## What this demonstrates

| Concept | Where to look |
| --- | --- |
| Aspect manifest / runtime split | `src/<aspect>/<aspect>.aspect.js` (tiny) vs `<aspect>.main.runtime.js` (heavy) |
| Lazy runtime loading via `() => import(...)` thunks | `src/cli/cli.aspect.js:7` and every other `*.aspect.js` |
| Command descriptors (data only, inlined) | `src/<aspect>/<aspect>.commands.js` |
| Static command index | `src/command-index.generated.js` |
| Lazy Harmony resolver | `src/harmony/harmony.js#resolve` |
| Simulated heavy aspect cost | each aspect's `*-internals.js` busy-loops at module top level |
| Eager-mode fallback for comparison | `BIT_EAGER=1` |
| Per-aspect load tracing | `BIT_TRACE_ASPECT_LOAD=1` |

## Run it

Requires Node 18+ (anything with native ESM works).

```sh
# fast paths — no aspect runtime loads
node bin/mini-bit.js --version
node bin/mini-bit.js --help

# real commands (lazy mode by default)
BIT_TRACE_ASPECT_LOAD=1 node bin/mini-bit.js status
BIT_TRACE_ASPECT_LOAD=1 node bin/mini-bit.js install
BIT_TRACE_ASPECT_LOAD=1 node bin/mini-bit.js compile

# eager mode for comparison
BIT_TRACE_ASPECT_LOAD=1 BIT_EAGER=1 node bin/mini-bit.js status
```

## What you should see

In **lazy mode**, `bit status` loads exactly the aspects on its path:
`cli`, `logger`, `scope`, `workspace`, `status`. The `compiler` and `install`
runtimes are never imported.

In **eager mode** (today's Bit behaviour), *every* core aspect runtime is
imported and its `provider()` runs, regardless of which command the user typed.

The trailing `--- N aspect runtime(s) loaded in Mms ---` summary makes the
difference visible at a glance.

## Layout

```
bin/mini-bit.js                 Entry point. Builds Harmony, dispatches.
src/harmony/
  aspect.js                     Aspect.create — manifest with lazy runtime thunk
  harmony.js                    Harmony.load + Harmony.resolve (lazy DI)
  tracer.js                     Per-aspect load tracing & summary
src/<aspect>/
  <aspect>.aspect.js            Manifest (id, deps, runtime thunk)
  <aspect>.main.runtime.js      Provider + command registration (heavy)
  <aspect>.commands.js          Descriptor data (only for aspects with commands)
  <aspect>-internals.js         Simulated weight at module-top-level
src/command-index.generated.js  Static name → aspect mapping (would be codegen'd)
src/bit/bit.aspect.js           Meta-aspect listing all cores (eager mode only)
```

## What's missing vs real Bit

This is a prototype, not a port. Notably:
- **Slot machinery is omitted.** Aspects extend each other today via slots
  (e.g., `commandsSlot`, `OnStartSlot`). The lazy-load model still works with
  slots — see RFC §6.6 / §6.8 for the slot-producer index design — but adding
  them here would obscure the core demonstration.
- **No yargs.** A real CLI needs argv parsing with subcommands, flags, help
  rendering, completion. The prototype dispatches by `argv[0]` only.
- **No workspace.jsonc / config plumbing.** Harmony's `config` map is stubbed.
- **No user-extension loader.** RFC §6.7 specifies that user extensions use the
  same `harmony.resolve` path as core; trivial to bolt on top of what's here.
