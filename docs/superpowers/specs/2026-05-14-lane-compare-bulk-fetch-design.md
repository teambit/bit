# Lane Compare — Bulk Fetch, Scoped Batching, and Registrar Rewiring

## Problem

Opening Lane Compare fires a request waterfall of ~4 GraphQL requests per component,
all eager, none batched. For a lane with N components this is an N+1 (really an N×4)
problem that takes tens of seconds to settle.

Per `InlineComponentCompare`, regardless of scroll position:

- `EagerFileRegistrar` → `useComponentCompareQuery` (the **full** `compareComponent`
  query: every file's full content + diff output) + `useComponent`
- `EagerAspectRegistrar` → **two** `GET_COMPONENT_ASPECTS` queries (base + compare),
  each with `fetchPolicy: 'no-cache'`

The eager registrars pull full file contents and diffs for every component just to
extract changed file/aspect _names_ for the sidebar. There is no request batching
(`GraphQLConfig.enableBatching` defaults to `false`, so every `useQuery` is its own
HTTP request), and `InlineContextProvider` adds a per-component dependency chain
(`useComponent` → `useComponentCompareQuery` → `useCode`).

## Goals

- Replace the per-component `compareComponent` + `GET_COMPONENT_ASPECTS` queries with
  a single **paginated bulk resolver** that returns full compare data for a list of
  component pairs.
- Load bulk data via **sequential background paging** so no single request is huge.
- Make GraphQL request batching **opt-in per operation**, scoped to the lane-compare
  workspace queries — the rest of the app is unaffected.
- Remove redundant per-component queries (`useComponent` for compositions,
  `GET_COMPONENT_ASPECTS`).

## Non-goals

- Enabling global `enableBatching`.
- Removing or changing the single `compareComponent` resolver / `useComponentCompareQuery`
  hook — kept for any other callers.
- Optimizing base-lane component-model loading (`useComponent` per component) beyond a
  minimal `context` passthrough — a possible follow-up.
- List virtualization.

## Architecture

### 1. Bulk resolver (server)

`scopes/component/component-compare/component-compare.graphql.ts` — add a paginated
bulk field on `ComponentHost`:

```graphql
input ComponentComparePair {
  baseId: String!
  compareId: String!
}

extend type ComponentHost {
  compareComponents(pairs: [ComponentComparePair!]!, offset: Int, limit: Int): [ComponentCompareResult]!
}
```

Resolver behavior:

- Slice `pairs` by `offset` / `limit` (defaults: `offset = 0`, `limit` = full list).
- `pMap` over the slice with `concurrentComponentsLimit()` concurrency, each entry →
  `componentCompareMain.compare(baseId, compareId)`.
- **Per-pair error isolation:** wrap each `compare()` in try/catch; on failure
  (e.g. `compare()` throws "no version yet") log and yield `null` for that slot.
  Elements are therefore **nullable** (`[ComponentCompareResult]!`) so one bad pair
  never fails the whole page.
- `ComponentCompareResult.id` stays `${baseId}-${compareId}` for Apollo normalization.
- The existing `ComponentCompareResult.api` field resolver is reused untouched — it
  resolves per-result, concurrently, only when the client selects `api`.

The single `compareComponent` resolver stays as-is.

### 2. Bulk context provider + UI rewiring

A new `LaneCompareCompareDataProvider` (lane-compare package) wraps the diff pane:

- Builds the full ordered `pairs` array from `componentsToDiff`.
- Fires `compareComponents` with `offset: 0, limit: PAGE_SIZE`.
- On each page's completion, calls Apollo `fetchMore` with the next `offset` until all
  pairs are covered — **sequential background paging**. Components render progressively
  as pages arrive.
- Exposes via React context: `Map<idStr, ComponentCompareResult | null>`, an overall
  `loading` flag, and a `loadedCount` for progressive UI.
- `PAGE_SIZE` is a module constant (initial default 25), easy to tune.

UI rewiring (all consumers are lane-compare-only, so this is a clean refactor, not a
breaking change to a shared component):

- `EagerFileRegistrar` / `EagerAspectRegistrar` — removed as query-firing components.
  Replaced by a single thin `RegistryFeeder` component rendered by the provider that, as
  bulk pages arrive, registers changed files / aspects into `FileRegistry`.
- `InlineContextProvider` — reads `componentCompareData` from the bulk context (keyed by
  `compareId` / `baseId`) instead of calling `useComponentCompareQuery`.
- `GET_COMPONENT_ASPECTS` and its two `no-cache` queries are **deleted**; the bulk
  result's `aspects` field replaces the client-side config/data diffing.

### 3. Scoped opt-in batching

`scopes/harmony/graphql/graphql.ui.runtime.tsx`, `createLink` (the default,
non-batched path):

- Always build a `BatchHttpLink` alongside the plain `HttpLink`.
- Route with `ApolloLink.split(op => op.getContext().batch === true, batchLink, httpLink)`.

This adds the _capability_ to opt into batching for every consumer of the graphql
aspect (the shared side effect), while actual behavior only changes for operations that
explicitly set `context: { batch: true }`. The global `enableBatching` config and the
`createLinkBatched` path are left untouched.

- `useComponent` / `useCode` get a minimal change to forward an Apollo `context` option.
- Lane-compare's remaining per-component queries — `useComponent` (base/compare) and
  `useCode` (new components) — pass `context: { batch: true }`.
- The bulk `compareComponents` query is **not** batched (it is already a single large
  query; batching coalesces many small ones).

### 4. Small-waste cleanup

- `EagerFileRegistrar`'s `useComponent` call (used only for `hasCompositions`) is
  removed — `lane-compare.tsx` already derives `compositionsMap` from
  `useLaneComponents` descriptors. The redundant `useCompositionsRegistryRegister` path
  is sourced from that map instead.
- Net result: per visible component drops from ~4 eager queries to reading shared
  context plus, at most, batched `useComponent` / `useCode`.

## Data flow

```
componentsToDiff (lane-compare)
  → LaneCompareCompareDataProvider builds ordered pairs
  → compareComponents(pairs, offset:0, limit:PAGE_SIZE)
  → fetchMore(offset += PAGE_SIZE) ... until all pairs loaded   [sequential]
  → context: Map<idStr, ComponentCompareResult | null>
      → RegistryFeeder registers changed files/aspects into FileRegistry  → sidebar
      → InlineContextProvider reads componentCompareData by id            → inline diff
  → useComponent / useCode (visible components only) with context:{batch:true}
      → BatchHttpLink coalesces
```

## Error handling

- **Bulk resolver:** per-pair try/catch → `null` element + logged error. A page request
  itself can still fail (network) — that surfaces as a query error.
- **Provider:** a failed page sets an `error` state; pages already loaded stay usable;
  `fetchMore` failure stops the sequence without discarding loaded data.
- **UI:** `InlineContextProvider` treats a `null` / missing bulk entry the same as the
  current `!componentCompareData` case (skeleton / unavailable).

## Testing

- **Server unit tests** (`component-compare`): `compareComponents` resolver — pagination
  slicing (offset/limit), per-pair error isolation (one throwing pair → `null`, others
  unaffected), concurrency.
- **E2E:** a component-compare e2e exercising the bulk resolver, following existing
  `lanes.spec.ts` patterns.
- **Provider paging:** a small unit test for offset progression / termination.
- **UI behavior:** verified manually by the user (per established preference) —
  no automated UI runs in the plan.

## Known details / risks

- **Aspect granularity:** `EagerAspectRegistrar`'s client-side config/data diff is
  replaced by `ComponentCompareResult.aspects` (the `fields` from `compare()`). The
  field granularity may differ from the previous per-aspect-id list; the registrar
  mapping (or the resolver) is adjusted during implementation to preserve the sidebar's
  aspect list.
- **Context passthrough:** `useComponent` / `useCode` currently may not forward an
  Apollo `context` option — a minimal one-line change each.
- **PAGE_SIZE** is a guess (25) pending real-world tuning.
