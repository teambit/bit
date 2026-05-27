import type { ComponentID } from '@teambit/component-id';

/**
 * Result of discovery: input ComponentIDs partitioned into "workspace components"
 * (present in the bitmap, with versions resolved) and "scope components" (everything else).
 *
 * Keys for `workspaceIds` are the *resolved* id string (with version filled in from
 * the bitmap). Keys for `scopeIds` are the input id string as-given. The asymmetry
 * is preserved from V1 — workspace ids need version resolution because `bit show comp1`
 * doesn't include a version, while scope ids are typically already versioned.
 */
export interface DiscoveredIds {
  workspaceIds: Map<string, ComponentID>;
  scopeIds: Map<string, ComponentID>;
}

export interface DiscoveryInput {
  /**
   * All workspace component ids — including locally-deleted ones, since users may
   * still want to load and inspect them.
   */
  knownWorkspaceIds: ComponentID[];
  /**
   * Resolve a (possibly versionless) workspace ComponentID to its full versioned form
   * using bitmap state. Pure with respect to the bitmap snapshot at the time of the call.
   */
  resolveWorkspaceVersion: (id: ComponentID) => ComponentID;
}

/**
 * Pure classifier: partition input ids into workspace vs scope buckets, resolving
 * workspace versions from the bitmap. If `existing` is passed, results are appended
 * to it (preserving V1's "append to map" behavior used during plan-building when
 * extra extension ids are discovered after the initial pass).
 */
export function classifyIds(ids: ComponentID[], input: DiscoveryInput, existing?: DiscoveredIds): DiscoveredIds {
  const result = existing ?? { workspaceIds: new Map(), scopeIds: new Map() };
  for (const id of ids) {
    const inWs = input.knownWorkspaceIds.find((wsId) => wsId.isEqual(id, { ignoreVersion: !id.hasVersion() }));
    if (!inWs) {
      result.scopeIds.set(id.toString(), id);
      continue;
    }
    const resolved = input.resolveWorkspaceVersion(id);
    result.workspaceIds.set(resolved.toString(), resolved);
  }
  return result;
}
