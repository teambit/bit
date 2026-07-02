import { useEffect, useMemo, useState } from 'react';
import { ComponentModel } from '@teambit/component';
import useLatest from '@react-hook/latest';
import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { gql, useApolloClient } from '@apollo/client';
import type { ComponentIdObj } from '@teambit/component-id';
import { ComponentID } from '@teambit/component-id';

import { Workspace } from './workspace-model';

type UseWorkspaceOptions = {
  onComponentAdded?: (component: ComponentModel[]) => void;
  onComponentUpdated?: (component: ComponentModel[]) => void;
  onComponentRemoved?: (compId: ComponentID[]) => void;
};
type RawComponent = { id: ComponentIdObj };

/**
 * Cheap, card-renderable fields only. Everything here resolves from already-loaded component
 * metadata (id, env, aspects, compositions, preview, deprecation, server, buildStatus, description),
 * so the light query returns fast and the grid can paint immediately. The two expensive async
 * resolvers — `status` (getStatus(): git/scope compare) and `issuesCount` (getIssues(): dependency
 * analysis) — are deliberately omitted here and fetched separately by `wcComponentDetailFields`.
 */
const wcComponentFieldsLight = gql`
  fragment wcComponentFieldsLight on Component {
    id {
      name
      version
      scope
    }
    aspects(include: ["teambit.preview/preview", "teambit.envs/envs"]) {
      # 'id' property in gql refers to a *global* identifier and used for caching.
      # this makes aspect data cache under the same key, even when they are under different components.
      # renaming the property fixes that.
      aspectId: id
      data
    }
    compositions {
      identifier
    }
    description
    buildStatus
    preview {
      includesEnvTemplate
      legacyHeader
      isScaling
      skipIncludes
    }
    deprecation {
      isDeprecate
      newId
      range
    }
    server {
      env
      url
    }
    env {
      id
      icon
    }
  }
`;

/**
 * The expensive per-component fields, split out so they never block first paint. These drive the
 * status pills (changed/building) and the issues badge, both of which gracefully degrade to a
 * neutral "built" / no-issues state until this query resolves.
 */
const wcComponentDetailFields = gql`
  fragment wcComponentDetailFields on Component {
    id {
      name
      version
      scope
    }
    issuesCount
    status {
      isOutdated
      isNew
      isInScope
      isStaged
      modifyInfo {
        hasModifiedFiles
        hasModifiedDependencies
      }
      isDeleted
    }
  }
`;

/**
 * Full per-component shape (light + detail). Used by the subscriptions: a single added/changed
 * component is cheap to fully resolve, so live updates always carry fresh status.
 */
const wcComponentFieldsFull = gql`
  fragment wcComponentFieldsFull on Component {
    ...wcComponentFieldsLight
    ...wcComponentDetailFields
  }
  ${wcComponentFieldsLight}
  ${wcComponentDetailFields}
`;

const WORKSPACE_LIGHT = gql`
  query workspaceLight {
    workspace {
      name
      path
      icon
      components {
        ...wcComponentFieldsLight
      }
    }
  }
  ${wcComponentFieldsLight}
`;

// The detail fields are fetched one page at a time via the existing `components(offset, limit)`
// resolver. getStatus()/getIssues() are synchronous CPU work; fetching all 204 at once blocks the
// server's event loop for ~5s straight (a navigation query issued during that window waited ~10s).
// Paging it lets the loop breathe between chunks — measured ping latency dropped from ~10s to ~0.3s.
const WORKSPACE_DETAILS_PAGE = gql`
  query workspaceDetailsPage($offset: Int!, $limit: Int!) {
    workspace {
      components(offset: $offset, limit: $limit) {
        ...wcComponentDetailFields
      }
    }
  }
  ${wcComponentDetailFields}
`;

// Small pages keep any single server-blocking burst under ~350ms; the gap yields the event loop so
// other requests (navigation, lanes) are serviced promptly between pages.
const DETAIL_CHUNK_SIZE = 15;
const DETAIL_CHUNK_GAP_MS = 60;

const COMPONENT_SUBSCRIPTION_ADDED = gql`
  subscription OnComponentAdded {
    componentAdded {
      component {
        ...wcComponentFieldsFull
      }
    }
  }
  ${wcComponentFieldsFull}
`;

