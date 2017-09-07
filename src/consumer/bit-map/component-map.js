/** @flow */
import path from 'path';
import logger from '../../logger/logger';
import { COMPONENT_ORIGINS } from '../../constants';
import { isDir, pathNormalizeToLinux } from '../../utils';

export type ComponentOrigin = $Keys<typeof COMPONENT_ORIGINS>;

export type ComponentMapFile = {
  name: string,
  relativePath: string,
  test: string
}

export type ComponentMapData = {
  files: ComponentMapFile[],
  mainFile: string,
  rootDir?: string, // needed to search for the component's bit.json. If it's undefined, the component probably don't have bit.json
  origin: ComponentOrigin,
  dependencies: string[], // needed for the bind process
  mainDistFile?: string, // needed when there is a build process involved
}

export default class ComponentMap {
  constructor({ files, mainFile, rootDir, origin, dependencies, mainDistFile }: ComponentMapData) {
    this.files = files;
    this.mainFile = mainFile;
    this.rootDir = rootDir;
    this.origin = origin;
    this.dependencies = dependencies;
    this.mainDistFile = mainDistFile;
  }

  static fromJson(componentMapObj: ComponentMapData): ComponentMap {
    return new ComponentMap(componentMapObj);
  }

  static getPathWithoutRootDir(rootDir, filePath) {
    const newPath = path.relative(rootDir, filePath);
    if (newPath.startsWith('..')) {
      // this is forbidden for security reasons. Allowing files to be written outside the components directory may
      // result in overriding OS files.
      throw new Error(`unable to add file ${filePath} because it's located outside the component root dir ${rootDir}`);
    }
    return newPath;
  }

  static changeFilesPathAccordingToItsRootDir(existingRootDir, files) {
    const changes = [];
    files.forEach((file) => {
      const newPath = this.getPathWithoutRootDir(existingRootDir, file.relativePath);
      changes.push({ from: file.relativePath, to: newPath });
      file.relativePath = newPath;
    });
    return changes;
  }

  _findFile(fileName: string): ComponentMapFile {
    fileName = pathNormalizeToLinux(fileName);
    return this.files.find((file) => {
      const filePath = this.rootDir ? path.join(this.rootDir, file.relativePath) : file.relativePath;
      return filePath === fileName;
    });
  }

  _updateFileLocation(fileFrom: string, fileTo: string): Array<Object> {
    const currentFile = this._findFile(fileFrom);
    if (!currentFile) throw new Error(`the file ${fileFrom} is untracked`);
    const rootDir = this.rootDir;
    const newLocation = rootDir ? this.getPathWithoutRootDir(rootDir, fileTo) : fileTo;
    logger.debug(`updating file location from ${currentFile.relativePath} to ${newLocation}`);
    if (this.mainFile === currentFile.relativePath) this.mainFile = newLocation;
    const changes = [{ from: currentFile.relativePath, to: newLocation }];
    currentFile.relativePath = newLocation;
    return changes;
  }

  _updateDirLocation(dirFrom, dirTo) {
    const changes = [];
    const rootDir = this.rootDir;
    if (rootDir && rootDir === dirFrom) {
      this.rootDir = dirTo;
      return this.changeFilesPathAccordingToItsRootDir(dirTo, this.files);
    }
    let areFilesChanged = false;
    this.files.forEach((file) => {
      const filePath = rootDir ? path.join(rootDir, file.relativePath) : file.relativePath;
      if (filePath.startsWith(dirFrom)) {
        areFilesChanged = true;
        const fileTo = filePath.replace(dirFrom, dirTo);
        const newLocation = rootDir ? this.getPathWithoutRootDir(rootDir, fileTo) : fileTo;
        logger.debug(`updating file location from ${file.relativePath} to ${newLocation}`);
        if (this.mainFile === file.relativePath) this.mainFile = newLocation;
        changes.push({ from: file.relativePath, to: newLocation });
        file.relativePath = newLocation;
      }
    });
    if (!areFilesChanged) {
      throw new Error(`neither one of the files use the directory ${dirFrom}`);
    }
    return changes;
  }

  updatePathLocation(from: string, to: string, fromExists: boolean): Array<Object> {
    const isPathDir = fromExists ? isDir(from) : isDir(to);
    if (isPathDir) return this._updateDirLocation(from, to);
    return this._updateFileLocation(from, to);
  }
}

