// @flow
import path from 'path';
import normalize from 'normalize-path';
import R from 'ramda';
import format from 'string-format';
import { DEFAULT_DIST_DIRNAME, DEFAULT_INDEX_NAME, COMPONENT_ORIGINS, AUTO_GENERATED_MSG } from '../../constants';
import { outputFile, getWithoutExt, searchFilesIgnoreExt } from '../../utils';
import logger from '../../logger/logger';
import { ComponentWithDependencies } from '../../scope';
import Component from '../component';
import BitMap from '../bit-map/bit-map';
import { BitIds } from '../../bit-id';

const LINKS_CONTENT_TEMPLATES = {
  js: "module.exports = require('{filePath}');",
  ts: "export * from '{filePath}';",
  jsx: "export * from '{filePath}';",
  tsx: "export * from '{filePath}';",
  css: "@import '{filePath}.css';",
  scss: "@import '{filePath}.scss';",
  sass: "@import '{filePath}.sass';",
  less: "@import '{filePath}.less';"
};

// todo: move to bit-javascript
function _getIndexFileName(mainFile: string): string {
  return `${DEFAULT_INDEX_NAME}${path.extname(mainFile)}`;
}

// todo: move to bit-javascript
function _getLinkContent(filePath: string): string {
  if (!filePath.startsWith('.')) {
    filePath = `./${filePath}`; // it must be relative, otherwise, it'll search it in node_modules
  }
  const fileExt = path.extname(filePath).replace('.', '');
  filePath = getWithoutExt(filePath); // remove the extension
  const template = LINKS_CONTENT_TEMPLATES[fileExt];
  return format(template, { filePath: normalize(filePath) });
}

/**
 * The following scenario will help understanding why links are needed.
 * Component A has a dependency B. (for instance, in a.js there is a require statement to 'b.js').
 * While importing component A, it knows about the B dependency and it saves it under 'dependencies' directory of A.
 * The problem is that the above require is broken, because 'b.js' is not in the same place where it was originally.
 * This function solves this issue by creating the 'b.js' file in the original location and points to the new location
 * under 'dependencies' of A.
 */
