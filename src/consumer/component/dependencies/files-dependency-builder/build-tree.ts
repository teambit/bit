import { set } from 'lodash';
import path from 'path';
import R from 'ramda';

import { DEFAULT_BINDINGS_PREFIX } from '../../../../constants';
import { resolvePackageData } from '../../../../utils/packages';
import generateTree, { MadgeTree } from './generate-tree-madge';
import { FoundPackages, MissingGroupItem, MissingHandler } from './missing-handler';
import { convertPathMapToRelativePaths, getPathMapWithLinkFilesData, PathMapItem } from './path-map';
import {
  DependencyTreeParams,
  FileObject,
  ImportSpecifier,
  ResolveModulesConfig,
  DependenciesTree,
  DependenciesTreeItem,
} from './types/dependency-tree-type';

export type LinkFile = {
  file: string;
  importSpecifiers: ImportSpecifier[];
};

/**
 * Gets a list of dependencies and group them by types (files, components, packages)
 * It's also transform the node package dependencies from array of paths to object in this format:
 * {dependencyName: version} (like in package.json)
 *
 * componentDir is the root of working directory (used for node packages version calculation)
 */
function groupDependencyList(
  dependenciesPaths: string[],
  componentDir: string,
  bindingPrefix: string,
  isLegacyProject: boolean
): DependenciesTreeItem {
  const resultGroups = new DependenciesTreeItem();
  const isPackage = (str: string) => str.includes('node_modules/');
  const isBitLegacyComponent = (str: string) =>
    isLegacyProject &&
    (str.includes(`node_modules/${bindingPrefix}`) || str.includes(`node_modules/${DEFAULT_BINDINGS_PREFIX}`));
  dependenciesPaths.forEach((dependencyPath) => {
    if (!isPackage(dependencyPath)) {
      resultGroups.files.push({ file: dependencyPath });
      return;
    }
    const resolvedPackage = resolvePackageData(componentDir, path.join(componentDir, dependencyPath));
    if (!resolvedPackage) {
      // package doesn't have package.json, probably it's a custom-resolve-module dep file
      resultGroups.unidentifiedPackages.push(dependencyPath);
      return;
    }

    // If the package is a component add it to the components list
    // @todo: currently, for author, the package.json doesn't have any version.
    // we might change this decision later. see https://github.com/teambit/bit/pull/2924
    if (resolvedPackage.componentId) {
      resultGroups.components.push(resolvedPackage);
      return;
    }
    if (isBitLegacyComponent(dependencyPath)) {
      resultGroups.components.push(resolvedPackage);
      return;
    }
    const version = resolvedPackage.versionUsedByDependent || resolvedPackage.concreteVersion;
    const packageWithVersion = {
      [resolvedPackage.name]: version,
    };
    Object.assign(resultGroups.packages, packageWithVersion);
  });

  return resultGroups;
}

/**
 * Run over each entry in the tree and transform the dependencies from list of paths
 * to object with dependencies types
 *
 * @returns new tree with grouped dependencies
 */
function MadgeTreeToDependenciesTree(
  tree: MadgeTree,
  componentDir: string,
  bindingPrefix: string,
  isLegacyProject: boolean
): DependenciesTree {
  const result: DependenciesTree = {};
  Object.keys(tree).forEach((filePath) => {
    if (tree[filePath] && !R.isEmpty(tree[filePath])) {
      result[filePath] = groupDependencyList(tree[filePath], componentDir, bindingPrefix, isLegacyProject);
    } else {
      result[filePath] = new DependenciesTreeItem();
    }
  });

  return result;
}

/**
 * add extra data such as custom-resolve and link-files from pathMap
 */
