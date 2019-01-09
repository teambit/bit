// @flow
import fs from 'fs-extra';
import path from 'path';
import R from 'ramda';
import uniqBy from 'lodash.uniqby';
import groupBy from 'lodash.groupby';
import { DEFAULT_INDEX_NAME, COMPONENT_ORIGINS } from '../constants';
import { outputFile, getExt } from '../utils';
import type { OutputFileParams } from '../utils/fs-output-file';
import logger from '../logger/logger';
import type { ComponentWithDependencies } from '../scope';
import type Component from '../consumer/component/consumer-component';
import type { Dependency, Dependencies } from '../consumer/component/dependencies';
import type { RelativePath } from '../consumer/component/dependencies/dependency';
import { BitIds, BitId } from '../bit-id';
import type { Consumer } from '../consumer';
import ComponentMap from '../consumer/bit-map/component-map';
import type { PathOsBased, PathOsBasedAbsolute } from '../utils/path';
import postInstallTemplate from '../consumer/component/templates/postinstall.default-template';
import { getLinkToFileContent } from './link-content';
import createSymlinkOrCopy from '../utils/fs/create-symlink-or-copy';
import DependencyFileLinkGenerator from './dependency-file-link-generator';
import type { LinkFile } from './dependency-file-link-generator';

type Symlink = {
  source: PathOsBasedAbsolute, // symlink is pointing to this path
  dest: PathOsBasedAbsolute // path where the symlink is written to
};

// todo: move to bit-javascript
function getIndexFileName(mainFile: string): string {
  return `${DEFAULT_INDEX_NAME}.${getExt(mainFile)}`;
}

/**
 * a component may have many dependencies, this function returns the links content for all of its dependencies
 */
async function getComponentLinks({
  consumer,
  component,
  componentMap,
  dependencies,
  createNpmLinkFiles
}: {
  consumer: Consumer,
  component: Component,
  componentMap: ComponentMap,
  dependencies: Component[], // Array of the dependencies components (the full component) - used to generate a dist link (with the correct extension)
  createNpmLinkFiles: boolean
}): Promise<OutputFileParams[]> {
  const directDependencies: Dependency[] = _getDirectDependencies(component, componentMap);
  const flattenedDependencies: BitIds = _getFlattenedDependencies(component, componentMap);
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
    const getDependencyComponent = () => {
      return dependencies.find(dependency => dependency.id.isEqual(dependencyId));
    };
    const dependencyComponent = getDependencyComponent();

    if (!dependencyComponent) {
      const errorMessage = `link-generation: failed finding ${dependencyId.toString()} in the dependencies array of ${component.id.toString()}.
The dependencies array has the following ids: ${dependencies.map(d => d.id).join(', ')}`;
      throw new Error(errorMessage);
    }

    const dependencyLinks = dep.relativePaths.map((relativePath: RelativePath) => {
      const dependencyFileLinkGenerator = new DependencyFileLinkGenerator({
        consumer,
        component,
        componentMap,
        relativePath,
        dependencyId,
        dependencyComponent,
        createNpmLinkFiles
      });
      return dependencyFileLinkGenerator.generate();
    });
    return R.flatten(dependencyLinks);
  });
  const internalCustomResolvedLinks = component.customResolvedPaths.length
    ? getInternalCustomResolvedLinks(component, componentMap, createNpmLinkFiles)
    : [];
  const flattenLinks = R.flatten(links).concat(internalCustomResolvedLinks);

  const { postInstallLinks, linksToWrite, symlinks } = groupLinks(flattenLinks);
  if (postInstallLinks.length) {
    await generatePostInstallScript(component, postInstallLinks);
  }
  if (symlinks.length) {
    createSymlinks(symlinks, component.id.toString());
  }
  return linksToWrite;
}

function _getDirectDependencies(component: Component, componentMap: ComponentMap): Dependency[] {
  // devDependencies of Nested components are not written to the filesystem, so no need to link them.
  return componentMap.origin === COMPONENT_ORIGINS.NESTED
    ? component.dependencies.get()
    : component.getAllNonEnvsDependencies();
}

function _getFlattenedDependencies(component: Component, componentMap: ComponentMap): BitIds {
  return componentMap.origin === COMPONENT_ORIGINS.NESTED
    ? component.flattenedDependencies
    : BitIds.fromArray(component.getAllNonEnvsFlattenedDependencies());
}

