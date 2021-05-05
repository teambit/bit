import fs from 'fs-extra';
import * as path from 'path';
import R from 'ramda';

import { BitId, BitIds } from '../../bit-id';
import { BIT_MAP, COMPONENT_ORIGINS } from '../../constants';
import ValidationError from '../../error/validation-error';
import { RemoteLaneId } from '../../lane-id/lane-id';
import logger from '../../logger/logger';
import { isValidPath, pathJoinLinux, pathNormalizeToLinux, pathRelativeLinux, sortObject } from '../../utils';
import { getLastModifiedDirTimestampMs } from '../../utils/fs/last-modified';
import { PathLinux, PathLinuxRelative, PathOsBased, PathOsBasedRelative } from '../../utils/path';
import AddComponents from '../component-ops/add-components';
import { AddContext, getFilesByDir, getGitIgnoreHarmony } from '../component-ops/add-components/add-components';
import { EmptyDirectory, NoFiles } from '../component-ops/add-components/exceptions';
import ComponentNotFoundInPath from '../component/exceptions/component-not-found-in-path';
import Consumer from '../consumer';
import OutsideRootDir from './exceptions/outside-root-dir';

// TODO: should be better defined
export type ComponentOrigin = keyof typeof COMPONENT_ORIGINS;

export type ComponentMapFile = {
  name: string;
  relativePath: PathLinux;
  test: boolean;
};

export type NextVersion = {
  version: 'patch' | 'minor' | 'major' | string;
  message?: string;
  username?: string;
  email?: string;
};

type LaneVersion = { remoteLane: RemoteLaneId; version: string };

