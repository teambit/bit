import type { Component } from '@teambit/component';

/**
 * Deterministic, sorted serialization of a Component for diffing.
 * The set of fields in this snapshot IS the contract — see
 * docs/rfcs/component-loading-rewrite/SNAPSHOT-CONTRACT.md.
 *
 * Anything in the snapshot must match between two loader implementations.
 * Anything not in the snapshot, the new loader is free to change.
 *
 * Start minimal. Add fields as we discover what matters.
 */
export interface NormalizedSnapshot {
  id: string;
  head: string | null;
  tags: string[];
  extensionIds: string[];
}

export function serializeComponentForDiff(component: Component): NormalizedSnapshot {
  return {
    id: component.id.toString(),
    head: component.head?.hash ?? null,
    tags: collectTags(component),
    extensionIds: collectExtensionIds(component),
  };
}

function collectTags(component: Component): string[] {
  const versions: string[] = [];
  for (const tag of component.tags.values()) {
    versions.push(tag.version.raw);
  }
  return versions.sort();
}

function collectExtensionIds(component: Component): string[] {
  const extensions = component.state?.config?.extensions;
  if (!extensions) return [];
  const ids: string[] = [];
  for (const entry of extensions) {
    if (entry.stringId) ids.push(entry.stringId);
  }
  return ids.sort();
}
