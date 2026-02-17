# Ralph Wiggum Protocol (Perf Edition)

## Loop structure (repeat until done)

1. Restate goal + constraints (briefly)
2. Pick ONE next task (smallest measurable unit)
3. Implement minimal diff
4. Measure:
   - baseline: dev-server-test2 + BVM bit
   - optimized: dev-server-test + \_\_bd
5. Validate runtime acceptance checklist
6. Update STATE.json:
   - move item to completed/blocked
   - add benchmark numbers + logs
7. Decide:
   - If improved and correct -> keep
   - If neutral/worse or risky -> revert and document

## Mandatory behaviors

- Never hardcode package names/lists
- Prefer official Bit APIs for dependency discovery
- Never claim perf wins without baseline comparison
- Do not stack multiple optimizations in one iteration
- If unexpected behavior occurs, stop and isolate root cause before continuing
- Clear webpack/rspack caches before comparative measurement
- When adding new exports to aspects, update the aspect `index.ts`

## Verification requirements (critical)

- After modifying source in `__bit`, always run `bit compile <aspect>`
- Verify dist/runtime behavior, not source assumptions
- Run `__bd start` and validate in browser before declaring done
- For GraphQL changes, validate real network behavior
- For preview changes, validate iframe load + composition rendering + HMR

## Current context

### Workstream 1: Runtime Optimizations — `perf/runtime-optimizations`

- Status: IN PROGRESS (stabilization)
- Merge complete with master rspack migration (`7b9a59e0f` on top of `225881d03`)
- Current focus: offline refresh resilience, status semantics, SW/cache isolation, layout polish, EMFILE stability

### Workstream 2: Rspack Migration — `perf/rspack-migration`

- Status: Major migration landed to master; branch remains for follow-up optimizations
- Focus: remaining env migration/perf hardening without runtime regressions
