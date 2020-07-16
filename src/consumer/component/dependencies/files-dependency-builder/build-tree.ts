import path from 'path';
import R from 'ramda';
import { set } from 'lodash';
import generateTree from './generate-tree-madge';
import { DEFAULT_BINDINGS_PREFIX } from '../../../../constants';
import { getPathMapWithLinkFilesData, convertPathMapToRelativePaths } from './path-map';
import { PathMapItem } from './path-map';
import {
  Tree,
  FileObject,
  ImportSpecifier,
  DependencyTreeParams,
  ResolveModulesConfig
} from './types/dependency-tree-type';
import { PathOsBased } from '../../../../utils/path';
import { MissingGroupItem, MissingHandler, FoundPackages } from './missing-handler';
import { resolvePackageData, ResolvedPackageData } from '../../../../utils/packages';

export type LinkFile = {
  file: string;
  importSpecifiers: ImportSpecifier[];
};

interface SimpleGroupedDependencies {
  bits: string[];
  packages: string[];
  files: string[];
}

/**
 * Group dependencies by types (files, bits, packages)
 * @param {any} dependencies list of dependencies paths to group
 * @returns {Function} function which group the dependencies
 */
const byType = (list, bindingPrefix: string): SimpleGroupedDependencies => {
  const grouped = R.groupBy(item => {
    if (item.includes(`node_modules/${bindingPrefix}`) || item.includes(`node_modules/${DEFAULT_BINDINGS_PREFIX}`)) {
      return 'bits';
    }
    return item.includes('node_modules') ? 'packages' : 'files';
  });
  return grouped(list);
};

interface GroupedDependenciesResolved {
  bits: Array<ResolvedPackageData>;
  packages: PackageDependency;
  files: string[];
  unidentifiedPackages: PathOsBased[];
}

/**
 * Gets a list of dependencies and group them by types (files, bits, packages)
 * It's also transform the node package dependencies from array of paths to object in this format:
 * {dependencyName: version} (like in package.json)
 *
 * @param {any} list of dependencies paths
 * @param {any} componentDir root of working directory (used for node packages version calculation)
 * @returns {Object} object with the dependencies groups
 */
function groupDependencyList(list, componentDir: string, bindingPrefix: string): GroupedDependenciesResolved {
  const groups = byType(list, bindingPrefix);
  const resultGroups: GroupedDependenciesResolved = {
    bits: [],
    packages: {},
    files: groups.files,
    unidentifiedPackages: []
  };
  const unidentifiedPackages: string[] = [];
  if (groups.packages) {
    const packages = {};
    groups.packages.forEach(packagePath => {
      const resolvedPackage = resolvePackageData(componentDir, path.join(componentDir, packagePath));
      // If the package is actually a component add it to the components (bits) list
      if (resolvedPackage) {
        const version = resolvedPackage.versionUsedByDependent || resolvedPackage.concreteVersion;
        if (!version) throw new Error(`unable to find the version for a package ${packagePath}`);
        if (resolvedPackage.componentId) {
          resultGroups.bits.push(resolvedPackage);
        } else {
          const packageWithVersion = {
            [resolvedPackage.name]: version
          };
          Object.assign(packages, packageWithVersion);
        }
      } else unidentifiedPackages.push(packagePath);
    });
    resultGroups.packages = packages;
  }
  if (groups.bits) {
    groups.bits.forEach(packagePath => {
      const resolvedPackage = resolvePackageData(componentDir, path.join(componentDir, packagePath));
      // If the package is actually a component add it to the components (bits) list
      if (resolvedPackage) {
        resultGroups.bits.push(resolvedPackage);
      } else {
        unidentifiedPackages.push(packagePath);
      }
    });
  }
  if (!R.isEmpty(unidentifiedPackages)) {
    resultGroups.unidentifiedPackages = unidentifiedPackages;
  }
  return resultGroups;
}

interface GroupedDependenciesTree {
  [filePath: string]: GroupedDependenciesResolved;
}
/**
 * Run over each entry in the tree and transform the dependencies from list of paths
 * to object with dependencies types
 *
 * @returns new tree with grouped dependencies
 */
