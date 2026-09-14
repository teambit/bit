import * as path from 'path';
import globby from 'globby';
import ignore from 'ignore';
import { pickBy, isNil, sortBy, isEmpty } from 'lodash';
import type { ComponentID } from '@teambit/component-id';
import {
  BIT_HIDDEN_DIR,
  BIT_MAP,
  BIT_WORKSPACE_TMP_DIRNAME,
  DOT_GIT_DIR,
  Extensions,
  OLD_BIT_MAP,
  IGNORE_ROOT_ONLY_LIST,
  ALWAYS_IGNORE_LIST,
  IGNORE_LIST,
  GIT_IGNORE,
} from '@teambit/legacy.constants';
import { ValidationError } from '@teambit/legacy.cli.error';
import { logger } from '@teambit/legacy.logger';
import { isValidPath } from '@teambit/legacy.utils';
import {
  retrieveUserIgnoreList,
  BIT_IGNORE,
  getBitIgnoreFile,
  getGitIgnoreFile,
} from '@teambit/git.modules.ignore-file-reader';
import type { PathLinux, PathLinuxRelative, PathOsBasedRelative } from '@teambit/toolbox.path.path';
import { pathJoinLinux, pathNormalizeToLinux, pathRelativeLinux } from '@teambit/toolbox.path.path';
import { removeInternalConfigFields } from '@teambit/legacy.extension-data';
import OutsideRootDir from './exceptions/outside-root-dir';
import { IgnoredDirectory, ComponentNotFoundInPath } from '@teambit/legacy.consumer-component';

export type Config = { [aspectId: string]: Record<string, any> | '-' };

/**
 * rootDir of a component that owns the workspace root. such a component holds the files that no
 * other component claims - e.g. the workspace config, CI config, README and license files.
 * it is the only rootDir allowed to contain other components' root-dirs.
 */
export const WORKSPACE_ROOT_DIR = '.';

/**
 * `.bitmap` is the live map of the workspace. the workspace-root component versions it, so a git-free
 * workspace can be restored from the scope, but no operation may write or delete the one on disk
 * from a versioned copy: writing it into a sub-directory (importing a workspace-root component into
 * another workspace) creates a broken nested workspace there, and writing or deleting it at the root
 * clobbers the map the running command is mutating. the rest of the component's files are handled
 * normally.
 */
export function isWorkspaceMapFile(relativePath: PathLinux): boolean {
  return relativePath === BIT_MAP;
}

/**
 * excluded from every directory scan, before the ignore files are consulted.
 * node_modules is filtered by the ignore list later on anyway, but enumerating it first hurts
 * performance dramatically. the rest are git's and bit's own internals: `.bit` (the local object
 * store), `.git` and `.bitTmp` are outputs of versioning, not sources, `.bit.map.json` is the legacy
 * location of the map itself, and `.git` is also a file in git worktrees and submodules (a pointer to
 * the real git dir). they are matched at any depth: the workspace-root component scans the whole
 * workspace, and a nested repository or bit workspace that no component claims must not hand its
 * metadata to it.
 *
 * note that `.bitmap` is deliberately NOT here. it is the map of the workspace and a git-free
 * workspace has to be able to restore it, so the root component tracks it like any other file.
 */
const SCAN_IGNORE_LIST = [
  '**/node_modules/**',
  `**/${BIT_HIDDEN_DIR}/**`,
  `**/${DOT_GIT_DIR}`,
  `**/${DOT_GIT_DIR}/**`,
  `**/${BIT_WORKSPACE_TMP_DIRNAME}/**`,
  `**/${OLD_BIT_MAP}`,
];

/**
 * a bit workspace nested in the scanned tree that no component claims must not hand its map to the
 * workspace-root component: restored, it would turn that directory into a broken workspace (a map
 * without its scope). only the root's own map is tracked, see isWorkspaceMapFile - a map at any
 * other component's root is never tracked either, so what a component versions is what a write
 * lands, the live map excepted.
 */
const NESTED_WORKSPACE_MAP = `*/**/${BIT_MAP}`;

