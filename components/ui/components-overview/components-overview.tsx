import type { ReactNode } from 'react';
import React, { useMemo } from 'react';
import classnames from 'classnames';
import { ComponentGrid } from '@teambit/explorer.ui.gallery.component-grid';
import compact from 'lodash.compact';
import { ScopeID } from '@teambit/scopes.scope-id';
import { useCloudScopes } from '@teambit/cloud.hooks.use-cloud-scopes';
import type { ComponentModel } from '@teambit/component';
import type { ComponentDescriptor } from '@teambit/component-descriptor';
import { useComponentsAggregation } from './use-components-aggregation';
import { useQueryParamWithDefault, useListParamWithDefault } from './use-query-param-with-default';
import { NamespaceHeader } from './namespace-header';
import { HopeComponentCard } from './hope-component-card';
import type { AggregationType, WorkspaceItem } from './components-overview.types';
import { ComponentsOverviewFilterPanel } from './components-overview-filter-panel';
import styles from './components-overview.module.scss';

export type ComponentsOverviewProps = {
  components: ComponentModel[];
  componentDescriptors: ComponentDescriptor[];
  /** link target for a card. Default: `${id.fullName}?scope=${id.scope}` */
  getHref?: (component: ComponentModel) => string;
  /** rendered above the filter command bar */
  header?: ReactNode;
  /** rendered inside the content container, after the sections */
  footer?: ReactNode;
  /** rendered when the filtered set is empty */
  emptyState?: ReactNode;
  /** localStorage key prefix for persisted filter/aggregation prefs */
  storageNamespace?: string;
  /** forwarded to HopeComponentCard */
  showPreview?: boolean;
  className?: string;
};

export function ComponentsOverview({
  components,
  componentDescriptors,
  getHref,
  header,
  footer,
  emptyState,
  storageNamespace = 'components-overview',
  showPreview,
  className,
}: ComponentsOverviewProps) {
  const storageKeyPrefix = `${storageNamespace}:`;

  const uniqueScopes = useMemo(() => [...new Set(components.map((c) => c.id.scope))], [components]);
  const { cloudScopes } = useCloudScopes(uniqueScopes);
  const cloudMap = useMemo(() => new Map((cloudScopes || []).map((s) => [s.id.toString(), s])), [cloudScopes]);
  const compDescriptorMap = useMemo(
    () => new Map(componentDescriptors.map((d) => [d.id.toString(), d])),
    [componentDescriptors]
  );

  const items: WorkspaceItem[] = useMemo(
    () =>
      compact(
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
              ? {
                  id: scope.id,
                  icon: (scope as any).icon,
                  backgroundIconColor: (scope as any).backgroundIconColor,
                }
              : undefined,
          };
        })
      ),
    [components, compDescriptorMap, cloudMap]
  );

  const [aggregation, setAggregation] = useQueryParamWithDefault<AggregationType>('aggregation', 'namespaces', {
    storageKeyPrefix,
  });
  const [activeNamespaces, setActiveNamespaces] = useListParamWithDefault('ns', { storageKeyPrefix });
  const [activeScopes, setActiveScopes] = useListParamWithDefault('scopes', { storageKeyPrefix });

  const filters = useMemo(
    () => ({ namespaces: activeNamespaces, scopes: activeScopes, statuses: new Set() as any }),
    [activeNamespaces, activeScopes]
  );

  const { groups, groupType, availableAggregations, filteredCount } = useComponentsAggregation(
    items,
    aggregation,
    filters
  );

  return (
    <div className={classnames(styles.container, className)}>
      {header}

      <ComponentsOverviewFilterPanel
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
        {filteredCount === 0 && emptyState}

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
                  showPreview={showPreview}
                  getHref={getHref}
                />
              ))}
            </ComponentGrid>
          </section>
        ))}

        {footer}
      </div>
    </div>
  );
}