function groupDependencyTree(tree: any, componentDir: string, bindingPrefix: string): GroupedDependenciesTree {
  const result = {};
  Object.keys(tree).forEach(key => {
    if (tree[key] && !R.isEmpty(tree[key])) {
      result[key] = groupDependencyList(tree[key], componentDir, bindingPrefix);
    } else {
      result[key] = {};
    }
  });

  return result;
}

interface PackageDependency {
  [dependencyId: string]: string;
}

/**
 * add extra data such as custom-resolve and link-files from pathMap
 */
function updateTreeWithPathMap(tree: Tree, pathMapAbsolute: PathMapItem[], baseDir: string): void {
  if (!pathMapAbsolute.length) return;
  const pathMapRelative = convertPathMapToRelativePaths(pathMapAbsolute, baseDir);
  const pathMap = getPathMapWithLinkFilesData(pathMapRelative);
  Object.keys(tree).forEach((filePath: string) => {
    const treeFiles = tree[filePath].files;
    if (!treeFiles || !treeFiles.length) return; // file has no dependency
    const mainFilePathMap = pathMap.find(file => file.file === filePath);
    if (!mainFilePathMap) throw new Error(`updateTreeWithPathMap: PathMap is missing for ${filePath}`);
    // a file might have a cycle dependency with itself, remove it from the dependencies.
    const files: FileObject[] = treeFiles
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      .filter(dependency => dependency !== filePath)
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      .map((dependency: string) => {
        const dependencyPathMap = mainFilePathMap.dependencies.find(file => file.resolvedDep === dependency);
        if (!dependencyPathMap)
          throw new Error(`updateTreeWithPathMap: dependencyPathMap is missing for ${dependency}`);
        const fileObject: FileObject = {
          file: dependency,
          importSource: dependencyPathMap.importSource,
          isCustomResolveUsed: dependencyPathMap.isCustomResolveUsed
        };
        if (dependencyPathMap.linkFile) {
          fileObject.isLink = true;
          fileObject.linkDependencies = dependencyPathMap.realDependencies;
          return fileObject;
        }
        if (dependencyPathMap.importSpecifiers && dependencyPathMap.importSpecifiers.length) {
          const depImportSpecifiers = dependencyPathMap.importSpecifiers.map(importSpecifier => {
            return {
              mainFile: importSpecifier
            };
          });
          fileObject.importSpecifiers = depImportSpecifiers;
        }
        return fileObject;
      });
    tree[filePath].files = files; // eslint-disable-line no-param-reassign
  });
}

/**
 * config aliases are passed later on to webpack-enhancer and it expects them to have the full path
 */
function getResolveConfigAbsolute(
  workspacePath: string,
  resolveConfig: ResolveModulesConfig | null | undefined
): ResolveModulesConfig | null | undefined {
  if (!resolveConfig) return resolveConfig;
  const resolveConfigAbsolute = R.clone(resolveConfig);
  if (resolveConfig.modulesDirectories) {
    resolveConfigAbsolute.modulesDirectories = resolveConfig.modulesDirectories.map(moduleDirectory => {
      return path.isAbsolute(moduleDirectory) ? moduleDirectory : path.join(workspacePath, moduleDirectory);
    });
  }
  if (resolveConfigAbsolute.aliases) {
    Object.keys(resolveConfigAbsolute.aliases).forEach(alias => {
      if (!path.isAbsolute(resolveConfigAbsolute.aliases[alias])) {
        resolveConfigAbsolute.aliases[alias] = path.join(workspacePath, resolveConfigAbsolute.aliases[alias]);
      }
    });
  }
  return resolveConfigAbsolute;
}

