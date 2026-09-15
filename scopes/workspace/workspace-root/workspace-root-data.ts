import { ComponentID } from '@teambit/component-id';
import type { BitMap, ComponentMap } from '@teambit/legacy.bit-map';
import { WORKSPACE_ROOT_DIR } from '@teambit/legacy.bit-map';
import type { ExtensionDataList } from '@teambit/legacy.extension-data';
import { ExtensionDataEntry } from '@teambit/legacy.extension-data';
import { WorkspaceRootAspect } from './workspace-root.aspect';

/**
 * the aspect data every member of a workspace-root component carries once snapped: the root of the
 * workspace it was snapped in, at the version the root had at that moment. the version is left out
 * only when the root was never snapped.
 *
 * it is data, not config, on purpose: a Version's hash covers the extensions' config only, so the
 * pointer never makes a component modified, and the root moving on does not touch its members.
 */
export type WorkspaceRootData = {
  /** e.g. "my-org.my-scope/my-root@0.0.7" */
  root: string;
};

/**
 * the entry of the component that owns the workspace root (rootDir "."), if the workspace has one.
 */
export function findWorkspaceRootMap(bitMap: BitMap): ComponentMap | undefined {
  return bitMap.components.find((componentMap) => componentMap.rootDir === WORKSPACE_ROOT_DIR);
}

export function readWorkspaceRoot(extensions: ExtensionDataList): ComponentID | undefined {
  const root = extensions.findCoreExtension(WorkspaceRootAspect.id)?.data?.root;
  return root ? ComponentID.fromString(root) : undefined;
}

export function writeWorkspaceRoot(extensions: ExtensionDataList, rootId: ComponentID): void {
  const data: WorkspaceRootData = { root: rootId.toString() };
  const existing = extensions.findCoreExtension(WorkspaceRootAspect.id);
  if (existing) {
    existing.data = data;
    return;
  }
  // core aspects are keyed by name in the extensions list, the same way the component loader adds
  // aspect data (see WorkspaceComponentLoader.getDataEntry)
  extensions.push(new ExtensionDataEntry(undefined, undefined, WorkspaceRootAspect.id, undefined, data));
}
