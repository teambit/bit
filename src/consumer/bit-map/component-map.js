/** @flow */
import path from 'path';
import R from 'ramda';
import logger from '../../logger/logger';
import { COMPONENT_ORIGINS, BIT_MAP } from '../../constants';
import { pathNormalizeToLinux, pathJoinLinux, pathRelativeLinux } from '../../utils';
import type { PathLinux, PathOsBased } from '../../utils/path';

export type ComponentOrigin = $Keys<typeof COMPONENT_ORIGINS>;

export type ComponentMapFile = {
  name: string,
  relativePath: PathLinux,
  test: boolean
};

export type ComponentMapData = {
  files: ComponentMapFile[],
  mainFile: PathLinux,
  rootDir?: PathLinux,
  origin: ComponentOrigin,
  dependencies: string[],
  mainDistFile?: PathLinux,
  originallySharedDir?: PathLinux
};

export type PathChange = { from: PathLinux, to: PathLinux };

export default class ComponentMap {
  files: ComponentMapFile[];
  mainFile: PathLinux;
  rootDir: ?PathLinux; // always set for IMPORTED and NESTED. For AUTHORED it's set when a component was added as a directory
  origin: ComponentOrigin;
  dependencies: string[]; // needed for the link process
  mainDistFile: ?PathLinux; // needed when there is a build process involved
  originallySharedDir: ?PathLinux; // directory shared among a component and its dependencies by the original author. Relevant for IMPORTED only
  constructor({ files, mainFile, rootDir, origin, dependencies, mainDistFile, originallySharedDir }: ComponentMapData) {
    this.files = files;
    this.mainFile = mainFile;
    this.rootDir = rootDir;
    this.origin = origin;
    this.dependencies = dependencies;
    this.mainDistFile = mainDistFile;
    this.originallySharedDir = originallySharedDir;
  }

  static fromJson(componentMapObj: ComponentMapData): ComponentMap {
    return new ComponentMap(componentMapObj);
  }

  static getPathWithoutRootDir(rootDir, filePath): PathLinux {
    const newPath = pathRelativeLinux(rootDir, filePath);
    if (newPath.startsWith('..')) {
      // this is forbidden for security reasons. Allowing files to be written outside the components directory may
      // result in overriding OS files.
      throw new Error(`unable to add file ${filePath} because it's located outside the component root dir ${rootDir}`);
    }
    return newPath;
  }

  static getFilesRelativeToRootDir(rootDir, files): ComponentMapFile[] {
    const newFiles = [];
    files.forEach((file) => {
      const newFile = R.clone(file);
      newFile.relativePath = this.getPathWithoutRootDir(rootDir, file.relativePath);
      newFiles.push(newFile);
    });
    return newFiles;
  }

  _findFile(fileName: PathLinux): ?ComponentMapFile {
    return this.files.find((file) => {
      const filePath = this.rootDir ? pathJoinLinux(this.rootDir, file.relativePath) : file.relativePath;
      return filePath === fileName;
    });
  }

  updateFileLocation(fileFrom: PathOsBased, fileTo: PathOsBased): PathChange[] {
    fileFrom = pathNormalizeToLinux(fileFrom);
    fileTo = pathNormalizeToLinux(fileTo);
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

  updateDirLocation(dirFrom: PathOsBased, dirTo: PathOsBased): PathChange[] {
    dirFrom = pathNormalizeToLinux(dirFrom);
    dirTo = pathNormalizeToLinux(dirTo);
    const changes = [];
    if (this.rootDir && this.rootDir.startsWith(dirFrom)) {
      const newRootDir = this.rootDir.replace(dirFrom, dirTo);
      const newRootDirNormalized = pathNormalizeToLinux(newRootDir);
      changes.push({ from: this.rootDir, to: newRootDirNormalized });
      logger.debug(`updating rootDir location from ${this.rootDir} to ${newRootDirNormalized}`);
      this.rootDir = newRootDirNormalized;
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

  getFilesRelativeToConsumer(): PathLinux[] {
    return this.files.map((file) => {
      return this.rootDir ? pathJoinLinux(this.rootDir, file.relativePath) : file.relativePath;
    });
  }

  getFilesGroupedByBeingTests(): Object {
    const allFiles = [];
    const nonTestsFiles = [];
    const testsFiles = [];
    this.files.forEach((file: ComponentMapFile) => {
      allFiles.push(file.relativePath);
      if (file.test) testsFiles.push(file.relativePath);
      else nonTestsFiles.push(file.relativePath);
    });
    return { allFiles, nonTestsFiles, testsFiles };
  }

  validate() {
    const errorMessage = `failed adding a component-map record (to ${BIT_MAP} file).`;
    if (!this.mainFile) throw new Error(`${errorMessage} mainFile attribute is missing`);
    // if it's an environment component (such as compiler) the rootDir is an empty string
    if (this.rootDir === undefined && this.origin !== COMPONENT_ORIGINS.AUTHORED) { throw new Error(`${errorMessage} rootDir attribute is missing`); }
    // $FlowFixMe
    if (this.rootDir && (this.rootDir.startsWith('./') || this.rootDir.startsWith('../'))) {
      throw new Error(`${errorMessage} rootDir attribute ${this.rootDir} is invalid`);
    }
    if (!this.files || !this.files.length) throw new Error(`${errorMessage} files list is missing`);
  }
}
