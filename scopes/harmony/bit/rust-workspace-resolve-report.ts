import { ComponentID } from '@teambit/component-id';
import { formatItem, formatSection } from '@teambit/cli/dist/output-formatter.js';

/** Keep the MergeCmd resolved-components branch without loading Consumer models. */
export function formatRustWorkspaceResolve(value: any) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => key !== 'resolvedComponents') ||
    !Array.isArray(value.resolvedComponents) ||
    value.resolvedComponents.length > 4096
  )
    throw new Error('native resolve report');
  const seen = new Set<string>();
  const items = value.resolvedComponents.map((row: any) => {
    if (
      !row ||
      typeof row !== 'object' ||
      Array.isArray(row) ||
      Object.keys(row).some((key) => key !== 'id') ||
      typeof row.id !== 'string' ||
      row.id.length > 4096
    )
      throw new Error('native resolve component');
    const identity = ComponentID.fromString(row.id).toStringWithoutVersion();
    if (seen.has(identity)) throw new Error('native resolve duplicate component');
    seen.add(identity);
    return formatItem(identity);
  });
  return formatSection('resolved components', '', items);
}