function updateTreeWithPathMap(tree: DependenciesTree, pathMapAbsolute: PathMapItem[], baseDir: string): void {
  if (!pathMapAbsolute.length) return;
  const pathMapRelative = convertPathMapToRelativePaths(pathMapAbsolute, baseDir);
  const pathMap = getPathMapWithLinkFilesData(pathMapRelative);
  Object.keys(tree).forEach((filePath: string) => {
    const treeFiles = tree[filePath].files;
    if (!treeFiles.length) return; // file has no dependency
    const mainFilePathMap = pathMap.find((file) => file.file === filePath);
    if (!mainFilePathMap) throw new Error(`updateTreeWithPathMap: PathMap is missing for ${filePath}`);
    // a file might have a cycle dependency with itself, remove it from the dependencies.
    tree[filePath].files = treeFiles.filter((dependency) => dependency.file !== filePath);
    tree[filePath].files.forEach((fileObject: FileObject) => {
      const dependencyPathMap = mainFilePathMap.dependencies.find((file) => file.resolvedDep === fileObject.file);
      if (!dependencyPathMap) {
        throw new Error(`updateTreeWithPathMap: dependencyPathMap is missing for ${fileObject.file}`);
      }
      fileObject.importSource = dependencyPathMap.importSource;
      fileObject.isCustomResolveUsed = dependencyPathMap.isCustomResolveUsed;
      if (dependencyPathMap.linkFile) {
        fileObject.isLink = true;
        fileObject.linkDependencies = dependencyPathMap.realDependencies;
        return fileObject;
      }
      if (dependencyPathMap.importSpecifiers && dependencyPathMap.importSpecifiers.length) {
        const depImportSpecifiers = dependencyPathMap.importSpecifiers.map((importSpecifier) => {
          return {
            mainFile: importSpecifier,
          };
        });
        fileObject.importSpecifiers = depImportSpecifiers;
      }
      return fileObject;
    });
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
    resolveConfigAbsolute.modulesDirectories = resolveConfig.modulesDirectories.map((moduleDirectory) => {
      return path.isAbsolute(moduleDirectory) ? moduleDirectory : path.join(workspacePath, moduleDirectory);
    });
  }
  if (resolveConfigAbsolute.aliases) {
    Object.keys(resolveConfigAbsolute.aliases).forEach((alias) => {
      if (!path.isAbsolute(resolveConfigAbsolute.aliases[alias])) {
        resolveConfigAbsolute.aliases[alias] = path.join(workspacePath, resolveConfigAbsolute.aliases[alias]);
      }
    });
  }
  return resolveConfigAbsolute;
}

function mergeManuallyFoundPackagesToTree(
  foundPackages: FoundPackages,
  missingGroups: MissingGroupItem[],
  tree: DependenciesTree
) {
  if (R.isEmpty(foundPackages.components) && R.isEmpty(foundPackages.packages)) return;
  // Merge manually found packages (by groupMissing()) with the packages found by Madge (generate-tree-madge)
  Object.keys(foundPackages.packages).forEach((pkg) => {
    // locate package in groups(contains missing)
    missingGroups.forEach((fileDep: MissingGroupItem) => {
      if (fileDep.packages && fileDep.packages.includes(pkg)) {
        fileDep.packages = fileDep.packages.filter((packageName) => packageName !== pkg);
        set(tree[fileDep.originFile], ['packages', pkg], foundPackages.packages[pkg]);
      }
    });
  });
  foundPackages.components.forEach((component) => {
    missingGroups.forEach((fileDep: MissingGroupItem) => {
      if (
        fileDep.components &&
        ((component.fullPath && fileDep.components.includes(component.fullPath)) ||
          fileDep.components.includes(component.name))
      ) {
        fileDep.components = fileDep.components.filter((existComponent) => {
          return existComponent !== component.fullPath && existComponent !== component.name;
        });
        (tree[fileDep.originFile] ||= new DependenciesTreeItem()).components.push(component);
      }
      if (fileDep.packages && fileDep.packages.includes(component.name)) {
        fileDep.packages = fileDep.packages.filter((packageName) => packageName !== component.name);
        (tree[fileDep.originFile] ||= new DependenciesTreeItem()).components.push(component);
      }
    });
  });
}

function mergeMissingToTree(missingGroups, tree: DependenciesTree) {
  if (R.isEmpty(missingGroups)) return;
  missingGroups.forEach((missing) => {
    const missingCloned = R.clone(missing);
    delete missingCloned.originFile;
    (tree[missing.originFile] ||= new DependenciesTreeItem()).missing = missingCloned;
  });
}

function mergeErrorsToTree(errors, tree: DependenciesTree) {
  if (R.isEmpty(errors)) return;
  Object.keys(errors).forEach((file) => {
    (tree[file] ||= new DependenciesTreeItem()).error = errors[file];
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
  isLegacyProject,
  resolveModulesConfig,
  visited = {},
  cacheProjectAst,
}: DependencyTreeParams): Promise<{ tree: DependenciesTree }> {
  const resolveConfigAbsolute = getResolveConfigAbsolute(workspacePath, resolveModulesConfig);
  const config = {
    baseDir: componentDir,
    includeNpm: true,
    requireConfig: null,
    webpackConfig: null,
    visited,
    nonExistent: [],
    resolveConfig: resolveConfigAbsolute,
    cacheProjectAst,
  };
  // This is important because without this, madge won't know to resolve files if we run the
  // CMD not from the root dir
  const fullPaths = filePaths.map((filePath) => {
    if (filePath.startsWith(componentDir)) {
      return filePath;
    }
    return path.resolve(componentDir, filePath);
  });
  const { madgeTree, skipped, pathMap, errors } = generateTree(fullPaths, config);
  const tree: DependenciesTree = MadgeTreeToDependenciesTree(madgeTree, componentDir, bindingPrefix, isLegacyProject);
  const { missingGroups, foundPackages } = new MissingHandler(
    skipped,
    componentDir,
    workspacePath,
    bindingPrefix,
    isLegacyProject
  ).groupAndFindMissing();

  if (foundPackages) mergeManuallyFoundPackagesToTree(foundPackages, missingGroups, tree);
  if (errors) mergeErrorsToTree(errors, tree);
  if (missingGroups) mergeMissingToTree(missingGroups, tree);
  if (pathMap) updateTreeWithPathMap(tree, pathMap, componentDir);

  return { tree };
}
