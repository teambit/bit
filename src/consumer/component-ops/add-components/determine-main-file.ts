import * as path from 'path';
import R from 'ramda';

import { DEFAULT_INDEX_EXTS, DEFAULT_INDEX_NAME, DEFAULT_SEPARATOR } from '../../../constants';
import { pathJoinLinux, PathLinux, pathNormalizeToLinux } from '../../../utils/path';
import ComponentMap from '../../bit-map/component-map';
import { MissingMainFile } from '../../bit-map/exceptions';
import { AddedComponent } from './add-components';

export default function determineMainFile(
  addedComponent: AddedComponent,
  existingComponentMap: ComponentMap | null | undefined
): PathLinux {
  const mainFile = addedComponent.mainFile;
  const componentIdStr = addedComponent.componentId.toString();
  const files = addedComponent.files.filter((file) => !file.test);
  const rootDir = existingComponentMap && existingComponentMap.rootDir;
  const strategies: Function[] = [
    getExistingIfNotChanged,
    getUserSpecifiedMainFile,
    onlyOneFileEnteredUseIt,
    searchForFileNameIndex,
    searchForSameFileNameAsImmediateDir,
  ];

  for (const strategy of strategies) {
    const foundMainFile = strategy();
    if (foundMainFile) {
      return foundMainFile;
    }
  }
  const mainFileString = `${DEFAULT_INDEX_NAME}.[${DEFAULT_INDEX_EXTS.join(', ')}]`;
  throw new MissingMainFile(
    componentIdStr,
    mainFileString,
    files.map((file) => path.normalize(file.relativePath))
  );

  /**
   * user didn't enter mainFile but the component already exists with mainFile
   */
  function getExistingIfNotChanged(): PathLinux | null | undefined {
    if (!mainFile && existingComponentMap) {
      return existingComponentMap.mainFile;
    }
    return null;
  }
  /**
   * user entered mainFile => search the mainFile in the files array, throw error if not found
   */
  function getUserSpecifiedMainFile(): PathLinux | null | undefined {
    if (mainFile) {
      const foundMainFile = _searchMainFile(pathNormalizeToLinux(mainFile));
      if (foundMainFile) return foundMainFile;
      throw new MissingMainFile(
        componentIdStr,
        mainFile,
        files.map((file) => path.normalize(file.relativePath))
      );
    }
    return null;
  }
  /**
   * user didn't enter mainFile and the component has only one file, use that file as the main file
   */
  function onlyOneFileEnteredUseIt(): PathLinux | null | undefined {
    if (files.length === 1) {
      return files[0].relativePath;
    }
    return null;
  }
  /**
   * user didn't enter mainFile and the component has multiple files, search for file name "index",
   * e.g. `index.js`, `index.css`, etc.
   */
  function searchForFileNameIndex(): PathLinux | null | undefined {
    for (const ext of DEFAULT_INDEX_EXTS) {
      const mainFileNameToSearch = `${DEFAULT_INDEX_NAME}.${ext}`;
      const searchResult = _searchMainFile(mainFileNameToSearch);
      if (searchResult) {
        return searchResult;
      }
    }
    return null;
  }
  /**
   * user didn't enter mainFile and the component has multiple files, search for file with the same
   * name as the directory (see #1714)
   */
  function searchForSameFileNameAsImmediateDir(): PathLinux | null | undefined {
    if (addedComponent.immediateDir) {
      for (const ext of DEFAULT_INDEX_EXTS) {
        const mainFileNameToSearch = `${addedComponent.immediateDir}.${ext}`;
        const searchResult = _searchMainFile(mainFileNameToSearch);
        if (searchResult) {
          return searchResult;
        }
      }
    }
    return null;
  }

  function _searchMainFile(baseMainFile: PathLinux): PathLinux | null | undefined {
    // search for an exact relative-path
    let mainFileFromFiles = files.find((file) => file.relativePath === baseMainFile);
    if (mainFileFromFiles) return baseMainFile;
    if (rootDir) {
      const mainFileUsingRootDir = files.find((file) => pathJoinLinux(rootDir, file.relativePath) === baseMainFile);
      if (mainFileUsingRootDir) return mainFileUsingRootDir.relativePath;
    }
    // search for a file-name
    const potentialMainFiles = files.filter((file) => file.name === baseMainFile);
    if (!potentialMainFiles.length) return null;
    // when there are several files that met the criteria, choose the closer to the root
    const sortByNumOfDirs = (a, b) =>
      a.relativePath.split(DEFAULT_SEPARATOR).length - b.relativePath.split(DEFAULT_SEPARATOR).length;
    potentialMainFiles.sort(sortByNumOfDirs);
    mainFileFromFiles = R.head(potentialMainFiles);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return mainFileFromFiles.relativePath;
  }
}
