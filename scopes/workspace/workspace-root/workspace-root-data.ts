import fs from 'fs-extra';
import path from 'path';
import { ComponentID } from '@teambit/component-id';
import type { BitMap, ComponentMap, VersionedBitmapEntry } from '@teambit/legacy.bit-map';
import { isWorkspaceMapFile, readVersionedBitmapEntries } from '@teambit/legacy.bit-map';
import type { ExtensionDataList } from '@teambit/legacy.extension-data';
import { ExtensionDataEntry } from '@teambit/legacy.extension-data';
import { pathNormalizeToLinux } from '@teambit/legacy.utils';
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

export const PNPM_WORKSPACE_MANIFEST = 'pnpm-workspace.yaml';

/**
 * a workspace whose root component is a pnpm workspace. pnpm installs it from the packages' own
 * manifests, so bit neither installs it nor writes dependencies into the root package.json.
 */
export function isPnpmWorkspaceRoot(workspacePath: string, bitMap: BitMap): boolean {
  return Boolean(findWorkspaceRootMap(bitMap)) && fs.existsSync(path.join(workspacePath, PNPM_WORKSPACE_MANIFEST));
}

/**
 * the entry of the component that owns the workspace root (rootDir "."), if the workspace has one.
 *
 * a root created on another lane, or removed, stays in `.bitmap` so a switch back can restore it.
 * it is not this workspace's root though, and tagging or snapping would otherwise bring it along.
 */
export function findWorkspaceRootMap(bitMap: BitMap): ComponentMap | undefined {
  return bitMap.getWorkspaceRootMap();
}

/**
 * the components a workspace-root component lists in the `.bitmap` it versions, itself included,
 * each with the directory it records for it. read from the root's files, so it is the same list
 * wherever the root was loaded from.
 */
export function readRootBitmapEntries(
  rootFiles: Array<{ relative: string; contents: Buffer }>
): VersionedBitmapEntry[] {
  const bitmapFile = rootFiles.find((file) => isWorkspaceMapFile(pathNormalizeToLinux(file.relative)));
  return bitmapFile ? readVersionedBitmapEntries(bitmapFile.contents.toString()) : [];
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
 * nothing clears this data: it is not inherited from the version before it. the loader supplies the
 * aspect's data on every load, so a component arrives with the root of the workspace it is in now, or
 * with none - what an earlier workspace recorded never reaches the next version. the data is replaced
 * wholesale rather than merged, so a component that changes role (a member tracked at "." later, or a
 * root moved into a directory of its own) does not keep the marker of the role it left.
 */
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
