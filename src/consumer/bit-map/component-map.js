/** @flow */
import path from 'path';
import logger from '../../logger/logger';
import { COMPONENT_ORIGINS, BIT_MAP } from '../../constants';
import { pathNormalizeToLinux, pathJoinLinux, pathRelativeLinux, isValidPath } from '../../utils';
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
  trackDir?: PathLinux,
  origin: ComponentOrigin,
  dependencies?: string[],
  mainDistFile?: PathLinux,
  originallySharedDir?: PathLinux
};

export type PathChange = { from: PathLinux, to: PathLinux };

export default class ComponentMap {
  files: ComponentMapFile[];
  mainFile: PathLinux;
  rootDir: ?PathLinux; // always set for IMPORTED and NESTED.
  // reason why trackDir and not re-use rootDir is because using rootDir requires all paths to be
  // relative to rootDir for consistency, then, when saving into the model changing them back to
  // be relative to consumer-root. (we can't save in the model relative to rootDir, otherwise the
  // dependencies paths won't work).
  trackDir: ?PathLinux; // relevant for AUTHORED only when a component was added as a directory, used for tracking changes in that dir
  origin: ComponentOrigin;
  dependencies: ?(string[]); // needed for the link process
  mainDistFile: ?PathLinux; // needed when there is a build process involved
  originallySharedDir: ?PathLinux; // directory shared among a component and its dependencies by the original author. Relevant for IMPORTED only
  constructor({
    files,
    mainFile,
    rootDir,
    trackDir,
    origin,
    dependencies,
    mainDistFile,
    originallySharedDir
  }: ComponentMapData) {
    this.files = files;
    this.mainFile = mainFile;
    this.rootDir = rootDir;
    this.trackDir = trackDir;
    this.origin = origin;
    this.dependencies = dependencies;
    this.mainDistFile = mainDistFile;
    this.originallySharedDir = originallySharedDir;
  }

  static fromJson(componentMapObj: ComponentMapData): ComponentMap {
    return new ComponentMap(componentMapObj);
  }

  static getPathWithoutRootDir(rootDir: PathLinux, filePath: PathLinux): PathLinux {
    const newPath = pathRelativeLinux(rootDir, filePath);
    if (newPath.startsWith('..')) {
      // this is forbidden for security reasons. Allowing files to be written outside the components directory may
      // result in overriding OS files.
      throw new Error(`unable to add file ${filePath} because it's located outside the component root dir ${rootDir}`);
    }
    return newPath;
  }

  static changeFilesPathAccordingToItsRootDir(existingRootDir: PathLinux, files: ComponentMapFile[]): PathChange[] {
    const changes = [];
    files.forEach((file) => {
      const newPath = this.getPathWithoutRootDir(existingRootDir, file.relativePath);
      changes.push({ from: file.relativePath, to: newPath });
      file.relativePath = newPath;
    });
    return changes;
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
    this.validate();
    return changes;
  }

  updateDirLocation(dirFrom: PathOsBased, dirTo: PathOsBased): PathChange[] {
    dirFrom = pathNormalizeToLinux(dirFrom);
    dirTo = pathNormalizeToLinux(dirTo);
    const changes = [];
    if (this.rootDir && this.rootDir.startsWith(dirFrom)) {
      const rootDir = this.rootDir;
      const newRootDir = rootDir.replace(dirFrom, dirTo);
      const newRootDirNormalized = pathNormalizeToLinux(newRootDir);
      changes.push({ from: rootDir, to: newRootDirNormalized });
      logger.debug(`updating rootDir location from ${rootDir} to ${newRootDirNormalized}`);
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
    if (this.origin === COMPONENT_ORIGINS.AUTHORED && this.trackDir && this.trackDir === dirFrom) {
      this.trackDir = dirTo;
    }
    this.validate();
    return changes;
  }

  getFilesRelativeToConsumer(): PathLinux[] {
    return this.files.map((file) => {
      return this.rootDir ? pathJoinLinux(this.rootDir, file.relativePath) : file.relativePath;
    });
  }

  getFilesGroupedByBeingTests(): { allFiles: string[], nonTestsFiles: string[], testsFiles: string[] } {
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

  /**
   * if one of the added files is outside of the trackDir, remove the trackDir attribute
   */
  removeTrackDirIfNeeded(): void {
    if (this.trackDir) {
      for (const file of this.files) {
        if (!file.relativePath.startsWith(this.trackDir)) {
          this.trackDir = undefined;
          return;
        }
      }
    }
  }

  validate() {
    const errorMessage = `failed adding a component-map record (to ${BIT_MAP} file).`;
    if (!this.mainFile) throw new Error(`${errorMessage} mainFile attribute is missing`);
    if (!isValidPath(this.mainFile)) {
      throw new Error(`${errorMessage} mainFile attribute ${this.mainFile} is invalid`);
    }
    // if it's an environment component (such as compiler) the rootDir is an empty string
    if (this.rootDir === undefined && this.origin !== COMPONENT_ORIGINS.AUTHORED) {
      throw new Error(`${errorMessage} rootDir attribute is missing`);
    }
    // $FlowFixMe
    if (this.rootDir && !isValidPath(this.rootDir)) {
      throw new Error(`${errorMessage} rootDir attribute ${this.rootDir} is invalid`);
    }
    if (this.rootDir && this.origin === COMPONENT_ORIGINS.AUTHORED) {
      throw new Error(`${errorMessage} rootDir attribute should not be set for AUTHORED component`);
    }
    if (this.trackDir && this.origin !== COMPONENT_ORIGINS.AUTHORED) {
      throw new Error(`${errorMessage} trackDir attribute should be set for AUTHORED component only`);
    }
    if (!this.files || !this.files.length) throw new Error(`${errorMessage} files list is missing`);
    this.files.forEach((file) => {
      if (!isValidPath(file.relativePath)) {
        throw new Error(`${errorMessage} file path ${file.relativePath} is invalid`);
      }
    });
    if (this.trackDir) {
      const trackDir = this.trackDir;
      this.files.forEach((file) => {
        if (!file.relativePath.startsWith(trackDir)) {
          throw new Error(`${errorMessage} a file path ${file.relativePath} is not in the trackDir ${trackDir}`);
        }
      });
    }
  }
}
