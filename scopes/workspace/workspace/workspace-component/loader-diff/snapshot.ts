import type { Component } from '@teambit/component';

/**
 * Deterministic, sorted serialization of a Component for diffing.
 * The set of fields in this snapshot IS the contract — see
 * docs/rfcs/component-loading-rewrite/SNAPSHOT-CONTRACT.md.
 *
 * Anything in the snapshot must match between two loader implementations.
 * Anything not in the snapshot, the new loader is free to change.
 */
export interface NormalizedSnapshot {
  id: string;
  head: string | null;
  tags: string[];
  extensionIds: string[];
  /** Pre-slot config (`state.config.extensions`), sorted by id, with config + data. */
  extensions: AspectSnapshot[];
  /** Post-slot aspects (`state.aspects.entries`), sorted by id, with config + data. */
  aspects: AspectSnapshot[];
}

export interface AspectSnapshot {
  id: string;
  /** JSON-canonical form of the entry's config. */
  config: string;
}

// `data` (the mutable post-load state populated by aspect slots and dep
// resolution) is intentionally NOT included. In V1, the contents of `data`
// depend on cache warmth — a cold-cache load eagerly computes dependencies,
// a warm-cache load short-circuits. The harness's primary and partner will
// have different cache states when sampling is enabled, so comparing `data`
// produces noisy false positives. `config` is stable across cache states.
// See SNAPSHOT-CONTRACT.md.

export function serializeComponentForDiff(component: Component): NormalizedSnapshot {
  return {
    id: component.id.toString(),
    head: component.head?.hash ?? null,
    tags: collectTags(component),
    extensionIds: collectExtensionIds(component),
    extensions: collectExtensions(component),
    aspects: collectAspects(component),
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

function collectExtensions(component: Component): AspectSnapshot[] {
  const extensions = component.state?.config?.extensions;
  if (!extensions) return [];
  const out: AspectSnapshot[] = [];
  for (const entry of extensions) {
    if (!entry.stringId) continue;
    out.push({ id: entry.stringId, config: canonicalJson(entry.config) });
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function collectAspects(component: Component): AspectSnapshot[] {
  const aspects = component.state?.aspects;
  if (!aspects) return [];
  const out: AspectSnapshot[] = [];
  for (const entry of aspects.entries) {
    out.push({ id: entry.id.toString(), config: canonicalJson(entry.config) });
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Stable JSON serialization: sorts object keys at every level so two
 * structurally-equal objects produce the same string regardless of insertion order.
 * Non-serializable values (functions, undefined, BigInt, etc.) are dropped or coerced
 * by JSON.stringify the same way on both sides — fine for V1-vs-V1 diffing.
 */
function canonicalJson(value: unknown): string {
  if (value === undefined || value === null) return 'null';
  return JSON.stringify(value, (_key, val) => {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(val).sort()) sorted[k] = (val as Record<string, unknown>)[k];
      return sorted;
    }
    return val;
  });
}
