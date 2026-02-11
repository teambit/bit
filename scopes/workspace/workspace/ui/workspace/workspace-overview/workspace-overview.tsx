import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import classNames from 'classnames';
import { EmptyWorkspace } from '@teambit/workspace.ui.empty-workspace';
import { PreviewPlaceholder } from '@teambit/preview.ui.preview-placeholder';
import { Tooltip } from '@teambit/design.ui.tooltip';
import { ComponentID } from '@teambit/component-id';
import type { ComponentModel } from '@teambit/component';
import type { ComponentDescriptor } from '@teambit/component-descriptor';
import compact from 'lodash.compact';
import { ScopeID } from '@teambit/scopes.scope-id';
import { useCloudScopes } from '@teambit/cloud.hooks.use-cloud-scopes';
import { WorkspaceComponentCard } from '@teambit/workspace.ui.workspace-component-card';
import type { ComponentCardPluginType, PluginProps } from '@teambit/explorer.ui.component-card';
import { useWorkspaceMode } from '@teambit/workspace.ui.use-workspace-mode';
import { H3 } from '@teambit/design.ui.heading';
import { WorkspaceUIContext } from '../workspace-context';
import { LinkPlugin } from './link-plugin';
import { useWorkspaceAggregation } from './use-workspace-aggregation';
import { useQueryParamWithDefault } from './use-query-param-with-default';
import type { AggregationType } from './workspace-overview.types';
import { WorkspaceFilterPanel } from './workspace-filter-panel';
import { useVirtualGrid } from './use-virtual-grid';
import styles from './workspace-overview.module.scss';

const CONNECTION_STATUS_EVENT = 'bit-dev-server-connection-status';

type ConnectionEventDetail = {
  online?: boolean;
  reason?: 'network' | 'browser-offline' | 'preview';
};

