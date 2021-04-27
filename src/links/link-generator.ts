import groupBy from 'lodash.groupby';
import * as path from 'path';
import R from 'ramda';

import { BitId, BitIds } from '../bit-id';
import {
  ANGULAR_BIT_ENTRY_POINT_FILE,
  ANGULAR_PACKAGE_IDENTIFIER,
  COMPONENT_ORIGINS,
  DEFAULT_INDEX_NAME,
} from '../constants';
import BitMap from '../consumer/bit-map';
import ComponentMap from '../consumer/bit-map/component-map';
import { throwForNonLegacy } from '../consumer/component/component-schema';
import Component from '../consumer/component/consumer-component';
import { Dependency } from '../consumer/component/dependencies';
import { RelativePath } from '../consumer/component/dependencies/dependency';
import DataToPersist from '../consumer/component/sources/data-to-persist';
import postInstallTemplate from '../consumer/component/templates/postinstall.default-template';
import Consumer from '../consumer/consumer';
import logger from '../logger/logger';
import { ComponentWithDependencies } from '../scope';
import { getExt } from '../utils';
import componentIdToPackageName from '../utils/bit/component-id-to-package-name';
import { OutputFileParams } from '../utils/fs-output-file';
import getWithoutExt from '../utils/fs/fs-no-ext';
import { PathOsBasedAbsolute } from '../utils/path';
import DependencyFileLinkGenerator, { LinkFileType } from './dependency-file-link-generator';
import { EXTENSIONS_NOT_SUPPORT_DIRS, getLinkToFileContent, JAVASCRIPT_FLAVORS_EXTENSIONS } from './link-content';
import LinkFile from './link-file';
import Symlink from './symlink';

type SymlinkType = {
  source: PathOsBasedAbsolute; // symlink is pointing to this path
  dest: PathOsBasedAbsolute; // path where the symlink is written to
};

// todo: move to bit-javascript
function getIndexFileName(mainFile: string): string {
  return `${DEFAULT_INDEX_NAME}.${getExt(mainFile)}`;
}

/**
 * a component may have many dependencies, this function returns the links content for all of its dependencies
 */
function getComponentLinks({
  consumer,
  component,
  dependencies,
  createNpmLinkFiles,
  bitMap,
}: {
  consumer?: Consumer | null | undefined;
  component: Component;
  dependencies: Component[]; // Array of the dependencies components (the full component) - used to generate a dist link (with the correct extension)
  createNpmLinkFiles: boolean;
  bitMap: BitMap;
}): DataToPersist {
  const dataToPersist = new DataToPersist();
  if (!component.isLegacy) return dataToPersist;
  const componentMap: ComponentMap = bitMap.getComponent(component.id);
  component.componentMap = componentMap;
  const directDependencies: Dependency[] = _getDirectDependencies(component, componentMap, createNpmLinkFiles);
  const flattenedDependencies: BitIds = component.flattenedDependencies;
  const links = directDependencies.map((dep: Dependency) => {
    if (!dep.relativePaths || R.isEmpty(dep.relativePaths)) return [];
    const getDependencyIdWithResolvedVersion = (): BitId => {
      // Check if the dependency is latest, if yes we need to resolve if from the flatten dependencies to get the
      // Actual version number, because on the bitmap we have only specific versions
      if (dep.id.getVersion().latest) {
        return flattenedDependencies.resolveVersion(dep.id);
      }
      return dep.id;
    };
    const dependencyId = getDependencyIdWithResolvedVersion();
    const dependencyComponent = _getDependencyComponent(dependencyId, dependencies, component.id);

    const dependencyLinks = dep.relativePaths.map((relativePath: RelativePath) => {
      const dependencyFileLinkGenerator = new DependencyFileLinkGenerator({
        consumer,
        bitMap,
        component,
        relativePath,
        dependencyComponent,
        createNpmLinkFiles,
      });
      return dependencyFileLinkGenerator.generate();
    });
    return R.flatten(dependencyLinks);
  });
  const internalCustomResolvedLinks = component.customResolvedPaths.length
    ? getInternalCustomResolvedLinks(component, componentMap, createNpmLinkFiles)
    : [];
  const flattenLinks = R.flatten(links).concat(internalCustomResolvedLinks);

  const { postInstallLinks, postInstallSymlinks, linksToWrite, symlinks } = groupLinks(flattenLinks);
  const shouldGeneratePostInstallScript = postInstallLinks.length || postInstallSymlinks.length;
  if (shouldGeneratePostInstallScript) {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const postInstallFile = generatePostInstallScript(component, postInstallLinks, postInstallSymlinks);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    dataToPersist.addFile(postInstallFile);
  }
  const customResolveAliasesAdded = addCustomResolveAliasesToPackageJson(component, flattenLinks);
  if (customResolveAliasesAdded || shouldGeneratePostInstallScript) {
    // $FlowFixMe it has been verified above that component.packageJsonFile is not empty
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const packageJsonFile = component.packageJsonFile.toVinylFile();
    dataToPersist.addFile(packageJsonFile);
  }

  if (symlinks.length) {
    dataToPersist.addManySymlinks(
      symlinks.map((symlink) => Symlink.makeInstance(symlink.source, symlink.dest, undefined, true))
    );
  }
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  dataToPersist.addManyFiles(linksToWrite.map((linkToWrite) => LinkFile.load(linkToWrite)));
  return dataToPersist;
}

