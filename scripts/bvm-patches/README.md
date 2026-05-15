# bvm-patches — bootstrap workaround for the lazy-aspects migration

`bit compile` needs a working `bit` binary. The bvm-installed `bit` (the only
one available before this migration lands) can't load the workspace because:

1. `cli.register(descriptor, factory)` (slice 7 codemod) trips the older
   `setDefaults` — it tries to mutate `command.name` on the factory closure.
2. A prior `bit compile` in this workspace rewrote some shipped aspect dist
   files (e.g. `@teambit/clear-cache/dist/clear-cache.aspect.js`) to
   `require('@teambit/core')`, which isn't part of the bvm install's
   dependency closure.

`apply.mjs` patches the bvm install in place to bridge both. The patches
are tiny, self-marked (re-runs are no-ops), and reversible via `--revert`.

The Aspect-class side of the lazy-aspects migration (making `Aspect.create`
backward-compatible with `Harmony.load + harmony.run`) lives in the workspace
source at `scopes/harmony/core/aspect.ts`. That's the proper fix; this
script is just the bootstrap so the source fix can be compiled.

## When to delete this

The day a new `bit` version ships with the patched `cli.main.runtime.js` and
`load-bit.js` baked in (and `@teambit/core` declared as a real dep). At that
point: `node scripts/bvm-patches/apply.mjs --revert`, `bvm install <new>`,
delete this directory.

## Usage

```sh
# Patch the bvm install pointed at by `which bit`:
node scripts/bvm-patches/apply.mjs

# Patch a specific install (e.g. another version):
node scripts/bvm-patches/apply.mjs --bit-dir=~/.bvm/versions/1.13.170/bit-1.13.170

# Restore the originals (uses the `.bvm-patches.bak` files apply.mjs writes):
node scripts/bvm-patches/apply.mjs --revert
```

The script also creates `<bvm-bit>/node_modules/@teambit/core` as a symlink
to the workspace's `node_modules/@teambit/core` so the patched `load-bit.js`
can `require('@teambit/core')`. Run `bit link` from the workspace first if
that path doesn't exist yet.

## What gets edited

| Path inside bvm bit | Change |
| --- | --- |
| `node_modules/@teambit/core` | New symlink → workspace `@teambit/core` |
| `node_modules/@teambit/cli/dist/cli.main.runtime.js` | `register()` learns the `(descriptor, factory)` signature |

Originals are copied to `<file>.bvm-patches.bak` before the edit; `--revert`
restores them.

## After applying

Run `bit compile` and the workspace dist will rebuild against the new
patterns. If anything else still trips on shipped bit-1.13.x code, add a new
`patchOnce(...)` call to `apply.mjs` — the script is intentionally a flat
list of edits so adding one is a one-block change.