export function WorkspaceOverview() {
  const { workspace, loading: workspaceLoading } = useContext(WorkspaceUIContext);
  const { components, componentDescriptors } = workspace;

  const { isMinimal } = useWorkspaceMode();
  const compModelsById = useMemo(() => new Map(components.map((c) => [c.id.toString(), c])), [components]);

  const uniqueScopes = useMemo(() => [...new Set(components.map((c) => c.id.scope))], [components]);
  const { cloudScopes } = useCloudScopes(uniqueScopes);

  const items = useMemo(() => {
    const cloudMap = new Map((cloudScopes || []).map((s) => [s.id.toString(), s]));
    const compDescriptorMap = new Map(componentDescriptors.map((d) => [d.id.toString(), d]));

    return compact(
      components.map((component) => {
        if (component.deprecation?.isDeprecate) return null;

        const descriptor = compDescriptorMap.get(component.id.toString());
        if (!descriptor) return null;

        const cloudScope = cloudMap.get(component.id.scope);
        const scope =
          cloudScope ||
          (ScopeID.isValid(component.id.scope) && { id: ScopeID.fromString(component.id.scope) }) ||
          undefined;

        return { component, componentDescriptor: descriptor, scope: (scope && { id: scope.id }) || undefined };
      })
    );
  }, [components, componentDescriptors, cloudScopes]);

  const [aggregation, setAggregation] = useQueryParamWithDefault<AggregationType>('aggregation', 'namespaces');
  const [activeNamespaces, setActiveNamespaces] = useState<string[]>([]);
  const [activeScopes, setActiveScopes] = useState<string[]>([]);
  const [connectionState, setConnectionState] = useState<'loading' | 'online' | 'offline'>('loading');
  const [connectionReason, setConnectionReason] = useState<'network' | 'browser-offline'>('network');
  const [isRetryingConnection, setIsRetryingConnection] = useState(false);
  const offlineTimerRef = useRef<number | undefined>(undefined);
  const pendingOfflineReasonRef = useRef<'network' | 'browser-offline'>('network');

  const filters = useMemo(
    () => ({ namespaces: activeNamespaces, scopes: activeScopes }),
    [activeNamespaces, activeScopes]
  );

  const { groups, groupType, availableAggregations, filteredCount } = useWorkspaceAggregation(
    items,
    aggregation,
    filters
  );

  const plugins = useCardPlugins({ compModelsById, componentDescriptors });

  const scrollRef = useRef<HTMLDivElement>(null);
  const { virtualizer, virtualRows, columns, isVirtualized, rowStarts } = useVirtualGrid({
    groups,
    groupType,
    scrollRef,
    isMinimal,
  });
  const [retainedRowIndexes, setRetainedRowIndexes] = useState<number[]>([]);
  const retainedRowStartsRef = useRef<Record<number, number>>({});

  const liveVirtualItems = isVirtualized ? virtualizer.getVirtualItems() : [];
  const liveVirtualItemsByIndex = useMemo(() => {
    return new Map(liveVirtualItems.map((item) => [item.index, item]));
  }, [liveVirtualItems]);
  const liveRowKey = useMemo(() => liveVirtualItems.map((item) => item.index).join(','), [liveVirtualItems]);
  const rowIndexesToRender = useMemo(() => {
    if (!isVirtualized) return [];
    if (retainedRowIndexes.length > 0) return retainedRowIndexes;
    if (liveVirtualItems.length > 0) return liveVirtualItems.map((item) => item.index);
    return virtualRows.slice(0, Math.min(8, virtualRows.length)).map((_, index) => index);
  }, [isVirtualized, retainedRowIndexes, liveVirtualItems, virtualRows]);

  useEffect(() => {
    if (!isVirtualized) return;
    for (const item of liveVirtualItems) {
      retainedRowStartsRef.current[item.index] = item.start;
    }
  }, [liveRowKey, liveVirtualItems, isVirtualized]);

  useEffect(() => {
    if (!isVirtualized) return;
    if (!liveVirtualItems.length) return;
    setRetainedRowIndexes((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const item of liveVirtualItems) {
        if (!next.has(item.index)) {
          next.add(item.index);
          changed = true;
        }
      }
      if (!changed) return prev;
      return Array.from(next).sort((a, b) => a - b);
    });
  }, [liveRowKey, liveVirtualItems, isVirtualized]);

  // Filters/aggregation semantics changed — drop retained row cache to avoid index drift.
  useEffect(() => {
    if (!isVirtualized) return;
    setRetainedRowIndexes([]);
    retainedRowStartsRef.current = {};
  }, [aggregation, groupType, activeNamespaces.join(','), activeScopes.join(','), isVirtualized]);

  useEffect(() => {
    if (components.length > 0 || workspace.name) {
      setConnectionState('online');
    }
  }, [components.length, workspace.name]);

  const runConnectionProbe = useCallback(async () => {
    if (typeof window === 'undefined') return;
    if (isRetryingConnection) return;

    setIsRetryingConnection(true);
    try {
      if (!window.navigator.onLine) {
        setConnectionReason('browser-offline');
        setConnectionState('offline');
        return;
      }

      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 2500);
      const result = await fetch('/graphql', {
        method: 'POST',
        cache: 'no-store',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          query: 'query __BitHealth { __typename }',
        }),
      }).catch(() => undefined);
      window.clearTimeout(timeout);

      if (result?.ok) {
        if (offlineTimerRef.current) {
          window.clearTimeout(offlineTimerRef.current);
          offlineTimerRef.current = undefined;
        }
        setConnectionState('online');
        setConnectionReason('network');
        return;
      }

      setConnectionReason('network');
      setConnectionState('offline');
    } finally {
      setIsRetryingConnection(false);
    }
  }, [isRetryingConnection]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleConnectionEvent = (event: Event) => {
      const { detail } = event as CustomEvent<ConnectionEventDetail>;
      if (detail?.reason === 'preview') return;

      if (detail?.online === true) {
        if (offlineTimerRef.current) {
          window.clearTimeout(offlineTimerRef.current);
          offlineTimerRef.current = undefined;
        }
        setConnectionReason('network');
        setConnectionState('online');
        return;
      }

      if (detail?.online === false) {
        pendingOfflineReasonRef.current = detail?.reason === 'browser-offline' ? 'browser-offline' : 'network';
        if (!offlineTimerRef.current) {
          // Debounce brief network/proxy hiccups to prevent shell flicker.
          offlineTimerRef.current = window.setTimeout(() => {
            setConnectionReason(pendingOfflineReasonRef.current);
            setConnectionState('offline');
            offlineTimerRef.current = undefined;
          }, 900);
        }
      }
    };

    window.addEventListener(CONNECTION_STATUS_EVENT, handleConnectionEvent as EventListener);
    return () => {
      window.removeEventListener(CONNECTION_STATUS_EVENT, handleConnectionEvent as EventListener);
      if (offlineTimerRef.current) {
        window.clearTimeout(offlineTimerRef.current);
        offlineTimerRef.current = undefined;
      }
    };
  }, [components.length, workspace.name]);

  const primaryShellCards = useMemo(() => Array.from({ length: 8 }, (_, idx) => idx), []);
  const secondaryShellCards = useMemo(() => Array.from({ length: 4 }, (_, idx) => idx), []);

  const bootShell = (
    <div className={styles.bootShellWrap}>
      <div className={classNames(styles.bootStatusRow, connectionState === 'offline' && styles.bootStatusRowOffline)}>
        <div className={styles.bootStatusCopy}>
          <span
            className={classNames(
              styles.bootShellStatus,
              connectionState === 'offline' ? styles.bootShellStatusOffline : styles.bootShellStatusLoading
            )}
          >
            {connectionState === 'offline' ? 'Offline' : 'Connecting'}
          </span>
          <span className={styles.bootStatusText}>
            {connectionState === 'offline'
              ? connectionReason === 'browser-offline'
                ? 'No browser network connection. Reconnect to continue.'
                : 'Dev server is temporarily unavailable. The workspace will recover as soon as it responds.'
              : 'Loading workspace structure and preview slots.'}
          </span>
        </div>
        <button
          type="button"
          className={styles.bootShellAction}
          onClick={() => void runConnectionProbe()}
          disabled={isRetryingConnection}
        >
          {isRetryingConnection ? 'Checking...' : 'Retry now'}
        </button>
      </div>
      <div className={styles.bootLayoutShell} aria-hidden>
        <div className={styles.bootFilterRow}>
          <div className={styles.bootFilterPill} />
          <div className={styles.bootFilterPill} />
          <div className={styles.bootFilterSpacer} />
          <div className={styles.bootFilterToggle} />
        </div>
        <div className={styles.bootSection}>
          <H3 className={styles.bootSectionSlash}>/</H3>
          <div className={styles.bootSkeletonGrid}>
            {primaryShellCards.map((cardIndex) => (
              <div key={`boot-shell-card-primary-${cardIndex}`} className={styles.bootSkeletonCard}>
                <div className={styles.bootSkeletonCardBody}>
                  <div className={styles.bootSkeletonCardTopLabel} />
                  <div className={styles.bootSkeletonCardTitle} />
                  <div className={styles.bootSkeletonCardTitleShort} />
                  <div className={styles.bootSkeletonCardPreview} />
                </div>
                <div className={styles.bootSkeletonCardFooter}>
                  <div className={styles.bootSkeletonCardTag} />
                  <div className={styles.bootSkeletonCardMeta} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className={styles.bootSection}>
          <div className={styles.bootSectionHeading} />
          <div className={styles.bootSkeletonGrid}>
            {secondaryShellCards.map((cardIndex) => (
              <div key={`boot-shell-card-secondary-${cardIndex}`} className={styles.bootSkeletonCard}>
                <div className={styles.bootSkeletonCardBody}>
                  <div className={styles.bootSkeletonCardTopLabel} />
                  <div className={styles.bootSkeletonCardTitle} />
                  <div className={styles.bootSkeletonCardTitleShort} />
                  <div className={styles.bootSkeletonCardPreview} />
                </div>
                <div className={styles.bootSkeletonCardFooter}>
                  <div className={styles.bootSkeletonCardTag} />
                  <div className={styles.bootSkeletonCardMeta} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  // Empty state: keep loading shell while workspace query is still warming up.
  if (!components.length) {
    if (!workspace.name || workspaceLoading) {
      return <div className={styles.container}>{bootShell}</div>;
    }

    return <EmptyWorkspace name={workspace.name} />;
  }

  return (
    <div ref={scrollRef} className={styles.container}>
      <WorkspaceFilterPanel
        aggregation={aggregation}
        onAggregationChange={setAggregation}
        availableAggregations={availableAggregations}
        items={items}
        activeNamespaces={activeNamespaces}
        onNamespacesChange={setActiveNamespaces}
        activeScopes={activeScopes}
        onScopesChange={setActiveScopes}
      />

      {filteredCount === 0 && <EmptyWorkspace name={workspace.name} />}

      {filteredCount > 0 &&
        (isVirtualized ? (
          <div style={{ height: virtualizer.getTotalSize(), width: '100%', position: 'relative' }}>
            {rowIndexesToRender.map((rowIndex) => {
              const row = virtualRows[rowIndex];
              if (!row) return null;
              const liveItem = liveVirtualItemsByIndex.get(rowIndex);
              const start = liveItem?.start ?? retainedRowStartsRef.current[rowIndex] ?? rowStarts[rowIndex] ?? 0;
              const itemKey = liveItem?.key ?? `retained-${rowIndex}`;

              return (
                <div
                  key={itemKey}
                  data-index={rowIndex}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${start}px)`,
                  }}
                >
                  {row.type === 'header' ? (
                    <div className={row.isFirst ? styles.virtualGroupHeaderFirst : styles.virtualGroupHeader}>
                      <H3 className={styles.aggregationTitle}>{row.group.displayName}</H3>
                    </div>
                  ) : (
                    <div
                      className={styles.virtualCardRow}
                      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
                    >
                      {row.items.map((item) => (
                        <WorkspaceComponentCard
                          key={item.component.id.toString()}
                          component={item.component}
                          componentDescriptor={item.componentDescriptor}
                          scope={item.scope}
                          plugins={plugins}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div>
            {virtualRows.map((row, index) => {
              return row.type === 'header' ? (
                <div
                  key={`${row.group.name}-${index}`}
                  className={row.isFirst ? styles.virtualGroupHeaderFirst : styles.virtualGroupHeader}
                >
                  <H3 className={styles.aggregationTitle}>{row.group.displayName}</H3>
                </div>
              ) : (
                <div
                  key={`cards-${index}`}
                  className={`${styles.virtualCardRow} ${styles.nonVirtualRow}`}
                  style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
                >
                  {row.items.map((item) => (
                    <WorkspaceComponentCard
                      key={item.component.id.toString()}
                      component={item.component}
                      componentDescriptor={item.componentDescriptor}
                      scope={item.scope}
                      plugins={plugins}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        ))}
    </div>
  );
}

export function useCardPlugins({
  compModelsById,
  componentDescriptors,
}: {
  compModelsById: Map<string, ComponentModel>;
  componentDescriptors: ComponentDescriptor[];
}): ComponentCardPluginType<PluginProps>[] {
  // Use a ref so plugin closures always read the latest data without
  // recreating the plugins array. This prevents the cascade:
  // data change → new plugins → all cards remount previews → iframe destruction storm.
  const compModelsByIdRef = useRef(compModelsById);
  compModelsByIdRef.current = compModelsById;

  // Build a signature that changes when aspect data arrives (e.g. heavy query resolves).
  // Only env icon data matters — we recreate plugins so the env icon placeholder
  // transitions to the actual icon.
  const descriptorAspectsSignature = React.useMemo(() => {
    return componentDescriptors
      .map((d) => {
        const env = d.get<{ id?: string }>('teambit.envs/envs');
        return env?.id || '';
      })
      .join(',');
  }, [componentDescriptors]);

  const plugins = React.useMemo(
    () => [
      {
        preview: function Preview({ component }) {
          const compModel = compModelsByIdRef.current.get(component.id.toString());
          if (!compModel) return null;
          return <PreviewPlaceholder componentDescriptor={component} component={compModel} shouldShowPreview />;
        },
      },
      {
        previewBottomRight: function PreviewBottomRight({ component }) {
          // Read env from ComponentModel.environment (computed by envs resolver, always correct)
          // instead of ComponentDescriptor aspect data (raw stored data, may show default node env)
          const compModel = compModelsByIdRef.current.get(component.id.toString());
          const env = compModel?.environment;
          const envComponentId = env?.id ? ComponentID.fromString(env?.id) : undefined;

          if (!env?.icon) {
            return (
              <div className={styles.rightPreviewPlugins}>
                <div className={styles.badge}>
                  <div className={styles.envIconPlaceholder} />
                </div>
              </div>
            );
          }

          return (
            <div className={styles.rightPreviewPlugins}>
              <div className={styles.badge}>
                <Tooltip delay={300} content={envComponentId?.name}>
                  <img src={env.icon} className={styles.envIcon} />
                </Tooltip>
              </div>
            </div>
          );
        },
      },
      new LinkPlugin(),
    ],
    [descriptorAspectsSignature]
  );

  return plugins;
}
