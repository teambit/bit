import path from 'path';
import type { Stats } from 'fs-extra';
import fs from 'fs-extra';
import { BitError } from '@teambit/bit-error';
import type { ComponentID } from '@teambit/component-id';
import type { Harmony } from '@teambit/harmony';
import { HostInitializerMain } from '@teambit/host-initializer';
import type { ImporterMain } from '@teambit/importer';
import { ImporterAspect } from '@teambit/importer';
import type { InstallMain } from '@teambit/install';
import { InstallAspect } from '@teambit/install';
import { LaneId } from '@teambit/lane-id';
import type { VersionedBitmapEntry } from '@teambit/legacy.bit-map';
import { isWorkspaceMapFile, readVersionedBitmapEntries, WORKSPACE_ROOT_DIR } from '@teambit/legacy.bit-map';
import { BIT_HIDDEN_DIR, BIT_WORKSPACE_TMP_DIRNAME, DOT_GIT_DIR } from '@teambit/legacy.constants';
import { pathNormalizeToLinux } from '@teambit/legacy.utils';
import type { ScopeMain } from '@teambit/scope';
import { ScopeAspect } from '@teambit/scope';
import { Remote } from '@teambit/scope.remotes';
import type { Workspace } from '@teambit/workspace';
import { WorkspaceAspect } from '@teambit/workspace';
import { getWorkspaceInfo } from '@teambit/workspace.modules.workspace-locator';
import { isWorkspaceRootComponent } from './workspace-root-data';

export type LoadBit = (workspacePath?: string) => Promise<Harmony>;

export type CloneOptions = {
  /**
   * clone the workspace as it is on this lane, "scope/name". the workspace comes out on the lane,
   * and the components at their heads there; a component the lane does not have comes from main.
   */
  lane?: string;
  /**
   * url of the scope hosting the components, for a scope that is neither on bit.cloud nor in the
   * global remotes. it is registered in the new workspace.
   */
  remote?: string;
  skipDependencyInstallation?: boolean;
};

export type CloneResult = {
  /** the root, at the version the workspace was made from */
  rootId: ComponentID;
  workspacePath: string;
  /** the components the root lists, at the versions they were written with */
  components: ComponentID[];
  /**
   * components the root lists that their remote does not have - never exported, or exported to
   * another scope - so the clone is without them.
   */
  missing: string[];
  laneId?: LaneId;
  /** the clone is complete without the install; the user re-runs it in the workspace */
  installationError?: Error;
};

/**
 * runs against the new workspace, so it works on the aspects loaded for it rather than on the ones
 * of the process, which loaded without a workspace.
 */
class WorkspaceCloner {
  private workspace: Workspace;
  private importer: ImporterMain;
  private scope: ScopeMain;
  private install: InstallMain;

  constructor(
    harmony: Harmony,
    private workspacePath: string
  ) {
    this.workspace = harmony.get<Workspace>(WorkspaceAspect.id);
    this.importer = harmony.get<ImporterMain>(ImporterAspect.id);
    this.scope = harmony.get<ScopeMain>(ScopeAspect.id);
    this.install = harmony.get<InstallMain>(InstallAspect.id);
  }

  async clone(rootId: ComponentID, options: CloneOptions): Promise<CloneResult> {
    if (options.remote) await this.addRemote(options.remote);
    const laneId = options.lane ? await this.switchToLane(options.lane) : undefined;
    const { versionedRootId, entries } = await this.fetchRoot(rootId);
    await this.writeRoot(versionedRootId);
    const { components, missing } = await this.writeMembers(entries);
    const installationError = options.skipDependencyInstallation ? undefined : await this.installGracefully();
    return {
      rootId: versionedRootId,
      workspacePath: this.workspacePath,
      components,
      missing,
      laneId,
      installationError,
    };
  }

  private async addRemote(url: string) {
    const remote = new Remote(url);
    remote.name = (await remote.scope()).name;
    const scopeJson = this.scope.legacyScope.scopeJson;
    scopeJson.addRemote(remote);
    await scopeJson.write();
  }

