import React, { useContext, useMemo } from 'react';
import { ComponentGrid } from '@teambit/explorer.ui.gallery.component-grid';
import { EmptyWorkspace } from '@teambit/workspace.ui.empty-workspace';
import compact from 'lodash.compact';
import { ScopeID } from '@teambit/scopes.scope-id';
import { useCloudScopes } from '@teambit/cloud.hooks.use-cloud-scopes';
import { useWorkspaceMode } from '@teambit/workspace.ui.use-workspace-mode';
import { WorkspaceContext } from '../workspace-context';
import { useWorkspaceAggregation } from './use-workspace-aggregation';
import { useQueryParamWithDefault, useListParamWithDefault } from './use-query-param-with-default';
import { NamespaceHeader } from './namespace-header';
import { HopeComponentCard } from './hope-component-card';
import type { AggregationType } from './workspace-overview.types';
import { WorkspaceFilterPanel } from './workspace-filter-panel';
import styles from './workspace-overview.module.scss';

export function WorkspaceOverview() {
  const workspace = useContext(WorkspaceContext);
  const { components, componentDescriptors } = workspace;

  if (!components.length) return <EmptyWorkspace name={workspace.name} />;

  const { isMinimal } = useWorkspaceMode();
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

      return {
        component,
        componentDescriptor: descriptor,
        scope: scope
          ? { id: scope.id, icon: (scope as any).icon, backgroundIconColor: (scope as any).backgroundIconColor }
          : undefined,
      };
    })
  );

  const [aggregation, setAggregation] = useQueryParamWithDefault<AggregationType>('aggregation', 'namespaces');
  const [activeNamespaces, setActiveNamespaces] = useListParamWithDefault('ns');
  const [activeScopes, setActiveScopes] = useListParamWithDefault('scopes');

  const filters = useMemo(
    () => ({ namespaces: activeNamespaces, scopes: activeScopes, statuses: new Set() as any }),
    [activeNamespaces, activeScopes]
  );

  const { groups, groupType, availableAggregations, filteredCount } = useWorkspaceAggregation(
    items,
    aggregation,
    filters
  );

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

      <div className={styles.content}>
        {filteredCount === 0 && <EmptyWorkspace name={workspace.name} />}

        {groups.map((group) => (
          <section key={group.name} className={styles.section}>
            {groupType !== 'none' && (
              <div className={styles.sectionHeader}>
                <NamespaceHeader
                  namespace={group.name}
                  items={group.items}
                  scopeIcon={group.scopeIcon}
                  scopeIconColor={group.scopeIconColor}
                />
              </div>
            )}

            <ComponentGrid className={styles.cardGrid}>
              {group.items.map((item) => (
                <HopeComponentCard
                  key={item.component.id.toString()}
                  component={item.component}
                  componentDescriptor={item.componentDescriptor}
                  scope={item.scope as any}
                  showPreview={isMinimal}
                />
              ))}
            </ComponentGrid>
          </section>
        ))}
      </div>
    </div>
  );
}