function _getDependencyComponent(dependencyId: BitId, dependencies: Component[], componentId: BitId): Component {
  const componentWithSameVersion = dependencies.find((dependency) => dependency.id.isEqual(dependencyId));
  if (componentWithSameVersion) return componentWithSameVersion;
  const dependencyComponent = dependencies.find((dependency) => dependency.id.isEqualWithoutVersion(dependencyId));
  if (!dependencyComponent) {
    const errorMessage = `link-generation: failed finding ${dependencyId.toString()} in the dependencies array of ${componentId.toString()}.
The dependencies array has the following ids: ${dependencies.map((d) => d.id).join(', ')}`;
    throw new Error(errorMessage);
  }
  logger.warn(`link-generation: failed finding an exact version of ${dependencyId.toString()} in the dependencies array of ${componentId.toString()}.
    will use ${dependencyComponent.id.toString()} instead. this might happen when the dependency version is overridden in package.json or bit.json`);
  return dependencyComponent;
}

function _getDirectDependencies(
  component: Component,
  componentMap: ComponentMap,
  createNpmLinkFiles: boolean
): Dependency[] {
  // devDependencies of Nested components are not written to the filesystem, so no need to link them.
  return componentMap.origin === COMPONENT_ORIGINS.NESTED || createNpmLinkFiles
    ? component.dependencies.get()
    : component.getAllNonEnvsDependencies();
}

function groupLinks(
  flattenLinks: LinkFileType[]
): {
  postInstallLinks: OutputFileParams[];
  linksToWrite: OutputFileParams[];
  symlinks: SymlinkType[];
  postInstallSymlinks: SymlinkType[];
} {
  const groupedLinks = groupBy(flattenLinks, (link) => link.linkPath);
  const linksToWrite = [];
  const postInstallLinks = [];
  const postInstallSymlinks = [];
  const symlinks = [];
  Object.keys(groupedLinks).forEach((group) => {
    let content = '';
    const firstGroupItem = groupedLinks[group][0];
    if (firstGroupItem.symlinkTo) {
      if (firstGroupItem.postInstallSymlink) {
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        postInstallSymlinks.push({ source: firstGroupItem.symlinkTo, dest: firstGroupItem.linkPath });
        return;
      }
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      symlinks.push({ source: firstGroupItem.symlinkTo, dest: firstGroupItem.linkPath });
      return;
    }
    if (firstGroupItem.isEs6) {
      // check by the first item of the array, it can be any other item as well
      content = 'Object.defineProperty(exports, "__esModule", { value: true });\n';
    }
    content += groupedLinks[group].map((linkItem) => linkItem.linkContent).join('\n');
    const linkFile: OutputFileParams = { filePath: group, content };
    if (firstGroupItem.postInstallLink) {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      postInstallLinks.push(linkFile);
    } else {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      linksToWrite.push(linkFile);
    }
  });
  return { postInstallLinks, postInstallSymlinks, linksToWrite, symlinks };
}