  /**
   * the workspace comes out on the lane with nothing written, the way a lane switch leaves it when it
   * has nothing to check out (see LaneSwitcher.saveLanesData): the lane and the objects of its
   * components are fetched, the lane is tracked and made current. the imports that follow take the
   * lane heads because the workspace is on it.
   */
  private async switchToLane(lane: string): Promise<LaneId> {
    if (!lane.includes('/')) {
      throw new BitError(
        `unable to clone from lane "${lane}", the lane must be given with its scope, e.g. "my-org.my-scope/${lane}"`
      );
    }
    const laneId = LaneId.parse(lane);
    const remoteLane = await this.importer.importLaneObject(laneId);
    await this.importer.fetchLaneComponents(remoteLane);
    const consumer = this.workspace.consumer;
    consumer.scope.lanes.trackLane({ localLane: laneId.name, remoteLane: laneId.name, remoteScope: laneId.scope });
    consumer.setCurrentLane(laneId, true);
    consumer.scope.objects.clearObjectsFromCache();
    await consumer.writeBitMap('clone');
    return laneId;
  }

  /**
   * brings the root's objects, settles its version - the one asked for, or its head on the lane or on
   * main - and reads the components it lists from its versioned `.bitmap`.
   */
  private async fetchRoot(
    rootId: ComponentID
  ): Promise<{ versionedRootId: ComponentID; entries: VersionedBitmapEntry[] }> {
    const { importedIds, missingIds } = await this.importer.import({
      ids: [rootId.toString()],
      objectsOnly: true,
      installNpmPackages: false,
      writeConfigFiles: false,
    });
    const versionedRootId = importedIds.find((id) => id.isEqualWithoutVersion(rootId));
    if (!versionedRootId) {
      // the importer reports a component the remote does not have rather than throwing
      if (missingIds?.length) {
        throw new BitError(
          `unable to clone, the remote scope "${rootId.scope}" does not have "${rootId.toString()}". a workspace is cloned from an exported workspace-root component, run "bit export" in its workspace first`
        );
      }
      throw new BitError(`unable to clone, "${rootId.toString()}" was not imported`);
    }
    const rootComponent = await this.scope.legacyScope.getConsumerComponent(versionedRootId);
    if (!isWorkspaceRootComponent(rootComponent.extensions)) {
      throw new BitError(
        `unable to clone "${versionedRootId.toString()}", it is not a workspace-root component. a workspace is cloned from the component tracked at its root, run "bit add ." there to create one`
      );
    }
    const bitmapFile = rootComponent.files.find((file) => isWorkspaceMapFile(pathNormalizeToLinux(file.relative)));
    const entries = bitmapFile ? readVersionedBitmapEntries(bitmapFile.contents.toString()) : [];
    return { versionedRootId, entries };
  }

  /**
   * the root's own files, onto the workspace directory, as `bit import <id> --path <dir>` does. it
   * goes before the members: the guards of the root let the files `bit init` generated be replaced
   * only while the workspace is still empty of components.
   */
  private async writeRoot(versionedRootId: ComponentID) {
    const { importedIds } = await this.importer.import({
      ids: [versionedRootId.toString()],
      writeToPath: this.workspacePath,
      installNpmPackages: false,
      writeConfigFiles: false,
    });
    if (!importedIds.length) throw new BitError(`unable to clone, "${versionedRootId.toString()}" was not imported`);
  }

  /**
   * every component the root lists, in one import - each to the directory the root recorded for it.
   *
   * a component the remote does not have is reported rather than fetched: a root versioned before the
   * first export lists its members by their default scope, and a member may have stayed behind.
   */
  private async writeMembers(
    entries: VersionedBitmapEntry[]
  ): Promise<{ components: ComponentID[]; missing: string[] }> {
    const writeToPathPerId = resolveWriteToPathPerId(this.workspacePath, entries);
    throwForOverlappingDirs(writeToPathPerId);
    const ids = Object.keys(writeToPathPerId);
    if (!ids.length) return { components: [], missing: [] };
    const { importedIds, missingIds } = await this.importer.import({
      ids,
      writeToPathPerId,
      installNpmPackages: false,
      writeConfigFiles: false,
    });
    const components = importedIds.filter((id) => writeToPathPerId[id.toStringWithoutVersion()]);
    return { components, missing: missingIds || [] };
  }

