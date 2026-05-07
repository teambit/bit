# Component Snapshot Contract

The diff harness compares loaders by serializing each loaded `Component` to a
`NormalizedSnapshot` and diffing the two snapshots. The set of fields included
in the snapshot **is** the contract: anything in the snapshot must match
between V1 and V2; anything not in the snapshot, V2 is free to change.

The snapshot is deliberately small at the start. Fields are added one at a time
as we discover what matters. Adding a field is cheap; removing a field once
something depends on it is not — so err on the side of starting minimal.

## Determinism rules

- Arrays are sorted by a stable key (usually `id` or `aspectId`) before serialization.
- Object keys are emitted in sorted order (use `JSON.stringify` with a replacer
  that sorts keys).
- Versions, hashes, and other identifiers are emitted as strings.
- Timestamp fields are excluded.
- File contents are excluded — too large, and orthogonal to the loader's job.

## Fields (v0 — minimal)

| Field          | Source                                | Notes                                       |
| -------------- | ------------------------------------- | ------------------------------------------- |
| `id`           | `component.id.toString()`             | Full id including scope and version         |
| `head`         | `component.head?.toString() ?? null`  | Scope HEAD hash, or null for new components |
| `tags`         | sorted versions from `component.tags` | Tag versions present in scope               |
| `extensionIds` | sorted aspect ids from `state.config` | Just the ids first; data added in v1        |

## Fields (v1 — once v0 is stable on V1-vs-V1)

| Field        | Source                                               | Notes                                       |
| ------------ | ---------------------------------------------------- | ------------------------------------------- |
| `extensions` | `state.config.extensions`, sorted by id, with `data` | Full extension payloads, JSON-stable        |
| `envId`      | env descriptor id                                    | Resolved env, e.g. `teambit.harmony/aspect` |
| `envType`    | env descriptor type                                  |                                             |
| `aspects`    | `state.aspects` entries, sorted by id, with `config` | Post-`onComponentLoad` slot state           |

## Fields (v2 — once v1 is stable)

| Field          | Source                                | Notes                                            |
| -------------- | ------------------------------------- | ------------------------------------------------ |
| `dependencies` | from `dep-resolver` data on component | Sorted by package name; capture version + scope  |
| `isModified`   | `component.isModified()`              | The single most failure-prone consumer of loader |

## Out of scope (intentionally)

- File contents, file paths, `state.filesystem` — orthogonal to loader correctness.
- Slot subscriber side effects (writes to other state) — covered by e2e tests, not by the snapshot.
- Cache hit/miss counts — observable indirectly via performance, not via output equivalence.
- Component object identity — V2 may construct different `Component` instances. We compare values, not references.

## How to extend

When you find a behavior that the harness misses (something diverges between
V1 and the rewritten loader and the harness reports zero diffs), add the
relevant field here, update `snapshot.ts`, and rerun the V1-vs-V1 baseline. If
V1-vs-V1 isn't zero on the new field, the field needs a normalization rule
before it can join the contract.

## Command coverage

The harness wraps `Workspace.componentLoader`, so any command that loads
components via `workspace.get` / `workspace.getMany` / `workspace.getIfExist`
is covered. Confirmed:

- `bit status` — covered (loads components, then compares against scope state).
- `bit show <id>` — covered (calls `host.get(id)` which routes to the loader).

**Not covered, by design:**

- `bit list` — only reads `consumer.bitMap.bitmapIdsFromCurrentLane`. No
  components are loaded. The harness can't observe what doesn't run.

If you find a command that loads components but doesn't trigger the harness,
that's a real gap — either the command is using a different loader path
(`consumer.loadComponents` directly, scope-only loading, etc.) or the wrapping
in `Workspace`'s constructor missed something. File it as a follow-up.

## Sample rate (`BIT_LOADER_DIFF_SAMPLE`)

On large workspaces (bit7 itself, ~300 components), running both loaders for
every call doubles cache footprint and can OOM Node's default 4GB heap. Set
`BIT_LOADER_DIFF_SAMPLE=10` to run the partner only every 10th call. The
trade-off: sampling can miss regressions that only manifest on the
non-sampled calls. Use the lowest sample rate the workspace can afford.