function createSymlinks(symlinks: Symlink[], componentId: string) {
  symlinks.forEach((symlink: Symlink) => {
    createSymlinkOrCopy(symlink.source, symlink.dest, componentId);
  });
}

function groupLinks(
  flattenLinks: LinkFile[]
): { postInstallLinks: OutputFileParams[], linksToWrite: OutputFileParams[], symlinks: Symlink[] } {
  const groupedLinks = groupBy(flattenLinks, link => link.linkPath);
  const linksToWrite = [];
  const postInstallLinks = [];
  const symlinks = [];
  Object.keys(groupedLinks).forEach((group) => {
    let content = '';
    const firstGroupItem = groupedLinks[group][0];
    if (firstGroupItem.symlinkTo) {
      symlinks.push({ source: firstGroupItem.symlinkTo, dest: firstGroupItem.linkPath });
      return;
    }
    if (firstGroupItem.isEs6) {
      // check by the first item of the array, it can be any other item as well
      content = 'Object.defineProperty(exports, "__esModule", { value: true });\n';
    }
    content += groupedLinks[group].map(linkItem => linkItem.linkContent).join('\n');
    const linkFile: OutputFileParams = { filePath: group, content };
    if (firstGroupItem.postInstallLink) {
      postInstallLinks.push(linkFile);
    } else {
      linksToWrite.push(linkFile);
    }
  });
  return { postInstallLinks, linksToWrite, symlinks };
}

/**
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
async function writeComponentsDependenciesLinks(
  componentDependencies: ComponentWithDependencies[],
  consumer: Consumer,
  createNpmLinkFiles: boolean
): Promise<any> {
  const allLinksP = componentDependencies.map(async (componentWithDeps: ComponentWithDependencies) => {
    const componentMap = consumer.bitMap.getComponent(componentWithDeps.component.id);
    if (componentMap.origin === COMPONENT_ORIGINS.AUTHORED) {
      logger.debug(
        `writeComponentsDependenciesLinks, ignoring a component ${componentWithDeps.component.id.toString()} as it is an author component`
      );
      return null;
    }
    // it must be IMPORTED. We don't pass NESTED to this function
    logger.debug(`writeComponentsDependenciesLinks, generating links for ${componentWithDeps.component.id.toString()}`);

    const componentsLinks = await getComponentLinks({
      consumer,
      component: componentWithDeps.component,
      componentMap,
      dependencies: componentWithDeps.allDependencies,
      createNpmLinkFiles
    });

    if (componentWithDeps.component.dependenciesSavedAsComponents) {
      const dependenciesLinks = await Promise.all(
        componentWithDeps.allDependencies.map((dep: Component) => {
          const depComponentMap = consumer.bitMap.getComponent(dep.id);
          // We pass here the componentWithDeps.dependencies again because it contains the full dependencies objects
          // also the indirect ones
          // The dep.dependencies contain only an id and relativePaths and not the full object
          const dependencies = componentWithDeps.allDependencies;
          dependencies.push(componentWithDeps.component);
          return getComponentLinks({
            consumer,
            component: dep,
            componentMap: depComponentMap,
            dependencies,
            createNpmLinkFiles
          });
        })
      );
      return [componentsLinks, ...dependenciesLinks];
    }
    return componentsLinks;
  });
  const allLinks = await Promise.all(allLinksP);

  const linksWithoutNulls = R.flatten(allLinks).filter(x => x);
  const linksWithoutDuplications = uniqBy(linksWithoutNulls, 'filePath');
  return Promise.all(linksWithoutDuplications.map(link => outputFile(link)));
}

/**
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
): LinkFile[] {
  const componentDir = component.writtenPath || componentMap.rootDir;
  if (!componentDir) {
    throw new Error(`getInternalCustomResolvedLinks, unable to find the written path of ${component.id.toString()}`);
  }
  const getDestination = (importSource: string) => `node_modules/${importSource}`;
  return component.customResolvedPaths.map((customPath) => {
    const sourceAbs = path.join(componentDir, customPath.destinationPath);
    const dest = getDestination(customPath.importSource);
    const destAbs = path.join(componentDir, dest);
    const destRelative = path.relative(path.dirname(destAbs), sourceAbs);
    const linkContent = getLinkToFileContent(destRelative);
    return { linkPath: createNpmLinkFiles ? dest : destAbs, linkContent, postInstallLink: createNpmLinkFiles };
  });
}

/**
 * change the package.json of a component to include postInstall script.
 * @see postInstallTemplate() JSDoc to understand better why this postInstall script is needed
 */
