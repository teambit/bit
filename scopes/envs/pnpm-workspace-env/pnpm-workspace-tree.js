const { createHash } = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const WORKSPACE_ROOT_ASPECT = 'teambit.workspace/workspace-root';

/**
 * the root of the workspace the component was snapped in, at the version the root had then, e.g.
 * "my-org.my-scope/my-root@0.0.7". a component never snapped has none.
 */
function readRootId(component) {
  return component.state.aspects.get(WORKSPACE_ROOT_ASPECT)?.data?.root;
}

function withoutVersion(id) {
  return id.split('@')[0];
}

/**
 * the members the root lists, each with its directory. the list came from a remote, so a directory
 * that escapes the tree is refused rather than written outside of it.
 */
function readWorkspaceMembers(root, workspaceRoot) {
  return workspaceRoot.listMembers(root).map(({ id, rootDir }) => {
    if (!isInsideTree(rootDir)) {
      throw new Error(`the workspace root lists "${id}" at "${rootDir}", which is not a directory inside it`);
    }
    return { id, rootDir };
  });
}

function isInsideTree(rootDir) {
  if (typeof rootDir !== 'string' || !rootDir || path.isAbsolute(rootDir)) return false;
  const normalized = path.posix.normalize(rootDir.split(path.sep).join('/'));
  return normalized !== '.' && normalized !== '..' && !normalized.startsWith('../');
}

/**
 * the root and every member it lists. the root is the one the members were snapped with or, for
 * members never snapped, the root of the workspace being built.
 *
 * a component of the build comes as built, at its exact version. the builder isolates each env's
 * components on their own, so the rest - the root, the members of other envs, and in a CI the members
 * the snap did not change - come from the source (see WorkspaceTreeSource and ScopeTreeSource).
 */
async function loadPnpmWorkspaceTree(rootId, buildComponents, source, workspaceRoot) {
  const findInBuild = (id) =>
    buildComponents.find((component) => component.id.toStringWithoutVersion() === withoutVersion(id));
  const root = rootId ? findInBuild(rootId) || (await source.get([rootId]))[0] : await source.getWorkspaceRoot();
  if (!root) throw new Error(rootId ? `unable to load the workspace root ${rootId}` : 'no workspace root was found');

  const members = new Map();
  const outsideBuild = [];
  readWorkspaceMembers(root, workspaceRoot).forEach((member) => {
    const component = findInBuild(member.id);
    if (component) members.set(member.rootDir, component);
    else outsideBuild.push(member);
  });
  const loaded = outsideBuild.length ? await source.get(outsideBuild.map((member) => member.id)) : [];
  const missing = [];
  outsideBuild.forEach((member, index) => {
    if (loaded[index]) members.set(member.rootDir, loaded[index]);
    else missing.push(member.id);
  });
  return { root, members, missing: missing.sort() };
}

/**
 * the components as the workspace has them now, modified or never snapped included - what a
 * "bit build" of the workspace is about.
 */
class WorkspaceTreeSource {
  constructor(workspace, workspaceRoot) {
    this.workspace = workspace;
    this.workspaceRoot = workspaceRoot;
  }

  get(ids) {
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

  async getWorkspaceRoot() {
    const rootId = this.workspaceRoot.getRootComponentId();
    return rootId ? this.workspace.get(rootId) : undefined;
  }
}

/**
 * the components as their remotes have them. a component the snap being built did not change comes at
 * its head - the lane's head when a lane is checked out, main's otherwise.
 */
class ScopeTreeSource {
  constructor(scope) {
    this.scope = scope;
  }

  async get(ids) {
    const lane = await this.scope.legacyScope.getCurrentLaneObject();
    const componentIds = await Promise.all(
      ids.map(async (id) => {
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
    const resolved = componentIds.filter(Boolean);
    if (resolved.length) {
      await this.scope.import(resolved, {
        lane,
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

  /** in a scope, every member was snapped along with its root, so it has one recorded */
  async getWorkspaceRoot() {
    return undefined;
  }

  /** a version-less id is taken at main's head, not at whatever lane the local objects saw last */
  async withHead(componentId) {
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
async function writePnpmWorkspaceTree(tree, targetDir) {
  await fs.rm(targetDir, { recursive: true, force: true });
  await fs.mkdir(targetDir, { recursive: true });
  await writeComponentFiles(tree.root, targetDir);
  await Promise.all(
    [...tree.members.entries()].map(([rootDir, component]) =>
      writeComponentFiles(component, path.join(targetDir, rootDir))
    )
  );
}

async function writeComponentFiles(component, targetDir) {
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
function treeSignature(tree) {
  const hash = createHash('sha1');
  const components = [['.', tree.root], ...tree.members.entries()];
  components
    .sort(([dirA], [dirB]) => dirA.localeCompare(dirB))
    .forEach(([rootDir, component]) => {
      const files = [...component.filesystem.files].sort((a, b) => a.relative.localeCompare(b.relative));
      files.forEach((file) => hash.update(`${rootDir}/${file.relative}\0`).update(file.contents));
    });
  return hash.digest('hex');
}

module.exports = {
  loadPnpmWorkspaceTree,
  readRootId,
  ScopeTreeSource,
  treeSignature,
  WorkspaceTreeSource,
  writePnpmWorkspaceTree,
};
