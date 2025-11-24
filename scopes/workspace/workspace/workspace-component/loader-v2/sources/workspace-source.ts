import type { ComponentID } from '@teambit/component-id';
import type { ExtensionDataList } from '@teambit/legacy.extension-data';
import type { ConsumerComponent } from '@teambit/legacy.consumer-component';
import type { ComponentSource, RawComponentData } from '../component-source';
import type { Workspace } from '../../workspace';

/**
 * WorkspaceSource loads components from the workspace filesystem.
 *
 * This is an adapter that bridges the V2 loader to the existing workspace loading logic.
 * It delegates to workspace.consumer.loadComponents() but returns data in the V2 format.
 */
export class WorkspaceSource implements ComponentSource {
  readonly name = 'workspace';
  readonly priority = 1; // Higher priority (lower number) than scope

  constructor(private workspace: Workspace) {}

  /**
   * Check if a component exists in the workspace (.bitmap)
   */
  async has(id: ComponentID): Promise<boolean> {
    try {
      const nonDeletedIds = this.workspace.listIds();
      const deletedIds = await this.workspace.locallyDeletedIds();
      const allIds = [...nonDeletedIds, ...deletedIds];

      return allIds.some((wsId) => wsId.isEqual(id, { ignoreVersion: !id.hasVersion() }));
    } catch {
      return false;
    }
  }

  /**
   * Check multiple components at once
   */
  async hasMany(ids: ComponentID[]): Promise<Map<string, boolean>> {
    const result = new Map<string, boolean>();
    const nonDeletedIds = this.workspace.listIds();
    const deletedIds = await this.workspace.locallyDeletedIds();
    const allWsIds = [...nonDeletedIds, ...deletedIds];

    for (const id of ids) {
      const exists = allWsIds.some((wsId) => wsId.isEqual(id, { ignoreVersion: !id.hasVersion() }));
      result.set(id.toString(), exists);
    }

    return result;
  }

  /**
   * Load raw component data for a single component
   */
  async loadRaw(id: ComponentID): Promise<RawComponentData> {
    // Use workspace's existing load mechanism
    const consumer = this.workspace.consumer;
    const resolvedId = this.resolveVersion(id);

    // Load via legacy consumer
    const legacyComponents = await consumer.loadComponents([resolvedId], false);

    if (legacyComponents.length === 0) {
      throw new Error(`Component ${id.toString()} not found in workspace`);
    }

    const consumerComponent = legacyComponents[0];

    // Get extensions
    const componentFromScope = await this.workspace.scope.get(resolvedId, undefined, false).catch(() => null);
    const { extensions } = await this.workspace.componentExtensions(resolvedId, componentFromScope, undefined, {
      loadExtensions: false,
    });

    return {
      id: resolvedId,
      consumerComponent,
      extensions,
      isNew: !resolvedId.hasVersion(),
      source: 'workspace',
    };
  }

  /**
   * Load raw component data for multiple components
   */
  async loadRawMany(ids: ComponentID[]): Promise<Map<string, RawComponentData>> {
    const result = new Map<string, RawComponentData>();

    // Resolve versions for all IDs
    const resolvedIds = ids.map((id) => this.resolveVersion(id));

    // Load all components via legacy consumer
    const consumer = this.workspace.consumer;
    const legacyComponents: ConsumerComponent[] = await consumer.loadComponents(resolvedIds, false);

    // Convert to RawComponentData
    for (const consumerComponent of legacyComponents) {
      const id = consumerComponent.id;

      // Get extensions
      const componentFromScope = await this.workspace.scope.get(id, undefined, false).catch(() => null);
      const { extensions } = await this.workspace.componentExtensions(id, componentFromScope, undefined, {
        loadExtensions: false,
      });

      const rawData: RawComponentData = {
        id,
        consumerComponent,
        extensions,
        isNew: !id.hasVersion(),
        source: 'workspace',
      };

      result.set(id.toString(), rawData);
    }

    return result;
  }

  /**
   * Get extensions for a component without fully loading it
   */
  async getExtensions(id: ComponentID): Promise<ExtensionDataList | null> {
    try {
      const resolvedId = this.resolveVersion(id);
      const componentFromScope = await this.workspace.scope.get(resolvedId, undefined, false).catch(() => null);
      const { extensions } = await this.workspace.componentExtensions(resolvedId, componentFromScope, undefined, {
        loadExtensions: false,
      });
      return extensions;
    } catch {
      return null;
    }
  }

  /**
   * Get extensions for multiple components
   */
  async getExtensionsMany(ids: ComponentID[]): Promise<Map<string, ExtensionDataList>> {
    const result = new Map<string, ExtensionDataList>();

    for (const id of ids) {
      const extensions = await this.getExtensions(id);
      if (extensions) {
        result.set(id.toString(), extensions);
      }
    }

    return result;
  }

  /**
   * Resolve version from workspace state (handles out-of-sync)
   */
  private resolveVersion(id: ComponentID): ComponentID {
    try {
      const bitMap = this.workspace.consumer.bitMap;
      const idWithoutVersion = id.toStringWithoutVersion();

      if (bitMap.hasId(idWithoutVersion)) {
        const componentMap = bitMap.getComponent(idWithoutVersion);
        if (componentMap.version) {
          return id.changeVersion(componentMap.version);
        }
      }

      return id;
    } catch {
      return id;
    }
  }
}

/**
 * Factory function for creating a WorkspaceSource
 */
export function createWorkspaceSource(workspace: Workspace): WorkspaceSource {
  return new WorkspaceSource(workspace);
}
