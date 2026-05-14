# Lane Compare — Bulk Fetch, Scoped Batching, Registrar Rewiring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the lane-compare per-component GraphQL request waterfall (~4 eager requests × N components) with one paginated bulk query, scoped opt-in request batching, and registrar rewiring.

**Architecture:** A new paginated `compareComponents` GraphQL resolver returns full compare data for a list of component pairs. A `CompareDataProvider` (component-compare package) fires it once for the whole lane list with sequential background paging, and distributes results via React context. The eager per-component registrars are removed; `InlineContextProvider` and a thin `RegistryFeeder` read from the bulk context. GraphQL gains an opt-in `context: { batch: true }` link split so the few remaining per-component `useComponent` queries coalesce.

**Tech Stack:** TypeScript, Bit aspects, GraphQL (`graphql-tag`, `@graphql-tools`), Apollo Client 3, React 17, `p-map`, mocha + chai.

**Spec:** `docs/superpowers/specs/2026-05-14-lane-compare-bulk-fetch-design.md`

---

## File Structure

**Server (component-compare aspect):**

- Create: `scopes/component/component-compare/compare-component-pairs.ts` — pure pagination + per-pair error-isolation helper.
- Create: `scopes/component/component-compare/compare-component-pairs.spec.ts` — unit test for the helper.
- Modify: `scopes/component/component-compare/component-compare.main.runtime.ts` — add `compareComponents()` method.
- Modify: `scopes/component/component-compare/component-compare.graphql.ts` — add `ComponentComparePair` input, `compareComponents` field, `baseId`/`compareId` on `ComponentCompareResult`, resolver.

**GraphQL aspect:**

- Modify: `scopes/harmony/graphql/graphql.ui.runtime.tsx` — opt-in batch link split in `createLink`.

**Component aspect (context passthrough):**

- Modify: `scopes/component/component/ui/use-component.model.ts` — `context` on `UseComponentOptions`, `UseComponentType` signature.
- Modify: `scopes/component/component/ui/use-component.tsx` — forward `context`.
- Modify: `scopes/component/component/ui/use-component-query.ts` — accept + forward `context`.
- Modify: `scopes/component/component/ui/use-component-logs.ts` — accept + forward `context`.

**component-compare package:**

- Create: `components/ui/component-compare/component-compare/compare-data-context.tsx` — `CompareDataProvider`, `useCompareData`, bulk query, sequential paging.
- Modify: `components/ui/component-compare/component-compare/component-compare.tsx` — delete `EagerFileRegistrar`/`EagerAspectRegistrar`/`GET_COMPONENT_ASPECTS`, add `RegistryFeeder` + `NewComponentFileRegistrar`, rewire `InlineComponentCompare` + `InlineContextProvider`.
- Modify: `components/ui/component-compare/component-compare/index.ts` — export `CompareDataProvider`, `useCompareData`, `RegistryFeeder`.

**lane-compare package:**

- Modify: `components/ui/compare/lane-compare/lane-compare.tsx` — wrap diff pane with `CompareDataProvider` + `RegistryFeeder`, build memoized pairs.

---

## Task 1: Pure pagination + error-isolation helper

**Files:**

- Create: `scopes/component/component-compare/compare-component-pairs.ts`
- Test: `scopes/component/component-compare/compare-component-pairs.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `scopes/component/component-compare/compare-component-pairs.spec.ts`:

```ts
import { expect } from 'chai';
import { compareComponentPairs } from './compare-component-pairs';
import type { ComponentComparePair } from './compare-component-pairs';

