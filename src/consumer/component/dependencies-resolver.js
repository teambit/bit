/** @flow */
import path from 'path';
import R from 'ramda';
import { DEFAULT_INDEX_NAME, DEFAULT_INDEX_TS_NAME } from '../../constants';
import BitMap from '../bit-map/bit-map';

const depsTreeCache = {};

/**
 * Run over the deps tree recursively to build the full deps tree for component
 * @param {Object} tree - which contain direct deps for each file
 * @param {string} file - file to calculate deps for
 * @param {string} entryComponentId - component id for the entry of traversing - used to know which of the files are part of that component
 * @param {string} consumerPath
 * @param {string} originFilePath - The original filePath as written in the dependent import statement - this important while committing imported components
 * @param {BitMap} bitMap
 */
export default function traverseDepsTreeRecursive(tree: Object,
                                                  file: string,
                                                  entryComponentId: string,
                                                  bitMap: BitMap,
                                                  consumerPath: string,
                                                  originFilePath?: string): Object {
  const depsTreeCacheId = `${file}@${entryComponentId}`;
  if (depsTreeCache[depsTreeCacheId] === null) return {}; // todo: cyclomatic dependency
  if (depsTreeCache[depsTreeCacheId]) {
    return depsTreeCache[depsTreeCacheId];
  }
  depsTreeCache[depsTreeCacheId] = null; // mark as started

  const packagesDeps = {};
  let missingDeps = [];
  let destination;

  // Don't traverse generated authored components (from the same reasons above):
  let componentId = bitMap.getComponentIdByPath(file);
  if (!componentId) {
    // Check if its a generated index file
    if (path.basename(file) === DEFAULT_INDEX_NAME || path.basename(file) === DEFAULT_INDEX_TS_NAME) {
      const indexDir = path.dirname(file);
      componentId = bitMap.getComponentIdByRootPath(indexDir);
      // Refer to the main file in case the source component required the index of the imported
      if (componentId) destination = bitMap.getMainFileOfComponent(componentId);
    }

    if (!componentId) {
      missingDeps.push(file);
      depsTreeCache[depsTreeCacheId] = { componentsDeps: {}, packagesDeps, missingDeps };
      return ({ componentsDeps: {}, packagesDeps, missingDeps });
    }
  }
  if (componentId === entryComponentId) {
    const currPackagesDeps = tree[file].packages;
    if (currPackagesDeps && !R.isEmpty(currPackagesDeps)) {
      Object.assign(packagesDeps, currPackagesDeps);
    }
    const allFilesDeps = tree[file].files;
    if (!allFilesDeps || R.isEmpty(allFilesDeps)) {
      depsTreeCache[depsTreeCacheId] = { componentsDeps: {}, packagesDeps, missingDeps };
      return { componentsDeps: {}, packagesDeps, missingDeps };
    }
    const rootDir = bitMap.getRootDirOfComponent(componentId);
    const rootDirFullPath = rootDir ? path.join(consumerPath, rootDir) : consumerPath;
    const recursiveResults = allFilesDeps.map((fileDep) => {
      let relativeToConsumerFileDep = fileDep;
      // Change the dependencies files to be relative to current consumer
      // We are not just using path.resolve(rootDir, fileDep) because this might not work when running
      // bit commands not from root, because resolve take by default the process.cwd
      if (rootDir) {
        const fullFileDep = path.resolve(rootDirFullPath, fileDep);
        // const fullFileDep = path.resolve(rootDirFullPath, fileDep);
        // relativeToConsumerFileDep = path.relative(rootDirFullPath, fullFileDep);
        relativeToConsumerFileDep = path.relative(consumerPath, fullFileDep);
        // In case it's another file of the same component we need it to be relative to the rootDir of the current component (and not to consumer)
        // there for We use the original fileDep.
        // We need it to be relative to the rootDir because this is how it will be represented in the tree since we passed this root dir to madge earlier
        if (relativeToConsumerFileDep.startsWith(rootDir)) {
          relativeToConsumerFileDep = fileDep;
        }
      }
      return traverseDepsTreeRecursive(tree, relativeToConsumerFileDep, entryComponentId, bitMap, consumerPath, fileDep);
    });
    const currComponentsDeps = {};
    recursiveResults.forEach((result) => {
      if (result.componentsDeps && !R.isEmpty(result.componentsDeps)) {
        Object.keys(result.componentsDeps).forEach((currId) => {
          const resultPaths = result.componentsDeps[currId];
          if (currComponentsDeps[currId]) {
            currComponentsDeps[currId] = currComponentsDeps[currId].concat(resultPaths);
          } else {
            currComponentsDeps[currId] = resultPaths;
          }
        });
      }
      if (result.missingDeps && !R.isEmpty(result.missingDeps)) {
        missingDeps = missingDeps.concat(result.missingDeps);
      }
      Object.assign(packagesDeps, result.packagesDeps);
    });
    depsTreeCache[depsTreeCacheId] = { componentsDeps: currComponentsDeps, packagesDeps, missingDeps };
    return { componentsDeps: currComponentsDeps, packagesDeps, missingDeps };
  }

  if (!destination) {
    const depRootDir = bitMap.getRootDirOfComponent(componentId);
    destination = depRootDir && file.startsWith(depRootDir) ? path.relative(depRootDir, file) : file;
  }

  const currComponentsDeps = { [componentId]: [{ sourceRelativePath: originFilePath || file, destinationRelativePath: destination }] };
  depsTreeCache[depsTreeCacheId] = { componentsDeps: currComponentsDeps, packagesDeps: {}, missingDeps: [] };
  return ({ componentsDeps: currComponentsDeps, packagesDeps: {}, missingDeps: [] });
}