  /**
   * the same install `bit import` runs once its components are written, compile included. a failure
   * does not undo the clone, the workspace is complete without it.
   */
  private async installGracefully(): Promise<Error | undefined> {
    try {
      await this.install.install(undefined, {
        dedupe: true,
        updateExisting: false,
        import: false,
        writeConfigFiles: true,
      });
      return undefined;
    } catch (err: any) {
      return err;
    }
  }
}

/**
 * makes a workspace out of a workspace-root component, the way `git clone` makes a working tree out of
 * a repository: a fresh workspace in an empty directory, the root's files at its root, every component
 * the root's `.bitmap` lists in the directory it records, then install. the versioned `.bitmap` has
 * no versions on purpose (see normalizeBitmapContentForVersioning), so the components come at their
 * heads - on main, or on the lane when one is given - and a root version pins the root files only.
 *
 * the directory must be empty or absent, and outside any workspace. there is no override: this is a
 * new workspace, not an import into one, so nothing at the target is the user's.
 */
export async function cloneWorkspace(
  rootId: ComponentID,
  dir: string | undefined,
  options: CloneOptions,
  loadBit: LoadBit
): Promise<CloneResult> {
  const workspacePath = await resolveThroughExistingAncestors(resolveClonePath(dir, rootId));
  await throwForWorkspaceAbove(workspacePath);
  // before anything is made: ensureDir below creates every missing level, not only the destination,
  // so this is the point a failure has to undo from
  const topmostCreated = await topmostAbsentDir(workspacePath);
  const createdDir = await ensureEmptyDir(workspacePath);
  const originalCwd = process.cwd();
  try {
    // the code paths below, from the workspace init to the install, take the workspace from the cwd.
    // inside the try, so that a directory made here is removed even when entering it is what failed
    process.chdir(workspacePath);
    // only workspace.jsonc, .bitmap and the scope dir. the root files come from the component, and
    // only what the component versions belongs at the root: no package.json, agent file or mcp config
    await HostInitializerMain.init(
      workspacePath,
      false,
      true,
      false,
      false,
      false,
      false,
      false,
      false,
      {},
      undefined,
      undefined,
      {
        skipDefaultMcp: true,
        skipAgentInstructions: true,
      }
    );
    const harmony = await loadBit(workspacePath);
    return await new WorkspaceCloner(harmony, workspacePath).clone(rootId, options);
  } catch (err) {
    // leave the directory before removing it, and leave nothing half-made behind: it was empty or
    // absent to begin with. removing the topmost level that was made here takes the ones below it
    // along, so "clone into new-parent/ws" does not leave an empty "new-parent" standing.
    process.chdir(originalCwd);
    if (createdDir) await fs.remove(topmostCreated || workspacePath);
    else await fs.emptyDir(workspacePath);
    throw err;
  } finally {
    // the clone itself runs with the new workspace as the cwd, its install included. the caller, which
    // may be a program that goes on to do other things, keeps the directory it was in.
    process.chdir(originalCwd);
  }
}

/**
 * the directories a component is never written into, at any depth: bit's own object store and temp
 * dir, git's, and the installed packages. they are the machinery of the workspace being made rather
 * than part of it, and the scan that builds a component's file-set skips them for the same reason
 * (see SCAN_IGNORE_LIST). a map that lists a member in one of them writes into the workings of the
 * clone - `.bit` holds the objects the clone is being read from.
 */
const RESERVED_DIRS = [BIT_HIDDEN_DIR, DOT_GIT_DIR, BIT_WORKSPACE_TMP_DIRNAME, 'node_modules'];

/**
 * the directory of a component the root lists, inside the workspace. the list comes from a remote,
 * so a root-dir that escapes the workspace - "../x", an absolute path - is refused, and so are the
 * workspace root itself, which only the root component owns, a directory bit or git keeps for
 * itself, and a missing root-dir, which no `.bitmap` of the current schema has.
 */
