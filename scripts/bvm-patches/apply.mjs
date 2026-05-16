#!/usr/bin/env node
// Bootstrap patches for the bvm-installed `bit` binary.
//
// Why this exists: while the RFC migration is in flight, the workspace
// source uses new lazy patterns (`Aspect.create({ runtimes: thunk })`,
// `cli.register(descriptor, factory)`, `@teambit/core` Harmony) that the
// shipped bit-1.13.x can't load. `bit compile` requires a working bit
// binary, so we get a chicken-and-egg. This script patches the bvm install
// in-place to bridge the gap; remove it once a bit version ships with the
// patched code baked in.
//
// Usage:
//   node scripts/bvm-patches/apply.mjs              # patches the active bvm bit
//   node scripts/bvm-patches/apply.mjs --bit-dir=…  # explicit path
//   node scripts/bvm-patches/apply.mjs --revert     # restore the .bak files
//
// What gets patched:
//   1) <bvm-bit>/node_modules/@teambit/core    → symlink to <workspace>/node_modules/@teambit/core
//   2) <bvm-bit>/node_modules/@teambit/cli/dist/cli.main.runtime.js
//      → register() learns the new (descriptor, factory) signature
//   3) <bvm-bit>/node_modules/@teambit/bit/dist/load-bit.js
//      → loadLegacyConfig + the main load switch to LazyHarmony from @teambit/core