const COMPONENT_SUBSCRIPTION_CHANGED = gql`
  subscription OnComponentChanged {
    componentChanged {
      component {
        ...wcComponentFieldsFull
      }
    }
  }
  ${wcComponentFieldsFull}
`;

const COMPONENT_SUBSCRIPTION_REMOVED = gql`
  subscription OnComponentRemoved {
    componentRemoved {
      componentIds {
        name
        version
        scope
      }
    }
  }
`;

const COMPONENT_SERVER_STARTED = gql`
  subscription OnComponentServerStarted {
    componentServerStarted {
      env
      url
      host
      basePath
    }
  }
`;

function componentKey(id: ComponentIdObj): string {
  return `${id.scope}/${id.name}@${id.version}`;
}

export function useWorkspace(options: UseWorkspaceOptions = {}) {
  // Light query drives first paint. cache-and-network so a revisit paints instantly from cache,
  // then refreshes in the background (the workspace host otherwise defaults to network-only).
  const { data, subscribeToMore, loading, ...rest } = useDataQuery(WORKSPACE_LIGHT, {
    fetchPolicy: 'cache-and-network',
  });

  // CRITICAL: the detail data (status + issuesCount) is NOT fetched in parallel with the light query.
  // getStatus()/getIssues() are synchronous CPU work that monopolizes the server's single-threaded
  // event loop for several seconds on large workspaces; running it concurrently would stall the light
  // query behind it (measured: light alone ~10ms, but ~5s when racing the detail query) and the grid
  // would never paint early. So we wait for the light data to arrive AND for the browser to go idle
  // (i.e. the grid has painted) before kicking off the (chunked) detail fetch in the background.
  const [detailEnabled, setDetailEnabled] = useState(false);
  const lightDataReady = Boolean(data?.workspace);
  const totalComponents = data?.workspace?.components?.length ?? 0;

  useEffect(() => {
    if (!lightDataReady || detailEnabled || typeof window === 'undefined') return undefined;
    const enable = () => setDetailEnabled(true);
    const ric = (window as any).requestIdleCallback as
      | ((cb: () => void, opts?: { timeout: number }) => number)
      | undefined;
    if (ric) {
      const handle = ric(enable, { timeout: 1000 });
      return () => (window as any).cancelIdleCallback?.(handle);
    }
    const handle = window.setTimeout(enable, 200);
    return () => window.clearTimeout(handle);
  }, [lightDataReady, detailEnabled]);

  // Detail (status + issuesCount) is paged in once the grid has painted, with a yield between pages
  // so the server stays responsive. Results accumulate by component key and merge in progressively —
  // status pills and issue counts fill in chunk by chunk rather than all-or-nothing after ~5s.
  const client = useApolloClient();
  const [detailByKey, setDetailByKey] = useState<Map<string, { status?: any; issuesCount?: number }>>(new Map());

  useEffect(() => {
    if (!detailEnabled || !totalComponents) return undefined;
    let cancelled = false;

    (async () => {
      for (let offset = 0; offset < totalComponents; offset += DETAIL_CHUNK_SIZE) {
        if (cancelled) return;
        try {
          const res = await client.query({
            query: WORKSPACE_DETAILS_PAGE,
            variables: { offset, limit: DETAIL_CHUNK_SIZE },
            fetchPolicy: 'network-only',
          });
          if (cancelled) return;
          const comps: { id: ComponentIdObj; status?: any; issuesCount?: number }[] =
            res.data?.workspace?.components ?? [];
          if (comps.length) {
            setDetailByKey((prev) => {
              const next = new Map(prev);
              for (const c of comps) next.set(componentKey(c.id), { status: c.status, issuesCount: c.issuesCount });
              return next;
            });
          }
        } catch {
          // a failed page must not abort the rest of the pages
        }
        if (cancelled) return;
        // yield the server event loop between pages
        await new Promise((resolve) => {
          setTimeout(resolve, DETAIL_CHUNK_GAP_MS);
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [detailEnabled, totalComponents, client]);

  const optionsRef = useLatest(options);

  useEffect(() => {
    const unSubCompAddition = subscribeToMore({
      document: COMPONENT_SUBSCRIPTION_ADDED,
      updateQuery: (prev, { subscriptionData }) => {
        const update = subscriptionData.data;
        const addedComponent = update?.componentAdded?.component;
        if (!addedComponent) return prev;

        const componentExists = prev.workspace.components.find((component: any) =>
          ComponentID.isEqualObj(component.id, addedComponent.id, { ignoreVersion: true })
        );
        if (componentExists) return prev;

        // side effect - trigger observers
        setTimeout(() => optionsRef.current.onComponentAdded?.([ComponentModel.from(addedComponent)]));

        return {
          ...prev,
          workspace: {
            ...prev.workspace,
            components: [...prev.workspace.components, addedComponent],
          },
        };
      },
    });

    const unSubCompChange = subscribeToMore({
      document: COMPONENT_SUBSCRIPTION_CHANGED,
      updateQuery: (prev, { subscriptionData }) => {
        const update = subscriptionData.data;
        if (!update) return prev;

        const updatedComponent = update.componentChanged.component;
        // side effect - trigger observers
        setTimeout(() => optionsRef.current.onComponentUpdated?.([ComponentModel.from(updatedComponent)]));

        return {
          ...prev,
          workspace: {
            ...prev.workspace,
            components: prev.workspace.components.map((component) =>
              component.id.name === updatedComponent.id.name ? updatedComponent : component
            ),
          },
        };
      },
    });

    const unSubCompRemoved = subscribeToMore({
      document: COMPONENT_SUBSCRIPTION_REMOVED,
      updateQuery: (prev, { subscriptionData }) => {
        const idsToRemove: ComponentIdObj[] | undefined = subscriptionData?.data?.componentRemoved?.componentIds;
        if (!idsToRemove || idsToRemove.length === 0) return prev;

        // side effect - trigger observers
        setTimeout(() => optionsRef.current.onComponentRemoved?.(idsToRemove.map((id) => ComponentID.fromObject(id))));

        return {
          ...prev,
          workspace: {
            ...prev.workspace,
            components: prev.workspace.components.filter((component: RawComponent) =>
              idsToRemove.every((id) => !ComponentID.isEqualObj(id, component.id))
            ),
          },
        };
      },
    });

    const unSubServerStarted = subscribeToMore({
      document: COMPONENT_SERVER_STARTED,
      updateQuery: (prev, { subscriptionData }) => {
        const update = subscriptionData.data;
        if (!update) return prev;

        const serverInfo = update.componentServerStarted;
        if (!serverInfo || serverInfo.length === 0) return prev;

        const updatedComponents = prev.workspace.components.map((component) => {
          if (component.env?.id === serverInfo[0].env) {
            return {
              ...component,
              server: {
                env: serverInfo[0].env,
                url: serverInfo[0].url,
                host: serverInfo[0].host,
                basePath: serverInfo[0].basePath,
              },
            };
          }
          return component;
        });

        return {
          ...prev,
          workspace: {
            ...prev.workspace,
            components: updatedComponents,
          },
        };
      },
    });

    return () => {
      unSubCompAddition();
      unSubCompChange();
      unSubCompRemoved();
      unSubServerStarted();
    };
  }, [optionsRef]);

  const workspace = useMemo(() => {
    const rawWorkspace = data?.workspace;
    if (!rawWorkspace) return undefined;

    // Merge the paged-in heavy fields (status, issuesCount) onto the light components by id.
    // Components are not normalized in the Apollo cache (their `id` is an object, not a scalar key),
    // so the detail pages are accumulated in `detailByKey` and merged here by hand. The light
    // component wins when it already carries a value — a live subscription update (full fragment)
    // refreshes status there, and the paged detail is only the initial enrichment.
    const components = rawWorkspace.components.map((component: any) => {
      const detail = detailByKey.get(componentKey(component.id));
      if (!detail) return component;
      return {
        ...component,
        status: component.status ?? detail.status,
        issuesCount: component.issuesCount ?? detail.issuesCount,
      };
    });

    return Workspace.from({ ...rawWorkspace, components });
  }, [data?.workspace, detailByKey]);

  return {
    workspace,
    loading,
    subscribeToMore,
    ...rest,
  };
}
