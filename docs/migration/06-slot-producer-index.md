# Chunk 06 — Slot-Producer Index

| Field | Value |
| --- | --- |
| Depends on | 05 |
| Blocks | 07 (for correctness of slot-consuming aspects) |
| Risk | Medium |
| Effort | 2–3 days |

## Goal

Generate a static map of `slot id → list of producer aspect ids`. The lazy
loader consults this map: when an aspect consumes a slot, the loader resolves
all known producers first.

Without this, slot-consuming aspects under lazy load see partial views.

## Why now

Chunks 01–05 are correct only for commands (which are owned by exactly one
aspect). Many real aspects extend each other via slots — e.g., schema fragments,
GraphQL resolvers, env registrations, status sections. This chunk makes lazy
loading correct for those.

## Background: slots today

```ts
// Aspect A declares a slot type
class MainA {
  static slots = [Slot.withType<MyContribution>()];
  static async provider(deps, config, [mySlot]) {
    this.mySlot = mySlot;
  }
  query() { return this.mySlot.values().flat(); }
}

// Aspect B contributes to A's slot
class MainB {
  static dependencies = [AAspect];
  static async provider([a]) {
    a.registerContribution(myThing);  // calls slot.register internally
  }
}
```

Under eager load, B runs before A.query() is called. Under lazy load, A might
load without B, and `query()` returns an empty view.

## Scope

### Codegen

`scripts/codegen/build-slot-producers.mjs`:

1. **AST-walk every `*.main.runtime.ts`** to find:
   - **Slot declarations**: `class X { static slots = [Slot.withType<...>()] }`
   - **Contribution calls**: any method call that ultimately invokes
     `slot.register(...)` on another aspect's slot. Heuristic: look for
     method calls like `dep.register*(...)` where `dep` is a dep from
     `this.constructor.dependencies`. (Refine the heuristic with each aspect's
     conventions.)
2. **Emit** `scopes/harmony/bit/slot-producers.generated.ts`:
   ```ts
   export const SLOT_PRODUCERS: Record<string, string[]> = {
     'teambit.harmony/cli:commandsSlot': [
       'teambit.component/status',
       'teambit.dependencies/install',
       // ...
     ],
     'teambit.harmony/cli:onStartSlot': [
       'teambit.workspace/workspace',
     ],
     // ...
   };
   ```

### Loader integration

`Harmony.resolve(id)` is augmented:

```ts
async resolve(id: string) {
  // ... existing logic ...
  // After provider() runs, before returning:
  await this.resolveSlotProducers(id);
  return instance;
}

async resolveSlotProducers(id: string) {
  const ownedSlotIds = this.getOwnedSlotIds(id); // from manifest annotations
  for (const slotId of ownedSlotIds) {
    const producers = SLOT_PRODUCERS[slotId] ?? [];
    await Promise.all(producers.map(p => this.resolve(p)));
  }
}
```

The aspect manifest gains an optional `slots` field listing the slot ids it
owns (so the loader knows which slots to look up). Generated alongside the
producer index.

### Opt-out for performance-critical paths

Some slots are "best-effort" by design (telemetry, debug instrumentation).
Mark them in the aspect:

```ts
static slots = [Slot.withType<Telemetry>({ bestEffort: true })];
```

Best-effort slots are **not** pre-loaded by the producer index. Consumers
accept a partial view.

### Static analysis caveats

The heuristic for detecting `slot.register` calls is imperfect. Output an
explicit list of aspects the script couldn't analyze; require manual
annotation:

```ts
// In an aspect that contributes via runtime conditions:
export const contributesTo = ['teambit.harmony/cli:commandsSlot'];
```

The codegen reads `contributesTo` exports as a fallback.

## Acceptance criteria

- [ ] `scripts/codegen/build-slot-producers.mjs` produces a complete map for
      every slot in the codebase.
- [ ] Aspects flagged as "couldn't analyze" are <5; each has a manual
      `contributesTo` annotation.
- [ ] Under `BIT_LAZY_RESOLVE=1`, every slot-consuming aspect sees the same
      contributors as eager mode. Verified by a parity test.
- [ ] Best-effort slot opt-out works and is documented.
- [ ] Codegen is integrated into `bit compile` and CI checks for staleness.

## Risks

- **False negatives in static analysis** (missed contributors). Mitigation:
  parity test in CI; new aspects must annotate `contributesTo` if codegen
  can't detect them.
- **Over-eager loading** if a slot has dozens of producers, all loaded
  whenever any aspect with that slot is resolved. Mitigation: review the
  generated map; if a slot's producer list dominates load time, consider
  marking it best-effort or splitting the slot.
- **Circular slot chains** (A contributes to B which contributes back to A).
  The `loading` map handles deduplication; verify with a test case.

## Files touched

- `scripts/codegen/build-slot-producers.mjs` (new)
- `scopes/harmony/bit/slot-producers.generated.ts` (new, committed)
- `scopes/harmony/harmony/harmony.ts` (`resolve` + `resolveSlotProducers`)
- `scopes/harmony/harmony/aspect/aspect.ts` (optional `slots` field for
  owned-slot ids)
- A handful of aspects with `contributesTo` annotations

## Out of scope

- Generalized topic/event bus to replace slots (a future architectural
  conversation).
- Memoization of `resolveSlotProducers` per slot (small optimization).