/**
 * the ignore patterns for scanning a directory. `excludeDirs` are the root-dirs of the components
 * nested inside it, whose files belong to them. they are literal paths, so their glob metacharacters
 * are escaped: a Next.js route dir like "app/[slug]" is a valid root-dir, and read as a pattern it
 * would exclude the wrong directories (`app/l`) rather than itself.
 *
 * shared with `bit add`, so its initial file-set is built from the same exclusions the rescan uses -
 * otherwise the two disagree about what the workspace-root component owns.
 */
export function getScanIgnorePatterns(dir: PathLinux, excludeDirs: PathLinux[] = []): string[] {
  return [
    ...SCAN_IGNORE_LIST,
    dir === WORKSPACE_ROOT_DIR ? NESTED_WORKSPACE_MAP : `${escapeGlobPath(dir)}/${BIT_MAP}`,
    ...excludeDirs.map((excludeDir) => `${escapeGlobPath(excludeDir)}/**`),
  ];
}

/**
 * applies the workspace ignore rules (`gitIgnore`) to the scanned paths. git applies each .gitignore to
 * the directory it sits in, so the scan of the workspace root - the one scan that spans directories no
 * component claims - honors the ignore files below the root as well, evaluated together with the
 * root's in git's precedence order: a nested pattern comes after the root's, so its negation
 * re-includes a file the root excluded. only ignore files that are not themselves ignored are
 * consulted, since git does not descend into an ignored directory. nested patterns are rebased to
 * their directory: a pattern with no slash before its end matches at any depth below it (`build/`
 * becomes `docs/**\/build/`), any other is anchored to it (`/local.env` becomes `docs/local.env`).
 * a .bitignore beside a .gitignore wins, as at the root. nested components are subtracted before
 * this runs, so their ignore files are theirs to apply. the rules bit owns (`.env`, node_modules, and
 * the generated files unless `trackAllFiles`) are applied last, on their own, so no negation
 * re-includes them.
 */
export async function filterByIgnoreFiles(
  dir: PathLinux,
  consumerPath: string,
  gitIgnore: any,
  relativePaths: PathLinux[],
  trackAllFiles = false
): Promise<PathLinux[]> {
  const filteredByRoot: PathLinux[] = gitIgnore.filter(relativePaths);
  if (dir !== WORKSPACE_ROOT_DIR) return filteredByRoot;
  const nestedPatterns = await getNestedIgnorePatterns(consumerPath, gitIgnore, relativePaths);
  if (!nestedPatterns.length) return filteredByRoot;
  const filteredByUserRules: PathLinux[] = ignore().add(gitIgnore).add(nestedPatterns).filter(relativePaths);
  return ignore()
    .add(trackAllFiles ? ALWAYS_IGNORE_LIST : IGNORE_LIST)
    .filter(filteredByUserRules);
}

/**
 * the component's own ignore file (.bitignore, else .gitignore, at its root), applied to its files.
 * resolved against the workspace, not the process cwd: `dir` is workspace-relative, so running bit
 * from a sub-directory would otherwise look in the wrong place - and getBitIgnoreFile() does not
 * swallow ENOENT. not for the workspace root: its own file is the workspace's, part of `gitIgnore`
 * and evaluated together with the nested ones - applied again on its own it would undo their negations.
 */
export async function filterByOwnIgnoreFile(
  dir: PathLinux,
  consumerPath: string,
  relativePaths: PathLinux[]
): Promise<PathLinux[]> {
  if (dir === WORKSPACE_ROOT_DIR) return relativePaths;
  const ignoreFileDir = path.join(consumerPath, dir);
  const ownIgnoreFile = relativePaths.includes(BIT_IGNORE)
    ? await getBitIgnoreFile(ignoreFileDir)
    : await getGitIgnoreFile(ignoreFileDir);
  return ownIgnoreFile.length ? ignore().add(ownIgnoreFile).filter(relativePaths) : relativePaths;
}

