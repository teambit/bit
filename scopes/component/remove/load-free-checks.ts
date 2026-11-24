import path from 'path';
import fs from 'fs-extra';
import type { Workspace } from '@teambit/workspace';
import type { ComponentID } from '@teambit/component-id';
import type { componentIdToPackageName } from '@teambit/pkg.modules.component-package-name';
import { WORKSPACE_ROOT_DIR } from '@teambit/legacy.bit-map';
import { COMPONENT_CONFIG_FILE_NAME } from '@teambit/legacy.constants';
import { VERSION_ZERO } from '@teambit/objects';
import { pathNormalizeToLinux } from '@teambit/toolbox.path.path';
import { logger } from '@teambit/legacy.logger';

/**
 * the data needed to calculate the package name of a component (see componentIdToPackageName).
 */
export type PackageNameData = Parameters<typeof componentIdToPackageName>[0];

export type RemoveStatus = { newlyCreated: boolean; modified: boolean };

/**
 * the helpers below let "bit remove" avoid loading the removed components. loading a component loads its env, and
 * when the env is not installed (e.g. the components were imported without installing), it's loaded from the scope,
 * which means isolating it in a capsule - way too expensive for a command that only needs a few facts about them.
 * each helper returns undefined when it can't tell without loading, so the caller falls back to the full load.
 */

/**
 * whether removing the component loses local work ("modified"): its files differ from the checked-out version.
 * unlike the component status, dependencies are not compared. they are derived from the files (and the env), so
 * comparing them requires loading the env, and when the packages are not installed they differ anyway.
 */
export async function getStatusWithoutLoading(
  workspace: Workspace,
  id: ComponentID
): Promise<RemoveStatus | undefined> {
  const consumer = workspace.consumer;
  try {
    const componentMap = consumer.bitMap.getComponentIfExist(id, { ignoreVersion: true });
    if (!componentMap || componentMap.rootDir === WORKSPACE_ROOT_DIR) return undefined;
    // config changes are kept in .bitmap or in component.json. comparing them to the model requires a merge of all
    // config sources, let the full status handle them.
    if (componentMap.config && Object.keys(componentMap.config).length) return undefined;
    const compDirAbs = path.join(consumer.getPath(), componentMap.getComponentDir());
    if (!(await fs.pathExists(compDirAbs))) return undefined;
    if (await fs.pathExists(path.join(compDirAbs, COMPONENT_CONFIG_FILE_NAME))) return undefined;
    // a pending merge may carry merged config. same as above.
    if (consumer.scope.objects.unmergedComponents.getEntry(id)) return undefined;

    await consumer.bitMap.trackDirectoryChanges(componentMap);
    // without the main file, the component is invalid. the full status knows to let it be removed.
    if (!componentMap.getAllFilesPaths().includes(componentMap.mainFile)) return undefined;

    const modelComponent = await consumer.scope.getModelComponentIfExist(id.changeVersion(undefined));
    const hasHistory = modelComponent && modelComponent.getHeadRegardlessOfLaneAsTagOrHash(true) !== VERSION_ZERO;
    const hasVersion = componentMap.id.hasVersion();
    if (!hasVersion && !hasHistory) return { newlyCreated: true, modified: false };
    // either versioned but missing from the scope (pending import), or the scope has a version the .bitmap doesn't
    // (out of sync). the full status knows how to handle both.
    if (!hasVersion || !modelComponent) return undefined;
    if (!hasHistory) return { newlyCreated: true, modified: false };
    const versionStr = componentMap.id.version as string;
    const version = await modelComponent.loadVersion(versionStr, consumer.scope.objects, false);
    if (!version) return undefined;

    const modified =
      pathNormalizeToLinux(componentMap.mainFile) !== version.mainFile ||
      (await workspace.getFilesModification(id)).isModified();
    return { newlyCreated: false, modified };
  } catch (err: any) {
    logger.debug(`getStatusWithoutLoading, failed for ${id.toString()}, falling back to the full status`, err);
    return undefined;
  }
}

export async function getPackageNameDataWithoutLoading(
  workspace: Workspace,
  id: ComponentID
): Promise<PackageNameData | undefined> {
  try {
    const componentMap = workspace.consumer.bitMap.getComponentIfExist(id, { ignoreVersion: true });
    if (!componentMap) return undefined;
    const compId = componentMap.id;
    const componentFromScope = compId.hasVersion() ? await workspace.scope.get(compId, true, false) : undefined;
    const { extensions } = await workspace.componentExtensions(compId, componentFromScope, [], {
      loadExtensions: false,
    });
    return { id: compId, bindingPrefix: componentFromScope?.state._consumer.bindingPrefix, extensions };
  } catch (err: any) {
    logger.debug(`getPackageNameDataWithoutLoading, failed for ${id.toString()}, falling back to loading`, err);
    return undefined;
  }
}

/**
 * find a workspace component (other than the excluded ones) that uses one of the given new components as an aspect.
 * a new component was never tagged/snapped, so only the workspace config (.bitmap, component.json and variants)
 * can reference it - no need to read the components from the scope.
 */
export async function findComponentUsingAsAspect(
  workspace: Workspace,
  newIds: string[],
  idsToExclude: ComponentID[]
): Promise<{ user: ComponentID; usedId: string } | undefined> {
  const idsToExcludeStr = new Set(idsToExclude.map((id) => id.toStringWithoutVersion()));
  const ids = workspace.listIds().filter((id) => !idsToExcludeStr.has(id.toStringWithoutVersion()));
  for (const id of ids) {
    const { extensions } = await workspace.componentExtensions(id, undefined, [], { loadExtensions: false });
    const usedId = newIds.find((newId) =>
      extensions.some((ext) => (ext.extensionId?.toStringWithoutVersion() || ext.stringId) === newId)
    );
    if (usedId) return { user: id, usedId };
  }
  return undefined;
}
