# Prompts

## Session bootstrap prompt — Runtime Optimizations (Current)

Activate the Wiggum workflow.

You are operating in the Bit local repo (`__bit`).
Read in this order:

1. `.agent/context.md`
2. `.agent/protocol/PROTOCOL.md`
3. `.agent/protocol/STATE.json`
4. `.agent/scale/*`

Branch: `perf/runtime-optimizations`
Status: IN PROGRESS (stabilization on merged rspack stack)

Current reality:

- Rspack migration has been merged from master into this branch.
- Focus is runtime reliability/UX hardening, not initial webpack->rspack migration.

Primary tasks now:

1. offline refresh resilience (no blank page)
2. correct main-vs-preview status semantics
3. SW/cache isolation across workspaces/branches
4. MIME/fallback correctness for JS/hot-update assets
5. final workspace spacing/z-index polish
6. EMFILE watcher stability

---

## Session bootstrap prompt — Rspack Follow-up Work

Use only for targeted rspack follow-up optimization/hardening.

Read:

- `.agent/context.md`
- `.agent/rspack-migration-scope.md`
- `.agent/protocol/PROTOCOL.md`
- `.agent/protocol/STATE.json`

Constraint:

- Rspack migration is already merged in master and in `perf/runtime-optimizations`.
- Do not plan migration bootstrap tasks as if webpack UI path is still primary.

---

## Per-iteration prompt

Continue Wiggum iteration.

You must:

- choose exactly one next task from STATE
- implement minimal diff
- run baseline + optimized validation when claiming perf gain
- run runtime acceptance checks
- update STATE with numbers/logs and decision
- revert if neutral/worse/risky

Stop after updating STATE.