export function resolveComponentDir(workspacePath: string, entry: VersionedBitmapEntry): string {
  const { rootDir } = entry;
  // the absolute check goes before the resolve: an absolute path that happens to sit under this
  // workspace resolves to an ordinary relative one and would pass every check below, though it is
  // still a directory of the machine the root was snapped on rather than one of this workspace.
  // the type is checked, not assumed: the entry is parsed from a `.bitmap` that came from a remote, and
  // the parser asserts its shape without looking at the values. handing a number or an object to
  // path.isAbsolute would abort the clone with a node type error instead of the message below.
  const isUsable = typeof rootDir === 'string' && rootDir.length > 0 && !path.isAbsolute(rootDir);
  const target = isUsable ? path.resolve(workspacePath, rootDir) : undefined;
  const relative = target ? path.relative(workspacePath, target) : undefined;
  // a leading ".." is only a way out when it is the whole segment: a directory may be named "..cache"
  const climbsOut = relative === '..' || relative?.startsWith(`..${path.sep}`);
  const isReserved = relative?.split(path.sep).some((segment) => RESERVED_DIRS.includes(segment));
  if (!target || !relative || climbsOut || isReserved || path.isAbsolute(relative)) {
    throw new BitError(
      `unable to clone, the root component lists "${entry.id}" at "${entry.rootDir}", which is not a directory inside the workspace`
    );
  }
  return target;
}

/**
 * where each member the root lists is written to, by id.
 *
 * built through a Map rather than straight onto the object the importer takes, because an id read
 * out of a remote `.bitmap` is an arbitrary string: assigning one that reads `__proto__` runs the
 * inherited setter instead of creating an own property, and two entries can resolve to a single id
 * (the key and the name/scope fields are independent, see readVersionedBitmapEntries) so the later
 * one overwrites the earlier. either way that member leaves no trace here - it is absent from the
 * import request, and absent from the missing-members report too, since that reports what the remote
 * did not have. the clone comes out short of a component with nothing to say why, so a collision is
 * refused instead.
 */
export function resolveWriteToPathPerId(
  workspacePath: string,
  entries: VersionedBitmapEntry[]
): Record<string, string> {
  const dirPerId = new Map<string, string>();
  entries.forEach((entry) => {
    if (entry.rootDir === WORKSPACE_ROOT_DIR) return;
    if (dirPerId.has(entry.id)) {
      throw new BitError(`unable to clone, the root component lists "${entry.id}" more than once`);
    }
    dirPerId.set(entry.id, resolveComponentDir(workspacePath, entry));
  });
  // defines every key as an own property, `__proto__` included
  return Object.fromEntries(dirPerId);
}

/**
 * two members the root lists may not share a directory, nor sit one inside another. a `.bitmap` bit
 * wrote holds neither - it refuses a duplicate root-dir, and a component under another component's
 * directory - but this one came from a remote. left to the writer, a collision is relocated and then
 * moved back to the path each component was asked for, so the later one lands on the earlier one's
 * files and the clone comes out missing a component it reported as written.
 */
export function throwForOverlappingDirs(dirPerId: Record<string, string>): void {
  const idByDir = new Map<string, string>();
  const refuse = (id: string, otherId: string, dir: string) => {
    throw new BitError(
      `unable to clone, the root component lists "${id}" at "${dir}", which overlaps the directory it lists "${otherId}" at`
    );
  };
  Object.entries(dirPerId).forEach(([id, dir]) => {
    const taken = idByDir.get(dir);
    if (taken) refuse(id, taken, dir);
    idByDir.set(dir, id);
  });
  Object.entries(dirPerId).forEach(([id, dir]) => {
    // every level above it, so a component nested any number of levels inside another is caught
    for (let parent = path.dirname(dir); parent !== path.dirname(parent); parent = path.dirname(parent)) {
      const owner = idByDir.get(parent);
      if (owner) refuse(id, owner, dir);
    }
  });
}

