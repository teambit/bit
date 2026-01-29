import type { WorkspaceItem } from './workspace-overview.types';

export const PRIORITY_HIGH = ['ui', 'pages'] as string[];
export const PRIORITY_MED = ['design'] as string[];
export const PRIORITY_LOW = ['entities', 'provider', 'hooks', 'icons'] as string[];

export function getRootNamespace(ns: string): string {
  if (!ns) return '';
  return ns.split('/')[0]!;
}

export function namespacePriority(ns: string): number {
  const root = getRootNamespace(ns);

  // internal namespaces (starting with _) go last
  if (root.startsWith('_')) return 4;

  if (PRIORITY_HIGH.includes(root)) return 0;
  if (PRIORITY_MED.includes(root)) return 1;
  if (PRIORITY_LOW.includes(root)) return 3;
  return 2;
}

export function sortNamespacesAdvanced(list: string[]): string[] {
  return [...list].sort((a, b) => {
    const pa = namespacePriority(a);
    const pb = namespacePriority(b);
    if (pa !== pb) return pa - pb;
    return a.localeCompare(b);
  });
}

export function sortItemsByNamespace(items: WorkspaceItem[]): WorkspaceItem[] {
  return [...items].sort((a, b) => {
    const na = a.component.id.namespace || '/';
    const nb = b.component.id.namespace || '/';

    const pa = namespacePriority(na);
    const pb = namespacePriority(nb);
    if (pa !== pb) return pa - pb;

    return a.component.id.name.localeCompare(b.component.id.name);
  });
}