describe('compareComponentPairs', () => {
  const pairs: ComponentComparePair[] = [
    { baseId: 'a@1', compareId: 'a@2' },
    { baseId: 'b@1', compareId: 'b@2' },
    { baseId: 'c@1', compareId: 'c@2' },
  ];

  it('returns one result per pair, preserving order', async () => {
    const results = await compareComponentPairs(
      pairs,
      async (baseId, compareId) => ({ id: `${baseId}-${compareId}` }),
      { concurrency: 2 }
    );
    expect(results).to.deep.equal([{ id: 'a@1-a@2' }, { id: 'b@1-b@2' }, { id: 'c@1-c@2' }]);
  });

  it('slices by offset and limit', async () => {
    const results = await compareComponentPairs(pairs, async (baseId) => ({ id: baseId }), {
      offset: 1,
      limit: 1,
      concurrency: 2,
    });
    expect(results).to.deep.equal([{ id: 'b@1' }]);
  });

  it('returns an empty array when offset is past the end', async () => {
    const results = await compareComponentPairs(pairs, async (b) => ({ id: b }), {
      offset: 99,
      concurrency: 2,
    });
    expect(results).to.deep.equal([]);
  });

  it('isolates a failing pair as null without failing the others', async () => {
    const errors: ComponentComparePair[] = [];
    const results = await compareComponentPairs(
      pairs,
      async (baseId) => {
        if (baseId === 'b@1') throw new Error('no version yet');
        return { id: baseId };
      },
      {
        concurrency: 2,
        onError: (pair) => errors.push(pair),
      }
    );
    expect(results).to.deep.equal([{ id: 'a@1' }, null, { id: 'c@1' }]);
    expect(errors).to.deep.equal([{ baseId: 'b@1', compareId: 'b@2' }]);
  });

  it('returns an empty array for empty input', async () => {
    const results = await compareComponentPairs([], async (b) => ({ id: b }), { concurrency: 2 });
    expect(results).to.deep.equal([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bit test teambit.component/component-compare`
Expected: FAIL — `Cannot find module './compare-component-pairs'`.

- [ ] **Step 3: Write the helper**

Create `scopes/component/component-compare/compare-component-pairs.ts`:

```ts
import pMap from 'p-map';

export type ComponentComparePair = {
  baseId: string;
  compareId: string;
};

export type CompareComponentPairsOptions = {
  /** index into `pairs` to start from (default 0) */
  offset?: number;
  /** number of pairs to process from `offset` (default: the rest of the list) */
  limit?: number;
  /** max number of pairs compared in parallel */
  concurrency: number;
  /** invoked when a single pair's comparison throws; that pair's slot becomes null */
  onError?: (pair: ComponentComparePair, err: unknown) => void;
};

/**
 * compares a paginated slice of component pairs with bounded concurrency.
 * a pair whose `compareFn` throws becomes `null` in the result instead of failing the whole batch.
 * the returned array is aligned to the requested slice (`pairs[offset .. offset + limit]`).
 */
export async function compareComponentPairs<T>(
  pairs: ComponentComparePair[],
  compareFn: (baseId: string, compareId: string) => Promise<T>,
  options: CompareComponentPairsOptions
): Promise<Array<T | null>> {
  const offset = options.offset ?? 0;
  const limit = options.limit ?? pairs.length - offset;
  const slice = pairs.slice(offset, offset + limit);

  return pMap(
    slice,
    async (pair): Promise<T | null> => {
      try {
        return await compareFn(pair.baseId, pair.compareId);
      } catch (err) {
        options.onError?.(pair, err);
        return null;
      }
    },
    { concurrency: options.concurrency }
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bit test teambit.component/component-compare`
Expected: PASS — all 5 `compareComponentPairs` tests green.

- [ ] **Step 5: Commit**

```bash
git add scopes/component/component-compare/compare-component-pairs.ts scopes/component/component-compare/compare-component-pairs.spec.ts
git commit -m "feat(component-compare): add paginated compare-pairs helper"
```

---

## Task 2: `ComponentCompareMain.compareComponents()` method

**Files:**

- Modify: `scopes/component/component-compare/component-compare.main.runtime.ts`

- [ ] **Step 1: Add imports**

In `scopes/component/component-compare/component-compare.main.runtime.ts`, add to the import block (after the existing `import { ImporterAspect } from '@teambit/importer';` line near the top):

```ts
import { concurrentComponentsLimit } from '@teambit/harmony.modules.concurrency';
import { compareComponentPairs } from './compare-component-pairs';
import type { ComponentComparePair } from './compare-component-pairs';
```

- [ ] **Step 2: Add the `compareComponents` method**

In `scopes/component/component-compare/component-compare.main.runtime.ts`, immediately after the `compare()` method (it ends with the `return { id, baseId, compareId, code, fields, tests };` block and its closing `}`), add:

```ts
  /**
   * compare a paginated slice of component pairs in one call.
   * a pair that fails to compare (e.g. a component without versions) becomes `null` in the
   * returned array rather than failing the whole batch. the array is aligned to the requested
   * slice (`pairs[offset .. offset + limit]`).
   */
  async compareComponents(
    pairs: ComponentComparePair[],
    options?: { offset?: number; limit?: number }
  ): Promise<Array<ComponentCompareResult | null>> {
    return compareComponentPairs(
      pairs,
      (baseId, compareId) => this.compare(baseId, compareId),
      {
        offset: options?.offset,
        limit: options?.limit,
        concurrency: concurrentComponentsLimit(),
        onError: (pair, err) => {
          this.logger.warn(
            `compareComponents: failed to compare ${pair.baseId} <> ${pair.compareId}: ${err}`
          );
        },
      }
    );
  }
```

- [ ] **Step 3: Verify compilation**

Run: `npm run lint`
Expected: PASS — 0 errors. (`tsc --noEmit` confirms the method, imports, and types check.)

- [ ] **Step 4: Commit**

```bash
git add scopes/component/component-compare/component-compare.main.runtime.ts
git commit -m "feat(component-compare): add compareComponents bulk method"
```

---

## Task 3: GraphQL bulk field + resolver

**Files:**

- Modify: `scopes/component/component-compare/component-compare.graphql.ts`

- [ ] **Step 1: Add the `ComponentComparePair` input and `compareComponents` field to typeDefs**

In `scopes/component/component-compare/component-compare.graphql.ts`, the `typeDefs` template currently ends with:

```graphql
extend type ComponentHost {
  compareComponent(baseId: String!, compareId: String!): ComponentCompareResult
}
```

Replace that block with:

```graphql
input ComponentComparePair {
  baseId: String!
  compareId: String!
}

extend type ComponentHost {
  compareComponent(baseId: String!, compareId: String!): ComponentCompareResult
  compareComponents(pairs: [ComponentComparePair!]!, offset: Int, limit: Int): [ComponentCompareResult]!
}
```

- [ ] **Step 2: Expose `baseId` / `compareId` on `ComponentCompareResult`**

In the same `typeDefs`, the `ComponentCompareResult` type currently reads:

```graphql
type ComponentCompareResult {
  # unique id for graphql - baseId + compareId
  id: String!
  code(fileName: String): [FileCompareResult!]!
  aspects(aspectName: String): [FieldCompareResult!]!
  tests(fileName: String): [FileCompareResult!]
  api: APIDiffResult
}
```

Replace it with (adds `baseId` / `compareId` so the client can key bulk results by the exact ids it requested):

```graphql
type ComponentCompareResult {
  # unique id for graphql - baseId + compareId
  id: String!
  baseId: String!
  compareId: String!
  code(fileName: String): [FileCompareResult!]!
  aspects(aspectName: String): [FieldCompareResult!]!
  tests(fileName: String): [FileCompareResult!]
  api: APIDiffResult
}
```

`baseId` / `compareId` already exist on the `ComponentCompareResult` object returned by `compare()`, so the default field resolver handles them — no resolver change needed for those two fields.

- [ ] **Step 3: Add the `compareComponents` resolver**

In `scopes/component/component-compare/component-compare.graphql.ts`, the `ComponentHost` resolver block currently reads:

```ts
      ComponentHost: {
        compareComponent: async (_, { baseId, compareId }: { baseId: string; compareId: string }) => {
          return componentCompareMain.compare(baseId, compareId);
        },
      },
```

Replace it with:

```ts
      ComponentHost: {
        compareComponent: async (_, { baseId, compareId }: { baseId: string; compareId: string }) => {
          return componentCompareMain.compare(baseId, compareId);
        },
        compareComponents: async (
          _,
          {
            pairs,
            offset,
            limit,
          }: { pairs: Array<{ baseId: string; compareId: string }>; offset?: number; limit?: number }
        ) => {
          return componentCompareMain.compareComponents(pairs, { offset, limit });
        },
      },
```

- [ ] **Step 4: Verify compilation**

Run: `npm run lint`
Expected: PASS — 0 errors.

- [ ] **Step 5: Compile the aspect so the runtime picks up the schema**

Run: `bit compile teambit.component/component-compare`
Expected: `✔ 1/1 components compiled successfully.`

- [ ] **Step 6: Commit**

```bash
git add scopes/component/component-compare/component-compare.graphql.ts
git commit -m "feat(component-compare): add compareComponents bulk GraphQL field"
```

---

## Task 4: Scoped opt-in GraphQL batching

**Files:**

- Modify: `scopes/harmony/graphql/graphql.ui.runtime.tsx:139-155` (`createLink`)

- [ ] **Step 1: Rewrite `createLink` to add an opt-in batch split**

In `scopes/harmony/graphql/graphql.ui.runtime.tsx`, the `createLink` method currently reads:

```ts
  private createLink(uri: string, { subscriptionUri }: { subscriptionUri?: string } = {}) {
    if (this.config.enableBatching) {
      return this.createLinkBatched(uri, { subscriptionUri });
    }
    const httpLink = new HttpLink({ credentials: 'include', uri });
    const subsLink = subscriptionUri
      ? new WebSocketLink({
          uri: subscriptionUri,
          options: { reconnect: true },
        })
      : undefined;

    const hybridLink = subsLink ? createSplitLink(httpLink, subsLink) : httpLink;
    const errorLogger = onError(logError);

    return ApolloLink.from([errorLogger, hybridLink]);
  }
```

Replace it with:

```ts
  private createLink(uri: string, { subscriptionUri }: { subscriptionUri?: string } = {}) {
    if (this.config.enableBatching) {
      return this.createLinkBatched(uri, { subscriptionUri });
    }
    const httpLink = new HttpLink({ credentials: 'include', uri });
    const batchHttpLink = new BatchHttpLink({
      uri,
      credentials: 'include',
      batchInterval: this.config.batchInterval,
      batchMax: this.config.batchMax,
    });
    // opt-in batching: an operation that sets `context: { batch: true }` is coalesced via
    // BatchHttpLink; every other operation keeps going through the plain HttpLink unchanged.
    const httpOrBatchLink = ApolloLink.split(
      (operation) => operation.getContext().batch === true,
      batchHttpLink,
      httpLink
    );
    const subsLink = subscriptionUri
      ? new WebSocketLink({
          uri: subscriptionUri,
          options: { reconnect: true },
        })
      : undefined;

    const hybridLink = subsLink ? createSplitLink(httpOrBatchLink, subsLink) : httpOrBatchLink;
    const errorLogger = onError(logError);

    return ApolloLink.from([errorLogger, hybridLink]);
  }
```

`BatchHttpLink` is already imported at the top of the file (`import { BatchHttpLink } from '@apollo/client/link/batch-http';`). `this.config.batchInterval` / `batchMax` already have defaults (`50` / `20`) in `static defaultConfig`.

- [ ] **Step 2: Verify compilation**

Run: `npm run lint`
Expected: PASS — 0 errors.

- [ ] **Step 3: Compile the aspect**

Run: `bit compile teambit.harmony/graphql`
Expected: `✔ 1/1 components compiled successfully.`

- [ ] **Step 4: Commit**

```bash
git add scopes/harmony/graphql/graphql.ui.runtime.tsx
git commit -m "feat(graphql): add opt-in per-operation request batching"
```

---

## Task 5: `context` passthrough through the `useComponent` chain

**Files:**

- Modify: `scopes/component/component/ui/use-component.model.ts`
- Modify: `scopes/component/component/ui/use-component.tsx`
- Modify: `scopes/component/component/ui/use-component-query.ts`
- Modify: `scopes/component/component/ui/use-component-logs.ts`

- [ ] **Step 1: Add `context` to `UseComponentOptions` and `UseComponentType`**

In `scopes/component/component/ui/use-component.model.ts`, the `UseComponentOptions` type currently reads:

```ts
export type UseComponentOptions = {
  version?: string;
  logFilters?: Filters;
  customUseComponent?: UseComponentType;
  skip?: boolean;
};
```

Replace it with:

```ts
export type UseComponentOptions = {
  version?: string;
  logFilters?: Filters;
  customUseComponent?: UseComponentType;
  skip?: boolean;
  /** apollo operation context forwarded to the underlying queries (e.g. `{ batch: true }`) */
  context?: Record<string, any>;
};
```

In the same file, `UseComponentType` currently reads:

```ts
export type UseComponentType = (id: string, host: string, filters?: Filters, skip?: boolean) => ComponentQueryResult;
```

Replace it with:

```ts
export type UseComponentType = (
  id: string,
  host: string,
  filters?: Filters,
  skip?: boolean,
  context?: Record<string, any>
) => ComponentQueryResult;
```

- [ ] **Step 2: Forward `context` from `useComponent`**

In `scopes/component/component/ui/use-component.tsx`, the `useComponent` function currently reads:

```ts
export function useComponent(host: string, id?: string, options?: UseComponentOptions): ComponentQueryResult {
  const query = useQuery();
  const { version, logFilters, customUseComponent, skip } = options || {};
  const componentVersion = (version || query.get('version')) ?? undefined;

  const componentIdStr = id && withVersion(id, componentVersion);
  const targetUseComponent = customUseComponent || useComponentQuery;

  return targetUseComponent(componentIdStr || '', host, logFilters, skip || !id);
}
```

Replace it with:

```ts
export function useComponent(host: string, id?: string, options?: UseComponentOptions): ComponentQueryResult {
  const query = useQuery();
  const { version, logFilters, customUseComponent, skip, context } = options || {};
  const componentVersion = (version || query.get('version')) ?? undefined;

  const componentIdStr = id && withVersion(id, componentVersion);
  const targetUseComponent = customUseComponent || useComponentQuery;

  return targetUseComponent(componentIdStr || '', host, logFilters, skip || !id, context);
}
```

- [ ] **Step 3: Accept + forward `context` in `useComponentQuery`**

In `scopes/component/component/ui/use-component-query.ts`, the `useComponentQuery` signature and its two query calls currently read:

```ts
export function useComponentQuery(
  componentId: string,
  host: string,
  filters?: Filters,
  skip?: boolean
): ComponentQueryResult {
  const idRef = useRef(componentId);
  idRef.current = componentId;
  const variables = {
    id: componentId,
    extensionId: host,
  };

  const { data, error, loading } = useDataQuery(GET_COMPONENT, {
    variables,
    skip,
    errorPolicy: 'all',
  });

  const { loading: loadingLogs, componentLogs: { logs } = {} } = useComponentLogs(componentId, host, filters, skip);
```

Replace that span with:

```ts
export function useComponentQuery(
  componentId: string,
  host: string,
  filters?: Filters,
  skip?: boolean,
  context?: Record<string, any>
): ComponentQueryResult {
  const idRef = useRef(componentId);
  idRef.current = componentId;
  const variables = {
    id: componentId,
    extensionId: host,
  };

  const { data, error, loading } = useDataQuery(GET_COMPONENT, {
    variables,
    skip,
    errorPolicy: 'all',
    context,
  });

  const { loading: loadingLogs, componentLogs: { logs } = {} } = useComponentLogs(
    componentId,
    host,
    filters,
    skip,
    context
  );
```

- [ ] **Step 4: Accept + forward `context` in `useComponentLogs`**

In `scopes/component/component/ui/use-component-logs.ts`, the `useComponentLogs` signature and its query call currently read:

```ts
export function useComponentLogs(
  componentId: string,
  host: string,
  filters?: Filters,
  skipFromProps?: boolean
): ComponentLogsResult {
  const { variables, skip } = useComponentLogsInit(componentId, host, filters, skipFromProps);

  const { data, error, loading } = useDataQuery(GET_COMPONENT_WITH_LOGS, {
    variables,
    skip,
    errorPolicy: 'all',
  });
```

Replace that span with:

```ts
export function useComponentLogs(
  componentId: string,
  host: string,
  filters?: Filters,
  skipFromProps?: boolean,
  context?: Record<string, any>
): ComponentLogsResult {
  const { variables, skip } = useComponentLogsInit(componentId, host, filters, skipFromProps);

  const { data, error, loading } = useDataQuery(GET_COMPONENT_WITH_LOGS, {
    variables,
    skip,
    errorPolicy: 'all',
    context,
  });
```

- [ ] **Step 5: Verify compilation**

Run: `npm run lint`
Expected: PASS — 0 errors.

- [ ] **Step 6: Compile the aspect**

Run: `bit compile teambit.component/component`
Expected: `✔ 1/1 components compiled successfully.`

- [ ] **Step 7: Commit**

```bash
git add scopes/component/component/ui/use-component.model.ts scopes/component/component/ui/use-component.tsx scopes/component/component/ui/use-component-query.ts scopes/component/component/ui/use-component-logs.ts
git commit -m "feat(component): forward optional apollo context through useComponent"
```

---

## Task 6: `CompareDataProvider` + `useCompareData` (bulk query + paging)

**Files:**

- Create: `components/ui/component-compare/component-compare/compare-data-context.tsx`
- Modify: `components/ui/component-compare/component-compare/index.ts`

- [ ] **Step 1: Create the bulk-data context, provider, and hook**

Create `components/ui/component-compare/component-compare/compare-data-context.tsx`:

```tsx
import React, { createContext, useContext, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { gql } from '@apollo/client';
import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';

/** number of component pairs requested per bulk page */
export const COMPARE_PAGE_SIZE = 25;

export type ComponentComparePair = {
  baseId: string;
  compareId: string;
};

/** shape of a single bulk `compareComponents` result (mirrors the per-component `compareComponent` query) */
export type CompareComponentData = {
  id: string;
  baseId: string;
  compareId: string;
  code: Array<{
    status?: string;
    fileName: string;
    diffOutput?: string;
    baseContent?: string;
    compareContent?: string;
  }>;
  aspects: Array<{ fieldName: string; diffOutput?: string }>;
  tests?: Array<{
    status?: string;
    fileName: string;
    diffOutput?: string;
    baseContent?: string;
    compareContent?: string;
  }>;
};

export const QUERY_COMPARE_COMPONENTS = gql`
  query CompareComponents($pairs: [ComponentComparePair!]!, $offset: Int, $limit: Int) {
    getHost {
      id
      compareComponents(pairs: $pairs, offset: $offset, limit: $limit) {
        id
        baseId
        compareId
        code {
          status
          fileName
          diffOutput
          baseContent
          compareContent
        }
        aspects {
          fieldName
          diffOutput
        }
        tests {
          status
          fileName
          diffOutput
          baseContent
          compareContent
        }
      }
    }
  }
`;

export type CompareDataContextModel = {
  /** look up bulk compare data for a component by its `compareId`; `null` = failed to compare, `undefined` = not loaded yet */
  getData: (compareId: string) => CompareComponentData | null | undefined;
  /** true until every page has loaded */
  loading: boolean;
  /** number of pairs whose data has loaded so far */
  loadedCount: number;
};

const CompareDataContext = createContext<CompareDataContextModel | undefined>(undefined);

export function useCompareData(): CompareDataContextModel | undefined {
  return useContext(CompareDataContext);
}

/**
 * fires the bulk `compareComponents` query for the whole `pairs` list and exposes the results via context.
 * loads sequentially in pages of COMPARE_PAGE_SIZE — page 1 first, then fetchMore for each subsequent page
 * in the background until all pairs are covered.
 */
export function CompareDataProvider({ pairs, children }: { pairs: ComponentComparePair[]; children: ReactNode }) {
  const skip = pairs.length === 0;

  const { data, loading, fetchMore } = useDataQuery(QUERY_COMPARE_COMPONENTS, {
    variables: { pairs, offset: 0, limit: COMPARE_PAGE_SIZE },
    skip,
    notifyOnNetworkStatusChange: true,
  });

  const results: Array<CompareComponentData | null> = data?.getHost?.compareComponents ?? [];
  const allLoaded = skip || results.length >= pairs.length;

  // sequential background paging: whenever a page settles and pairs remain, request the next page.
  useEffect(() => {
    if (skip || loading || allLoaded) return;
    fetchMore({
      variables: { pairs, offset: results.length, limit: COMPARE_PAGE_SIZE },
      updateQuery: (prev: any, { fetchMoreResult }: any) => {
        if (!fetchMoreResult) return prev;
        return {
          getHost: {
            ...prev.getHost,
            compareComponents: [
              ...(prev.getHost?.compareComponents ?? []),
              ...(fetchMoreResult.getHost?.compareComponents ?? []),
            ],
          },
        };
      },
    }).catch(() => {
      // a failed page stops the sequence; pages already loaded stay usable.
    });
  }, [skip, loading, allLoaded, results.length, pairs, fetchMore]);

  const dataByCompareId = useMemo(() => {
    const map = new Map<string, CompareComponentData | null>();
    results.forEach((res, i) => {
      const pair = pairs[i];
      if (pair) map.set(pair.compareId, res ?? null);
    });
    return map;
  }, [results, pairs]);

  const value = useMemo<CompareDataContextModel>(
    () => ({
      getData: (compareId: string) => dataByCompareId.get(compareId),
      loading: !allLoaded,
      loadedCount: results.length,
    }),
    [dataByCompareId, allLoaded, results.length]
  );

  return <CompareDataContext.Provider value={value}>{children}</CompareDataContext.Provider>;
}
```

- [ ] **Step 2: Export the new module**

In `components/ui/component-compare/component-compare/index.ts`, the file currently ends with:

```ts
export { InlineComponentCompare, ComponentCompareHeader } from './component-compare';
export type { InlineComponentCompareProps, ComponentCompareHeaderProps } from './component-compare';
```

Append after those lines:

```ts
export { CompareDataProvider, useCompareData, COMPARE_PAGE_SIZE } from './compare-data-context';
export type { CompareDataContextModel, CompareComponentData, ComponentComparePair } from './compare-data-context';
```

(`RegistryFeeder` is exported in Task 7, once it exists in `component-compare.tsx`.)

- [ ] **Step 3: Verify compilation**

Run: `npm run lint`
Expected: PASS — 0 errors. The new context file and its exports type-check on their own.

- [ ] **Step 4: Commit**

```bash
git add components/ui/component-compare/component-compare/compare-data-context.tsx components/ui/component-compare/component-compare/index.ts
git commit -m "feat(component-compare): add CompareDataProvider bulk-fetch context"
```

---

## Task 7: Rewire `component-compare.tsx` to the bulk context

**Files:**

- Modify: `components/ui/component-compare/component-compare/component-compare.tsx`

This task removes the two eager registrars and the `GET_COMPONENT_ASPECTS` query, adds `RegistryFeeder` and `NewComponentFileRegistrar`, and rewires `InlineComponentCompare` + `InlineContextProvider` to read from the bulk context.

- [ ] **Step 1: Update imports**

In `components/ui/component-compare/component-compare/component-compare.tsx`, the import at line 13 currently reads:

```ts
import { useComponentCompareQuery } from '@teambit/component.ui.component-compare.hooks.use-component-compare';
```

Delete that line.

The import at line 8 currently reads:

```ts
import { useFileRegistryRegister, useAspectRegistryRegister, useCompositionsRegistryRegister } from './file-registry';
```

Replace it with (drops `useCompositionsRegistryRegister` — after this task nothing in `component-compare.tsx` calls it, and `getHasCompositions` has no readers anywhere; `lane-compare.tsx` derives its own `compositionsMap` from `useLaneComponents` descriptors. The hook stays defined/exported in `file-registry.tsx` / `index.ts` — only this file stops importing it):

```ts
import { useFileRegistryRegister, useAspectRegistryRegister } from './file-registry';
```

Add a new import directly below the `file-registry` import:

```ts
import { useCompareData } from './compare-data-context';
import type { ComponentComparePair, CompareComponentData } from './compare-data-context';
```

- [ ] **Step 2: Rewrite `InlineComponentCompare`'s render body**

In `components/ui/component-compare/component-compare/component-compare.tsx`, inside `InlineComponentCompare`, the returned JSX currently contains:

```tsx
        <EagerFileRegistrar baseId={baseId} compareId={compareId} host={host} />
        <EagerAspectRegistrar baseId={baseId} compareId={compareId} />

        {!hasBeenVisible && <InlineSkeleton lines={1} />}
```

Replace those three lines with:

```tsx
{
  !baseId && !!compareId && <NewComponentFileRegistrar compareId={compareId} host={host} />;
}

{
  !hasBeenVisible && <InlineSkeleton lines={1} />;
}
```

(Non-new components no longer need a per-component registrar — `RegistryFeeder` handles them. New components keep a minimal file registrar.)

- [ ] **Step 3: Replace `InlineContextProvider` with a bulk-context-aware version**

In `components/ui/component-compare/component-compare/component-compare.tsx`, the entire `InlineContextProvider` function (it starts with `function InlineContextProvider({` and ends at its closing `}` before `export function EagerFileRegistrar({`) currently reads as the original implementation. Replace the **whole function** with:

```tsx
function InlineContextProvider({
  baseId,
  compareId,
  host = 'teambit.scope/scope',
  children,
}: {
  baseId?: string;
  compareId?: string;
  host?: string;
  children: ReactNode;
}) {
  const isNew = !baseId && !!compareId;

  const { component: baseModel, componentDescriptor: baseDescriptor } = useComponent(host, baseId, {
    skip: !baseId,
    context: { batch: true },
  });
  const { component: compareModel, componentDescriptor: compareDescriptor } = useComponent(host, compareId, {
    skip: !compareId,
    context: { batch: true },
  });

  const hasBase = !baseId || !!baseModel;
  const hasCompare = !compareId || !!compareModel;

  const compareData = useCompareData();
  const componentCompareData = compareId ? compareData?.getData(compareId) : undefined;
  // for non-new components: undefined = bulk page not loaded yet, null = pair failed to compare.
  const compCompareLoading = !isNew && componentCompareData === undefined;

  const { fileTree: newCompFileTree, loading: newCompCodeLoading } = useCode(isNew ? compareModel?.id : undefined);

  const fileCompareDataByName = useMemo(() => {
    if (isNew) {
      if (newCompCodeLoading || !newCompFileTree) return undefined;
      const lookup = new Map();
      newCompFileTree.forEach((fileName: string) => {
        lookup.set(fileName, { fileName, baseContent: '', compareContent: undefined, status: 'NEW' });
      });
      return lookup;
    }
    if (compCompareLoading) return undefined;
    if (!componentCompareData) return null;
    const lookup = new Map();
    (componentCompareData.code || []).forEach((f: any) => {
      lookup.set(f.fileName, f);
    });
    return lookup;
  }, [isNew, newCompCodeLoading, newCompFileTree, compCompareLoading, componentCompareData]);

  const fieldCompareDataByName = useMemo(() => {
    if (compCompareLoading) return undefined;
    if (!componentCompareData) return null;
    const lookup = new Map();
    (componentCompareData.aspects || []).forEach((a: any) => lookup.set(a.fieldName, a));
    return lookup;
  }, [compCompareLoading, componentCompareData]);

  const testCompareDataByName = useMemo(() => {
    if (compCompareLoading) return undefined;
    if (!componentCompareData) return null;
    const lookup = new Map();
    (componentCompareData.tests || []).forEach((t: any) => lookup.set(t.fileName, t));
    return lookup;
  }, [compCompareLoading, componentCompareData]);

  if (!hasBase || !hasCompare) {
    return <InlineSkeleton lines={2} />;
  }

  const contextValue = {
    base: baseModel ? { model: baseModel, descriptor: baseDescriptor } : undefined,
    compare: compareModel ? { model: compareModel, descriptor: compareDescriptor } : undefined,
    loading: compCompareLoading,
    logsByVersion: new Map(),
    fileCompareDataByName,
    fieldCompareDataByName,
    testCompareDataByName,
    isFullScreen: false,
    hidden: false,
  };

  return <ComponentCompareContext.Provider value={contextValue as any}>{children}</ComponentCompareContext.Provider>;
}
```

- [ ] **Step 4: Replace `EagerFileRegistrar` with `NewComponentFileRegistrar`**

In `components/ui/component-compare/component-compare/component-compare.tsx`, the entire `EagerFileRegistrar` function (starts with `export function EagerFileRegistrar({` and ends at its closing `}` before `const GET_COMPONENT_ASPECTS = gql\``) — replace the **whole function** with:

```tsx
/**
 * registers the file list of a NEW component (one with no base) into the FileRegistry for the sidebar.
 * non-new components are fed in bulk by `RegistryFeeder`. `useCode` is an external hook that cannot
 * forward a batch context, so these (minority) queries stay unbatched.
 */
export function NewComponentFileRegistrar({
  compareId,
  host = 'teambit.scope/scope',
}: {
  compareId: string;
  host?: string;
}) {
  const newCompId = useMemo(() => ComponentIdValue.fromString(compareId), [compareId]);
  const { fileTree: newCompFileTree, loading } = useCode(newCompId);

  const registryFiles = useMemo(() => {
    if (loading || !newCompFileTree?.length) return undefined;
    return newCompFileTree.map((n: string) => ({ name: n, status: 'NEW' }));
  }, [loading, newCompFileTree]);

  useFileRegistryRegister(compareId.split('@')[0], registryFiles);

  return null;
}
```

(The unused `host` prop is kept for signature parity with how it is rendered in Step 2; `useCode`'s default host is used. If `npm run lint` flags `host` as unused, remove the `host` param from both this function and the Step 2 render — but keep them consistent.)

- [ ] **Step 5: Delete `GET_COMPONENT_ASPECTS` and `EagerAspectRegistrar`**

In `components/ui/component-compare/component-compare/component-compare.tsx`, delete the entire `const GET_COMPONENT_ASPECTS = gql\`...\`;`declaration and the entire`EagerAspectRegistrar`function that follows it (everything from`const GET_COMPONENT_ASPECTS = gql`through the closing`}`of`export function EagerAspectRegistrar`).

- [ ] **Step 6: Add `RegistryFeeder`**

In `components/ui/component-compare/component-compare/component-compare.tsx`, add at the end of the file (after the last existing declaration):

```tsx
/** registers one component's bulk compare data into the FileRegistry. renders nothing. */
function CompareRegistryEntry({ compareId }: { compareId: string }) {
  const compareData = useCompareData();
  const data: CompareComponentData | null | undefined = compareData?.getData(compareId);
  const componentIdStr = compareId.split('@')[0];

  const registryFiles = useMemo(() => {
    if (!data) return undefined;
    return (data.code || [])
      .filter((f) => f.status !== 'UNCHANGED')
      .map((f) => ({ name: f.fileName, status: f.status }));
  }, [data]);

  const aspectRegistryFiles = useMemo(() => {
    if (!data) return undefined;
    return (data.aspects || []).map((a) => ({ name: a.fieldName, status: 'MODIFIED' }));
  }, [data]);

  useFileRegistryRegister(componentIdStr, registryFiles);
  useAspectRegistryRegister(componentIdStr, aspectRegistryFiles);

  return null;
}

/**
 * feeds the FileRegistry from the bulk `CompareDataProvider` for every component pair that has a base.
 * renders one null-rendering `CompareRegistryEntry` per pair — no per-component queries are fired.
 */
export function RegistryFeeder({ pairs }: { pairs: ComponentComparePair[] }) {
  return (
    <>
      {pairs.map((pair) => (
        <CompareRegistryEntry key={pair.compareId} compareId={pair.compareId} />
      ))}
    </>
  );
}
```

- [ ] **Step 7: Export `RegistryFeeder` from the package**

In `components/ui/component-compare/component-compare/index.ts`, the last two lines added in Task 6 currently read:

```ts
export { CompareDataProvider, useCompareData, COMPARE_PAGE_SIZE } from './compare-data-context';
export type { CompareDataContextModel, CompareComponentData, ComponentComparePair } from './compare-data-context';
```

Append after them:

```ts
export { RegistryFeeder } from './component-compare';
```

- [ ] **Step 8: Verify compilation**

Run: `npm run lint`
Expected: PASS — 0 errors. If `useCode` or `ComponentIdValue` is reported unused, confirm it is still imported (both are still used — `useCode` in `InlineContextProvider` + `NewComponentFileRegistrar`, `ComponentIdValue` in `NewComponentFileRegistrar`).

- [ ] **Step 9: Commit**

```bash
git add components/ui/component-compare/component-compare/component-compare.tsx components/ui/component-compare/component-compare/index.ts
git commit -m "refactor(component-compare): feed inline compare from bulk context"
```

---

## Task 8: Wire the bulk provider into `lane-compare.tsx`

**Files:**

- Modify: `components/ui/compare/lane-compare/lane-compare.tsx`

- [ ] **Step 1: Update imports**

In `components/ui/compare/lane-compare/lane-compare.tsx`, the import block at lines 10-17 currently reads:

```tsx
import {
  InlineComponentCompare,
  CompareToolbar,
  CompareSidebar,
  FileRegistryProvider,
  useFileRegistry,
  DiffModeProvider,
} from '@teambit/component.ui.component-compare.component-compare';
```

Replace it with:

```tsx
import {
  InlineComponentCompare,
  CompareToolbar,
  CompareSidebar,
  FileRegistryProvider,
  useFileRegistry,
  DiffModeProvider,
  CompareDataProvider,
  RegistryFeeder,
} from '@teambit/component.ui.component-compare.component-compare';
import type { ComponentComparePair } from '@teambit/component.ui.component-compare.component-compare';
```

- [ ] **Step 2: Build the memoized `comparePairs` list**

In `components/ui/compare/lane-compare/lane-compare.tsx`, inside `LaneCompareInline`, the `allComponents` memo ends at line 252 (`[componentsToDiff, laneComponentDiffByCompId]`). Directly after that memo, add:

```tsx
// pairs for the bulk compare query — only components that have a base (new components use the useCode path).
const comparePairs = useMemo<ComponentComparePair[]>(
  () =>
    allComponents
      .filter((c) => !!c.baseId && !!c.compareId)
      .map((c) => ({ baseId: c.baseId as string, compareId: c.compareId })),
  [allComponents]
);
```

- [ ] **Step 3: Wrap the layout with `CompareDataProvider` + `RegistryFeeder`**

In `components/ui/compare/lane-compare/lane-compare.tsx`, `LaneCompareInline`'s return currently is:

```tsx
  return (
    <div {...rest} className={classnames(styles.rootLaneCompare, className)}>
      {/* Toolbar */}
      <CompareToolbar
```

Replace that opening with:

```tsx
  return (
    <CompareDataProvider pairs={comparePairs}>
      <RegistryFeeder pairs={comparePairs} />
      <div {...rest} className={classnames(styles.rootLaneCompare, className)}>
        {/* Toolbar */}
        <CompareToolbar
```

Then find the matching close of that outer `<div>` — it is the last `</div>` before the function's closing `);` / `}` (currently:

```tsx
      </div>
    </div>
  );
}
```

the first `</div>` closes `styles.layout`, the second closes `styles.rootLaneCompare`). Replace that closing span with:

```tsx
        </div>
      </div>
    </CompareDataProvider>
  );
}
```

(One extra level of indentation is applied to the JSX between the new opening and closing; `npm run prettier:check` / the lint-staged prettier pass will normalise indentation, so exact whitespace on the untouched inner lines is not load-bearing — but the new `<CompareDataProvider>` / `</CompareDataProvider>` wrapper and `<RegistryFeeder/>` must be present.)

- [ ] **Step 4: Verify compilation and formatting**

Run: `npm run lint`
Expected: PASS — 0 errors.

Run: `npm run format`
Expected: completes; re-indents the wrapped JSX.

- [ ] **Step 5: Commit**

```bash
git add components/ui/compare/lane-compare/lane-compare.tsx
git commit -m "feat(lane-compare): fetch component compare data in bulk"
```

---

## Task 9: Compile affected aspects and final verification

**Files:** none (build + lint only)

- [ ] **Step 1: Compile every touched aspect**

Run:

```bash
bit compile teambit.component/component-compare teambit.harmony/graphql teambit.component/component teambit.component.ui.component-compare/component-compare teambit.lanes.ui.compare/lane-compare
```

Expected: `✔ 5/5 components compiled successfully.` (If a component id differs, resolve it with `bit list | grep <name>`; the source dirs are `scopes/component/component-compare`, `scopes/harmony/graphql`, `scopes/component/component`, `components/ui/component-compare/component-compare`, `components/ui/compare/lane-compare`.)

- [ ] **Step 2: Final lint**

Run: `npm run lint`
Expected: PASS — 0 errors.

- [ ] **Step 3: Run the helper unit test once more**

Run: `bit test teambit.component/component-compare`
Expected: PASS — the `compareComponentPairs` suite is green.

- [ ] **Step 4: Commit any compile output**

```bash
git add -A
git commit -m "chore: compile lane-compare bulk-fetch aspects" || echo "nothing to commit"
```

- [ ] **Step 5: Hand off for manual UI verification**

The remaining verification is manual (per the established preference): open Lane Compare, confirm the network panel shows one `compareComponents` request per page (instead of ~4 per component), the sidebar populates, inline diffs render, and `useComponent` requests are coalesced into batched calls. New components still render via the `useCode` path.

---

## Notes for the implementer

- **Bit dogfooding:** this repo builds itself with Bit. Source lives in `scopes/*` and `components/*`; the running UI/runtime loads from `node_modules/@teambit/*/dist/`, so every source change must be `bit compile`d (Task 9, or per-task where noted) before it takes effect at runtime. `npm run lint` (which runs `tsc --noEmit` + `oxlint`) is the canonical correctness check after each change.
- **Do not run `pnpm install` / `npm install`.** No new dependencies are introduced: `p-map` is already used across the repo, `BatchHttpLink` is already imported in `graphql.ui.runtime.tsx`.
- **`useComponentCompareQuery` is intentionally left in place** — it is an external hook and may have other callers; this plan simply stops `component-compare.tsx` from using it.
- **`EagerFileRegistrar` / `EagerAspectRegistrar` are not exported from the package `index.ts`** (only `InlineComponentCompare` / `ComponentCompareHeader` are), so deleting/renaming them is safe.

```

```