async function writeDependencyLinks(
  componentDependencies: ComponentWithDependencies[],
  bitMap: BitMap,
  consumerPath: string
): Promise<any> {
  const writeLinkFile = (componentId: string, mainFile: string, linkPath: string, relativePathInDependency: string) => {
    const rootDir = path.join(consumerPath, bitMap.getRootDirOfComponent(componentId));
    let actualFilePath = path.join(rootDir, relativePathInDependency);
    if (relativePathInDependency === mainFile) {
      actualFilePath = path.join(rootDir, _getIndexFileName(mainFile));
    }
    const relativeFilePath = path.relative(path.dirname(linkPath), actualFilePath);

    const linkContent = _getLinkContent(relativeFilePath);
    logger.debug(`writeLinkFile, on ${linkPath}`);
    return outputFile(linkPath, linkContent);
  };

  const componentLink = async (
    resolveDepVersion: string,
    sourceRelativePath: string,
    relativePathInDependency: string,
    relativeDistPathInDependency: string,
    relativeDistExtInDependency: string,
    parentDir: string,
    mainFile: string,
    hasDist: boolean
  ) => {
    const linkPath = path.join(parentDir, sourceRelativePath);
    let distLinkPath;
    if (hasDist) {
      const sourceRelativePathWithCompiledExt = getWithoutExt(sourceRelativePath) + relativeDistExtInDependency;
      distLinkPath = path.join(parentDir, DEFAULT_DIST_DIRNAME, sourceRelativePathWithCompiledExt);
      // Generate a link file inside dist folder of the dependent component
      writeLinkFile(resolveDepVersion, mainFile, distLinkPath, relativeDistPathInDependency);
    }

    return writeLinkFile(resolveDepVersion, mainFile, linkPath, relativePathInDependency);
  };

  const componentLinks = (
    // Array of the dependencies components (the full component) - used to generate a dist link (with the correct extension)
    dependencies: Component[],
    directDependencies: Object[],
    flattenedDependencies: BitIds,
    parentDir: string,
    mainFile: string,
    hasDist: boolean
  ) => {
    if (!directDependencies || !directDependencies.length) return Promise.resolve();
    const links = directDependencies.map((dep) => {
      if (!dep.relativePath && (!dep.relativePaths || R.isEmpty(dep.relativePaths))) return Promise.resolve();
      let resolveDepVersion = dep.id;
      // Check if the dependency is latest, if yes we need to resolve if from the flatten dependencies to get the
      // Actual version number, because on the bitmap we have only specific versions
      if (dep.id.getVersion().latest) {
        resolveDepVersion = flattenedDependencies.resolveVersion(dep.id).toString();
      }

      // Helper function to look for the component object
      const _byComponentId = dependency => dependency.id.toString() === resolveDepVersion.toString();

      // Get the real dependency component
      const depComponent = R.find(_byComponentId, dependencies);

      const currLinks = dep.relativePaths.map((relativePath) => {
        const destinationRelativePath = relativePath.destinationRelativePath;
        const destinationDistRelativePath = searchFilesIgnoreExt(
          depComponent.dists,
          path.join(DEFAULT_DIST_DIRNAME, destinationRelativePath),
          'relative'
        );
        return componentLink(
          resolveDepVersion,
          relativePath.sourceRelativePath,
          destinationRelativePath,
          destinationDistRelativePath.relative,
          destinationDistRelativePath.extname,
          parentDir,
          depComponent.calculateMainDistFile(),
          hasDist
        );
      });
      return Promise.all(currLinks);
    });
    return Promise.all(links);
  };

  const allLinksP = componentDependencies.map((componentWithDeps) => {
    const componentMap = bitMap.getComponent(componentWithDeps.component.id, true);
    if (componentMap.origin === COMPONENT_ORIGINS.AUTHORED) {
      logger.debug(
        `writeDependencyLinks, ignoring a component ${componentWithDeps.component.id} as it is an author component`
      );
      return Promise.resolve();
    }
    logger.debug(`writeDependencyLinks, generating links for ${componentWithDeps.component.id}`);
    const directDeps = componentWithDeps.component.dependencies;
    const flattenDeps = componentWithDeps.component.flattenedDependencies;
    const hasDist = componentWithDeps.component.dists && !R.isEmpty(componentWithDeps.component.dists);
    const mainFile = componentWithDeps.component.calculateMainDistFile();
    const directLinksP = componentLinks(
      componentWithDeps.dependencies,
      directDeps,
      flattenDeps,
      componentWithDeps.component.writtenPath,
      mainFile,
      hasDist
    );

    const indirectLinksP = componentWithDeps.dependencies.map((dep: Component) => {
      const depMainFile = dep.calculateMainDistFile();
      const depHasDist = dep.dists && !R.isEmpty(dep.dists);
      // We pass here the componentWithDeps.dependencies again because it contains the full dependencies objects
      // also the indirect ones
      // The dep.dependencies contain only an id and relativePathes and not the full object
      return componentLinks(
        componentWithDeps.dependencies,
        dep.dependencies,
        dep.flattenedDependencies,
        dep.writtenPath,
        depMainFile,
        depHasDist
      );
    });

    return Promise.all([directLinksP, ...indirectLinksP]);
  });
  return Promise.all(allLinksP);
}

async function writeEntryPointsForImportedComponent(component: Component, bitMap: BitMap): Promise<any> {
  const componentRoot = component.writtenPath;
  const componentId = component.id.toString();
  const componentMap = bitMap.getComponent(componentId);
  if (componentMap.origin === COMPONENT_ORIGINS.AUTHORED) return Promise.resolve();
  const mainFile = component.calculateMainDistFile();
  const indexName = _getIndexFileName(mainFile); // Move to bit-javascript
  const entryPointFileContent = _getLinkContent(`./${mainFile}`);
  const entryPointPath = path.join(componentRoot, indexName);
  return outputFile(entryPointPath, AUTO_GENERATED_MSG + entryPointFileContent);
}

export { writeEntryPointsForImportedComponent, writeDependencyLinks };