async function getNestedIgnorePatterns(
  consumerPath: string,
  gitIgnore: any,
  relativePaths: PathLinux[]
): Promise<string[]> {
  const ignoreFileByDir = new Map<PathLinux, string>();
  relativePaths.forEach((relativePath) => {
    const name = path.basename(relativePath);
    if (name !== GIT_IGNORE && name !== BIT_IGNORE) return;
    const fileDir = path.dirname(relativePath);
    if (fileDir === '.') return; // the root's own ignore file is in the workspace ignore list already
    // an ignore file applies even when it is ignored itself, as long as its directory is scanned:
    // git does not descend into an ignored directory
    if (gitIgnore.ignores(`${fileDir}/`)) return;
    if (name === BIT_IGNORE || !ignoreFileByDir.has(fileDir)) ignoreFileByDir.set(fileDir, name);
  });
  if (!ignoreFileByDir.size) return [];
  const patternsPerDir = await Promise.all(
    Array.from(ignoreFileByDir, async ([fileDir, name]) => {
      const absoluteDir = path.join(consumerPath, fileDir);
      const patterns = name === BIT_IGNORE ? await getBitIgnoreFile(absoluteDir) : await getGitIgnoreFile(absoluteDir);
      return patterns.map((pattern) => rebaseIgnorePattern(pattern, fileDir));
    })
  );
  return ([] as string[]).concat(...patternsPerDir);
}

