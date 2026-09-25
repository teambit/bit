import { createHash } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import type { Component, ComponentID } from '@teambit/component';
import type { ScopeMain } from '@teambit/scope';
import type { Workspace } from '@teambit/workspace';
import type { WorkspaceRootMain } from '@teambit/workspace-root';
import { WorkspaceRootAspect } from '@teambit/workspace-root';

export type PnpmWorkspaceTree = {
  root: Component;
  /** by the directory the root lists each member at */
  members: Map<string, Component>;
  /** the members no source has */
  missing: string[];
};

/** where the components of the tree come from, when the build does not have them */
export interface TreeSource {
  get(ids: string[]): Promise<Array<Component | undefined>>;
  /** the id of the root the components are built with. throws when there is no single one */
  getRootId(components: Component[]): string;
}

type WorkspaceMember = { id: string; rootDir: string };

/**
 * the root of the workspace the component was snapped in, at the version the root had then, e.g.
 * "my-org.my-scope/my-root@0.0.7". a component never snapped has none.
 */
function readRootId(component: Component): string | undefined {
  return component.state.aspects.get(WorkspaceRootAspect.id)?.data?.root;
}

function withoutVersion(id: string): string {
  return id.split('@')[0];
}

/**
 * the members the root lists, each with its directory. the list came from a remote, so a directory
 * that escapes the tree is refused rather than written outside of it.
 */
function readWorkspaceMembers(root: Component, workspaceRoot: WorkspaceRootMain): WorkspaceMember[] {
  return workspaceRoot.listMembers(root).map(({ id, rootDir }) => {
    if (!isInsideTree(rootDir)) {
      throw new Error(`the workspace root lists "${id}" at "${rootDir}", which is not a directory inside it`);
    }
    return { id, rootDir };
  });
}

function isInsideTree(rootDir: unknown): rootDir is string {
  if (typeof rootDir !== 'string' || !rootDir || path.isAbsolute(rootDir)) return false;
  const normalized = path.posix.normalize(rootDir.split(path.sep).join('/'));
  return normalized !== '.' && normalized !== '..' && !normalized.startsWith('../');
}

/**
 * the root and every member it lists. the source picks the root, see getRootId.
 *
 * a component of the build comes as built, at its exact version. the builder isolates each env's
 * components on their own, so the rest - the root, the members of other envs, and in a CI the members
 * the snap did not change - come from the source (see WorkspaceTreeSource and ScopeTreeSource).
 */
export async function loadPnpmWorkspaceTree(
  components: Component[],
  buildComponents: Component[],
  source: TreeSource,
  workspaceRoot: WorkspaceRootMain
): Promise<PnpmWorkspaceTree> {
  const findInBuild = (id: string) =>
    buildComponents.find((component) => component.id.toStringWithoutVersion() === withoutVersion(id));
  const rootId = source.getRootId(components);
  const root = findInBuild(rootId) || (await source.get([rootId]))[0];
  if (!root) throw new Error(`unable to load the workspace root ${rootId}`);

  const members = new Map<string, Component>();
  const outsideBuild: WorkspaceMember[] = [];
  readWorkspaceMembers(root, workspaceRoot).forEach((member) => {
    const component = findInBuild(member.id);
    if (component) members.set(member.rootDir, component);
    else outsideBuild.push(member);
  });
  const loaded = outsideBuild.length ? await source.get(outsideBuild.map((member) => member.id)) : [];
  const missing: string[] = [];
  outsideBuild.forEach((member, index) => {
    const component = loaded[index];
    if (component) members.set(member.rootDir, component);
    else missing.push(member.id);
  });
  return { root, members, missing: missing.sort() };
}

/**
 * the components as the workspace has them now, modified or never snapped included - what a
 * "bit build" of the workspace is about.
 */
export class WorkspaceTreeSource implements TreeSource {
  constructor(
    private workspace: Workspace,
    private workspaceRoot: WorkspaceRootMain
  ) {}

  get(ids: string[]): Promise<Array<Component | undefined>> {
    return Promise.all(
      ids.map(async (id) => {
        try {
          return await this.workspace.get(await this.workspace.resolveComponentId(withoutVersion(id)));
        } catch {
          return undefined;
        }
      })
    );
  }

