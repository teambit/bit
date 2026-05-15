# Chunk 04 — Single-Aspect End-to-End Pilot (`status`)

| Field | Value |
| --- | --- |
| Depends on | 02, 03 |
| Blocks | 05, 07 |
| Risk | Medium |
| Effort | 2–3 days |

## Goal

Convert exactly **one aspect** — `teambit.component/status` — to the new
architecture: descriptor split, lazy `runtimes` thunk, dispatched via
`harmony.resolve`. All other aspects keep working as today.

This chunk proves the design end-to-end on real code. If something doesn't fit,
we catch it here before the bulk rollout.

## Why `status`

- Moderately sized (~30 imports, several deps).
- Owned by a small set of commands (`status`, `mini-status`).
- Heavily used → any regression is immediately visible.
- Existing e2e coverage is strong.

## Scope

### File changes

1. **`scopes/component/status/status.aspect.ts`** — add the `runtimes` thunk:
   ```ts
   export const StatusAspect = Aspect.create({
     id: 'teambit.component/status',
     dependencies: [],
     declareRuntime: MainRuntime,
     runtimes: {
       main: () => import('./status.main.runtime.js'),  // NEW
     },
   });
   ```

2. **`scopes/component/status/status.commands.ts`** (new) — descriptor data:
   ```ts
   import type { CommandDescriptor } from '@teambit/cli';

   const descriptors: CommandDescriptor[] = [
     {
       name: 'status',
       alias: 's',
       description: 'show workspace component status and issues',
       options: [...],  // copied from current StatusCmd class
       loader: true,
       aspectId: 'teambit.component/status',
     },
     // mini-status equivalent
   ];

   export default descriptors;
   ```

3. **`scopes/component/status/status-cmd.ts`** — refactor `StatusCmd` to read
   static fields from the descriptor (single source of truth):
   ```ts
   import descriptors from './status.commands';
   const descriptor = descriptors[0];

   export class StatusCmd implements Command {
     name = descriptor.name;
     alias = descriptor.alias!;
     description = descriptor.description;
     options = descriptor.options;
     // ... etc

     constructor(private status: StatusMain) {}
     async report(args, flags) { /* unchanged */ }
     async json(args, flags) { /* unchanged */ }
   }
   ```

4. **`scopes/component/status/status.main.runtime.ts`** — no structural change.
   Provider still calls `cli.register(new StatusCmd(statusMain))`. The
   descriptor is the source of static fields; the class is the source of
   handlers.

### Dispatch wiring (one-off for the pilot)

`scopes/harmony/cli/cli.main.runtime.ts` learns to recognize the pilot
descriptor at startup (without loading the runtime):

```ts
// Pilot wiring — generalized in chunk 05
import statusDescriptors from '@teambit/status/status.commands';
for (const d of statusDescriptors) {
  cliMain.registerDescriptor(d);  // descriptor only, no handler yet
}
```

`registerDescriptor(d)` stores enough to render `--help` and to dispatch.
When the user runs `bit status`, CLI calls
`await this.harmony.resolve('teambit.component/status')` before invoking the
handler — by which point the descriptor's `aspectId` has been used to look up
which runtime to load.

### Validation guard

A startup assertion ensures the descriptor and the class agree on static
fields:

```ts
function assertDescriptorMatchesClass(descriptor, cmdInstance) {
  // name, alias, description, options must match
  if (descriptor.name !== cmdInstance.name) throw new Error(...);
  // ...
}
```

Runs once per pilot aspect, in dev mode only. Fails loudly on drift.

## Acceptance criteria

- [ ] `bit status` works in a real workspace — golden path + JSON output.
- [ ] `bit s` (alias) works.
- [ ] `bit --help` shows `status` in the command list **without loading**
      the status runtime (verify via `BIT_TRACE_ASPECT_LOAD=1`).
- [ ] `bit status` triggers exactly one `resolve` call for the status aspect.
- [ ] Benchmark scenario `status-small` does **not regress** vs baseline.
- [ ] E2E test suite for status passes unchanged.
- [ ] Eager-mode (today's default) still works — feature gated by `BIT_LAZY_RESOLVE=1`.

## Risks

- **Slot contributions to commandsSlot** from other aspects targeting status.
  Audit: search for any `slot.register` that mentions status or that the
  status aspect consumes. Document findings.
- **Descriptor drift.** Mitigation: dev-mode assertion at startup.
- **`--help` rendering subtleties.** Status has subcommands? If so, descriptor
  must capture them. Verify before merging.

## Files touched

- `scopes/component/status/status.aspect.ts`
- `scopes/component/status/status.commands.ts` (new)
- `scopes/component/status/status-cmd.ts`
- `scopes/harmony/cli/cli.main.runtime.ts` (pilot dispatch wiring)
- `scopes/harmony/cli/cli-main.ts` (or wherever `CLIMain` is) — add
  `registerDescriptor`

## Out of scope

- Generalizing the pilot to all aspects (chunk 07).
- Codegenning the descriptor list (chunk 05).
- Slot-producer correctness for status's contributors (chunk 06).