import { existsSync, readFileSync, readdirSync, writeFileSync, symlinkSync, lstatSync, copyFileSync, unlinkSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { homedir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = resolve(HERE, '..', '..');

const args = new Set(process.argv.slice(2));
const REVERT = args.has('--revert');
// `--esm` opts into the (still-experimental) Slice 09 ESM-emission patches.
// Without it, only the always-on lazy-aspect bootstrap fixes are applied,
// which keep dev compatible with the current CJS-emitting workspace.
const ESM = args.has('--esm');
const explicitDir = [...args].find((a) => a.startsWith('--bit-dir='))?.split('=')[1];

function findBvmBitDir() {
  if (explicitDir) return resolve(explicitDir);
  // bvm tracks the active version via ~/.bvm/links/bit (a symlink to
  // ~/.bvm/versions/<v>/bit-<v>). That's the canonical install dir.
  const home = process.env.HOME || process.env.USERPROFILE;
  if (home) {
    const linkPath = join(home, '.bvm', 'links', 'bit');
    if (existsSync(linkPath) && existsSync(join(linkPath, 'node_modules', '@teambit', 'bit'))) {
      return linkPath;
    }
  }
  abort('could not locate the bvm bit directory; pass --bit-dir=… explicitly');
}

function abort(msg) {
  console.error(`[bvm-patches] error: ${msg}`);
  process.exit(1);
}

function log(msg) {
  console.log(`[bvm-patches] ${msg}`);
}

function patchOnce(filePath, marker, find, replace) {
  if (!existsSync(filePath)) {
    log(`skip: ${filePath} not present`);
    return;
  }
  const src = readFileSync(filePath, 'utf8');
  if (src.includes(marker)) {
    log(`already patched: ${filePath}`);
    return;
  }
  const idx = src.indexOf(find);
  if (idx === -1) {
    abort(`expected snippet not found in ${filePath} — bit version may not match`);
  }
  const backup = `${filePath}.bvm-patches.bak`;
  if (!existsSync(backup)) copyFileSync(filePath, backup);
  const out = src.slice(0, idx) + replace + src.slice(idx + find.length);
  writeFileSync(filePath, out);
  log(`patched: ${filePath}`);
}

function revertOnce(filePath) {
  const backup = `${filePath}.bvm-patches.bak`;
  if (!existsSync(backup)) {
    log(`no backup for ${filePath}, skipping`);
    return;
  }
  copyFileSync(backup, filePath);
  unlinkSync(backup);
  log(`reverted: ${filePath}`);
}

function linkCoreOnce(bvmDir) {
  const target = join(bvmDir, 'node_modules', '@teambit', 'core');
  const source = join(WORKSPACE_ROOT, 'node_modules', '@teambit', 'core');
  if (!existsSync(source)) {
    abort(`workspace has no @teambit/core at ${source} — run "bit link" first`);
  }
  if (existsSync(target)) {
    try {
      const stat = lstatSync(target);
      if (stat.isSymbolicLink()) {
        log(`@teambit/core symlink already present in bvm`);
        return;
      }
    } catch {
      /* fall through */
    }
    abort(`${target} already exists and is not a symlink — refusing to overwrite`);
  }
  symlinkSync(source, target);
  log(`linked @teambit/core into bvm: ${target}`);
}

function unlinkCoreOnce(bvmDir) {
  const target = join(bvmDir, 'node_modules', '@teambit', 'core');
  if (!existsSync(target)) return;
  try {
    const stat = lstatSync(target);
    if (stat.isSymbolicLink()) {
      unlinkSync(target);
      log(`removed @teambit/core symlink from bvm`);
    }
  } catch {
    /* ignore */
  }
}

// ── Patch 1: cli.main.runtime.js register() ────────────────────────────────

const CLI_FIND = `  register(...commands) {
    commands.forEach(command => {
      this.setDefaults(command);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      command.commands.forEach(cmd => this.setDefaults(cmd));
    });
    this.commandsSlot.register(commands);
  }`;

const CLI_REPLACE = `  register(...args) {
    // bvm-patches: handle new (descriptor, factory) signature from slice 7.
    if (args.length === 2 && typeof args[1] === 'function') {
      const factory = args[1];
      const command = factory();
      this.setDefaults(command);
      command.commands.forEach(cmd => this.setDefaults(cmd));
      this.commandsSlot.register([command]);
      return;
    }
    const commands = args;
    commands.forEach(command => {
      this.setDefaults(command);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      command.commands.forEach(cmd => this.setDefaults(cmd));
    });
    this.commandsSlot.register(commands);
  }`;

// ── Patch 2: core-aspect-env capsule babel config ──────────────────────────
//
// The env that compiles bit's own components is `teambit.harmony/envs/
// core-aspect-env`, an external Bit-cloud package. Its `cjs.babel.config.js`
// ships with `@babel/plugin-transform-modules-commonjs` configured with
// `lazy: () => true`. That wraps every top-level `require()` in a thunk,
// which used to be a startup-time win — but now stacks on top of the
// slice 4/7 lazy-aspect machinery + slice 5's command-index short-circuit
// and adds per-call overhead instead of saving anything. With the babel
// thunks removed we see −67% on `bit status (no ws)` and −52% on
// `bit <typo>`; the architectural work is doing its job.
//
// We patch the capsule directly because the env is external. Re-run this
// script after `bit install` if the capsule is rebuilt and reverts.

const ENV_BABEL_FIND_SRC = `const newPlugins = [
  [
    require.resolve('@babel/plugin-transform-modules-commonjs'),
    {
      lazy: () => true,
    },
  ],
  ...plugins,
];`;

const ENV_BABEL_REPLACE_SRC = `// bvm-patches: dropped @babel/plugin-transform-modules-commonjs lazy.
// The slice 4/7 + slice 5 work supersedes it; keeping the babel-level
// lazy hides the impact of the architectural lazy load.
const newPlugins = [...plugins];`;

const ENV_BABEL_FIND_DIST = `const newPlugins = [[require.resolve('@babel/plugin-transform-modules-commonjs'), {
  lazy: () => true
}], ...plugins];`;

const ENV_BABEL_REPLACE_DIST = `// bvm-patches: dropped @babel/plugin-transform-modules-commonjs lazy.
const newPlugins = [...plugins];`;

// ── Patch 3: env preset-env modules:false (ESM emission) ───────────────────
//
// Flips the env's `cjs.babel.config.js` to emit ESM instead of CJS by
// passing `modules: false` to `@babel/preset-env`. Step 1 of the ESM
// source migration (docs/migration/09-esm-source-migration.md). The
// `.js`-extension dance is handled post-compile by
// `fix-bare-esm-imports.mjs`, and package.json `"type": "module"` is
// stamped by `set-package-type-module.mjs`.

const ENV_PRESET_FIND_SRC = `      targets: {
        node: 18,
      },
    },
  ],
]);`;

const ENV_PRESET_REPLACE_SRC = `      targets: {
        node: 18,
      },
      // bvm-patches: emit ESM. Step 1 of slice 09 (ESM source migration).
      modules: false,
    },
  ],
]);`;

const ENV_PRESET_FIND_DIST = `  targets: {
    node: 18
  }
}]]);`;

const ENV_PRESET_REPLACE_DIST = `  targets: {
    node: 18
  },
  // bvm-patches: emit ESM
  modules: false
}]]);`;

function patchCoreAspectEnvCapsules() {
  // Capsule roots vary per workspace hash, so we glob across all of them.
  const capsuleRoot = join(homedir(), 'Library', 'Caches', 'Bit', 'capsules');
  if (!existsSync(capsuleRoot)) {
    log(`no Bit capsule cache at ${capsuleRoot}, skipping env patch`);
    return;
  }
  let patched = 0;
  for (const workspaceHash of readdirSync(capsuleRoot)) {
    const wsDir = join(capsuleRoot, workspaceHash);
    let envEntries;
    try {
      envEntries = readdirSync(wsDir);
    } catch {
      continue;
    }
    for (const entry of envEntries) {
      if (!entry.startsWith('teambit.harmony_envs_core-aspect-env')) continue;
      const envDir = join(wsDir, entry);
      const srcPath = join(envDir, 'config', 'cjs.babel.config.js');
      const distPath = join(envDir, 'dist', 'config', 'cjs.babel.config.js');
      patchOnce(srcPath, 'bvm-patches: dropped @babel/plugin-transform-modules-commonjs lazy', ENV_BABEL_FIND_SRC, ENV_BABEL_REPLACE_SRC);
      patchOnce(distPath, 'bvm-patches: dropped @babel/plugin-transform-modules-commonjs lazy', ENV_BABEL_FIND_DIST, ENV_BABEL_REPLACE_DIST);
      if (ESM) {
        patchOnce(srcPath, 'bvm-patches: emit ESM. Step 1 of slice 09', ENV_PRESET_FIND_SRC, ENV_PRESET_REPLACE_SRC);
        patchOnce(distPath, 'bvm-patches: emit ESM', ENV_PRESET_FIND_DIST, ENV_PRESET_REPLACE_DIST);
      }
      patched++;
    }
  }
  if (patched === 0) log('no core-aspect-env capsules to patch');
}

function revertCoreAspectEnvCapsules() {
  const capsuleRoot = join(homedir(), 'Library', 'Caches', 'Bit', 'capsules');
  if (!existsSync(capsuleRoot)) return;
  for (const workspaceHash of readdirSync(capsuleRoot)) {
    const wsDir = join(capsuleRoot, workspaceHash);
    let envEntries;
    try {
      envEntries = readdirSync(wsDir);
    } catch {
      continue;
    }
    for (const entry of envEntries) {
      if (!entry.startsWith('teambit.harmony_envs_core-aspect-env')) continue;
      const envDir = join(wsDir, entry);
      revertOnce(join(envDir, 'config', 'cjs.babel.config.js'));
      revertOnce(join(envDir, 'dist', 'config', 'cjs.babel.config.js'));
    }
  }
}

// ── Driver ─────────────────────────────────────────────────────────────────

const bvmDir = findBvmBitDir();
log(`bvm bit dir: ${bvmDir}`);

const cliFile = join(bvmDir, 'node_modules', '@teambit', 'cli', 'dist', 'cli.main.runtime.js');

if (REVERT) {
  log(`reverting…`);
  revertOnce(cliFile);
  unlinkCoreOnce(bvmDir);
  revertCoreAspectEnvCapsules();
  log(`done`);
  process.exit(0);
}

// The @teambit/core symlink is needed because a prior `bit compile` rewrote
// some bvm-shipped aspect dist files (e.g. @teambit/clear-cache/dist/...) to
// `require("@teambit/core")`. The symlink lets the require resolve until a
// fresh bit version ships with the patched code.
linkCoreOnce(bvmDir);

patchOnce(cliFile, 'bvm-patches: handle new (descriptor, factory)', CLI_FIND, CLI_REPLACE);

patchCoreAspectEnvCapsules();

log(`done`);