/**
 * Relevant for legacy components only (before Harmony).
 *
 * The following scenario will help understanding why links are needed.
 * Component A has a dependency B. (for instance, in a.js there is a require statement to 'b.js').
 * While importing component A, it knows about the B dependency and it saves it under 'dependencies' directory of A.
 * The problem is that the above require is broken, because 'b.js' is not in the same place where it was originally.
 * This function solves this issue by creating the 'b.js' file in the original location and points to the new location
 * under 'dependencies' of A.
 *
 * It does the link generation in two steps.
 * step 1: "componentsLinks", it generates links to all imported components.
 * target: imported components. source: dependencies.
 * step 2: "dependenciesLinks", it generates links to all dependencies of the imported components.
 * target: dependencies. source: other dependencies.
 * this step is not needed when the imported components don't have dependencies, or when the
 * dependencies were installed as npm/yarn packages.
 */
function getComponentsDependenciesLinks(
  componentDependencies: ComponentWithDependencies[],
  consumer: Consumer | null | undefined,
  createNpmLinkFiles: boolean,
  bitMap: BitMap
): DataToPersist {
  const componentsDependenciesLinks = new DataToPersist();
  const linkedComponents = new BitIds();
  const componentsToLink = getComponentsToLink();
  addLinksForComponents();
  addLinksForDependencies();
  return componentsDependenciesLinks;
  function getComponentsToLink(): ComponentWithDependencies[] {
    return componentDependencies.reduce((acc, componentWithDeps) => {
      const component = componentWithDeps.component;
      const componentMap = bitMap.getComponent(component.id);
      component.componentMap = componentMap;
      if (componentMap.origin === COMPONENT_ORIGINS.AUTHORED) {
        logger.debug(
          `writeComponentsDependenciesLinks, ignoring a component ${component.id.toString()} as it is an author component`
        );
        return acc;
      }
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      return acc.concat(componentWithDeps);
    }, []);
  }
  function addLinksForComponents() {
    componentsToLink.forEach((componentWithDeps: ComponentWithDependencies) => {
      const component = componentWithDeps.component;
      if (linkedComponents.has(component.id)) return;
      // it must be IMPORTED. We don't pass NESTED to this function
      logger.debug(`writeComponentsDependenciesLinks, generating links for ${component.id.toString()}`);
      const componentsLinks = getComponentLinks({
        consumer,
        component,
        dependencies: componentWithDeps.allDependencies,
        createNpmLinkFiles,
        bitMap,
      });
      componentsDependenciesLinks.merge(componentsLinks);
      linkedComponents.push(component.id);
    });
  }
  function addLinksForDependencies() {
    componentsToLink.forEach((componentWithDeps: ComponentWithDependencies) => {
      if (!componentWithDeps.component.dependenciesSavedAsComponents) return;
      componentWithDeps.allDependencies.forEach((dep: Component) => {
        if (linkedComponents.has(dep.id)) return;
        // We pass here the componentWithDeps.dependencies again because it contains the full dependencies objects
        // also the indirect ones
        // The dep.dependencies contain only an id and relativePaths and not the full object
        const dependencies = componentWithDeps.allDependencies;
        dependencies.push(componentWithDeps.component);
        const dependencyLinks = getComponentLinks({
          consumer,
          component: dep,
          dependencies,
          createNpmLinkFiles,
          bitMap,
        });
        componentsDependenciesLinks.merge(dependencyLinks);
        linkedComponents.push(dep.id);
      });
    });
  }
}

/**
 * important: do not attempt to move this function into DependencyFileLinkGenerator as it should be
 * running even when a component does not have any dependencies.
 *
 * when using custom module resolutions, and inside a component there is a file that requires
 * another file by custom-resolved syntax, we must generate links on the imported component inside
 * node_modules.
 *
 * E.g. original component "utils/jump" has two files:
 * bar/foo.js => require('utils/is-string); // "src" is set to be a module-directory
 * utils/is-string.js
 *
 * imported component:
 * components/utils/jump/bar/foo.js
 * components/utils/jump/utils/is-string.js
 * components/utils/jump/node_modules/utils/is-string // this is the file we generate here
 */
