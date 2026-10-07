import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import { parse } from 'comment-json';
import { loadManyAspects } from '@teambit/harmony.testing.load-aspect';
import type { WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockWorkspace, destroyWorkspace, mockBareScope } from '@teambit/workspace.testing.mock-workspace';
import { WorkspaceAspect } from '@teambit/workspace';
import type { Workspace } from '@teambit/workspace';
import type { CLIMain } from '@teambit/cli';
import { CLIAspect } from '@teambit/cli';
import { TrackerAspect } from '@teambit/tracker';
import type { TrackerMain } from '@teambit/tracker';
import { SnappingAspect } from '@teambit/snapping';
import type { SnappingMain } from '@teambit/snapping';
import { ExportAspect } from '@teambit/export';
import { ImporterAspect } from '@teambit/importer';
import { ListerAspect } from '@teambit/lister';
import { StatusAspect } from './status.aspect';

/**
 * two components with the same name but different scope-names. it lives in the status aspect rather than in the
 * snapping aspect, since the flows assert the status, and tag is needed to set up the components.
 */
describe('two components with the same name but different scope-name', function () {
  this.timeout(0);

  const workspaces: WorkspaceData[] = [];
  const bareScopePaths: string[] = [];

  /** a workspace with its own bare scope (the scope its components get exported to) */
  function createWorkspace(remotes: { remoteScopeName: string; remoteScopePath: string }[] = []): WorkspaceData {
    const workspaceData = mockWorkspace();
    workspaces.push(workspaceData);
    // the remotes are read once per workspace load, so they are added before the first load
    const scopeJsonPath = path.join(workspaceData.workspacePath, '.bit', 'scope.json');
    const scopeJson = fs.readJsonSync(scopeJsonPath);
    remotes.forEach((remote) => {
      scopeJson.remotes = { ...scopeJson.remotes, [remote.remoteScopeName]: `file://${remote.remoteScopePath}` };
    });
    fs.writeJsonSync(scopeJsonPath, scopeJson, { spaces: 2 });
    return workspaceData;
  }

  function createBareScope(workspaceData: WorkspaceData) {
    const { scopeName, scopePath } = mockBareScope(workspaceData.remoteScopePath);
    bareScopePaths.push(scopePath);
    return { remoteScopeName: scopeName, remoteScopePath: scopePath };
  }

  /** a fresh harmony per call, to simulate a new process running a new command */
  async function load(workspacePath: string) {
    const harmony = await loadManyAspects(
      [WorkspaceAspect, SnappingAspect, ExportAspect, ImporterAspect, ListerAspect, StatusAspect, TrackerAspect],
      workspacePath
    );
    const cli = harmony.get<CLIMain>(CLIAspect.id);
    const getCmd = (name: string) => {
      const cmd = cli.getCommand(name);
      if (!cmd) throw new Error(`the "${name}" command is not registered`);
      return cmd;
    };
    /** commands resolve paths against the cwd */
    const inWorkspace = async <T>(fn: () => Promise<T>): Promise<T> => {
      const originalCwd = process.cwd();
      process.chdir(workspacePath);
      try {
        return await fn();
      } finally {
        process.chdir(originalCwd);
      }
    };
    return {
      tracker: harmony.get<TrackerMain>(TrackerAspect.id),
      workspace: harmony.get<Workspace>(WorkspaceAspect.id),
      snapping: harmony.get<SnappingMain>(SnappingAspect.id),
      exportCmd: (ids: string[] = []) => inWorkspace(() => getCmd('export').report!([ids] as any, {})),
      importCmd: (ids: string[], flags: Record<string, any> = {}) =>
        inWorkspace(() => getCmd('import').report!([ids] as any, flags)),
      statusJson: () => inWorkspace(async () => (await getCmd('status').json!([], {})) as Record<string, any>),
      listJson: () => inWorkspace(async () => (await getCmd('list').json!([], {})) as Record<string, any>[]),
    };
  }

  async function track(
    workspacePath: string,
    trackData: { rootDir: string; componentName: string; defaultScope?: string }
  ) {
    const { tracker, workspace } = await load(workspacePath);
    await tracker.track(trackData);
    await workspace.bitMap.write();
  }

  async function tag(workspacePath: string, params: { version?: string; unmodified?: boolean } = {}) {
    const { snapping } = await load(workspacePath);
    await snapping.tag({ build: false, ...params });
  }

  const createBarFoo = (workspacePath: string) =>
    fs.outputFileSync(
      path.join(workspacePath, 'bar', 'foo.js'),
      `module.exports = function foo() { return 'got foo'; };`
    );

  /** .bitmap opens with a comment banner */
  const readBitMap = (workspacePath: string): Record<string, any> =>
    parse(fs.readFileSync(path.join(workspacePath, '.bitmap'), 'utf8'), undefined, true) as Record<string, any>;

  after(async () => {
    await Promise.all(workspaces.map((workspaceData) => destroyWorkspace(workspaceData)));
    await Promise.all(bareScopePaths.map((scopePath) => fs.remove(scopePath)));
  });

  describe('importing objects from another scope', () => {
    let importingWorkspace: WorkspaceData;
    before(async () => {
      const authorWorkspace = createWorkspace();
      const anotherScope = createBareScope(authorWorkspace);
      await addRemoteToWorkspace(authorWorkspace, anotherScope);
      createBarFoo(authorWorkspace.workspacePath);
      await track(authorWorkspace.workspacePath, {
        rootDir: 'bar',
        componentName: 'bar/foo',
        defaultScope: anotherScope.remoteScopeName,
      });
      await tag(authorWorkspace.workspacePath);
      await tag(authorWorkspace.workspacePath, { unmodified: true, version: '0.0.2' });
      await (await load(authorWorkspace.workspacePath)).exportCmd(['bar/foo']);

      importingWorkspace = createWorkspace([anotherScope]);
      createBarFoo(importingWorkspace.workspacePath);
      await track(importingWorkspace.workspacePath, { rootDir: 'bar', componentName: 'bar/foo' });
      await (
        await load(importingWorkspace.workspacePath)
      ).importCmd([`${anotherScope.remoteScopeName}/bar/foo`], { objects: true });
    });
    it('bit status should show the component as new', async () => {
      const status = await (await load(importingWorkspace.workspacePath)).statusJson();
      expect(status.newComponents).to.have.lengthOf(1);
    });
  });

  describe('importing and using both in the same workspace', () => {
    let anotherScope: { remoteScopeName: string; remoteScopePath: string };
    let importingWorkspace: WorkspaceData;
    before(async () => {
      const authorWorkspace = createWorkspace();
      anotherScope = createBareScope(authorWorkspace);
      await addRemoteToWorkspace(authorWorkspace, anotherScope);
      createBarFoo(authorWorkspace.workspacePath);
      await track(authorWorkspace.workspacePath, {
        rootDir: 'bar',
        componentName: 'bar/foo',
        defaultScope: anotherScope.remoteScopeName,
      });
      await tag(authorWorkspace.workspacePath);
      await (await load(authorWorkspace.workspacePath)).exportCmd();

      importingWorkspace = createWorkspace([anotherScope]);
      createBarFoo(importingWorkspace.workspacePath);
      await track(importingWorkspace.workspacePath, { rootDir: 'bar', componentName: 'bar/foo' });
      await (await load(importingWorkspace.workspacePath)).importCmd([`${anotherScope.remoteScopeName}/bar/foo`]);
    });
    it('bitmap should have both and the keys should contain the scope-name to differentiate', () => {
      const bitMap = readBitMap(importingWorkspace.workspacePath);
      expect(bitMap).to.have.property(`${importingWorkspace.remoteScopeName}/bar/foo`);
      expect(bitMap).to.have.property(`${anotherScope.remoteScopeName}/bar/foo`);
    });
    it('bit status should show the new component correctly', async () => {
      const status = await (await load(importingWorkspace.workspacePath)).statusJson();
      expect(status.newComponents).to.have.lengthOf(1);
      expect(status.newComponents[0]).to.equal(`${importingWorkspace.remoteScopeName}/bar/foo`);
    });
    describe('having both components as imported', () => {
      let cleanWorkspace: WorkspaceData;
      before(async () => {
        await tag(importingWorkspace.workspacePath);
        await (await load(importingWorkspace.workspacePath)).exportCmd();

        cleanWorkspace = createWorkspace([importingWorkspace, anotherScope]);
        await (
          await load(cleanWorkspace.workspacePath)
        ).importCmd([`${importingWorkspace.remoteScopeName}/bar/foo`, `${anotherScope.remoteScopeName}/bar/foo`], {
          skipDependencyInstallation: true,
        });
      });
      it('the workspace should be fine and not throw errors', async () => {
        const status = await (await load(cleanWorkspace.workspacePath)).statusJson();
        const exclude = ['componentsWithIssues', 'currentLaneId', 'forkedLaneId'];
        Object.keys(status).forEach((key) => {
          if (exclude.includes(key)) return;
          expect(status[key], `status.${key} should be empty`).to.have.lengthOf(0);
        });
      });
    });
  });

  describe('creating two new components with the same name in the same workspace', () => {
    let workspacePath: string;
    before(async () => {
      const workspaceData = createWorkspace();
      workspacePath = workspaceData.workspacePath;
      const anotherScope = createBareScope(workspaceData);
      await addRemoteToWorkspace(workspaceData, anotherScope);
      fs.outputFileSync(path.join(workspacePath, 'scope1/comp1/index.ts'), '');
      fs.outputFileSync(path.join(workspacePath, 'scope2/comp1/index.ts'), '');
      await track(workspacePath, { rootDir: 'scope1/comp1', componentName: 'comp1' });
      await track(workspacePath, {
        rootDir: 'scope2/comp1',
        componentName: 'comp1',
        defaultScope: anotherScope.remoteScopeName,
      });
    });
    it('bit list should list them both', async () => {
      const list = await (await load(workspacePath)).listJson();
      expect(list).to.have.lengthOf(2);
    });
    describe('tagging them both', () => {
      before(async () => {
        await tag(workspacePath);
      });
      it('should tag both of them', async () => {
        const status = await (await load(workspacePath)).statusJson();
        expect(status.stagedComponents).to.have.lengthOf(2);
      });
      it('should export with no errors', async () => {
        await (await load(workspacePath)).exportCmd();
      });
    });
  });
});

/** add a bare scope as a remote of the workspace, as "bit remote add" does */
async function addRemoteToWorkspace(
  workspaceData: WorkspaceData,
  remote: { remoteScopeName: string; remoteScopePath: string }
) {
  const scopeJsonPath = path.join(workspaceData.workspacePath, '.bit', 'scope.json');
  const scopeJson = await fs.readJson(scopeJsonPath);
  scopeJson.remotes = { ...scopeJson.remotes, [remote.remoteScopeName]: `file://${remote.remoteScopePath}` };
  await fs.writeJson(scopeJsonPath, scopeJson, { spaces: 2 });
}
