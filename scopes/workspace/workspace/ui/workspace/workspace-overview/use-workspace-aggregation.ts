import { useMemo } from 'react';
import { sortNamespacesAdvanced, sortItemsByNamespace } from './namespace-sort';
import { filterItems, type ActiveFilters } from './filter-utils';
import type { WorkspaceItem, AggregationType, AggregationGroup, AggregationResult } from './workspace-overview.types';

export function useWorkspaceAggregation(
  items: WorkspaceItem[],
  aggregation: AggregationType,
  filters: ActiveFilters
): AggregationResult {
  const filtered = useMemo(() => filterItems(items, filters), [items, filters]);

  if (aggregation === 'none') {
    return {
      groups: [
        {
          name: 'all',
          displayName: '',
          items: sortItemsByNamespace(filtered),
        },
      ],
      groupType: 'none',
      availableAggregations: ['namespaces', 'scopes', 'none'],
      filteredCount: filtered.length,
    };
  }

  if (aggregation === 'namespaces') {
    const map = new Map<string, WorkspaceItem[]>();
    for (const item of filtered) {
      const ns = item.component.id.namespace || '/';
      if (!map.has(ns)) map.set(ns, []);
      map.get(ns)!.push(item);
    }

    const sortedKeys = sortNamespacesAdvanced([...map.keys()]);

    const groups: AggregationGroup[] = sortedKeys.map((ns) => ({
      name: ns,
      displayName: ns,
      items: sortItemsByNamespace(map.get(ns)!),
    }));

    return {
      groups,
      groupType: 'namespaces',
      availableAggregations: ['namespaces', 'scopes', 'none'],
      filteredCount: filtered.length,
    };
  }

  const map = new Map<string, WorkspaceItem[]>();
  for (const item of filtered) {
    const scope = item.component.id.scope;
    if (!map.has(scope)) map.set(scope, []);
    map.get(scope)!.push(item);
  }

  const sortedScopes = [...map.keys()].sort();

  const groups: AggregationGroup[] = sortedScopes.map((sc) => {
    const groupItems = map.get(sc)!;
    const sampleScope = groupItems.find((i) => i.scope?.icon)?.scope;
    return {
      name: sc,
      displayName: sc,
      items: sortItemsByNamespace(groupItems),
      scopeIcon: sampleScope?.icon,
      scopeIconColor: sampleScope?.backgroundIconColor,
    };
  });

  return {
    groups,
    groupType: 'scopes',
    availableAggregations: ['namespaces', 'scopes', 'none'],
    filteredCount: filtered.length,
  };
}
