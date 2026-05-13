import type { WorkspaceItem, ComponentStatus } from './workspace-overview.types';

export interface ActiveFilters {
  namespaces: string[];
  scopes: string[];
  statuses: Set<ComponentStatus>;
}

export const ALL_STATUSES: ComponentStatus[] = ['built', 'changed', 'building', 'queued'];

export function parseActiveFilters(search: URLSearchParams): ActiveFilters {
  return {
    namespaces: (search.get('ns') || '').split(',').filter(Boolean),
    scopes: (search.get('scopes') || '').split(',').filter(Boolean),
    statuses: new Set(ALL_STATUSES),
  };
}

export function getComponentStatus(item: WorkspaceItem): ComponentStatus {
  const buildStatus = (item.component as any).buildStatus;
  const status = (item.component as any).status;
  if (buildStatus === 'pending') return 'queued';
  if (status?.modifyInfo?.hasModifiedFiles || status?.modifyInfo?.hasModifiedDependencies) return 'changed';
  if (buildStatus === 'building') return 'building';
  return 'built';
}

export function filterItems(items: WorkspaceItem[], filters: ActiveFilters): WorkspaceItem[] {
  return items.filter((item) => {
    const ns = item.component.id.namespace || '/';
    const sc = item.component.id.scope;

    if (filters.namespaces.length && !filters.namespaces.includes(ns)) return false;
    if (filters.scopes.length && !filters.scopes.includes(sc)) return false;
    if (filters.statuses.size > 0 && filters.statuses.size < ALL_STATUSES.length) {
      const componentStatus = getComponentStatus(item);
      if (!filters.statuses.has(componentStatus)) return false;
    }

    return true;
  });
}
