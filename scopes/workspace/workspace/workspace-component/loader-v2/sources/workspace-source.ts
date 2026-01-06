import { ComponentIdList } from '@teambit/component-id';
import type { ComponentID } from '@teambit/component-id';
import { ExtensionDataList } from '@teambit/legacy.extension-data';
import type { ComponentSource, RawComponentData } from '../component-source';
import type { Workspace } from '../../../workspace';

/**
 * WorkspaceSource loads components from the workspace filesystem.
 *
 * Uses workspace.consumer.loadComponents() to load from the filesystem.
 */
export class WorkspaceSource implements ComponentSource {
  readonly name = 'workspace';
  readonly priority = 1; // Workspace has higher priority than scope

  constructor(private workspace: Workspace) {}

  /**
   * Check if a component exists in the workspace (.bitmap)
   */
  async has(id: ComponentID): Promise<boolean> {
    try {
      const allIdsStr = this.workspace.consumer.bitMap.getAllIdsStr();
      const idStr = id.toString();
      const idWithoutVersion = id.toStringWithoutVersion();
      return idStr in allIdsStr || idWithoutVersion in allIdsStr;
    } catch {
      return false;
    }
  }

  /**
   * Check multiple components at once
   */
  async hasMany(ids: ComponentID[]): Promise<Map<string, boolean>> {
    const result = new Map<string, boolean>();
    const allIdsStr = this.workspace.consumer.bitMap.getAllIdsStr();

    for (const id of ids) {
      const idStr = id.toString();
      const idWithoutVersion = id.toStringWithoutVersion();
      const has = idStr in allIdsStr || idWithoutVersion in allIdsStr;
      result.set(idStr, has);
    }

    return result;
  }

  /**
   * Load a single component from workspace
   */
  async loadRaw(id: ComponentID): Promise<RawComponentData> {
    const result = await this.loadRawMany([id]);
    const data = result.get(id.toString());
    if (!data) {
      throw new Error(`Component ${id.toString()} not found in workspace`);
    }
    return data;
  }

  /**
   * Load multiple components from workspace
   */
  async loadRawMany(ids: ComponentID[]): Promise<Map<string, RawComponentData>> {
    const result = new Map<string, RawComponentData>();

    if (ids.length === 0) {
      return result;
    }

    // Load components using consumer.loadComponents
    // Use skipDependencyResolution to prevent recursive workspace.get() calls
    // through the dependency resolution path (mergeVariantPolicies -> getEnvComponentByEnvId)
    // The V2 loader's Enrichment phase will handle dependency resolution separately
    //
    // IMPORTANT: storeInCache must be false to prevent caching these incomplete components
    // in the consumer's componentLoader cache. If cached, subsequent loads (like status checks)
    // would get the incomplete version and incorrectly mark components as modified.
    const loadOpts = {
      originatedFromHarmony: true,
      loadExtensions: false,
      loadDocs: false,
      loadCompositions: false,
      skipDependencyResolution: true,
      storeInCache: false,
    };

    const { components, invalidComponents, removedComponents } = await this.workspace.consumer.loadComponents(
      ComponentIdList.fromArray(ids),
      false, // throwOnFailure
      loadOpts
    );

    // Process successfully loaded components
    const allComponents = components.concat(removedComponents || []);
    for (const consumerComponent of allComponents) {
      const componentId = ids.find((id) => id.isEqual(consumerComponent.id));
      if (!componentId) continue;

      const extensions = consumerComponent.extensions || (consumerComponent as any).config?.extensions || [];

      result.set(componentId.toString(), {
        id: componentId,
        consumerComponent,
        extensions,
        isNew: !consumerComponent.version || consumerComponent.version === 'latest',
        source: 'workspace',
      });
    }

    // Process invalid components (still create entries for error tracking)
    for (const invalid of invalidComponents || []) {
      const componentId = ids.find((id) => id.toString() === invalid.id.toString());
      if (!componentId) continue;

      // For invalid components, create a minimal RawComponentData with errors
      result.set(componentId.toString(), {
        id: componentId,
        consumerComponent: invalid.component as any,
        extensions: new ExtensionDataList(),
        errors: [invalid.error],
        isNew: true,
        source: 'workspace',
      });
    }

    return result;
  }

  /**
   * Get extensions for a component without fully loading it
   */
  async getExtensions(id: ComponentID): Promise<ExtensionDataList | null> {
    try {
      // Load the component just to get extensions
      const data = await this.loadRaw(id);
      return data.extensions;
    } catch {
      return null;
    }
  }

  /**
   * Get extensions for multiple components
   */
  async getExtensionsMany(ids: ComponentID[]): Promise<Map<string, ExtensionDataList>> {
    const result = new Map<string, ExtensionDataList>();

    try {
      const loaded = await this.loadRawMany(ids);
      for (const [idStr, data] of loaded) {
        if (data.extensions) {
          result.set(idStr, data.extensions);
        }
      }
    } catch {
      // Return empty map on error
    }

    return result;
  }
}

export function createWorkspaceSource(workspace: Workspace): WorkspaceSource {
  return new WorkspaceSource(workspace);
}