function rebaseIgnorePattern(pattern: string, dir: PathLinux): string {
  const negated = pattern.startsWith('!');
  const body = negated ? pattern.slice(1) : pattern;
  const anchored = body.slice(0, -1).includes('/');
  // a trailing slash means "directories only". the join drops it, so it is put back.
  const dirOnly = body.endsWith('/') ? '/' : '';
  const base = anchored ? pathJoinLinux(dir, body.replace(/^\//, '')) : pathJoinLinux(dir, '**', body);
  const rebased = base + dirOnly;
  return negated ? `!${rebased}` : rebased;
}

/** backslash-escapes the characters that globby and glob read as pattern syntax */
function escapeGlobPath(literalPath: PathLinux): string {
  return literalPath.replace(/[*?[\]{}()!@+|]/g, '\\$&');
}

export type ComponentMapFile = {
  relativePath: PathLinux;
  /**
   * @deprecated should be safe to remove around August 2025
   * you can easily get it by running `path.basename(relativePath)`
   */
  name?: string;
  /**
   * @deprecated should be safe to remove around August 2025
   */
  test?: boolean;
};

export type NextVersion = {
  version: 'patch' | 'minor' | 'major' | 'prerelease' | string;
  preRelease?: string;
  message?: string;
  username?: string;
  email?: string;
};

export type ComponentMapData = {
  id: ComponentID;
  files: ComponentMapFile[];
  defaultScope?: string;
  mainFile: PathLinux;
  rootDir: PathLinux;
  wrapDir?: PathLinux;
  exported?: boolean;
  onLanesOnly?: boolean;
  localOnly?: boolean;
  isAvailableOnCurrentLane?: boolean;
  nextVersion?: NextVersion;
  config?: Config;
};

export type PathChange = { from: PathLinux; to: PathLinux };

export class ComponentMap {
  id: ComponentID;
  files: ComponentMapFile[];
  defaultScope?: string;
  mainFile: PathLinux;
  rootDir: PathLinux;
  wrapDir: PathLinux | undefined; // a wrapper directory needed when a user adds a package.json file to the component root so then it won't collide with Bit generated one
  // wether the compiler / tester are detached from the workspace global configuration
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  markBitMapChangedCb: Function;
  exported: boolean | null | undefined; // relevant for authored components only, it helps finding out whether a component has a scope
  isAvailableOnCurrentLane? = true; // if a component was created on another lane, it might not be available on the current lane
  /**
   * @deprecated here for forward compatibility.
   * used to determine whether a component is available only on lanes and not on main
   * schema 15 used this prop, and if it was false/undefined, it assumed the component is available regardless of `isAvailableOnCurrentLane`.
   * schema 16 is not using this prop anymore.
   * this is still here for projects that loaded .bitmap with schema 16 and then downgraded bit to a version with schema 15.
   */
  onLanesOnly? = false;
  localOnly?: boolean; // whether the component is local only and should not be snapped/tagged/exported
  nextVersion?: NextVersion; // for soft-tag (harmony only), this data is used in the CI to persist
  recentlyTracked?: boolean; // eventually the timestamp is saved in the filesystem cache so it won't be re-tracked if not changed
  name: string; // name of the component (including namespace)
  scope?: string | null; // empty string if new/staged. (undefined if legacy).
  version?: string; // empty string if new. (undefined if legacy).
  noFilesError?: Error; // set if during finding the files an error was found
  config?: { [aspectId: string]: Record<string, any> | '-' };
  constructor({
    id,
    files,
    defaultScope,
    mainFile,
    rootDir,
    wrapDir,
    onLanesOnly,
    localOnly,
    isAvailableOnCurrentLane,
    nextVersion,
    config,
  }: ComponentMapData) {
    this.id = id;
    this.files = files;
    this.defaultScope = defaultScope;
    this.mainFile = mainFile;
    this.rootDir = rootDir;
    this.wrapDir = wrapDir;
    this.onLanesOnly = onLanesOnly;
    this.localOnly = localOnly;
    this.isAvailableOnCurrentLane = typeof isAvailableOnCurrentLane === 'undefined' ? true : isAvailableOnCurrentLane;
    this.nextVersion = nextVersion;
    this.config = config;
  }

  static fromJson(componentMapObj: ComponentMapData): ComponentMap {
    return new ComponentMap(componentMapObj);
  }

  toPlainObject(): Record<string, any> {
    let res: Record<string, any> = {
      name: this.name,
      scope: this.scope,
      version: this.version,
      files: null,
      defaultScope: this.defaultScope,
      mainFile: this.mainFile,
      rootDir: this.rootDir,
      wrapDir: this.wrapDir,
      exported: this.exported,
      onLanesOnly: this.onLanesOnly || null, // if false, change to null so it won't be written
      isAvailableOnCurrentLane: this.isAvailableOnCurrentLane,
      nextVersion: this.nextVersion,
      localOnly: this.localOnly || null, // if false, change to null so it won't be written
      config: this.configToObject(),
    };

    res = pickBy(res, (value) => !isNil(value));
    return res;
  }

  configToObject() {
    if (!this.config) return undefined;
    const config = {};
    Object.keys(this.config).forEach((aspectId) => {
      config[aspectId] = removeInternalConfigFields(this.config?.[aspectId]);
    });
    return config;
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

  getComponentDir(): PathLinux {
    return this.rootDir;
  }

  doesAuthorHaveRootDir(): boolean {
    return Boolean(this.rootDir);
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

  isRemoved() {
    const removeAspectConf = this.config?.[Extensions.remove];
    if (!removeAspectConf) return false;
    return removeAspectConf !== '-' && removeAspectConf.removed;
  }
  isRecovered() {
    const removeAspectConf = this.config?.[Extensions.remove];
    if (!removeAspectConf) return false;
    return removeAspectConf !== '-' && removeAspectConf.removed === false;
  }
  isDeprecated() {
    const deprecationConf = this.config?.[Extensions.deprecation];
    if (!deprecationConf) return false;
    return deprecationConf !== '-' && deprecationConf.deprecate;
  }
  isUndeprecated() {
    const deprecationConf = this.config?.[Extensions.deprecation];
    if (!deprecationConf) return false;
    return deprecationConf !== '-' && deprecationConf.deprecate === false;
  }
  /**
   * a range-deprecation is stored with `deprecate: false` (only specific versions are deprecated),
   * so it's not isDeprecated(), yet it still needs clearing on undeprecate. detect it explicitly.
   */
  isDeprecatedByRange() {
    const deprecationConf = this.config?.[Extensions.deprecation];
    if (!deprecationConf || deprecationConf === '-') return false;
    return Boolean(deprecationConf.range);
  }
  isInternal() {
    const internalizeConf = this.config?.[Extensions.internalize];
    if (!internalizeConf) return false;
    return internalizeConf !== '-' && internalizeConf.internal;
  }
  isUninternalized() {
    const internalizeConf = this.config?.[Extensions.internalize];
    if (!internalizeConf) return false;
    return internalizeConf !== '-' && internalizeConf.internal === false;
  }

  sort() {
    this.files = sortBy(this.files, 'relativePath');
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
    // "." is valid - it marks the component that owns the workspace root. see WORKSPACE_ROOT_DIR.
    if (this.rootDir && this.rootDir !== WORKSPACE_ROOT_DIR && !isValidPath(this.rootDir)) {
      throw new ValidationError(`${errorMessage} rootDir attribute ${this.rootDir} is invalid`);
    }
    if (this.nextVersion && !this.nextVersion.version) {
      throw new ValidationError(`${errorMessage} version attribute should be set when nextVersion prop is set`);
    }
    if (this.isRemoved()) {
      // the following validation are related to the files, which don't exist in case of soft-remove
      return;
    }

    if (!this.files || !this.files.length) throw new ValidationError(`${errorMessage} files list is missing`);
    this.files.forEach((file) => {
      if (!isValidPath(file.relativePath)) {
        throw new ValidationError(`${errorMessage} file path ${file.relativePath} is invalid`);
      }
    });
    const foundMainFile = this.files.find((file) => file.relativePath === this.mainFile);
    if (!foundMainFile || isEmpty(foundMainFile)) {
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
  }
}

/**
 * scan a component's root-dir for its files.
 *
 * `excludeDirs` holds the root-dirs of components nested inside `dir`. their files belong to the
 * nested component, not to this one. this is what makes a workspace-root component (rootDir ".")
 * possible: it owns every file that no other component claims.
 */
export async function getFilesByDir(
  dir: string,
  consumerPath: string,
  gitIgnore: any,
  excludeDirs: PathLinux[] = [],
  trackAllFiles = false
): Promise<ComponentMapFile[]> {
  const matches = await globby(pathJoinLinux(dir, '**'), {
    cwd: consumerPath,
    dot: true,
    onlyFiles: true,
    ignore: getScanIgnorePatterns(dir, excludeDirs),
    // the workspace root is the one scan that spans the whole tree, where a symbolic link the user made
    // may lead anywhere. what it points to is not the workspace's source, so the link is not followed -
    // the add-time scan does not follow links either.
    followSymbolicLinks: dir !== WORKSPACE_ROOT_DIR,
    // every pattern here is an explicit glob. with expansion on, globby stats each ignore pattern
    // (relative to the process cwd, not to `cwd`) to decide whether to expand it, and `.git/**`
    // throws ENOTDIR wherever `.git` is a file - every git worktree.
    expandDirectories: false,
  });
  if (!matches.length) throw new ComponentNotFoundInPath(dir);
  const filteredMatches: string[] = await filterByIgnoreFiles(dir, consumerPath, gitIgnore, matches, trackAllFiles);
  // the paths are relative to the workspace. make them relative to the component's root-dir.
  const relativePathsLinux = filteredMatches.map((match) => pathRelativeLinux(dir, match));
  // the config files "bit ws-config write" generates are not source - unless the workspace declares that
  // every file is (trackAllFiles). in a repo adopted from an existing monorepo, the user wrote them.
  const filteredByIgnoredFromRoot = trackAllFiles
    ? relativePathsLinux
    : relativePathsLinux.filter((match) => !IGNORE_ROOT_ONLY_LIST.includes(match));
  const filteredByBitIgnore = await filterByOwnIgnoreFile(dir, consumerPath, filteredByIgnoredFromRoot);
  if (!filteredByBitIgnore.length) throw new IgnoredDirectory(dir);
  return filteredByBitIgnore.map((relativePath) => ({
    relativePath,
    test: false,
    name: path.basename(relativePath),
  }));
}

export async function getGitIgnoreHarmony(
  consumerPath: string,
  additionalPatterns?: string[],
  trackAllFiles = false
): Promise<any> {
  const ignoreList = await getIgnoreListHarmony(consumerPath, additionalPatterns, trackAllFiles);
  return ignore().add(ignoreList);
}

/**
 * the patterns git ignores, plus the files bit owns. with `trackAllFiles` the workspace declares that
 * bit owns nothing: package.json and the lockfiles are the user's source, so only the git-ignored
 * files and the hard exclusions (node_modules, .env and friends) are left out.
 */
export async function getIgnoreListHarmony(
  consumerPath: string,
  additionalPatterns?: string[],
  trackAllFiles = false
): Promise<string[]> {
  const userIgnoreList = await retrieveUserIgnoreList(consumerPath);
  // with trackAllFiles the workspace declares that bit generates nothing: package.json and the
  // lockfiles are the user's source. what the user ignores stays ignored either way.
  const ignoreList = [...userIgnoreList, ...(trackAllFiles ? ALWAYS_IGNORE_LIST : IGNORE_LIST)];
  if (additionalPatterns?.length) {
    ignoreList.push(...additionalPatterns);
  }
  return ignoreList;
}
