import type { WorkspaceItem } from './workspace-overview.types';

export interface ActiveFilters {
  namespaces: string[];
  scopes: string[];
}

export function parseActiveFilters(search: URLSearchParams): ActiveFilters {
  return {
    namespaces: (search.get('ns') || '').split(',').filter(Boolean),
    scopes: (search.get('scopes') || '').split(',').filter(Boolean),
  };
}

export function filterItems(items: WorkspaceItem[], filters: ActiveFilters): WorkspaceItem[] {
  return items.filter((item) => {
    const ns = item.component.id.namespace || '/';
    const sc = item.component.id.scope;

    if (filters.namespaces.length && !filters.namespaces.includes(ns)) return false;
    if (filters.scopes.length && !filters.scopes.includes(sc)) return false;

    return true;
  });
}
