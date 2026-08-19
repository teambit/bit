# 11. Next steps

[← back to bundle-plan index](../bundle-plan.md)

**A. Correctness / coverage**

1. Fix `bit start` — but not by growing the externals list (§8.3). The promising direction is to have
   the UI/preview rspack config resolve its aliases from the _pre-bundled UI artefact_ or from the
   user's workspace, rather than `require.resolve`-ing each package out of bit's own installation.
2. Turn the 41 remaining `require-resolve-not-external` warnings into an explicit decision list:
   external, copied asset, worker entry, or confirmed-dead now that core envs are gone.
3. Run the e2e suite against the bundled binary (`npm run e2e-test --bit_bin=…`) — the fastest way to
   find whatever is left.

**B. Size** — see §8.2 for the ordered levers.

**C. Packaging** — the critical path now that the task runs (§9e):

- Declare the 4 missing externals on `@teambit/bit` (`bit deps set`). Without this the published bundle
  is missing modules it needs at runtime. **This is now the single blocking item for a publishable
  artefact.** (`@teambit/mcp.mcp-config-writer` no longer needs to be on this list — 2026-08-11, §18 —
  its templates are inlined at build time instead of read from a copied runtime asset.)
- ~~Emit the publishable layout of §9b from the task itself~~ — **done**, see §9e.
- Supersede `CoreExporterTask` for `@teambit/bit` — both write the same locators today.
- Decide whether `main` should point at the `bit` shim rather than `dist/index.js` (§9e).
- Point the e2e runners at the task's artefact instead of the hand-built `/tmp/bit-bundle`, which is
  what actually proves the two build paths cannot drift.
- Decide SEA's fate with §9.2 in hand: embed (tamper-proof, 2× slower) vs stub (same startup as the
  script, still one binary on PATH, JS stays on disk) vs drop it.

**D. Hardening**

- Wire `e2e-test:bundle-circle` / `e2e-test:sea-circle` into CircleCI so the bundle is exercised by
  the full suite on every run, plus a smoke suite (`--help`, `init`, `create`, `status`, `build`) so
  it cannot silently rot.
- Land the `hook-require` fix (§6.2) on `master` independently.
- Land the two install guards on `remove-core-envs-from-manifest` — **done**, cherry-picked as
  `5f50bc2d5`. The third instance — `bd install` reaching its own compile step and dying on
  `@teambit/compiler/dist/index.js` lazily requiring `./types` — is **fixed 2026-08-12**, see §14.
  Fixing it removed the snapshot/restore dance local dev used to need.
- Consider generating the repo's own `esm.mjs` files the way the bundle's are — same staleness
  hazard, just less visible.
