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
};

export type ComponentMapData = {
  files: ComponentMapFile[],
  mainFile: string,
  rootDir?: string, // needed to search for the component's bit.json. If it's undefined, the component probably don't have bit.json
  origin: ComponentOrigin,
  dependencies: string[], // needed for the bind process
  mainDistFile?: string // needed when there is a build process involved
};

export default class ComponentMap {
  files: ComponentMapFile[];
  mainFile: string;
  rootDir: ?string;
  origin: ComponentOrigin;
  dependencies: string[];
  mainDistFile: ?string;
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

  _findFile(fileName: string): ?ComponentMapFile {
    fileName = pathNormalizeToLinux(fileName);
    return this.files.find((file) => {
      const filePath = this.rootDir ? path.join(this.rootDir, file.relativePath) : file.relativePath;
      return filePath === fileName;
    });
  }

  updateFileLocation(fileFrom: string, fileTo: string): Array<Object> {
    const currentFile = this._findFile(fileFrom);
    const changes = [];
    if (currentFile) {
      const rootDir = this.rootDir;
      const newLocation = rootDir ? ComponentMap.getPathWithoutRootDir(rootDir, fileTo) : fileTo;
      logger.debug(`updating file location from ${currentFile.relativePath} to ${newLocation}`);
      if (this.mainFile === currentFile.relativePath) this.mainFile = newLocation;
      changes.push({ from: currentFile.relativePath, to: newLocation });
      currentFile.relativePath = newLocation;
    }
    return changes;
  }

  updateDirLocation(dirFrom: string, dirTo: string) {
    const changes = [];
    if (this.rootDir && this.rootDir.startsWith(dirFrom)) {
      const newRootDir = this.rootDir.replace(dirFrom, dirTo);
      changes.push({ from: this.rootDir, to: newRootDir });
      this.rootDir = newRootDir;
      return changes;
    }
    this.files.forEach((file) => {
      const filePath = this.rootDir ? path.join(this.rootDir, file.relativePath) : file.relativePath;
      if (filePath.startsWith(dirFrom)) {
        const fileTo = filePath.replace(dirFrom, dirTo);
        const newLocation = this.rootDir ? ComponentMap.getPathWithoutRootDir(this.rootDir, fileTo) : fileTo;
        logger.debug(`updating file location from ${file.relativePath} to ${newLocation}`);
        if (this.mainFile === file.relativePath) this.mainFile = newLocation;
        changes.push({ from: file.relativePath, to: newLocation });
        file.relativePath = newLocation;
      }
    });
    return changes;
  }
}
