import type { ComponentID } from '@teambit/component-id';
import type { BitMap } from '@teambit/legacy.bit-map';

/**
 * Result of the Discovery phase
 */
export interface DiscoveryResult {
  /** All component IDs discovered */
  ids: ComponentID[];

  /** IDs that exist in workspace (from .bitmap) */
  workspaceIds: ComponentID[];

  /** IDs that need to be loaded from scope */
  scopeIds: ComponentID[];

  /** IDs that were explicitly requested (subset of ids) */
  requestedIds: ComponentID[];
}

/**
 * Discovery Phase
 *
 * Purpose: Find all ComponentIDs that need to be loaded.
 *
 * Input: Requested component IDs (or "all" to load entire workspace)
 * Output: Categorized lists of IDs (workspace vs scope)
 *
 * This phase does NOT load any component data - it only identifies what needs to be loaded.
 */
export class DiscoveryPhase {
  constructor(
    private bitmap: BitMap,
    private hasInScope: (id: ComponentID) => Promise<boolean>
  ) {}

  /**
   * Discover which components need to be loaded and categorize them.
   */
  async execute(requestedIds: ComponentID[]): Promise<DiscoveryResult> {
    const workspaceIds: ComponentID[] = [];
    const scopeIds: ComponentID[] = [];

    for (const id of requestedIds) {
      const isInWorkspace = this.isInWorkspace(id);
      if (isInWorkspace) {
        workspaceIds.push(id);
      } else {
        // Check if it exists in scope
        const isInScope = await this.hasInScope(id);
        if (isInScope) {
          scopeIds.push(id);
        }
        // If not in workspace or scope, it will be handled as an error later
      }
    }

    return {
      ids: [...workspaceIds, ...scopeIds],
      workspaceIds,
      scopeIds,
      requestedIds,
    };
  }

  /**
   * Discover all components in the workspace.
   */
  async discoverAll(): Promise<DiscoveryResult> {
    const allIds = this.bitmap.getAllBitIdsFromAllLanes();
    const componentIds = allIds.map((id) => id);

    return {
      ids: componentIds,
      workspaceIds: componentIds,
      scopeIds: [],
      requestedIds: componentIds,
    };
  }

  /**
   * Check if a component exists in the workspace (.bitmap)
   */
  private isInWorkspace(id: ComponentID): boolean {
    try {
      // Check if component is in bitmap
      const allIdsStr = this.bitmap.getAllIdsStr();
      const idStr = id.toString();
      const idWithoutVersion = id.toStringWithoutVersion();
      return idStr in allIdsStr || idWithoutVersion in allIdsStr;
    } catch {
      return false;
    }
  }
}

/**
 * Factory function for creating a DiscoveryPhase
 */
export function createDiscoveryPhase(
  bitmap: BitMap,
  hasInScope: (id: ComponentID) => Promise<boolean>
): DiscoveryPhase {
  return new DiscoveryPhase(bitmap, hasInScope);
}