  /**
   * the root of this workspace, whichever root the members were snapped with: the tree is built from
   * the manifests and the lockfile as the workspace has them, e.g. after an import rewrote a manifest.
   */
  getRootId(): string {
    const rootId = this.workspaceRoot.getRootComponentId();
    if (!rootId) throw new Error('no workspace root was found');
    return rootId.toString();
  }
}

/**
 * the components as their remotes have them. a component the snap being built did not change comes at
 * its head - the lane's head when a lane is checked out, main's otherwise.
 */
export class ScopeTreeSource implements TreeSource {
  constructor(private scope: ScopeMain) {}

  async get(ids: string[]): Promise<Array<Component | undefined>> {
    const lane = await this.scope.legacyScope.getCurrentLaneObject();
    const componentIds = await Promise.all(
      ids.map(async (id): Promise<ComponentID | undefined> => {
        try {
          const componentId = await this.scope.resolveComponentId(id);
          if (componentId.hasVersion()) return componentId;
          const laneHead = lane?.getComponent(componentId)?.head;
          return laneHead ? componentId.changeVersion(laneHead.toString()) : componentId;
        } catch {
          // a member never exported is listed by its name alone, and no scope has it
          return undefined;
        }
      })
    );
    const resolved = componentIds.filter((componentId): componentId is ComponentID => Boolean(componentId));
    if (resolved.length) {
      await this.scope.import(resolved, {
        lane: lane || undefined,
        reason: 'to rebuild the pnpm workspace of the components being built',
      });
    }
    return Promise.all(
      componentIds.map(async (componentId) => {
        if (!componentId) return undefined;
        try {
          return await this.scope.get(await this.withHead(componentId));
        } catch {
          return undefined;
        }
      })
    );
  }

  /** in a scope, every member was snapped along with its root, at the version the root had then */
  getRootId(components: Component[]): string {
    const rootIds = [...new Set(components.map(readRootId).filter((rootId): rootId is string => Boolean(rootId)))];
    if (!rootIds.length) throw new Error('no workspace root was found');
    if (rootIds.length > 1) {
      throw new Error(`the components belong to different workspace roots: ${rootIds.join(', ')}`);
    }
    return rootIds[0];
  }

  /** a version-less id is taken at main's head, not at whatever lane the local objects saw last */
  private async withHead(componentId: ComponentID): Promise<ComponentID> {
    if (componentId.hasVersion()) return componentId;
    const modelComponent = await this.scope.legacyScope.getModelComponentIfExist(componentId);
    const head = modelComponent?.getHeadAsTagIfExist();
    return head ? componentId.changeVersion(head) : componentId;
  }
}

/**
 * the pnpm workspace as it was snapped: the root's files at the top, every member in its directory.
 * the directory is emptied first, so nothing a previous build left behind leaks into this one.
 */
export async function writePnpmWorkspaceTree(tree: PnpmWorkspaceTree, targetDir: string): Promise<void> {
  await fs.rm(targetDir, { recursive: true, force: true });
  await fs.mkdir(targetDir, { recursive: true });
  await writeComponentFiles(tree.root, targetDir);
  await Promise.all(
    [...tree.members.entries()].map(([rootDir, component]) =>
      writeComponentFiles(component, path.join(targetDir, rootDir))
    )
  );
}

async function writeComponentFiles(component: Component, targetDir: string): Promise<void> {
  await Promise.all(
    component.filesystem.files.map(async (file) => {
      const filePath = path.join(targetDir, file.relative);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, file.contents);
    })
  );
}

/**
 * what the tree was written from: every file of the root and the members, where it goes. a task that
 * finds the tree written from the same files reuses it, install included. the files rather than the
 * versions, as a workspace build has components modified since their version, or never snapped.
 */
export function treeSignature(tree: PnpmWorkspaceTree): string {
  const hash = createHash('sha1');
  const components: Array<[string, Component]> = [['.', tree.root], ...tree.members.entries()];
  components
    .sort(([dirA], [dirB]) => dirA.localeCompare(dirB))
    .forEach(([rootDir, component]) => {
      const files = [...component.filesystem.files].sort((a, b) => a.relative.localeCompare(b.relative));
      files.forEach((file) => hash.update(`${rootDir}/${file.relative}\0`).update(file.contents));
    });
  return hash.digest('hex');
}