function mergeManuallyFoundPackagesToTree(foundPackages: FoundPackages, missingGroups: MissingGroupItem[], tree: Tree) {
  if (R.isEmpty(foundPackages.bits) && R.isEmpty(foundPackages.packages)) return;
  // Merge manually found packages (by groupMissing()) with the packages found by Madge (generate-tree-madge)
  Object.keys(foundPackages.packages).forEach(pkg => {
    // locate package in groups(contains missing)
    missingGroups.forEach((fileDep: MissingGroupItem) => {
      if (fileDep.packages && fileDep.packages.includes(pkg)) {
        fileDep.packages = fileDep.packages.filter(packageName => packageName !== pkg);
        set(tree[fileDep.originFile], ['packages', pkg], foundPackages.packages[pkg]);
      }
      if (fileDep.bits && fileDep.bits.includes(pkg)) {
        fileDep.bits = fileDep.bits.filter(packageName => packageName !== pkg);
        if (!tree[fileDep.originFile]) tree[fileDep.originFile] = {};
        if (!tree[fileDep.originFile].bits) tree[fileDep.originFile].bits = [];
        // @ts-ignore
        tree[fileDep.originFile].bits.push(pkg);
      }
    });
  });
  foundPackages.bits.forEach(component => {
    missingGroups.forEach((fileDep: MissingGroupItem) => {
      if (
        fileDep.bits &&
        ((component.fullPath && fileDep.bits.includes(component.fullPath)) || fileDep.bits.includes(component.name))
      ) {
        fileDep.bits = fileDep.bits.filter(existComponent => {
          return existComponent !== component.fullPath && existComponent !== component.name;
        });
        if (!tree[fileDep.originFile]) tree[fileDep.originFile] = {};
        if (!tree[fileDep.originFile].bits) tree[fileDep.originFile].bits = [];
        // @ts-ignore
        tree[fileDep.originFile].bits.push(component);
      }
    });
  });
}

function mergeMissingToTree(missingGroups, tree: Tree) {
  if (R.isEmpty(missingGroups)) return;
  missingGroups.forEach(missing => {
    const missingCloned = R.clone(missing);
    delete missingCloned.originFile;
    if (tree[missing.originFile]) tree[missing.originFile].missing = missingCloned;
    else tree[missing.originFile] = { missing: missingCloned };
  });
}

function mergeErrorsToTree(baseDir, errors, tree: Tree) {
  if (R.isEmpty(errors)) return;
  Object.keys(errors).forEach(file => {
    if (tree[file]) tree[file].error = errors[file];
    else tree[file] = { error: errors[file] };
  });
}

/**
 * Function for fetching dependency tree of file or dir
 * @param baseDir working directory
 * @param workspacePath
 * @param filePaths path of the file to calculate the dependencies
 * @param bindingPrefix
 */
export async function getDependencyTree({
  componentDir, // component rootDir, for legacy-authored it's the same as workspacePath
  workspacePath,
  filePaths,
  bindingPrefix,
  resolveModulesConfig,
  visited = {},
  cacheProjectAst
}: DependencyTreeParams): Promise<{ tree: Tree }> {
  const resolveConfigAbsolute = getResolveConfigAbsolute(workspacePath, resolveModulesConfig);
  const config = {
    baseDir: componentDir,
    includeNpm: true,
    requireConfig: null,
    webpackConfig: null,
    visited,
    nonExistent: [],
    resolveConfig: resolveConfigAbsolute,
    cacheProjectAst
  };
  // This is important because without this, madge won't know to resolve files if we run the
  // CMD not from the root dir
  const fullPaths = filePaths.map(filePath => {
    if (filePath.startsWith(componentDir)) {
      return filePath;
    }
    return path.resolve(componentDir, filePath);
  });
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const { madgeTree, skipped, pathMap, errors } = generateTree(fullPaths, config);
  // @ts-ignore
  const tree: Tree = groupDependencyTree(madgeTree, componentDir, bindingPrefix);
  const { missingGroups, foundPackages } = new MissingHandler(
    skipped,
    componentDir,
    workspacePath,
    bindingPrefix
  ).groupAndFindMissing();

  if (foundPackages) mergeManuallyFoundPackagesToTree(foundPackages, missingGroups, tree);
  if (errors) mergeErrorsToTree(componentDir, errors, tree);
  if (missingGroups) mergeMissingToTree(missingGroups, tree);
  if (pathMap) updateTreeWithPathMap(tree, pathMap, componentDir);

  return { tree };
}
