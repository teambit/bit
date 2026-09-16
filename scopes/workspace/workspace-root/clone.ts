import path from 'path';
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
import { ComponentNotFound } from '@teambit/legacy.scope';
import { pathNormalizeToLinux } from '@teambit/legacy.utils';
import type { ScopeMain } from '@teambit/scope';
import { ScopeAspect } from '@teambit/scope';
import { Remote } from '@teambit/scope.remotes';
import type { Workspace } from '@teambit/workspace';
import { WorkspaceAspect } from '@teambit/workspace';
import { isWorkspaceRootComponent } from './workspace-root-data';

export type LoadBit = (path?: string) => Promise<Harmony>;

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
    await this.write(versionedRootId.toString(), this.workspacePath);
    const components: ComponentID[] = [];
    const missing: string[] = [];
    for (const entry of entries) {
      if (entry.rootDir === WORKSPACE_ROOT_DIR) continue;
      const written = await this.write(entry.id, resolveComponentDir(this.workspacePath, entry));
      if (written) components.push(written);
      else missing.push(entry.id);
    }
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
   * as `bit import <id> --path <dir>` does. one import per component, the path is the batch's.
   *
   * @returns undefined when the remote does not have the component. a root versioned before the first
   * export lists its members by their default scope, and a member may have stayed behind.
   */
  private async write(id: string, dir: string): Promise<ComponentID | undefined> {
    let importedIds: ComponentID[];
    let missingIds: string[] | undefined;
    try {
      ({ importedIds, missingIds } = await this.importer.import({
        ids: [id],
        writeToPath: dir,
        installNpmPackages: false,
        writeConfigFiles: false,
      }));
    } catch (err: any) {
      if (err instanceof ComponentNotFound) return undefined;
      throw err;
    }
    const imported = importedIds[0];
    if (imported) return imported;
    if (missingIds?.length) return undefined;
    throw new BitError(`unable to clone, "${id}" was not imported`);
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
 * the directory must be empty or absent. there is no override: this is a new workspace, not an
 * import into one, so nothing at the target is the user's.
 */
export async function cloneWorkspace(
  rootId: ComponentID,
  dir: string | undefined,
  options: CloneOptions,
  loadBit: LoadBit
): Promise<CloneResult> {
  const workspacePath = path.resolve(dir || rootId.name);
  const createdDir = await ensureEmptyDir(workspacePath);
  // the code paths below, from the workspace init to the install, take the workspace from the cwd
  const originalCwd = process.cwd();
  process.chdir(workspacePath);
  try {
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
    // the caller is left where it was, and nothing half-made is left behind: the directory was empty
    // or absent to begin with
    process.chdir(originalCwd);
    if (createdDir) await fs.remove(workspacePath);
    else await fs.emptyDir(workspacePath);
    throw err;
  }
}

/**
 * the directory of a component the root lists, inside the workspace. the list comes from a remote,
 * so a root-dir that escapes the workspace - "../x", an absolute path - is refused, and so are the
 * workspace root itself, which only the root component owns, and a missing root-dir, which no
 * `.bitmap` of the current schema has.
 */
export function resolveComponentDir(workspacePath: string, entry: VersionedBitmapEntry): string {
  const target = entry.rootDir ? path.resolve(workspacePath, entry.rootDir) : undefined;
  const relative = target ? path.relative(workspacePath, target) : undefined;
  if (!target || !relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new BitError(
      `unable to clone, the root component lists "${entry.id}" at "${entry.rootDir}", which is not a directory inside the workspace`
    );
  }
  return target;
}

/**
 * @returns whether the directory was created here, so a failed clone knows to remove it
 */
async function ensureEmptyDir(dirPath: string): Promise<boolean> {
  if (!(await fs.pathExists(dirPath))) {
    await fs.ensureDir(dirPath);
    return true;
  }
  const stat = await fs.stat(dirPath);
  if (!stat.isDirectory()) throw new BitError(`unable to clone into "${dirPath}", it is not a directory`);
  const entries = await fs.readdir(dirPath);
  if (entries.length) throw new BitError(`unable to clone into "${dirPath}", the directory is not empty`);
  return false;
}
