import { ComponentID } from '@teambit/component-id';
import type { BitMap, ComponentMap } from '@teambit/legacy.bit-map';
import type { ExtensionDataList } from '@teambit/legacy.extension-data';
import { ExtensionDataEntry } from '@teambit/legacy.extension-data';
import { WorkspaceRootAspect } from './workspace-root.aspect';

/**
 * the aspect data of a workspace-root component and of its members. it is data, not config, on
 * purpose: a Version's hash covers the extensions' config only, so neither entry ever makes a
 * component modified, and the root moving on does not touch its members.
 */
export type WorkspaceRootData = {
  /**
   * on the workspace-root component itself. set when it is loaded in a workspace and saved with
   * every version, so the root is told from the model alone - by an import onto ".", a CI, a clone -
   * and not by the files it happens to carry.
   */
  isRoot?: boolean;
  /**
   * on a member: the root of the workspace it was snapped in, at the version the root had at that
   * moment, e.g. "my-org.my-scope/my-root@0.0.7". tag and snap bring a new or modified root into
   * their batch, so a member they made always has the version.
   */
  root?: string;
};

/**
 * the entry of the component that owns the workspace root (rootDir "."), if the workspace has one.
 *
 * a root created on another lane, or removed, stays in `.bitmap` so a switch back can restore it.
 * it is not this workspace's root though, and tagging or snapping would otherwise bring it along.
 */
export function findWorkspaceRootMap(bitMap: BitMap): ComponentMap | undefined {
  return bitMap.getWorkspaceRootMap();
}

function findData(extensions: ExtensionDataList): WorkspaceRootData | undefined {
  return extensions.findCoreExtension(WorkspaceRootAspect.id)?.data;
}

/**
 * whether the component is a workspace-root component, by the marker its versions carry.
 */
export function isWorkspaceRootComponent(extensions: ExtensionDataList): boolean {
  return Boolean(findData(extensions)?.isRoot);
}

export function readWorkspaceRoot(extensions: ExtensionDataList): ComponentID | undefined {
  const root = findData(extensions)?.root;
  return root ? ComponentID.fromString(root) : undefined;
}

/**
 * drop what another workspace recorded on this component.
 *
 * the data travels with the component, so one imported into a workspace that has no root of its own
 * still carries the root it was snapped in, and snapping it here would carry it into the new version -
 * claiming it was made in a workspace it has never been in. the same call clears a stale `isRoot` from
 * a component that was the root once and is tracked in a directory of its own now; left there, an
 * import onto "." or a clone would take ordinary source for a workspace root.
 */
export function clearWorkspaceRoot(extensions: ExtensionDataList): void {
  clearWorkspaceRootPointer(extensions);
  const existing = extensions.findCoreExtension(WorkspaceRootAspect.id);
  if (existing?.data) delete existing.data.isRoot;
}

/**
 * drop the pointer to the root this component was snapped in, and keep the marker saying it is a root
 * itself.
 *
 * for a component that was a member before it was tracked at ".": the loader merges the marker into
 * the data the component already carried rather than replacing it, so without this the version would
 * say the component is a workspace root and a member of a different one at the same time, and reading
 * its root back would name that other component.
 */
export function clearWorkspaceRootPointer(extensions: ExtensionDataList): void {
  const existing = extensions.findCoreExtension(WorkspaceRootAspect.id);
  if (!existing?.data) return;
  delete existing.data.root;
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
