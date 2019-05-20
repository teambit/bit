// @flow
import path from 'path';
import R from 'ramda';
import type BitMap from '../bit-map/bit-map';
import type { ComponentOrigin } from '../bit-map/component-map';
import { BitId } from '../../bit-id';
import type { Version } from '../../scope/models';
import type { PathLinux, PathOsBased } from '../../utils/path';
import VersionDependencies from '../../scope/version-dependencies';
import { pathNormalizeToLinux, sharedStartOfArray } from '../../utils';
import { Dependencies } from '../component/dependencies';
import { PACKAGE_JSON, COMPONENT_ORIGINS, WRAPPER_DIR } from '../../constants';
import ComponentMap from '../bit-map/component-map';
import ComponentVersion from '../../scope/component-version';
import type Consumer from '../consumer';
import BitIds from '../../bit-id/bit-ids';
import Repository from '../../scope/objects/repository';
import ComponentOverrides from '../config/component-overrides';
import CorruptedComponent from '../../scope/exceptions/corrupted-component';

export type ManipulateDirItem = { id: BitId, originallySharedDir: ?PathLinux, wrapDir: ?PathLinux };

/**
 * use this method when loading an existing component. don't use it during the import process
 */
export async function getManipulateDirForExistingComponents(
  consumer: Consumer,
  componentVersion: ComponentVersion
): Promise<ManipulateDirItem[]> {
  const id: BitId = componentVersion.id;
  const manipulateDirData = [];
  const componentMap: ?ComponentMap = consumer.bitMap.getComponentIfExist(id, { ignoreVersion: true });
  const version: Version = await componentVersion.getVersion(consumer.scope.objects);
  if (!version) {
    throw new CorruptedComponent(id.toString(), componentVersion.version);
  }
  const isAuthor = Boolean(componentMap && componentMap.origin === COMPONENT_ORIGINS.AUTHORED);
  const originallySharedDir = componentMap ? getOriginallySharedDirIfNeeded(isAuthor, version) : null;
  const wrapDir = componentMap ? getWrapDirIfNeeded(isAuthor, version) : null;
  manipulateDirData.push({ id, originallySharedDir, wrapDir });
  const dependencies = version.getAllDependencies();
  dependencies.forEach((dependency) => {
    const depComponentMap: ?ComponentMap = getDependencyComponentMap(consumer.bitMap, dependency.id);
    const manipulateDirDep: ManipulateDirItem = {
      id: dependency.id,
      originallySharedDir: depComponentMap ? depComponentMap.originallySharedDir : null,
      wrapDir: depComponentMap ? depComponentMap.wrapDir : null
    };
    manipulateDirData.push(manipulateDirDep);
  });
  return manipulateDirData;
}

/**
 * use this method while importing a component.
 * the data from bitMap is not enough because a component might be NESTED on bitmap but is now
 * imported.
 */
export async function getManipulateDirWhenImportingComponents(
  bitMap: BitMap,
  versionsDependencies: VersionDependencies[],
  repository: Repository
): Promise<ManipulateDirItem[]> {
  const nonDependencies = BitIds.fromArray(
    versionsDependencies.map(versionDependency => versionDependency.component.id)
  );
  const manipulateDirDataP = versionsDependencies.map(async (versionDependency: VersionDependencies) => {
    const manipulateDirComponent = await getManipulateDirItemFromComponentVersion(
      versionDependency.component,
      bitMap,
      repository
    );
    const manipulateDirDependenciesP = versionDependency.allDependencies.map((dependency: ComponentVersion) => {
      return getManipulateDirItemFromComponentVersion(dependency, bitMap, repository);
    });
    const manipulateDirDependencies = await Promise.all(manipulateDirDependenciesP);
    // a component might be a dependency and directly imported at the same time, in which case,
    // it should be considered as imported, not nested
    const manipulateDirDependenciesOnly = manipulateDirDependencies.filter(m => !nonDependencies.has(m.id));
    return [manipulateDirComponent, ...manipulateDirDependenciesOnly];
  });
  const manipulateDirData = await Promise.all(manipulateDirDataP);
  return R.flatten(manipulateDirData);
}

export function revertDirManipulationForPath(
  pathStr: PathOsBased,
  originallySharedDir: ?PathLinux,
  wrapDir: ?PathLinux
): PathLinux {
  const withSharedDir: PathLinux = addSharedDirForPath(pathStr, originallySharedDir);
  return removeWrapperDirFromPath(withSharedDir, wrapDir);
}

