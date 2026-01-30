import React, { useContext, useMemo, useState } from 'react';
import { ComponentGrid } from '@teambit/explorer.ui.gallery.component-grid';
import { EmptyWorkspace } from '@teambit/workspace.ui.empty-workspace';
import { PreviewPlaceholder } from '@teambit/preview.ui.preview-placeholder';
import { Tooltip } from '@teambit/design.ui.tooltip';
import { ComponentID } from '@teambit/component-id';
import type { ComponentModel } from '@teambit/component';
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
import styles from './workspace-overview.module.scss';

export function WorkspaceOverview() {
  const workspace = useContext(WorkspaceContext);
  const { components, componentDescriptors } = workspace;

  if (!components.length) return <EmptyWorkspace name={workspace.name} />;

  const { isMinimal } = useWorkspaceMode();
  const compModelsById = useMemo(() => new Map(components.map((c) => [c.id.toString(), c])), [components]);

  const uniqueScopes = [...new Set(components.map((c) => c.id.scope))];
  const { cloudScopes } = useCloudScopes(uniqueScopes);
  const cloudMap = new Map((cloudScopes || []).map((s) => [s.id.toString(), s]));

  const compDescriptorMap = new Map(componentDescriptors.map((d) => [d.id.toString(), d]));

  const items = compact(
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

  const [aggregation, setAggregation] = useQueryParamWithDefault<AggregationType>('aggregation', 'namespaces');
  const [activeNamespaces, setActiveNamespaces] = useState<string[]>([]);
  const [activeScopes, setActiveScopes] = useState<string[]>([]);

  const filters = useMemo(
    () => ({ namespaces: activeNamespaces, scopes: activeScopes }),
    [activeNamespaces, activeScopes]
  );

  const { groups, groupType, availableAggregations, filteredCount } = useWorkspaceAggregation(
    items,
    aggregation,
    filters
  );

  const plugins = useCardPlugins({ compModelsById, showPreview: isMinimal });

  return (
    <div className={styles.container}>
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

      {groups.map((group) => (
        <section key={group.name} className={styles.agg}>
          {groupType !== 'none' && <H3 className={styles.aggregationTitle}>{group.displayName}</H3>}

          <ComponentGrid className={styles.cardGrid}>
            {group.items.map((item) => (
              <WorkspaceComponentCard
                key={item.component.id.toString()}
                component={item.component}
                componentDescriptor={item.componentDescriptor}
                scope={item.scope}
                plugins={plugins}
                shouldShowPreviewState={isMinimal}
              />
            ))}
          </ComponentGrid>
        </section>
      ))}
    </div>
  );
}

export function useCardPlugins({
  compModelsById,
  showPreview,
}: {
  compModelsById: Map<string, ComponentModel>;
  showPreview?: boolean;
}): ComponentCardPluginType<PluginProps>[] {
  const serverUrlsSignature = React.useMemo(() => {
    const serversCount = Array.from(compModelsById.values())
      .filter((comp) => comp.server?.url)
      .map((comp) => comp.server?.url)
      .join(',');
    return serversCount;
  }, [compModelsById]);

  const plugins = React.useMemo(
    () => [
      {
        preview: function Preview({ component, shouldShowPreview }) {
          const compModel = compModelsById.get(component.id.toString());
          if (!compModel) return null;
          return (
            <PreviewPlaceholder
              componentDescriptor={component}
              component={compModel}
              shouldShowPreview={showPreview || shouldShowPreview}
            />
          );
        },
      },
      {
        previewBottomRight: function PreviewBottomRight({ component }) {
          const env = component.get('teambit.envs/envs');
          const envComponentId = env?.id ? ComponentID.fromString(env?.id) : undefined;

          return (
            <div className={styles.rightPreviewPlugins}>
              <div className={styles.badge}>
                <Tooltip delay={300} content={envComponentId?.name}>
                  <img src={env?.icon} className={styles.envIcon} />
                </Tooltip>
              </div>
            </div>
          );
        },
      },
      new LinkPlugin(),
    ],
    [compModelsById.size, serverUrlsSignature, showPreview]
  );

  return plugins;
}
