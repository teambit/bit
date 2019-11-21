import R from 'ramda';
import fs from 'fs-extra';
import * as path from 'path';
import logger from '../../logger/logger';
import { COMPONENT_ORIGINS, BIT_MAP } from '../../constants';
import { pathNormalizeToLinux, pathJoinLinux, pathRelativeLinux, isValidPath } from '../../utils';
import { PathOsBasedRelative, PathLinux, PathOsBased, PathLinuxRelative } from '../../utils/path';
import Consumer from '../consumer';
import { BitId } from '../../bit-id';
import AddComponents from '../component-ops/add-components';
import { AddContext } from '../component-ops/add-components/add-components';
import { NoFiles, EmptyDirectory } from '../component-ops/add-components/exceptions';
import ValidationError from '../../error/validation-error';
import ComponentNotFoundInPath from '../component/exceptions/component-not-found-in-path';
import ConfigDir from './config-dir';
import ShowDoctorError from '../../error/show-doctor-error';

// TODO: should be better defined
// @ts-ignore
export type ComponentOrigin = keyof typeof COMPONENT_ORIGINS;

export type ComponentMapFile = {
  name: string;
  relativePath: PathLinux;
  test: boolean;
};

export type ComponentMapData = {
  id: BitId;
  files: ComponentMapFile[];
  mainFile: PathLinux;
  rootDir?: PathLinux;
  trackDir?: PathLinux;
  configDir?: PathLinux | ConfigDir | string;
  origin: ComponentOrigin;
  originallySharedDir?: PathLinux;
  wrapDir?: PathLinux;
  exported?: boolean;
};

export type PathChange = { from: PathLinux; to: PathLinux };

export default class ComponentMap {
  id: BitId;
  files: ComponentMapFile[];
  mainFile: PathLinux;
  rootDir?: PathLinux; // always set for IMPORTED and NESTED.
  // reason why trackDir and not re-use rootDir is because using rootDir requires all paths to be
  // relative to rootDir for consistency, then, when saving into the model changing them back to
  // be relative to consumer-root. (we can't save in the model relative to rootDir, otherwise the
  // dependencies paths won't work).
  trackDir: PathLinux | null | undefined; // relevant for AUTHORED only when a component was added as a directory, used for tracking changes in that dir
  configDir: ConfigDir | null | undefined;
  origin: ComponentOrigin;
  originallySharedDir: PathLinux | null | undefined; // directory shared among a component and its dependencies by the original author. Relevant for IMPORTED only
  wrapDir: PathLinux | null | undefined; // a wrapper directory needed when a user adds a package.json file to the component root so then it won't collide with Bit generated one
  // wether the compiler / tester are detached from the workspace global configuration
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  markBitMapChangedCb: Function;
  exported: boolean | null | undefined; // relevant for authored components only, it helps finding out whether a component has a scope
  constructor({
    id,
    files,
    mainFile,
    rootDir,
    trackDir,
    configDir,
    origin,
    originallySharedDir,
    wrapDir
  }: ComponentMapData) {
    let confDir;
    if (configDir && typeof configDir === 'string') {
      confDir = new ConfigDir(configDir);
    } else if (configDir && configDir instanceof ConfigDir) {
      confDir = configDir.clone();
    }
    this.id = id;
    this.files = files;
    this.mainFile = mainFile;
    this.rootDir = rootDir;
    this.trackDir = trackDir;
    this.configDir = confDir;
    this.origin = origin;
    this.originallySharedDir = originallySharedDir;
    this.wrapDir = wrapDir;
  }

  static fromJson(componentMapObj: ComponentMapData): ComponentMap {
    return new ComponentMap(componentMapObj);
  }

  toPlainObject(): Record<string, any> {
    let res = {
      id: this.id,
      files: this.files,
      mainFile: this.mainFile,
      rootDir: this.rootDir,
      trackDir: this.trackDir,
      configDir: this.configDir ? this.configDir.linuxDirPath : undefined,
      origin: this.origin,
      originallySharedDir: this.originallySharedDir,
      wrapDir: this.wrapDir,
      exported: this.exported
    };
    const notNil = val => {
      return !R.isNil(val);
    };
    res = R.filter(notNil, res);
    return res;
  }

  static getPathWithoutRootDir(rootDir: PathLinux, filePath: PathLinux): PathLinux {
    const newPath = pathRelativeLinux(rootDir, filePath);
    if (newPath.startsWith('..')) {
      // this is forbidden for security reasons. Allowing files to be written outside the components directory may
      // result in overriding OS files.
      throw new ShowDoctorError(
        `unable to add file ${filePath} because it's located outside the component root dir ${rootDir}`
      );
    }
    return newPath;
  }

  static changeFilesPathAccordingToItsRootDir(existingRootDir: PathLinux, files: ComponentMapFile[]): PathChange[] {
    const changes = [];
    files.forEach(file => {
      const newPath = this.getPathWithoutRootDir(existingRootDir, file.relativePath);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      changes.push({ from: file.relativePath, to: newPath });
      file.relativePath = newPath;
    });
    return changes;
  }

