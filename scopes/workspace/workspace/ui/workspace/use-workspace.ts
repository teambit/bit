import { useEffect, useMemo } from 'react';
import { ComponentModel } from '@teambit/component';
import useLatest from '@react-hook/latest';
import { gql, useQuery } from '@apollo/client';
import type { ComponentIdObj } from '@teambit/component-id';
import { ComponentID } from '@teambit/component-id';

import { Workspace } from './workspace-model';

type UseWorkspaceOptions = {
  onComponentAdded?: (component: ComponentModel[]) => void;
  onComponentUpdated?: (component: ComponentModel[]) => void;
  onComponentRemoved?: (compId: ComponentID[]) => void;
};
type RawComponent = { id: ComponentIdObj };

// Light fragment — fast initial render (no status/issues — those are the slow N+1 resolvers)
const wcComponentFieldsLight = gql`
  fragment wcComponentFieldsLight on Component {
    id {
      name
      version
      scope
    }
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
    }
    server {
      env
      url
    }
    env {
      id
      icon
    }
    compositions {
      identifier
    }
  }
`;

// Heavy fragment — deferred but fast (no status — status is the slow N+1 resolver)
const wcComponentFieldsHeavy = gql`
  fragment wcComponentFieldsHeavy on Component {
    id {
      name
      version
      scope
    }
    aspects(include: ["teambit.preview/preview", "teambit.envs/envs"]) {
      aspectId: id
      data
    }
    description
    issuesCount
  }
`;

// Status fragment — separate because status resolution is ~13s for all components
const wcComponentFieldsStatus = gql`
  fragment wcComponentFieldsStatus on Component {
    id {
      name
      version
      scope
    }
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

// Full fragment — used for subscriptions (need complete data for updates)
const wcComponentFields = gql`
  fragment wcComponentFields on Component {
    id {
      name
      version
      scope
    }
    aspects(include: ["teambit.preview/preview", "teambit.envs/envs"]) {
      aspectId: id
      data
    }
    compositions {
      identifier
    }
    description
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

// Initial query — uses light fragment for fast render
const WORKSPACE = gql`
  query workspace {
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

// Deferred query — fills in heavy fields after initial render (fast: ~30ms)
const WORKSPACE_HEAVY = gql`
  query workspaceHeavy {
    workspace {
      name
      components {
        ...wcComponentFieldsHeavy
      }
    }
  }
  ${wcComponentFieldsHeavy}
`;

// Status query — separate because status resolution is slow (~13s for 212 components)
// Fires independently so it doesn't block heavy data from rendering.
const WORKSPACE_STATUS = gql`
  query workspaceStatus {
    workspace {
      name
      components {
        ...wcComponentFieldsStatus
      }
    }
  }
  ${wcComponentFieldsStatus}
`;

const COMPONENT_SUBSCRIPTION_ADDED = gql`
  subscription OnComponentAdded {
    componentAdded {
      component {
        ...wcComponentFields
      }
    }
  }
  ${wcComponentFields}
`;

const COMPONENT_SUBSCRIPTION_CHANGED = gql`
  subscription OnComponentChanged {
    componentChanged {
      component {
        ...wcComponentFields
      }
    }
  }
  ${wcComponentFields}
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

export function useWorkspace(options: UseWorkspaceOptions = {}) {
  // Use useQuery directly (NOT useDataQuery) to avoid triggering the global LoaderRibbon.
  // This ensures the workspace layout renders instantly — no loading spinner at all.
  // Data arrives in ~120ms and the UI fills in seamlessly.
  const { data, subscribeToMore, loading, ...rest } = useQuery(WORKSPACE, {
    // cache-and-network: serve cached data instantly on reload, then refresh from network.
    // nextFetchPolicy: after initial fetch, settle to cache-first — subsequent cache updates
    // (from subscriptions) won't trigger new network requests, preventing re-render storms.
    fetchPolicy: 'cache-and-network',
    nextFetchPolicy: 'cache-first',
  });
  const optionsRef = useLatest(options);

  // Heavy query — fires after light query returns; uses useQuery (not useDataQuery)
  // to avoid showing the global loading spinner while heavy fields resolve.
  // Fast (~30ms) because status is excluded.
  // IMPORTANT: use 'no-cache' to prevent writing to Apollo cache, which would
  // overwrite the light query's components array and lose env/server/buildStatus fields.
  const { data: heavyResult } = useQuery(WORKSPACE_HEAVY, {
    skip: !data?.workspace,
    fetchPolicy: 'no-cache',
  });

  // Status query — fires independently, takes ~13s (N+1 filesystem/scope lookups).
  // Separated so heavy data (compositions, aspects, descriptions) renders immediately.
  // IMPORTANT: use 'no-cache' — same reason as heavy query above.
  const { data: statusResult } = useQuery(WORKSPACE_STATUS, {
    skip: !data?.workspace,
    fetchPolicy: 'no-cache',
  });

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
    if (!data?.workspace) return undefined;

    const heavyComponents = heavyResult?.workspace?.components;
    const statusComponents = statusResult?.workspace?.components;

    // If we have any deferred data, merge it into the light data
    if (heavyComponents || statusComponents) {
      // Build lookup maps for deferred data
      const heavyMap = new Map<string, any>();
      if (heavyComponents) {
        for (const comp of heavyComponents) {
          heavyMap.set(`${comp.id.scope}/${comp.id.name}`, comp);
        }
      }
      const statusMap = new Map<string, any>();
      if (statusComponents) {
        for (const comp of statusComponents) {
          statusMap.set(`${comp.id.scope}/${comp.id.name}`, comp);
        }
      }

      // Merge: light base ← heavy fields ← status fields
      const merged = {
        ...data.workspace,
        components: data.workspace.components.map((comp: any) => {
          const key = `${comp.id.scope}/${comp.id.name}`;
          const heavy = heavyMap.get(key);
          const status = statusMap.get(key);
          return { ...comp, ...heavy, ...status };
        }),
      };
      return Workspace.from(merged);
    }

    return Workspace.from(data.workspace);
  }, [data?.workspace, heavyResult?.workspace?.components, statusResult?.workspace?.components]);

  return {
    workspace,
    loading,
    subscribeToMore,
    ...rest,
  };
}
