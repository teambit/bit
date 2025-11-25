import type { ComponentID } from '@teambit/component-id';
import type { ExtensionDataList } from '@teambit/legacy.extension-data';
import type { ComponentSource, RawComponentData } from '../component-source';
import type { Workspace } from '../../../workspace';

/**
 * WorkspaceSource loads components from the workspace filesystem.
 *
 * NOTE: This is a stub implementation.  V2 loader currently delegates to V1 in workspace-component-loader-v2.ts.
 * This file exists to satisfy the type system but methods are not currently used.
 */
export class WorkspaceSource implements ComponentSource {
  readonly name = 'workspace';
  readonly priority = 1;

  constructor(private workspace: Workspace) {}

  async has(_id: ComponentID): Promise<boolean> {
    throw new Error('WorkspaceSource.has not implemented - V2 loader delegates to V1');
  }

  async hasMany(_ids: ComponentID[]): Promise<Map<string, boolean>> {
    throw new Error('WorkspaceSource.hasMany not implemented - V2 loader delegates to V1');
  }

  async loadRaw(_id: ComponentID): Promise<RawComponentData> {
    throw new Error('WorkspaceSource.loadRaw not implemented - V2 loader delegates to V1');
  }

  async loadRawMany(_ids: ComponentID[]): Promise<Map<string, RawComponentData>> {
    throw new Error('WorkspaceSource.loadRawMany not implemented - V2 loader delegates to V1');
  }

  async getExtensions(_id: ComponentID): Promise<ExtensionDataList | null> {
    throw new Error('WorkspaceSource.getExtensions not implemented - V2 loader delegates to V1');
  }

  async getExtensionsMany(_ids: ComponentID[]): Promise<Map<string, ExtensionDataList>> {
    throw new Error('WorkspaceSource.getExtensionsMany not implemented - V2 loader delegates to V1');
  }
}

export function createWorkspaceSource(workspace: Workspace): WorkspaceSource {
  return new WorkspaceSource(workspace);
}
