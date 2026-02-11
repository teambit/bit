import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ComponentModel } from '@teambit/component';
import useLatest from '@react-hook/latest';
import { gql, useQuery } from '@apollo/client';
import type { ComponentIdObj } from '@teambit/component-id';
import { ComponentID } from '@teambit/component-id';

import { Workspace } from './workspace-model';

const CONNECTION_STATUS_EVENT = 'bit-dev-server-connection-status';
const WORKSPACE_SHELL_READY_EVENT = 'bit-workspace-shell-ready';
const STATUS_SHELL_READY_FALLBACK_MS = 2500;
const STATUS_PREVIEW_READY_FALLBACK_MS = 12000;
const STATUS_IDLE_ARM_MS = 1000;

type ConnectionEventDetail = {
  online?: boolean;
  reason?: 'network' | 'browser-offline' | 'preview';
  previewKey?: string;
  previewPresenceDelta?: number;
};

type UseWorkspaceOptions = {
  onComponentAdded?: (component: ComponentModel[]) => void;
  onComponentUpdated?: (component: ComponentModel[]) => void;
  onComponentRemoved?: (compId: ComponentID[]) => void;
  enableStatusQuery?: boolean;
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
  const { enableStatusQuery = true } = options;
  // Use useQuery directly (NOT useDataQuery) to avoid triggering the global LoaderRibbon.
  // This ensures the workspace layout renders instantly — no loading spinner at all.
  // Data arrives in ~120ms and the UI fills in seamlessly.
  const { data, subscribeToMore, loading, error, refetch, ...rest } = useQuery(WORKSPACE, {
    // cache-and-network: serve cached data instantly on reload, then refresh from network.
    // nextFetchPolicy: after initial fetch, settle to cache-first — subsequent cache updates
    // (from subscriptions) won't trigger new network requests, preventing re-render storms.
    fetchPolicy: 'cache-and-network',
    nextFetchPolicy: 'cache-first',
    errorPolicy: 'all',
  });
  const optionsRef = useLatest(options);
  const [shouldFetchStatus, setShouldFetchStatus] = useState(false);
  const [shellReady, setShellReady] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const recoveryRetryTimerRef = useRef<number | undefined>(undefined);
  const recoveryRetryDelayRef = useRef(1200);
  const recoveryInFlightRef = useRef(false);
  const hasWorkspaceNetworkError = !!error?.networkError;
  const previewPresenceKeysRef = useRef<Set<string>>(new Set());
  const previewReadyKeysRef = useRef<Set<string>>(new Set());

  const dispatchPreviewConnectionEvent = useCallback(
    (detail: { online?: boolean; previewKey?: string; previewPresenceDelta?: number }) => {
      if (typeof window === 'undefined') return;
      window.dispatchEvent(
        new CustomEvent(CONNECTION_STATUS_EVENT, {
          detail: { ...detail, reason: 'preview', timestamp: Date.now() },
        })
      );
    },
    []
  );

  const clearRecoveryRetryTimer = useCallback(() => {
    if (!recoveryRetryTimerRef.current) return;
    window.clearTimeout(recoveryRetryTimerRef.current);
    recoveryRetryTimerRef.current = undefined;
  }, []);

  const triggerRecoveryRefetch = useCallback(
    async (opts?: { immediateRetry?: boolean }) => {
      if (recoveryInFlightRef.current) return;
      recoveryInFlightRef.current = true;
      try {
        await refetch();
        recoveryRetryDelayRef.current = 1200;
      } catch {
        if (!opts?.immediateRetry) {
          recoveryRetryDelayRef.current = Math.min(Math.round(recoveryRetryDelayRef.current * 1.8), 10000);
        }
      } finally {
        recoveryInFlightRef.current = false;
      }
    },
    [refetch]
  );

  // Cache hydration should remain instant, but if the first network sync failed
  // (common during dev-server restarts), aggressively retry in background so stale
  // cached component lists converge quickly to current workspace reality.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (!data?.workspace) return undefined;

    if (!hasWorkspaceNetworkError) {
      clearRecoveryRetryTimer();
      recoveryRetryDelayRef.current = 1200;
      return undefined;
    }

    const scheduleRetry = () => {
      clearRecoveryRetryTimer();
      recoveryRetryTimerRef.current = window.setTimeout(async () => {
        await triggerRecoveryRefetch();
        if (hasWorkspaceNetworkError) scheduleRetry();
      }, recoveryRetryDelayRef.current);
    };

    scheduleRetry();
    return () => {
      clearRecoveryRetryTimer();
    };
  }, [data?.workspace?.name, hasWorkspaceNetworkError, clearRecoveryRetryTimer, triggerRecoveryRefetch]);

  // Trigger an immediate sync retry on explicit reconnect signals.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (!hasWorkspaceNetworkError) return undefined;

    const onOnline = () => {
      void triggerRecoveryRefetch({ immediateRetry: true });
    };
    const onConnectionEvent = (event: Event) => {
      const { detail } = event as CustomEvent<ConnectionEventDetail>;
      if (detail?.reason === 'preview') return;
      if (detail?.online === true) {
        void triggerRecoveryRefetch({ immediateRetry: true });
      }
    };

    window.addEventListener('online', onOnline);
    window.addEventListener(CONNECTION_STATUS_EVENT, onConnectionEvent as EventListener);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener(CONNECTION_STATUS_EVENT, onConnectionEvent as EventListener);
    };
  }, [hasWorkspaceNetworkError, triggerRecoveryRefetch]);

  // Heavy query — fires after light query returns; uses useQuery (not useDataQuery)
  // to avoid showing the global loading spinner while heavy fields resolve.
  // Fast (~30ms) because status is excluded.
  // IMPORTANT: use 'no-cache' to prevent writing to Apollo cache, which would
  // overwrite the light query's components array and lose env/server/buildStatus fields.
  const { data: heavyResult } = useQuery(WORKSPACE_HEAVY, {
    skip: !data?.workspace,
    fetchPolicy: 'no-cache',
  });

  // Delay status query until startup-critical UI is ready.
  // We wait for:
  // 1) sidebar shell readiness signal (from workspace drawer), and
  // 2) first preview-ready signal (or fallback timeout).
  // This keeps status as the final query so it cannot contend with startup paths.
  useEffect(() => {
    if (!data?.workspace || !enableStatusQuery) {
      setShouldFetchStatus(false);
      setShellReady(false);
      setPreviewReady(false);
      return;
    }

    if (typeof window === 'undefined') {
      setShellReady(true);
      setPreviewReady(true);
      return;
    }

    setShouldFetchStatus(false);
    setShellReady(false);
    setPreviewReady(false);

    const onShellReady = () => setShellReady(true);
    const onConnectionEvent = (event: Event) => {
      const { detail } = event as CustomEvent<ConnectionEventDetail>;
      if (detail?.reason === 'preview' && detail?.online === true) {
        setPreviewReady(true);
      }
    };

    window.addEventListener(WORKSPACE_SHELL_READY_EVENT, onShellReady as EventListener);
    window.addEventListener(CONNECTION_STATUS_EVENT, onConnectionEvent as EventListener);

    const shellFallback = window.setTimeout(() => setShellReady(true), STATUS_SHELL_READY_FALLBACK_MS);
    const previewFallback = window.setTimeout(() => setPreviewReady(true), STATUS_PREVIEW_READY_FALLBACK_MS);

    return () => {
      window.removeEventListener(WORKSPACE_SHELL_READY_EVENT, onShellReady as EventListener);
      window.removeEventListener(CONNECTION_STATUS_EVENT, onConnectionEvent as EventListener);
      window.clearTimeout(shellFallback);
      window.clearTimeout(previewFallback);
    };
  }, [data?.workspace?.name, enableStatusQuery]);

  useEffect(() => {
    if (!enableStatusQuery) return;
    if (!data?.workspace || !shellReady || !previewReady || shouldFetchStatus) return;

    if (typeof window === 'undefined') {
      setShouldFetchStatus(true);
      return;
    }

    let armTimeout: number | undefined;
    let idleId: number | undefined;

    const armStatusQuery = () => {
      armTimeout = window.setTimeout(() => {
        setShouldFetchStatus(true);
      }, STATUS_IDLE_ARM_MS);
    };

    if (typeof window.requestIdleCallback === 'function') {
      idleId = window.requestIdleCallback(armStatusQuery, { timeout: 2500 });
    } else {
      armStatusQuery();
    }

    return () => {
      if (idleId !== undefined && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleId);
      }
      if (armTimeout !== undefined) {
        window.clearTimeout(armTimeout);
      }
    };
  }, [data?.workspace?.name, shellReady, previewReady, shouldFetchStatus, enableStatusQuery]);

  // Status query stays fully deferred and runs in background only after shell + preview are ready.
  // Keep it a single query for correctness simplicity (no pagination merge complexity).
  const { data: statusResult, loading: statusLoading } = useQuery(WORKSPACE_STATUS, {
    skip: !enableStatusQuery || !data?.workspace || !shouldFetchStatus,
    fetchPolicy: 'no-cache',
    context: { skipBatch: true },
    notifyOnNetworkStatusChange: false,
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

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const currentComponents = workspace?.components || [];
    const nextPresence = new Set<string>();
    const nextReady = new Set<string>();

    for (const component of currentComponents) {
      if ((component.compositions?.length ?? 0) === 0) continue;
      const previewKey = `${component.id.toString()}:overview`;
      nextPresence.add(previewKey);
      if (component.server?.url) {
        nextReady.add(previewKey);
      }
    }

    const prevPresence = previewPresenceKeysRef.current;
    const prevReady = previewReadyKeysRef.current;

    for (const previewKey of nextPresence) {
      if (!prevPresence.has(previewKey)) {
        dispatchPreviewConnectionEvent({ previewKey, previewPresenceDelta: 1 });
      }
    }

    for (const previewKey of prevPresence) {
      if (!nextPresence.has(previewKey)) {
        dispatchPreviewConnectionEvent({ previewKey, previewPresenceDelta: -1 });
      }
    }

    for (const previewKey of nextPresence) {
      const isReady = nextReady.has(previewKey);
      const wasReady = prevReady.has(previewKey);
      if (isReady !== wasReady) {
        dispatchPreviewConnectionEvent({ previewKey, online: isReady });
      }
    }

    previewPresenceKeysRef.current = nextPresence;
    previewReadyKeysRef.current = nextReady;
  }, [workspace?.components, dispatchPreviewConnectionEvent]);

  useEffect(() => {
    return () => {
      if (typeof window === 'undefined') return;
      for (const previewKey of previewPresenceKeysRef.current) {
        dispatchPreviewConnectionEvent({ previewKey, previewPresenceDelta: -1 });
      }
      previewPresenceKeysRef.current = new Set();
      previewReadyKeysRef.current = new Set();
    };
  }, [dispatchPreviewConnectionEvent]);

  const statusReady = !enableStatusQuery || (shouldFetchStatus && !!statusResult?.workspace);
  const isStatusLoading = shouldFetchStatus && !statusReady && statusLoading;

  return {
    workspace,
    loading,
    statusLoading: isStatusLoading,
    statusReady,
    subscribeToMore,
    ...rest,
  };
}