async function generatePostInstallScript(component: Component, postInstallLinks) {
  // $FlowFixMe todo: is it possible that writtenPath is empty here?
  const componentDir: string = component.writtenPath;
  // convert from array to object for easier parsing in the postinstall script
  const linkPathsObject = postInstallLinks.reduce((acc, val) => {
    acc[val.filePath] = val.content;
    return acc;
  }, {});
  if (!component.packageJsonInstance) throw new Error(`packageJsonInstance is missing for ${component.id.toString()}`);
  const postInstallCode = postInstallTemplate(JSON.stringify(linkPathsObject));
  const POST_INSTALL_FILENAME = '.bit.postinstall.js';
  const postInstallFilePath = path.join(componentDir, POST_INSTALL_FILENAME);
  const postInstallScript = `node ${POST_INSTALL_FILENAME}`;
  // $FlowFixMe packageJsonInstance must be set
  component.packageJsonInstance.scripts = { postinstall: postInstallScript };
  const override = true;
  await Promise.all([
    fs.writeFile(postInstallFilePath, postInstallCode),
    // $FlowFixMe packageJsonInstance must be set
    component.packageJsonInstance.write({ override })
  ]);
}

/**
 * Relevant for IMPORTED and NESTED only
 */
async function writeEntryPointsForComponent(component: Component, consumer: Consumer): Promise<any> {
  const componentMap = consumer.bitMap.getComponent(component.id);
  const componentRoot = component.writtenPath || componentMap.rootDir;
  if (componentMap.origin === COMPONENT_ORIGINS.AUTHORED) return Promise.resolve();
  const mainFile = component.dists.calculateMainDistFile(component.mainFile);
  const indexName = getIndexFileName(mainFile); // Move to bit-javascript
  const entryPointFileContent = getLinkToFileContent(`./${mainFile}`);
  const entryPointPath = path.join(componentRoot, indexName);
  if (!component.dists.isEmpty() && component.dists.writeDistsFiles && !consumer.shouldDistsBeInsideTheComponent()) {
    const distDir = component.dists.getDistDirForConsumer(consumer, componentMap.rootDir);
    const entryPointDist = path.join(distDir, indexName);
    logger.debug(`writeEntryPointFile, on ${entryPointDist}`);
    await outputFile({ filePath: entryPointDist, content: entryPointFileContent, override: false });
  }
  logger.debug(`writeEntryPointFile, on ${entryPointPath}`);
  return outputFile({ filePath: entryPointPath, content: entryPointFileContent, override: false });
}

/**
 * used for writing compiler and tester dependencies to the directory of their configuration file
 * the configuration directory is not always the same as the component, it can be moved by 'eject-conf' command
 * this methods write the environment dependency links no matter where the directory located on the workspace
 *
 */
async function writeDependenciesLinksToDir(
  targetDir: PathOsBased,
  component: Component,
  dependencies: Dependencies,
  consumer: Consumer
) {
  const linksP = dependencies.get().map(async (dependency: Dependency) => {
    const dependencyComponent = await consumer.loadComponentFromModel(dependency.id);
    const dependencyLinks = dependency.relativePaths.map((relativePath: RelativePath) => {
      const dependencyFileLinkGenerator = new DependencyFileLinkGenerator({
        consumer,
        component, // $FlowFixMe componentMap should be set here
        componentMap: component.componentMap,
        relativePath,
        dependencyId: dependency.id,
        dependencyComponent,
        createNpmLinkFiles: false,
        targetDir
      });
      return dependencyFileLinkGenerator.generate();
    });
    return R.flatten(dependencyLinks);
  });
  const links = await Promise.all(linksP);

  const flattenLinks = R.flatten(links);
  const { linksToWrite } = groupLinks(flattenLinks);

  return Promise.all(linksToWrite.map(link => outputFile(link)));
}

export {
  writeEntryPointsForComponent,
  writeComponentsDependenciesLinks,
  getIndexFileName,
  writeDependenciesLinksToDir
};