/**
 * where the clone lands: the directory given, or one named after the component, as `git clone` names
 * the working tree after the repository. relative to the cwd, the clone runs outside a workspace.
 */
export function resolveClonePath(dir: string | undefined, rootId: ComponentID): string {
  return path.resolve(dir || rootId.name);
}

/**
 * the destination with the directories above it resolved through any symbolic link, and its own last
 * segment left as it is.
 *
 * a link above the target redirects everything that follows - the directory creation, the init, the
 * files, and the cleanup of a failed clone - while the lexical path says nothing about it, so the
 * workspace check would look in one place and the writes land in another, inside someone else's
 * workspace. the last segment is deliberately not resolved: a link *at* the destination is refused
 * rather than followed, which is ensureEmptyDir's rule.
 */
export async function resolveThroughExistingAncestors(dirPath: string): Promise<string> {
  const parent = path.dirname(dirPath);
  if (parent === dirPath) return dirPath;
  return path.join(await realpathOfNearestExisting(parent), path.basename(dirPath));
}

/**
 * the highest directory on the way to the destination that does not exist yet, or undefined when the
 * destination is already there. what a failed clone removes, so that the levels made on the way to it
 * go too rather than being left standing empty.
 */
export async function topmostAbsentDir(dirPath: string): Promise<string | undefined> {
  if (await fs.pathExists(dirPath)) return undefined;
  const parent = path.dirname(dirPath);
  if (parent === dirPath) return dirPath;
  return (await topmostAbsentDir(parent)) || dirPath;
}

/**
 * the deepest part of the path that exists, resolved, with the part that does not exist yet appended
 * as it is. the destination of a clone is normally absent, so there is nothing to resolve on it.
 */
async function realpathOfNearestExisting(dirPath: string): Promise<string> {
  const parent = path.dirname(dirPath);
  if (parent === dirPath) return dirPath;
  try {
    return await fs.realpath(dirPath);
  } catch (err: any) {
    if (err.code !== 'ENOENT') throw err;
    return path.join(await realpathOfNearestExisting(parent), path.basename(dirPath));
  }
}

/**
 * a clone makes its own workspace. the init below takes the nearest workspace at or above the target
 * instead of making one when there is a workspace above it, and the clone then writes its components
 * into that workspace's `.bitmap` - reporting success while leaving someone else's workspace holding
 * entries for a tree it does not own.
 */
async function throwForWorkspaceAbove(workspacePath: string): Promise<void> {
  const workspaceInfo = await getWorkspaceInfo(workspacePath);
  if (!workspaceInfo) return;
  throw new BitError(
    `unable to clone into "${workspacePath}", it is inside the workspace at "${workspaceInfo.path}".
a clone creates a workspace of its own, run it outside any workspace`
  );
}

/**
 * the workspace is written into this directory and a failed clone empties it again, so it has to be
 * the directory it appears to be: a symbolic link would put the workspace, and then the cleanup,
 * wherever it points. the same rule the writer applies to the files of a root (see
 * throwForSymlinksInTheWay).
 *
 * @returns whether the directory was created here, so a failed clone knows to remove it
 */
export async function ensureEmptyDir(dirPath: string): Promise<boolean> {
  const stat = await lstatIfExists(dirPath);
  if (!stat) {
    await fs.ensureDir(dirPath);
    return true;
  }
  if (stat.isSymbolicLink()) {
    throw new BitError(
      `unable to clone into "${dirPath}", it is a symbolic link and the workspace would be written through it`
    );
  }
  if (!stat.isDirectory()) throw new BitError(`unable to clone into "${dirPath}", it is not a directory`);
  const entries = await fs.readdir(dirPath);
  if (entries.length) throw new BitError(`unable to clone into "${dirPath}", the directory is not empty`);
  return false;
}

async function lstatIfExists(dirPath: string): Promise<Stats | undefined> {
  try {
    return await fs.lstat(dirPath);
  } catch (err: any) {
    if (err.code === 'ENOENT') return undefined;
    throw err;
  }
}
