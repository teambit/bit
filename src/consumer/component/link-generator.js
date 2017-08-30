import path from 'path';
import normalize from 'normalize-path';
import R from 'ramda';
import {
  DEFAULT_DIST_DIRNAME,
  DEFAULT_INDEX_NAME,
  DEFAULT_INDEX_TS_NAME,
  COMPONENT_ORIGINS
} from '../../constants';
import { outputFile } from '../../utils';
import logger from '../../logger/logger';
import { ComponentWithDependencies } from '../../scope';
import Component from '../component';
import BitMap from '../bit-map/bit-map';
import { BitIds } from '../../bit-id';

// todo: move to bit-javascript
function _getIndexFileName(mainFile: string): string {
  if (path.extname(mainFile) === '.ts') {
    return DEFAULT_INDEX_TS_NAME;
  }
  return DEFAULT_INDEX_NAME;
}

// todo: move to bit-javascript
function _getLinkContent(mainFile: string, filePath: string): string {
  if (!filePath.startsWith('.')) {
    filePath = `.${path.sep}${filePath}`; // it must be relative, otherwise, it'll search it in node_modules
  }
  filePath = filePath.substring(0, filePath.lastIndexOf('.')); // remove the extension
  if (path.extname(mainFile) === '.ts') {
    return `export * from '${normalize(filePath)}';`;
  }
  return `module.exports = require('${normalize(filePath)}');`;
}

/**
 * The following scenario will help understanding why links are needed.
 * Component A has a dependency B. (for instance, in a.js there is a require statement to 'b.js').
 * While importing component A, it knows about the B dependency and it saves it under 'dependencies' directory of A.
 * The problem is that the above require is broken, because 'b.js' is not in the same place where it was originally.
 * This function solves this issue by creating the 'b.js' file in the original location and points to the new location
 * under 'dependencies' of A.
 */
async function writeDependencyLinks(componentDependencies: ComponentWithDependencies[], bitMap: BitMap,
                                    consumerPath: string): Promise<any> {
  const writeLinkFile = (componentId: string, linkPath: string, relativePathInDependency: string) => {
    const rootDir = path.join(consumerPath, bitMap.getRootDirOfComponent(componentId));
    const mainFile = bitMap.getMainFileOfComponent(componentId);
    let actualFilePath = path.join(rootDir, relativePathInDependency);
    if (relativePathInDependency === mainFile) {
      actualFilePath = path.join(rootDir, _getIndexFileName(mainFile));
    }
    const relativeFilePath = path.relative(path.dirname(linkPath), actualFilePath);

    const linkContent = _getLinkContent(mainFile, relativeFilePath);
    logger.debug(`writeLinkFile, on ${linkPath}`);
    return outputFile(linkPath, linkContent);
  };

  const componentLink = async (resolveDepVersion: string, sourceRelativePath: string, relativePathInDependency: string,
                               parentDir: string, hasDist: boolean) => {
    const linkPath = path.join(parentDir, sourceRelativePath);
    let distLinkPath;
    if (hasDist) {
      distLinkPath = path.join(parentDir, DEFAULT_DIST_DIRNAME, sourceRelativePath);
    }

    // Generate a link file inside dist folder of the dependent component
    if (hasDist) {
      writeLinkFile(resolveDepVersion, distLinkPath, relativePathInDependency);
    }

    return writeLinkFile(resolveDepVersion, linkPath, relativePathInDependency);
  };

  const componentLinks = (directDependencies: Array<Object>, flattenedDependencies: BitIds, parentDir: string,
                          hasDist: boolean) => {
    if (!directDependencies || !directDependencies.length) return Promise.resolve();
    const links = directDependencies.map((dep) => {
      if (!dep.relativePath && (!dep.relativePaths || R.isEmpty(dep.relativePaths))) return Promise.resolve();
      let resolveDepVersion = dep.id;
      // Check if the dependency is latest, if yes we need to resolve if from the flatten dependencies to get the
      // Actual version number, because on the bitmap we have only specific versions
      if (dep.id.getVersion().latest) {
        resolveDepVersion = flattenedDependencies.resolveVersion(dep.id).toString();
      }

      const currLinks = dep.relativePaths.map((relativePath) => {
        return componentLink(resolveDepVersion, relativePath.sourceRelativePath, relativePath.destinationRelativePath, parentDir, hasDist);
      });
      return Promise.all(currLinks);
    });
    return Promise.all(links);
  };

  const allLinksP = componentDependencies.map((componentWithDeps) => {
    const componentMap = bitMap.getComponent(componentWithDeps.component.id, true);
    if (componentMap.origin === COMPONENT_ORIGINS.AUTHORED) {
      logger.debug(`writeDependencyLinks, ignoring a component ${componentWithDeps.component.id} as it is an author component`);
      return Promise.resolve();
    }
    logger.debug(`writeDependencyLinks, generating links for ${componentWithDeps.component.id}`);
    const directDeps = componentWithDeps.component.dependencies;
    const flattenDeps = componentWithDeps.component.flattenedDependencies;
    const hasDist = componentWithDeps.component.dists && !R.isEmpty(componentWithDeps.component.dists);
    const directLinksP = componentLinks(directDeps, flattenDeps, componentWithDeps.component.writtenPath, hasDist);

    const indirectLinksP = componentWithDeps.dependencies.map((dep: Component) => {
      const hasDist = dep.dists && !R.isEmpty(dep.dists);
      return componentLinks(dep.dependencies, dep.flattenedDependencies, dep.writtenPath, hasDist);
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
  let mainFile = bitMap.getMainFileOfComponent(componentId); // TODO: get main dist in case it exists?
  // In case there is dist files, we want to point the index to the dist file not to source.
  if (component.dists && !R.isEmpty(component.dists)) {
    logger.debug('_writeEntryPointsForImportedComponent, Change the index file to point to dist folder');
    mainFile = path.join(DEFAULT_DIST_DIRNAME, mainFile);
  }
  const indexName = _getIndexFileName(mainFile); // Move to bit-javascript
  const entryPointFileContent = _getLinkContent(mainFile, `.${path.sep}${mainFile}`);
  const entryPointPath = path.join(componentRoot, indexName);
  return outputFile(entryPointPath, entryPointFileContent);
}

export { writeEntryPointsForImportedComponent, writeDependencyLinks };