function getInternalCustomResolvedLinks(
  component: Component,
  componentMap: ComponentMap,
  createNpmLinkFiles: boolean
): LinkFileType[] {
  throwForNonLegacy(component.isLegacy, getInternalCustomResolvedLinks.name);
  const componentDir = component.writtenPath || componentMap.rootDir;
  if (!componentDir) {
    throw new Error(`getInternalCustomResolvedLinks, unable to find the written path of ${component.id.toString()}`);
  }
  const getDestination = ({ destinationPath, importSource }) => {
    const destinationFilename = path.basename(destinationPath);
    const destinationExt = getExt(destinationFilename);
    const destinationNoExt = getWithoutExt(destinationFilename);
    const importSourceSuffix = path.basename(importSource);
    const importSourceSuffixHasExt = importSourceSuffix.includes('.');
    let suffixToAdd = '';
    if (!importSourceSuffixHasExt) {
      // otherwise, it already points to a file
      if (importSourceSuffix === destinationNoExt) {
        // only extension is missing
        suffixToAdd = `.${destinationExt}`;
      }
      if (destinationNoExt === 'index') {
        // the index file is missing
        suffixToAdd = `/index.${destinationExt}`;
      }
    }
    return `node_modules/${importSource}${suffixToAdd}`;
  };
  const invalidImportSources = ['.', '..']; // before v14.1.4 components might have an invalid importSource saved. see #1734
  const isResolvePathsInvalid = (customPath) => !invalidImportSources.includes(customPath.importSource);
  const customResolvedPathsToProcess = R.uniqBy(JSON.stringify, component.customResolvedPaths).filter((customPath) =>
    isResolvePathsInvalid(customPath)
  );
  return customResolvedPathsToProcess.map((customPath) => {
    const sourceAbs = path.join(componentDir, customPath.destinationPath);
    const dest = getDestination(customPath);
    const destAbs = path.join(componentDir, dest);
    const destRelative = path.relative(path.dirname(destAbs), sourceAbs);
    const linkContent = getLinkToFileContent(destRelative);

    const postInstallSymlink = createNpmLinkFiles && !linkContent;
    const packageName = componentIdToPackageName(component);
    const customResolveMapping = { [customPath.importSource]: `${packageName}/${customPath.destinationPath}` };
    const getSymlink = () => {
      if (linkContent) return undefined;
      if (createNpmLinkFiles) return `${packageName}/${customPath.destinationPath}`;
      return sourceAbs;
    };
    return {
      linkPath: createNpmLinkFiles ? dest : destAbs,
      linkContent,
      postInstallLink: createNpmLinkFiles,
      customResolveMapping,
      symlinkTo: getSymlink(),
      postInstallSymlink,
    };
  });
}

/**
 * change the package.json of a component to include postInstall script.
 * @see postInstallTemplate() JSDoc to understand better why this postInstall script is needed
 */
function generatePostInstallScript(component: Component, postInstallLinks = [], postInstallSymlinks = []): LinkFile {
  throwForNonLegacy(component.isLegacy, generatePostInstallScript.name);
  // $FlowFixMe todo: is it possible that writtenPath is empty here?
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const componentDir: string = component.writtenPath;
  // convert from array to object for easier parsing in the postinstall script
  const linkPathsObject = postInstallLinks.reduce((acc, val) => {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    acc[val.filePath] = val.content;
    return acc;
  }, {});
  const symlinkPathsObject = postInstallSymlinks.reduce((acc, val) => {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    acc[val.dest] = val.source;
    return acc;
  }, {});
  const postInstallCode = postInstallTemplate(JSON.stringify(linkPathsObject), JSON.stringify(symlinkPathsObject));
  const POST_INSTALL_FILENAME = '.bit.postinstall.js';
  const postInstallFilePath = path.join(componentDir, POST_INSTALL_FILENAME);
  const postInstallScript = `node ${POST_INSTALL_FILENAME}`;
  if (!component.packageJsonFile) throw new Error(`packageJsonFile is missing for ${component.id.toString()}`);
  component.packageJsonFile.addOrUpdateProperty('scripts', { postinstall: postInstallScript });
  const postInstallFile = LinkFile.load({ filePath: postInstallFilePath, content: postInstallCode, override: true });
  return postInstallFile;
}