/**
 * find a shared directory among the files of the main component and its dependencies
 */
function calculateOriginallySharedDir(version: Version): ?PathLinux {
  const pathSep = '/'; // it works for Windows as well as all paths are normalized to Linux
  const filePaths = version.files.map(file => pathNormalizeToLinux(file.relativePath));
  const allDependencies = new Dependencies(version.getAllDependencies());
  const dependenciesPaths = allDependencies.getSourcesPaths();
  const overridesDependenciesFiles = ComponentOverrides.getAllFilesPaths(version.overrides);
  const allPaths = [...filePaths, ...dependenciesPaths, ...overridesDependenciesFiles];
  const sharedStart = sharedStartOfArray(allPaths);
  if (!sharedStart || !sharedStart.includes(pathSep)) return null;
  const sharedStartDirectories = sharedStart.split(pathSep);
  sharedStartDirectories.pop(); // the sharedStart ended with a slash, remove it.
  if (allPaths.some(p => p.replace(sharedStart, '') === PACKAGE_JSON)) {
    // if package.json is located in an inside dir, don't consider that dir as a sharedDir, we
    // must keep this directory in order to not collide with the generated package.json.
    sharedStartDirectories.pop();
  }
  return sharedStartDirectories.join(pathSep);
}

function getOriginallySharedDirIfNeeded(isAuthor: boolean, version: Version): ?PathLinux {
  if (isAuthor) return null;
  return calculateOriginallySharedDir(version);
}

/**
 * if one of the files is 'package.json' and it's on the root, we need a wrapper dir to avoid
 * collision with Bit generated package.json file.
 * also, if one of the files requires the root package.json, because we need to generate the
 * "package.json" file as a link once imported, we have to wrap it as well.
 */
function isWrapperDirNeeded(version: Version) {
  const allDependencies = new Dependencies(version.getAllDependencies());
  const dependenciesSourcePaths = allDependencies.getSourcesPaths();
  return (
    version.files.some(file => file.relativePath === PACKAGE_JSON) ||
    dependenciesSourcePaths.some(dependencyPath => dependencyPath === PACKAGE_JSON)
  );
}

function getWrapDirIfNeeded(isAuthor: boolean, version: Version): ?PathLinux {
  if (isAuthor) return null;
  return isWrapperDirNeeded(version) ? WRAPPER_DIR : null;
}

/**
 * a dependency might be imported with a different version.
 * e.g. is-string@0.0.1 has a dependency is-type@0.0.1, however is-type@0.0.2 has been imported directly
 * in this case, we should ignore the version when looking for it in .bitmap
 * on the other hand, a dependency might be nested, and as a nested it's ok to have multiple
 * components with different versions, in this case, we look for the exact version.
 * so we do prefer an exact version, but if it doesn't find one try without a version.
 */
function getDependencyComponentMap(bitMap, dependencyId): ?ComponentMap {
  return bitMap.getComponentIfExist(dependencyId) || bitMap.getComponentIfExist(dependencyId, { ignoreVersion: true });
}

async function getManipulateDirItemFromComponentVersion(
  componentVersion: ComponentVersion,
  bitMap: BitMap,
  repository
): Promise<ManipulateDirItem> {
  const id: BitId = componentVersion.id;
  const componentMap: ?ComponentMap = bitMap.getComponentIfExist(id, { ignoreScopeAndVersion: true });
  const isAuthor = Boolean(componentMap && componentMap.origin === COMPONENT_ORIGINS.AUTHORED);
  const version: Version = await componentVersion.getVersion(repository);
  const originallySharedDir = getOriginallySharedDirIfNeeded(isAuthor, version);
  const wrapDir = getWrapDirIfNeeded(isAuthor, version);
  return { id, originallySharedDir, wrapDir };
}

function addSharedDirForPath(pathStr: string, originallySharedDir: ?PathLinux): PathLinux {
  const withSharedDir = originallySharedDir ? path.join(originallySharedDir, pathStr) : pathStr;
  return pathNormalizeToLinux(withSharedDir);
}

function removeWrapperDirFromPath(pathStr: PathLinux, wrapDir: ?PathLinux): PathLinux {
  return wrapDir ? pathStr.replace(`${wrapDir}/`, '') : pathStr;
}