  setMarkAsChangedCb(markAsChangedBinded: Function) {
    this.markBitMapChangedCb = markAsChangedBinded;
  }

  _findFile(fileName: PathLinux): ComponentMapFile | null | undefined {
    return this.files.find(file => {
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
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      changes.push({ from: currentFile.relativePath, to: newLocation });
      currentFile.relativePath = newLocation;
      currentFile.name = path.basename(newLocation);
    }
    this.validate();
    return changes;
  }

  updateDirLocation(dirFrom: PathOsBasedRelative, dirTo: PathOsBasedRelative): PathChange[] {
    dirFrom = pathNormalizeToLinux(dirFrom);
    dirTo = pathNormalizeToLinux(dirTo);
    const changes = [];
    if (this.rootDir && this.rootDir.startsWith(dirFrom)) {
      const rootDir = this.rootDir;
      const newRootDir = rootDir.replace(dirFrom, dirTo);
      const newRootDirNormalized = pathNormalizeToLinux(newRootDir);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      changes.push({ from: rootDir, to: newRootDirNormalized });
      logger.debug(`updating rootDir location from ${rootDir} to ${newRootDirNormalized}`);
      this.rootDir = newRootDirNormalized;
      return changes;
    }
    this.files.forEach(file => {
      const filePath = this.rootDir ? path.join(this.rootDir, file.relativePath) : file.relativePath;
      if (filePath.startsWith(dirFrom)) {
        const fileTo = filePath.replace(dirFrom, dirTo);
        const newLocation = this.rootDir ? ComponentMap.getPathWithoutRootDir(this.rootDir, fileTo) : fileTo;
        logger.debug(`updating file location from ${file.relativePath} to ${newLocation}`);
        if (this.mainFile === file.relativePath) this.mainFile = newLocation;
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
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
    return this.files.map(file => {
      return this.rootDir ? pathJoinLinux(this.rootDir, file.relativePath) : file.relativePath;
    });
  }

  getAllFilesPaths(): PathLinux[] {
    return this.files.map(file => file.relativePath);
  }

  getFilesGroupedByBeingTests(): { allFiles: string[]; nonTestsFiles: string[]; testsFiles: string[] } {
    const allFiles = [];
    const nonTestsFiles = [];
    const testsFiles = [];
    this.files.forEach((file: ComponentMapFile) => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      allFiles.push(file.relativePath);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      if (file.test) testsFiles.push(file.relativePath);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      else nonTestsFiles.push(file.relativePath);
    });
    return { allFiles, nonTestsFiles, testsFiles };
  }

  /**
   * if one of the added files is outside of the trackDir, remove the trackDir attribute
   */
  removeTrackDirIfNeeded(): void {
    if (!this.trackDir) return;
    if (this.origin !== COMPONENT_ORIGINS.AUTHORED) {
      this.trackDir = undefined;
      return;
    }
    for (const file of this.files) {
      if (!file.relativePath.startsWith(this.trackDir)) {
        // Make sure we are not getting to case where we have config dir with {COMPONENT_DIR} but there is no component dir
        // This might happen in the following case:
        // User add a folder to bit which create the track dir
        // Then the user eject the config to that dir
        // Then the user adding a new file to that component which is outside of the component dir
        // This will remove the trackDir, so just before the remove we resolve it
        if (this.configDir) {
          this.configDir = this.configDir.getResolved({ componentDir: this.trackDir });
        }
        this.trackDir = undefined;
        return;
      }
    }
  }

  /**
   * directory to track for changes (such as files added/renamed)
   */
  getTrackDir(): PathLinux | null | undefined {
    if (this.origin === COMPONENT_ORIGINS.AUTHORED) return this.trackDir;
    if (this.origin === COMPONENT_ORIGINS.IMPORTED) {
      return this.wrapDir ? pathJoinLinux(this.rootDir, this.wrapDir) : this.rootDir;
    }
    // DO NOT track nested components!
    return null;
  }

  /**
   * this.rootDir is not defined for author. instead, the current workspace is the rootDir
   * also, for imported environments (compiler/tester) components the rootDir is empty
   */
  getRootDir(): PathLinuxRelative {
    return this.rootDir || '.';
  }

  /**
   * directory of the component (root / track)
   */
  getComponentDir(): PathLinux | null | undefined {
    if (this.origin === COMPONENT_ORIGINS.AUTHORED) return this.trackDir;
    return this.rootDir;
  }

  setConfigDir(val: PathLinux | null | undefined) {
    if (val === null || val === undefined) {
      delete this.configDir;
      this.markBitMapChangedCb();
      return;
    }
    this.markBitMapChangedCb();
    this.configDir = new ConfigDir(val);
  }

  async deleteConfigDirIfNotExists() {
    const resolvedDir = this.getBaseConfigDir();
    if (resolvedDir) {
      const isExist = await fs.pathExists(resolvedDir);
      if (!isExist) {
        this.setConfigDir(null);
      }
    }
  }

  /**
   * Get resolved base config dir (the dir where the bit.json is) after resolving the DSL
   */
  getBaseConfigDir(): PathLinux | null | undefined {
    if (!this.configDir) return null;
    const componentDir = this.getComponentDir();
    const configDir = this.configDir && this.configDir.getResolved({ componentDir }).getEnvTypeCleaned().linuxDirPath;
    return configDir;
  }

  /**
   * in case new files were created in the track-dir directory, add them to the component-map
   * so then they'll be tracked by bitmap
   */
  async trackDirectoryChanges(consumer: Consumer, id: BitId) {
    const trackDir = this.getTrackDir();
    if (trackDir) {
      const trackDirAbsolute = path.join(consumer.getPath(), trackDir);
      const trackDirRelative = path.relative(process.cwd(), trackDirAbsolute);
      if (!fs.existsSync(trackDirAbsolute)) throw new ComponentNotFoundInPath(trackDirRelative);
      const addParams = {
        componentPaths: [trackDirRelative || '.'],
        id: id.toString(),
        override: false, // this makes sure to not override existing files of componentMap
        trackDirFeature: true,
        origin: this.origin
      };
      const numOfFilesBefore = this.files.length;
      const addContext: AddContext = { consumer };
      const addComponents = new AddComponents(addContext, addParams);
      try {
        await addComponents.add();
      } catch (err) {
        if (err instanceof NoFiles || err instanceof EmptyDirectory) {
          // it might happen that a component is imported and current .gitignore configuration
          // are effectively removing all files from bitmap. we should ignore the error in that
          // case
        } else {
          throw err;
        }
      }
      if (this.files.length > numOfFilesBefore) {
        logger.info(`new file(s) have been added to .bitmap for ${id.toString()}`);
        consumer.bitMap.hasChanged = true;
      }
    }
  }

  removeFiles(files: ComponentMapFile[]): void {
    const relativePaths = files.map(file => file.relativePath);
    this.files = this.files.reduce((accumulator, file) => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      return relativePaths.includes(file.relativePath) ? accumulator : accumulator.concat(file);
    }, []);
    this.validate();
  }

  sort() {
    this.files = R.sortBy(R.prop('relativePath'), this.files);
  }

  clone() {
    // @ts-ignore - there is some issue with the config dir type
    return new ComponentMap(this);
  }

  validate(): void {
    const errorMessage = `failed adding or updating a ${BIT_MAP} record of ${this.id.toString()}.`;
    if (!this.mainFile) throw new ValidationError(`${errorMessage} mainFile attribute is missing`);
    if (!isValidPath(this.mainFile)) {
      throw new ValidationError(`${errorMessage} mainFile attribute ${this.mainFile} is invalid`);
    }
    // if it's an environment component (such as compiler) the rootDir is empty
    if (!this.rootDir && this.origin === COMPONENT_ORIGINS.NESTED) {
      throw new ValidationError(`${errorMessage} rootDir attribute is missing`);
    }
    if (this.rootDir && !isValidPath(this.rootDir)) {
      throw new ValidationError(`${errorMessage} rootDir attribute ${this.rootDir} is invalid`);
    }
    if (this.rootDir && this.origin === COMPONENT_ORIGINS.AUTHORED) {
      throw new ValidationError(`${errorMessage} rootDir attribute should not be set for AUTHORED component`);
    }
    if (this.trackDir && this.origin !== COMPONENT_ORIGINS.AUTHORED) {
      throw new ValidationError(`${errorMessage} trackDir attribute should be set for AUTHORED component only`);
    }
    if (this.originallySharedDir && this.origin === COMPONENT_ORIGINS.AUTHORED) {
      throw new ValidationError(
        `${errorMessage} originallySharedDir attribute should be set for non AUTHORED components only`
      );
    }

    if (!this.files || !this.files.length) throw new ValidationError(`${errorMessage} files list is missing`);
    this.files.forEach(file => {
      if (!isValidPath(file.relativePath)) {
        throw new ValidationError(`${errorMessage} file path ${file.relativePath} is invalid`);
      }
    });
    const foundMainFile = this.files.find(file => file.relativePath === this.mainFile);
    if (!foundMainFile || R.isEmpty(foundMainFile)) {
      throw new ValidationError(`${errorMessage} mainFile ${this.mainFile} is not in the files list`);
    }
    const filesPaths = this.files.map(file => file.relativePath);
    const duplicateFiles = filesPaths.filter(
      file => filesPaths.filter(f => file.toLowerCase() === f.toLowerCase()).length > 1
    );
    if (duplicateFiles.length) {
      throw new ValidationError(`${errorMessage} the following files are duplicated ${duplicateFiles.join(', ')}`);
    }
    if (this.trackDir) {
      const trackDir = this.trackDir;
      this.files.forEach(file => {
        if (!file.relativePath.startsWith(trackDir)) {
          throw new ValidationError(
            `${errorMessage} a file path ${file.relativePath} is not in the trackDir ${trackDir}`
          );
        }
      });
    }
  }
}