function addCustomResolveAliasesToPackageJson(component: Component, links: LinkFileType[]): boolean {
  const resolveAliases = links.reduce((acc, link: LinkFileType) => {
    if (link.customResolveMapping) Object.assign(acc, link.customResolveMapping);
    return acc;
  }, {});
  if (R.isEmpty(resolveAliases)) return false;
  if (!component.packageJsonFile) return false; // e.g. author doesn't have package.json per component
  const bitProperty = component.packageJsonFile.getProperty('bit') || {};
  bitProperty.resolveAliases = resolveAliases;
  return true;
}

/**
 * Not relevant for Harmony.
 * Relevant for IMPORTED and NESTED only
 */
function getEntryPointsForComponent(
  component: Component,
  consumer: Consumer | null | undefined,
  bitMap: BitMap
): LinkFile[] {
  if (!component.isLegacy) return [];
  const componentMap = bitMap.getComponent(component.id);
  if (componentMap.origin === COMPONENT_ORIGINS.AUTHORED) return [];
  const mainFile = component.dists.calculateMainDistFile(component.mainFile);
  const mainFileExt = getExt(mainFile);
  if (JAVASCRIPT_FLAVORS_EXTENSIONS.includes(mainFileExt) && component.packageJsonFile) {
    // if the main file is a javascript kind of file and the component has package.json file, no
    // need for an entry-point file because the "main" attribute of package.json takes care of that
    return [];
  }
  if (EXTENSIONS_NOT_SUPPORT_DIRS.includes(mainFileExt)) {
    // some extensions (such as .scss according to node-sass) don't know to resolve by an entry-point
    return [];
  }
  const files = [];
  const indexName = getIndexFileName(mainFile);
  const entryPointFileContent = getLinkToFileContent(`./${mainFile}`);
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const componentRoot: string = component.writtenPath || componentMap.rootDir;
  const entryPointPath = path.join(componentRoot, indexName);
  if (
    !component.dists.isEmpty() &&
    component.dists.writeDistsFiles &&
    consumer &&
    !consumer.shouldDistsBeInsideTheComponent()
  ) {
    const distDir = component.dists.getDistDirForConsumer(consumer, componentRoot);
    const entryPointDist = path.join(distDir, indexName);
    logger.debug(`writeEntryPointFile, on ${entryPointDist}`);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    files.push(LinkFile.load({ filePath: entryPointDist, content: entryPointFileContent }));
  }
  logger.debug(`writeEntryPointFile, on ${entryPointPath}`);
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  files.push(LinkFile.load({ filePath: entryPointPath, content: entryPointFileContent }));
  return files;
}

function getEntryPointForAngularComponent(
  component: Component,
  consumer: Consumer | null | undefined,
  bitMap: BitMap
): LinkFile | null | undefined {
  if (!_isAngularComponent(component)) return null;
  const componentMap = bitMap.getComponent(component.id);
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const componentRoot: string = component.writtenPath || componentMap.rootDir;
  if (componentMap.origin === COMPONENT_ORIGINS.AUTHORED) return null;
  const content = getLinkToFileContent(component.mainFile, []);
  const filePath = path.join(componentRoot, ANGULAR_BIT_ENTRY_POINT_FILE);
  return LinkFile.load({ filePath, content, override: false });
}

function _isAngularComponent(component: Component): boolean {
  return (
    component.packageDependencies[ANGULAR_PACKAGE_IDENTIFIER] ||
    component.peerPackageDependencies[ANGULAR_PACKAGE_IDENTIFIER]
  );
}

export {
  getComponentLinks, // irrelevant for Harmony
  getEntryPointsForComponent, // irrelevant for Harmony
  getComponentsDependenciesLinks, // irrelevant if all components use Harmony
  getIndexFileName, // irrelevant for Harmony
  getEntryPointForAngularComponent,
};