export type ComponentMapData = {
  id: BitId;
  files: ComponentMapFile[];
  mainFile: PathLinux;
  rootDir?: PathLinux;
  trackDir?: PathLinux;
  origin: ComponentOrigin;
  originallySharedDir?: PathLinux;
  wrapDir?: PathLinux;
  exported?: boolean;
  onLanesOnly: boolean;
  lanes?: LaneVersion[];
  defaultVersion?: string;
  isAvailableOnCurrentLane?: boolean;
  nextVersion?: NextVersion;
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
  trackDir: PathLinux | undefined; // relevant for AUTHORED only when a component was added as a directory, used for tracking changes in that dir
  origin: ComponentOrigin;
  originallySharedDir: PathLinux | undefined; // directory shared among a component and its dependencies by the original author. Relevant for IMPORTED only
  wrapDir: PathLinux | undefined; // a wrapper directory needed when a user adds a package.json file to the component root so then it won't collide with Bit generated one
  // wether the compiler / tester are detached from the workspace global configuration
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  markBitMapChangedCb: Function;
  exported: boolean | null | undefined; // relevant for authored components only, it helps finding out whether a component has a scope
  onLanesOnly? = false; // whether a component is available only on lanes and not on master
  lanes: LaneVersion[]; // save component versions per lanes if they're different than the id
  defaultVersion?: string | null;
  isAvailableOnCurrentLane? = true; // if a component was created on another lane, it might not be available on the current lane
  nextVersion?: NextVersion; // for soft-tag (harmony only), this data is used in the CI to persist
  recentlyTracked?: boolean; // eventually the timestamp is saved in the filesystem cache so it won't be re-tracked if not changed
  scope?: string | null; // Harmony only. empty string if new/staged. (undefined if legacy).
  version?: string; // Harmony only. empty string if new. (undefined if legacy).
  noFilesError?: Error; // set if during finding the files an error was found
  constructor({
    id,
    files,
    mainFile,
    rootDir,
    trackDir,
    origin,
    originallySharedDir,
    wrapDir,
    onLanesOnly,
    lanes,
    defaultVersion,
    isAvailableOnCurrentLane,
    nextVersion,
  }: ComponentMapData) {
    this.id = id;
    this.files = files;
    this.mainFile = mainFile;
    this.rootDir = rootDir;
    this.trackDir = trackDir;
    this.origin = origin;
    this.originallySharedDir = originallySharedDir;
    this.wrapDir = wrapDir;
    this.onLanesOnly = onLanesOnly;
    this.lanes = lanes || [];
    this.defaultVersion = defaultVersion;
    this.isAvailableOnCurrentLane = typeof isAvailableOnCurrentLane === 'undefined' ? true : isAvailableOnCurrentLane;
    this.nextVersion = nextVersion;
  }

  static fromJson(
    componentMapObj: Omit<ComponentMapData, 'lanes'> & { lanes: Array<{ remoteLane: string; version: string }> }
  ): ComponentMap {
    const componentMapParams = {
      ...componentMapObj,
      lanes: componentMapObj.lanes
        ? componentMapObj.lanes.map((lane) => ({
            remoteLane: RemoteLaneId.parse(lane.remoteLane),
            version: lane.version,
          }))
        : [],
    };
    return new ComponentMap(componentMapParams);
  }

  toPlainObject(isLegacy: boolean): Record<string, any> {
    let res = {
      scope: this.scope,
      version: this.version,
      files: isLegacy || !this.rootDir ? this.files.map((file) => sortObject(file)) : null,
      mainFile: this.mainFile,
      rootDir: this.rootDir,
      trackDir: this.trackDir,
      origin: isLegacy ? this.origin : undefined,
      originallySharedDir: this.originallySharedDir,
      wrapDir: this.wrapDir,
      exported: this.exported,
      onLanesOnly: this.onLanesOnly || null, // if false, change to null so it won't be written
      lanes: this.lanes.length
        ? this.lanes.map((l) => ({ remoteLane: l.remoteLane.toString(), version: l.version }))
        : null,
      nextVersion: this.nextVersion,
    };
    const notNil = (val) => {
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
      throw new OutsideRootDir(filePath, rootDir);
    }
    return newPath;
  }

  static changeFilesPathAccordingToItsRootDir(existingRootDir: PathLinux, files: ComponentMapFile[]): PathChange[] {
    const changes = [];
    files.forEach((file) => {
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

  _findFile(fileName: PathLinux): ComponentMapFile | undefined {
    return this.files.find((file) => {
      const filePath = this.rootDir ? pathJoinLinux(this.rootDir, file.relativePath) : file.relativePath;
      return filePath === fileName;
    });
  }

  changeRootDirAndUpdateFilesAccordingly(newRootDir: PathLinuxRelative) {
    if (this.rootDir === newRootDir) return;
    this.files.forEach((file) => {
      const filePathRelativeToConsumer = this.rootDir
        ? pathJoinLinux(this.rootDir, file.relativePath)
        : file.relativePath;
      const newPath = ComponentMap.getPathWithoutRootDir(newRootDir, filePathRelativeToConsumer);
      if (this.mainFile === file.relativePath) this.mainFile = newPath;
      file.relativePath = newPath;
    });
    this.rootDir = newRootDir;
    this.trackDir = undefined; // if there is trackDir, it's not needed anymore.
  }

  addRootDirToDistributedFiles(rootDir: PathOsBased) {
    this.files.forEach((file) => {
      file.relativePath = file.name;
    });
    this.rootDir = pathNormalizeToLinux(rootDir);
    this.mainFile = path.basename(this.mainFile);
    this.validate();
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
    this.files.forEach((file) => {
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
    return this.files.map((file) => {
      return this.rootDir ? pathJoinLinux(this.rootDir, file.relativePath) : file.relativePath;
    });
  }

  getAllFilesPaths(): PathLinux[] {
    return this.files.map((file) => file.relativePath);
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
        this.trackDir = undefined;
        return;
      }
    }
  }

  /**
   * directory to track for changes (such as files added/renamed)
   */
  getTrackDir(): PathLinux | undefined {
    if (this.origin === COMPONENT_ORIGINS.AUTHORED) return this.rootDir || this.trackDir;
    if (this.origin === COMPONENT_ORIGINS.IMPORTED) {
      return this.wrapDir ? pathJoinLinux(this.rootDir, this.wrapDir) : this.rootDir;
    }
    // DO NOT track nested components!
    return undefined;
  }

  /**
   * this.rootDir is not defined for author. instead, the current workspace is the rootDir
   * also, for imported environments (compiler/tester) components the rootDir is empty
   */
  getRootDir(): PathLinuxRelative {
    return this.rootDir || '.';
  }

  hasRootDir(): boolean {
    return Boolean(this.rootDir && this.rootDir !== '.');
  }

  /**
   * directory of the component (root / track)
   * for legacy (bit.json) workspace, it can be undefined for authored when individual files were added
   */
  getComponentDir(): PathLinux | undefined {
    if (this.origin === COMPONENT_ORIGINS.AUTHORED) return this.rootDir || this.trackDir;
    return this.rootDir;
  }

  doesAuthorHaveRootDir(): boolean {
    return Boolean(this.origin === COMPONENT_ORIGINS.AUTHORED && this.rootDir);
  }

  /**
   * this.id.version should indicate the currently used version, regardless of the lane.
   * on the filesystem, id.version is saved according to the master, so it needs to be changed.
   * @param currentRemote
   * @param currentLaneIds
   */
  updatePerLane(currentRemote?: RemoteLaneId | null, currentLaneIds?: BitIds | null) {
    this.isAvailableOnCurrentLane = undefined;
    const replaceVersion = (version) => {
      this.defaultVersion = this.id.version;
      this.id = this.id.changeVersion(version);
      this.isAvailableOnCurrentLane = true;
    };
    const localBitId = currentLaneIds ? currentLaneIds.searchWithoutVersion(this.id) : null;
    if (localBitId) {
      replaceVersion(localBitId.version);
    } else if (currentRemote) {
      const remoteExist = this.lanes.find((lane) => lane.remoteLane.isEqual(currentRemote));
      if (remoteExist) {
        replaceVersion(remoteExist.version);
      }
    }
    if (typeof this.isAvailableOnCurrentLane === 'undefined') {
      // either, it's the default lane. or, it's a lane and the component is not part of the lane
      this.isAvailableOnCurrentLane = !this.onLanesOnly;
    }
  }

  addLane(remoteLaneId: RemoteLaneId, version: string) {
    const existing = this.lanes.find((l) => l.remoteLane.isEqual(remoteLaneId));
    if (existing) existing.version = version;
    this.lanes.push({ remoteLane: remoteLaneId, version });
  }

  /**
   * in case new files were created in the track-dir directory, add them to the component-map
   * so then they'll be tracked by bitmap.
   * this doesn't get called on Harmony, it's for legacy only.
   */
  async trackDirectoryChanges(consumer: Consumer, id: BitId): Promise<void> {
    const trackDir = this.getTrackDir();
    if (!trackDir) {
      return;
    }
    const trackDirAbsolute = path.join(consumer.getPath(), trackDir);
    const trackDirRelative = path.relative(process.cwd(), trackDirAbsolute);
    if (!fs.existsSync(trackDirAbsolute)) throw new ComponentNotFoundInPath(trackDirRelative);
    const lastTrack = await consumer.componentFsCache.getLastTrackTimestamp(id.toString());
    const wasModifiedAfterLastTrack = async () => {
      const lastModified = await getLastModifiedDirTimestampMs(trackDirAbsolute);
      return lastModified > lastTrack;
    };
    if (!(await wasModifiedAfterLastTrack())) {
      return;
    }
    const addParams = {
      componentPaths: [trackDirRelative || '.'],
      id: id.toString(),
      override: false, // this makes sure to not override existing files of componentMap
      trackDirFeature: true,
      origin: this.origin,
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
    this.recentlyTracked = true;
  }

  /**
   * if the component dir has changed since the last tracking, re-scan the component-dir to get the
   * updated list of the files
   */
  async trackDirectoryChangesHarmony(consumer: Consumer, id: BitId): Promise<void> {
    const trackDir = this.rootDir;
    if (!trackDir) {
      return;
    }
    const trackDirAbsolute = path.join(consumer.getPath(), trackDir);
    const lastTrack = await consumer.componentFsCache.getLastTrackTimestamp(id.toString());
    const wasModifiedAfterLastTrack = async () => {
      const lastModified = await getLastModifiedDirTimestampMs(trackDirAbsolute);
      return lastModified > lastTrack;
    };
    if (!(await wasModifiedAfterLastTrack())) {
      return;
    }
    const gitIgnore = getGitIgnoreHarmony(consumer.getPath());
    this.files = await getFilesByDir(trackDir, consumer.getPath(), gitIgnore);
  }

  updateNextVersion(nextVersion: NextVersion) {
    this.nextVersion = nextVersion;
    this.validate();
  }

  clearNextVersion() {
    delete this.nextVersion;
  }

  removeFiles(files: ComponentMapFile[]): void {
    const relativePaths = files.map((file) => file.relativePath);
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
    if (this.trackDir && this.origin !== COMPONENT_ORIGINS.AUTHORED) {
      throw new ValidationError(`${errorMessage} trackDir attribute should be set for AUTHORED component only`);
    }
    // commented out because when importing a legacy component into Harmony it may have originallySharedDir
    // and on Harmony all components are Authored.
    // if (this.originallySharedDir && this.origin === COMPONENT_ORIGINS.AUTHORED) {
    //   throw new ValidationError(
    //     `${errorMessage} originallySharedDir attribute should be set for non AUTHORED components only`
    //   );
    // }
    if (this.nextVersion && !this.nextVersion.version) {
      throw new ValidationError(`${errorMessage} version attribute should be set when nextVersion prop is set`);
    }

    if (!this.files || !this.files.length) throw new ValidationError(`${errorMessage} files list is missing`);
    this.files.forEach((file) => {
      if (!isValidPath(file.relativePath)) {
        throw new ValidationError(`${errorMessage} file path ${file.relativePath} is invalid`);
      }
    });
    const foundMainFile = this.files.find((file) => file.relativePath === this.mainFile);
    if (!foundMainFile || R.isEmpty(foundMainFile)) {
      throw new ValidationError(`${errorMessage} mainFile ${this.mainFile} is not in the files list.
if you renamed the mainFile, please re-add the component with the "--main" flag pointing to the correct main-file`);
    }
    const filesPaths = this.files.map((file) => file.relativePath);
    const duplicateFiles = filesPaths.filter(
      (file) => filesPaths.filter((f) => file.toLowerCase() === f.toLowerCase()).length > 1
    );
    if (duplicateFiles.length) {
      throw new ValidationError(`${errorMessage} the following files are duplicated ${duplicateFiles.join(', ')}`);
    }
    if (this.trackDir) {
      const trackDir = this.trackDir;
      this.files.forEach((file) => {
        if (!file.relativePath.startsWith(trackDir)) {
          throw new ValidationError(
            `${errorMessage} a file path ${file.relativePath} is not in the trackDir ${trackDir}`
          );
        }
      });
    }
  }
}
