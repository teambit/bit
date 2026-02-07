import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
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
import { WorkspaceContext } from '../workspace-context';
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
  const workspace = useContext(WorkspaceContext);
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
  const didAutoRefreshRef = useRef(false);

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
  const { virtualizer, virtualRows, columns, isVirtualized } = useVirtualGrid({
    groups,
    groupType,
    scrollRef,
    isMinimal,
  });

  useEffect(() => {
    if (components.length > 0 || workspace.name) {
      setConnectionState('online');
      didAutoRefreshRef.current = false;
    }
  }, [components.length, workspace.name]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleConnectionEvent = (event: Event) => {
      const { detail } = event as CustomEvent<ConnectionEventDetail>;
      if (detail?.reason === 'preview') return;

      if (detail?.online === true) {
        setConnectionState('online');

        // If initial queries failed while server was booting, recover automatically.
        if (!workspace.name && components.length === 0 && !didAutoRefreshRef.current) {
          didAutoRefreshRef.current = true;
          window.setTimeout(() => window.location.reload(), 60);
        }
        return;
      }

      if (detail?.online === false) {
        setConnectionState('offline');
      }
    };

    window.addEventListener(CONNECTION_STATUS_EVENT, handleConnectionEvent as EventListener);
    return () => window.removeEventListener(CONNECTION_STATUS_EVENT, handleConnectionEvent as EventListener);
  }, [components.length, workspace.name]);

  // Empty state: don't flash EmptyWorkspace during the ~120ms initial load.
  // workspace.name is '' while loading (Workspace.empty()), non-empty when data arrives.
  if (!components.length) {
    if (!workspace.name && connectionState === 'loading') {
      return (
        <div ref={scrollRef} className={styles.container}>
          <div className={styles.loadingShell}>
            <H3 className={styles.loadingShellTitle}>Starting workspace UI</H3>
            <p className={styles.loadingShellText}>Connecting to dev server and loading components.</p>
          </div>
        </div>
      );
    }

    if (!workspace.name && connectionState === 'offline') {
      return (
        <div ref={scrollRef} className={styles.container}>
          <div className={styles.offlineShell}>
            <H3 className={styles.offlineShellTitle}>Offline mode</H3>
            <p className={styles.offlineShellText}>Waiting for the dev server to reconnect.</p>
          </div>
        </div>
      );
    }

    if (!workspace.name) return null;
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
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const row = virtualRows[virtualRow.index];
              if (!row) return null;

              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
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
