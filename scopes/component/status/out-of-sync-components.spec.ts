import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { parse } from 'comment-json';
import stripAnsi from 'strip-ansi';
import { loadManyAspects } from '@teambit/harmony.testing.load-aspect';
import type { WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockWorkspace, destroyWorkspace } from '@teambit/workspace.testing.mock-workspace';
import { fixtures } from '@teambit/legacy.e2e-helper';
import { MissingBitMapComponent } from '@teambit/legacy.bit-map';
import { IMPORT_PENDING_MSG } from '@teambit/legacy.constants';
import { ComponentsPendingImport } from '@teambit/legacy.consumer';
import { addFeature, reloadFeatureToggle } from '@teambit/harmony.modules.feature-toggle';
import { WorkspaceAspect } from '@teambit/workspace';
import type { Workspace } from '@teambit/workspace';
import type { CLIMain } from '@teambit/cli';
import { CLIAspect } from '@teambit/cli';
import { ComponentAspect } from '@teambit/component';
import { ListerAspect } from '@teambit/lister';
import { ExportAspect } from '@teambit/export';
import { RemoveAspect } from '@teambit/remove';
import { HostInitializerMain } from '@teambit/host-initializer';
import { TrackerAspect } from '@teambit/tracker';
import type { TrackerMain } from '@teambit/tracker';
import { SnappingAspect } from '@teambit/snapping';
import { StatusAspect } from './status.aspect';

/**
 * components that are not synced between the scope and the workspace (.bitmap). they live in the status aspect rather
 * than in the snapping aspect, since the flows assert the status, and tag/export are needed to set up the components.
 */
describe('components that are not synced between the scope and the consumer', function () {
  this.timeout(0);

  const workspaces: WorkspaceData[] = [];
  const tmpDirs: string[] = [];

  /** a fresh harmony per call, to simulate a new process running a new command */
  async function load(workspacePath: string) {
    const harmony = await loadManyAspects(
      [
        WorkspaceAspect,
        SnappingAspect,
        StatusAspect,
        ComponentAspect,
        TrackerAspect,
        ExportAspect,
        RemoveAspect,
        ListerAspect,
        CLIAspect,
      ],
      workspacePath
    );
    const cli = harmony.get<CLIMain>(CLIAspect.id);
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
      inWorkspace,
      report: (name: string, args: any[] = [], flags: Record<string, any> = {}) =>
        inWorkspace(async () => {
          const cmd = cli.getCommand(name);
          if (!cmd) throw new Error(`the "${name}" command is not registered`);
          const output: any = await cmd.report!(args as any, flags);
          return stripAnsi(typeof output === 'string' ? output : output.data);
        }),
      json: (name: string, args: any[] = [], flags: Record<string, any> = {}) =>
        inWorkspace(async () => {
          const cmd = cli.getCommand(name);
          if (!cmd) throw new Error(`the "${name}" command is not registered`);
          return JSON.parse(JSON.stringify(await cmd.json!(args as any, flags)));
        }),
    };
  }

  const status = async (workspacePath: string) => (await load(workspacePath)).report('status');
  const tagBarFoo = async (workspacePath: string, flags: Record<string, any> = {}) =>
    (await load(workspacePath)).report('tag', [['bar/foo']], { build: false, ...flags });
  const tagAll = async (workspacePath: string, flags: Record<string, any> = {}) =>
    (await load(workspacePath)).report('tag', [[]], { build: false, ...flags });
  const exportAll = async (workspacePath: string) => (await load(workspacePath)).report('export', [[]], {});
  const exportBarFoo = async (workspacePath: string) => (await load(workspacePath)).report('export', [['bar/foo']], {});
  const show = async (workspacePath: string) => (await load(workspacePath)).report('show', ['bar/foo']);

  /** bar/foo is a component in the "bar" dir with the main file foo.js */
  async function addBarFoo(workspacePath: string) {
    fs.outputFileSync(path.join(workspacePath, 'bar/foo.js'), fixtures.fooFixture);
    const { tracker, workspace, inWorkspace } = await load(workspacePath);
    await inWorkspace(async () => {
      await tracker.track({ rootDir: 'bar', componentName: 'bar/foo' });
      await workspace.bitMap.write();
    });
  }

  async function createWorkspace(): Promise<WorkspaceData> {
    const workspaceData = mockWorkspace();
    workspaces.push(workspaceData);
    await addBarFoo(workspaceData.workspacePath);
    return workspaceData;
  }

  const bitMapPath = (workspacePath: string) => path.join(workspacePath, '.bitmap');
  const readBitMapContent = (workspacePath: string) => fs.readFileSync(bitMapPath(workspacePath), 'utf8');
  const writeBitMapContent = (workspacePath: string, content: string) =>
    fs.writeFileSync(bitMapPath(workspacePath), content);
  const readBitMap = (workspacePath: string) => parse(readBitMapContent(workspacePath)) as any;

  /** equivalent of deleting the .bitmap and running "bit init --force" */
  async function deleteBitMapAndInit(workspacePath: string) {
    fs.removeSync(bitMapPath(workspacePath));
    await HostInitializerMain.init(workspacePath, false, false, false, false, false, false, false, true);
  }

  /** what Bit does when it loads, and the workspace has .bitmap and workspace.jsonc but the local scope is missing */
  async function repairMissingScope(workspacePath: string) {
    await HostInitializerMain.init(workspacePath);
  }

  /** equivalent of cloning the workspace: saves a copy of it, which can be restored later on */
  function cloneWorkspace(workspacePath: string): string {
    const clonePath = fs.mkdtempSync(path.join(os.tmpdir(), 'out-of-sync-clone-'));
    tmpDirs.push(clonePath);
    fs.copySync(workspacePath, clonePath);
    return clonePath;
  }
  function restoreWorkspace(workspacePath: string, clonePath: string) {
    fs.emptyDirSync(workspacePath);
    fs.copySync(clonePath, workspacePath);
  }

  /**
   * equivalent of "bit init --bare" on a remote that was already used: removes everything but keeps the scope name.
   */
  async function reInitRemoteScope(remoteScopePath: string) {
    const scopeJson = await fs.readFile(path.join(remoteScopePath, 'scope.json'));
    const dirs = (await fs.readdir(remoteScopePath)).filter((name) =>
      fs.statSync(path.join(remoteScopePath, name)).isDirectory()
    );
    await fs.emptyDir(remoteScopePath);
    await fs.writeFile(path.join(remoteScopePath, 'scope.json'), scopeJson);
    await Promise.all(dirs.map((dir) => fs.ensureDir(path.join(remoteScopePath, dir))));
  }

  async function expectToReject(fn: () => Promise<any>, expectedError: Error) {
    let error: Error | undefined;
    try {
      await fn();
    } catch (err: any) {
      error = err;
    }
    if (!error) throw new Error(`expected to throw an error "${expectedError.message}", but it did not throw`);
    expect(stripAnsi(error.message)).to.have.string(stripAnsi(expectedError.message));
  }

  /** the status json has no items in all its sections, besides the ones that are not relevant to sync */
  async function expectStatusToBeClean(workspacePath: string) {
    const statusJson = await (await load(workspacePath)).json('status');
    Object.keys(statusJson).forEach((key) => {
      if (['componentsWithIssues', 'currentLaneId', 'forkedLaneId'].includes(key)) return;
      expect(statusJson[key], `status.${key} should be empty`).to.have.lengthOf(0);
    });
  }

  before(() => {
    // "bit delete --hard" is blocked in non-interactive sessions unless the feature is explicitly enabled
    addFeature('hard-delete');
  });
  after(async () => {
    reloadFeatureToggle();
    await Promise.all(workspaces.map((workspaceData) => destroyWorkspace(workspaceData)));
    tmpDirs.forEach((dir) => fs.removeSync(dir));
  });

  describe('consumer with a new component and scope with the same component as staged', () => {
    let workspaceData: WorkspaceData;
    let scopeOutOfSync: string;
    before(async () => {
      workspaceData = await createWorkspace();
      const { workspacePath } = workspaceData;
      const bitMapContent = readBitMapContent(workspacePath);
      await tagBarFoo(workspacePath, { version: '0.0.1' });
      writeBitMapContent(workspacePath, bitMapContent);
      scopeOutOfSync = cloneWorkspace(workspacePath);
    });
    describe('bit tag', () => {
      it('should tag the component to the next version of what the scope has', async () => {
        const output = await tagBarFoo(workspaceData.workspacePath, { unmodified: true, patch: true });
        expect(output).to.have.string('0.0.2');
      });
    });
    describe('bit status', () => {
      let output: string;
      before(async () => {
        restoreWorkspace(workspaceData.workspacePath, scopeOutOfSync);
        output = await status(workspaceData.workspacePath);
      });
      it('should sync .bitmap according to the scope', () => {
        expect(output).to.have.string('staged');
        expect(readBitMap(workspaceData.workspacePath)['bar/foo'].version).to.equal('0.0.1');
      });
    });
    describe('bit export with id', () => {
      let output: string;
      before(async () => {
        restoreWorkspace(workspaceData.workspacePath, scopeOutOfSync);
        await reInitRemoteScope(workspaceData.remoteScopePath);
        output = await exportBarFoo(workspaceData.workspacePath);
      });
      it('should export the component successfully', () => {
        expect(output).to.have.string('exported components (1)');
      });
    });
    describe('bit export all', () => {
      let output: string;
      before(async () => {
        restoreWorkspace(workspaceData.workspacePath, scopeOutOfSync);
        await reInitRemoteScope(workspaceData.remoteScopePath);
        output = await exportAll(workspaceData.workspacePath);
      });
      it('should export the component successfully', () => {
        expect(output).to.have.string('exported components (1)');
      });
    });
  });

  describe('consumer with a tagged component and scope with the same component as exported', () => {
    let workspaceData: WorkspaceData;
    let scopeOutOfSync: string;
    before(async () => {
      workspaceData = await createWorkspace();
      const { workspacePath } = workspaceData;
      await tagBarFoo(workspacePath, { version: '0.0.1' });
      const bitMapContent = readBitMapContent(workspacePath);
      await exportAll(workspacePath);
      writeBitMapContent(workspacePath, bitMapContent);
      scopeOutOfSync = cloneWorkspace(workspacePath);
    });
    describe('bit tag', () => {
      it('should tag the component to the next version of what the scope has', async () => {
        const output = await tagBarFoo(workspaceData.workspacePath, { unmodified: true, patch: true });
        expect(output).to.have.string('0.0.2');
      });
    });
    describe('bit status', () => {
      before(async () => {
        restoreWorkspace(workspaceData.workspacePath, scopeOutOfSync);
        await status(workspaceData.workspacePath);
      });
      it('should sync .bitmap according to the scope', async () => {
        await expectStatusToBeClean(workspaceData.workspacePath);
        const bitMap = readBitMap(workspaceData.workspacePath);
        expect(bitMap['bar/foo'].scope).to.equal(workspaceData.remoteScopeName);
        expect(bitMap['bar/foo'].version).to.equal('0.0.1');
      });
    });
  });

  describe('consumer with no components and scope with staged components', () => {
    let workspaceData: WorkspaceData;
    let scopeOutOfSync: string;
    before(async () => {
      workspaceData = await createWorkspace();
      const { workspacePath } = workspaceData;
      await tagBarFoo(workspacePath, { version: '0.0.1' });
      await deleteBitMapAndInit(workspacePath);
      scopeOutOfSync = cloneWorkspace(workspacePath);
    });
    describe('bit show', () => {
      it('should not throw because "bit show" supports showing components from the scope', async () => {
        restoreWorkspace(workspaceData.workspacePath, scopeOutOfSync);
        await show(workspaceData.workspacePath); // throws on failure
      });
    });
    describe('bit export all', () => {
      let output: string;
      before(async () => {
        restoreWorkspace(workspaceData.workspacePath, scopeOutOfSync);
        output = await exportAll(workspaceData.workspacePath);
      });
      it('should export the component successfully', async () => {
        const lsRemote = await (
          await load(workspaceData.workspacePath)
        ).json('list', [workspaceData.remoteScopeName], {});
        expect(lsRemote).to.have.lengthOf(1);
        expect(lsRemote[0].id).to.have.string('bar/foo');
      });
      it('should tell the user that no local changes have been made because the components are not tracked', () => {
        expect(output).to.have.string('bit did not update the workspace as the component files are not tracked');
      });
    });
    describe('bit export id', () => {
      before(async () => {
        restoreWorkspace(workspaceData.workspacePath, scopeOutOfSync);
        await reInitRemoteScope(workspaceData.remoteScopePath);
      });
      it('should throw an error saying the component does not exist', async () => {
        const err = new MissingBitMapComponent(`${workspaceData.remoteScopeName}/bar/foo`);
        await expectToReject(() => exportBarFoo(workspaceData.workspacePath), err);
      });
    });
  });

  describe('consumer with no components and scope with exported components', () => {
    describe('bit add of the same component', () => {
      let workspaceData: WorkspaceData;
      before(async () => {
        workspaceData = await createWorkspace();
        const { workspacePath } = workspaceData;
        await tagBarFoo(workspacePath, { version: '0.0.1' });
        await exportAll(workspacePath);
        await deleteBitMapAndInit(workspacePath);
        await addBarFoo(workspacePath);
      });
      it('should sync the new component with the scope and assign a version and a scope name', () => {
        const bitMap = readBitMap(workspaceData.workspacePath);
        expect(bitMap['bar/foo'].scope).to.equal(workspaceData.remoteScopeName);
        expect(bitMap['bar/foo'].version).to.equal('0.0.1');
      });
    });
  });

  describe('consumer has exported components and scope is empty', () => {
    let workspaceData: WorkspaceData;
    let scopeOutOfSync: string;
    before(async () => {
      workspaceData = await createWorkspace();
      const { workspacePath } = workspaceData;
      await tagBarFoo(workspacePath, { version: '0.0.1' });
      await exportAll(workspacePath);
      fs.removeSync(path.join(workspacePath, '.bit'));
      scopeOutOfSync = cloneWorkspace(workspacePath);
    });
    describe('bit tag', () => {
      it('should stop the tagging process and throw an error suggesting to import the components', async () => {
        restoreWorkspace(workspaceData.workspacePath, scopeOutOfSync);
        await repairMissingScope(workspaceData.workspacePath);
        const err = new ComponentsPendingImport([`${workspaceData.remoteScopeName}/bar/foo@0.0.1`]);
        await expectToReject(() => tagBarFoo(workspaceData.workspacePath, { unmodified: true }), err);
      });
    });
    describe('bit status', () => {
      let output: string;
      before(async () => {
        restoreWorkspace(workspaceData.workspacePath, scopeOutOfSync);
        await repairMissingScope(workspaceData.workspacePath);
        output = await status(workspaceData.workspacePath);
      });
      it('should show a massage suggesting to import the components', () => {
        expect(output).to.have.string(IMPORT_PENDING_MSG);
      });
    });
  });

  describe('consumer has tagged component with a version that not exist in the scope', () => {
    let workspaceData: WorkspaceData;
    let scopeOutOfSync: string;
    before(async () => {
      workspaceData = await createWorkspace();
      const { workspacePath } = workspaceData;
      await tagBarFoo(workspacePath, { version: '0.0.1' });
      await tagBarFoo(workspacePath, { unmodified: true, ver: '2.0.0' });
      const bitMapContent = readBitMapContent(workspacePath);
      await (await load(workspacePath)).report('reset', ['bar/foo'], { head: true });
      writeBitMapContent(workspacePath, bitMapContent);
      scopeOutOfSync = cloneWorkspace(workspacePath);
    });
    describe('bit tag', () => {
      it('should tag the component to the next version of what the scope has', async () => {
        const output = await tagBarFoo(workspaceData.workspacePath, { unmodified: true, patch: true });
        expect(output).to.have.string('0.0.2');
      });
    });
    describe('bit status', () => {
      let output: string;
      before(async () => {
        restoreWorkspace(workspaceData.workspacePath, scopeOutOfSync);
        output = await status(workspaceData.workspacePath);
      });
      it('should sync .bitmap according to the scope', () => {
        expect(output).to.have.string('staged components');
        expect(readBitMap(workspaceData.workspacePath)['bar/foo'].version).to.equal('0.0.1');
      });
    });
  });

  describe('consumer has exported component with a version that not exist in the scope', () => {
    /** exported 0.0.1 and 2.0.0, but the workspace has the scope objects of 0.0.1 only and the .bitmap of 2.0.0 */
    async function setupMissingVersion() {
      const workspaceData = await createWorkspace();
      const { workspacePath } = workspaceData;
      await tagBarFoo(workspacePath, { version: '0.0.1' });
      await exportAll(workspacePath);
      const scopeAfterV1 = cloneWorkspace(workspacePath);
      await tagBarFoo(workspacePath, { unmodified: true, ver: '2.0.0' });
      await exportAll(workspacePath);
      const bitMapContent = readBitMapContent(workspacePath);
      restoreWorkspace(workspacePath, scopeAfterV1);
      writeBitMapContent(workspacePath, bitMapContent);
      return workspaceData;
    }
    describe('when the remote component has this missing version', () => {
      let workspaceData: WorkspaceData;
      before(async () => {
        workspaceData = await setupMissingVersion();
      });
      describe('bit status', () => {
        it('should throw an error suggesting to import the components', async () => {
          const err = new ComponentsPendingImport([`${workspaceData.remoteScopeName}/bar/foo@2.0.0`]);
          await expectToReject(() => status(workspaceData.workspacePath), err);
        });
      });
      describe('bit show', () => {
        it('should throw an error suggesting to import the components', async () => {
          const err = new ComponentsPendingImport([`${workspaceData.remoteScopeName}/bar/foo@2.0.0`]);
          await expectToReject(() => show(workspaceData.workspacePath), err);
        });
      });
      describe('bit tag', () => {
        it('should throw an error suggesting to import the components', async () => {
          const err = new ComponentsPendingImport([`${workspaceData.remoteScopeName}/bar/foo@2.0.0`]);
          await expectToReject(() => tagAll(workspaceData.workspacePath), err);
        });
      });
    });
    describe('when the remote component does not exist or does not have this missing version', () => {
      let workspaceData: WorkspaceData;
      let scopeOutOfSync: string;
      before(async () => {
        workspaceData = await setupMissingVersion();
        const { workspacePath, remoteScopeName } = workspaceData;
        await (
          await load(workspacePath)
        ).report('delete', [`${remoteScopeName}/bar/foo`], {
          silent: true,
          hard: true,
        });
        scopeOutOfSync = cloneWorkspace(workspacePath);
      });
      describe('bit status', () => {
        before(async () => {
          await status(workspaceData.workspacePath);
        });
        it('should sync .bitmap according to the latest version of the scope', async () => {
          await expectStatusToBeClean(workspaceData.workspacePath);
          const bitMapEntry = readBitMap(workspaceData.workspacePath)['bar/foo'];
          expect(bitMapEntry.version).to.equal('0.0.1');
          expect(bitMapEntry.scope).to.equal(workspaceData.remoteScopeName);
        });
      });
      describe('bit tag', () => {
        before(() => {
          restoreWorkspace(workspaceData.workspacePath, scopeOutOfSync);
        });
        it('should tag the component to the next version of what the scope has', async () => {
          const output = await tagBarFoo(workspaceData.workspacePath, { unmodified: true, patch: true });
          expect(output).to.have.string('0.0.2');
        });
      });
    });
  });
});
