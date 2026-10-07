import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import stripAnsi from 'strip-ansi';
import { loadManyAspects } from '@teambit/harmony.testing.load-aspect';
import type { WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockWorkspace, destroyWorkspace } from '@teambit/workspace.testing.mock-workspace';
import { addFeature, reloadFeatureToggle } from '@teambit/harmony.modules.feature-toggle';
import { WorkspaceAspect } from '@teambit/workspace';
import type { CLIMain } from '@teambit/cli';
import { CLIAspect } from '@teambit/cli';
import { ComponentAspect } from '@teambit/component';
import { ListerAspect, NoIdMatchWildcard } from '@teambit/lister';
import { ExportAspect } from '@teambit/export';
import { ImporterAspect } from '@teambit/importer';
import { TrackerAspect } from '@teambit/tracker';
import type { TrackerMain } from '@teambit/tracker';
import { RemoveAspect } from '@teambit/remove';
import { SnappingAspect } from '@teambit/snapping';
import type { SnappingMain } from '@teambit/snapping';
import { InstallAspect } from '@teambit/install';
import { ScopeAspect, NoIdMatchPattern } from '@teambit/scope';
import type { ScopeMain } from '@teambit/scope';
import { ComponentCompareAspect } from '@teambit/component-compare';
import type { Workspace } from '@teambit/workspace';
import { StatusAspect } from './status.aspect';

/**
 * component ids with a wildcard (tag, remove, export, reset, diff and list). they live in the status aspect,
 * since the flows assert the status, and the commands span many aspects, which the lower aspects cannot depend on.
 */

describe('component id with wildcard', function () {
  this.timeout(0);

  const workspaces: WorkspaceData[] = [];

  /**
   * a workspace with five components: utils/is/string, utils/is/type, utils/fs/read, utils/fs/write and bar/foo
   */
  async function createWorkspaceWithComps(): Promise<WorkspaceData> {
    const workspaceData = mockWorkspace();
    workspaces.push(workspaceData);
    const { workspacePath } = workspaceData;
    const compNames = ['utils/is/string', 'utils/is/type', 'utils/fs/read', 'utils/fs/write', 'bar/foo'];
    compNames.forEach((compName) => writeComp(workspacePath, compName, 'module.exports = () => {};'));
    const { tracker, workspace } = await load(workspacePath);
    for (const compName of compNames) {
      await tracker.track({ rootDir: compName, componentName: compName, mainFile: `${path.basename(compName)}.js` });
    }
    await workspace.bitMap.write();
    return workspaceData;
  }

  function writeComp(workspacePath: string, compName: string, content: string) {
    fs.outputFileSync(path.join(workspacePath, compName, `${path.basename(compName)}.js`), content);
  }

  /** a fresh harmony per call, to simulate a new process running a new command */
  async function load(workspacePath: string) {
    const harmony = await loadManyAspects(
      [
        WorkspaceAspect,
        SnappingAspect,
        ExportAspect,
        ImporterAspect,
        RemoveAspect,
        StatusAspect,
        ListerAspect,
        ComponentAspect,
        ScopeAspect,
        InstallAspect,
        TrackerAspect,
        ComponentCompareAspect,
        CLIAspect,
      ],
      workspacePath
    );
    const cli = harmony.get<CLIMain>(CLIAspect.id);
    // commands resolve patterns against the cwd
    const inWorkspace = async <T>(fn: () => Promise<T>): Promise<T> => {
      const originalCwd = process.cwd();
      process.chdir(workspacePath);
      try {
        return await fn();
      } finally {
        process.chdir(originalCwd);
      }
    };
    const getCmd = (name: string) => {
      const cmd = cli.getCommand(name);
      if (!cmd) throw new Error(`the "${name}" command is not registered`);
      return cmd;
    };
    return {
      snapping: harmony.get<SnappingMain>(SnappingAspect.id),
      scope: harmony.get<ScopeMain>(ScopeAspect.id),
      tracker: harmony.get<TrackerMain>(TrackerAspect.id),
      workspace: harmony.get<Workspace>(WorkspaceAspect.id),
      report: (name: string, args: any[] = [], flags: Record<string, any> = {}) =>
        inWorkspace(async () => {
          const output: any = await getCmd(name).report!(args as any, flags);
          return stripAnsi(typeof output === 'string' ? output : output.data);
        }),
      json: (name: string, args: any[] = [], flags: Record<string, any> = {}) =>
        inWorkspace(async () => JSON.parse(JSON.stringify(await getCmd(name).json!(args as any, flags)))),
    };
  }

  async function expectToReject(fn: () => Promise<any>, messagePart: string) {
    let error: Error | undefined;
    try {
      await fn();
    } catch (err: any) {
      error = err;
    }
    if (!error) throw new Error(`expected to throw an error containing "${messagePart}", but it did not throw`);
    expect(stripAnsi(error.message)).to.have.string(messagePart);
  }

  const tagCmd = async (workspacePath: string, patterns: string[]) =>
    (await load(workspacePath)).report('tag', [patterns], { build: false });
  const tagAll = async (workspacePath: string, params: { unmodified?: boolean; version?: string } = {}) => {
    const { snapping } = await load(workspacePath);
    await snapping.tag({ build: false, ...params });
  };
  const removeComponent = async (workspacePath: string, pattern: string) =>
    (await load(workspacePath)).report('remove', [pattern], { silent: true });
  // "bit remove --remote" is "bit delete --hard"
  const removeComponentFromRemote = async (workspacePath: string, pattern: string) =>
    (await load(workspacePath)).report('delete', [pattern], { silent: true, hard: true });
  const exportAll = async (workspacePath: string) => (await load(workspacePath)).report('export', [[]]);
  const exportIds = async (workspacePath: string, ids: string[]) => (await load(workspacePath)).report('export', [ids]);
  const statusJson = async (workspacePath: string) => (await load(workspacePath)).json('status');
  const listRemote = async (workspacePath: string, remoteScopeName: string) =>
    (await load(workspacePath)).json('list', [remoteScopeName]);
  const listRemoteIds = async (workspacePath: string, remoteScopeName: string, flags: Record<string, any> = {}) =>
    (await load(workspacePath)).report('list', [remoteScopeName], { ids: true, ...flags });
  // the scope filter leaves out the envs, which the in-process workspace imports into its local scope
  const listLocalScopeJson = async (workspacePath: string, scope: string) =>
    (await load(workspacePath)).json('list', [], { localScope: true, scope });
  const listLocalScope = async (workspacePath: string, flags: Record<string, any> = {}) =>
    (await load(workspacePath)).report('list', [], { localScope: true, ...flags });
  /** the ids of the staged components, without the scope name (as the components are new, their scope is the default) */
  const getStagedIds = async (workspacePath: string, remoteScopeName: string): Promise<string[]> => {
    const status = await statusJson(workspacePath);
    return status.stagedComponents.map((staged) => staged.id.replace(`${remoteScopeName}/`, ''));
  };

  before(() => {
    // "bit delete --hard" is blocked in non-interactive sessions unless the feature is explicitly enabled
    addFeature('hard-delete');
  });
  after(async () => {
    reloadFeatureToggle();
    await Promise.all(workspaces.map((workspaceData) => destroyWorkspace(workspaceData)));
  });

  describe('tag with wildcard', () => {
    let workspaceData: WorkspaceData;
    before(async () => {
      workspaceData = await createWorkspaceWithComps();
    });
    describe('when wildcard does not match any component', () => {
      it('should not tag any component', async () => {
        await expectToReject(
          () => tagCmd(workspaceData.workspacePath, ['none/*']),
          'unable to find any component matching the "none/*" pattern'
        );
      });
    });
    describe('when wildcard match some of the components', () => {
      let output: string;
      before(async () => {
        output = await tagCmd(workspaceData.workspacePath, ['**/utils/is/*']);
      });
      it('should indicate the tagged components', () => {
        expect(output).to.have.string('2 component(s) tagged');
        expect(output).to.have.string('utils/is/string');
        expect(output).to.have.string('utils/is/type');
      });
      it('should tag only the matched components', async () => {
        const status = await statusJson(workspaceData.workspacePath);
        expect(status.stagedComponents).to.have.lengthOf(2);
        expect(status.newComponents).to.have.lengthOf(3);
      });
    });
  });

  describe('remove with wildcard', () => {
    let workspaceData: WorkspaceData;
    before(async () => {
      workspaceData = await createWorkspaceWithComps();
      await tagAll(workspaceData.workspacePath);
    });
    describe('when wildcard does not match any component', () => {
      it('should throw an error saying the wildcard does not match any id', async () => {
        await expectToReject(
          () => removeComponent(workspaceData.workspacePath, 'none/*'),
          'unable to find any component matching'
        );
      });
    });
    describe('when wildcard match some of the components', () => {
      let output: string;
      before(async () => {
        // as an intermediate step, make sure all components are staged
        const status = await statusJson(workspaceData.workspacePath);
        expect(status.stagedComponents).to.have.lengthOf(5);

        output = await removeComponent(workspaceData.workspacePath, '**/utils/fs/*');
      });
      it('should indicate the removed components', () => {
        expect(output).to.have.string('utils/fs/read');
        expect(output).to.have.string('utils/fs/write');
      });
      it('should remove only the matched components', async () => {
        const status = await statusJson(workspaceData.workspacePath);
        expect(status.stagedComponents).to.have.lengthOf(3);
      });
    });
  });

  describe('remove from remote with wildcard', () => {
    let workspaceData: WorkspaceData;
    before(async () => {
      workspaceData = await createWorkspaceWithComps();
      await tagAll(workspaceData.workspacePath);
      await exportAll(workspaceData.workspacePath);

      // as an intermediate step, make sure the remote scope has all components
      const ls = await listRemote(workspaceData.workspacePath, workspaceData.remoteScopeName);
      expect(ls).to.have.lengthOf(5);
    });
    describe('when wildcard does not match any component', () => {
      it('should throw an error saying the wildcard does not match any id', async () => {
        const pattern = `${workspaceData.remoteScopeName}/none/*`;
        await expectToReject(
          () => removeComponentFromRemote(workspaceData.workspacePath, pattern),
          stripAnsi(new NoIdMatchWildcard([pattern]).message)
        );
      });
    });
    describe('when wildcard match some of the components', () => {
      let output: string;
      before(async () => {
        output = await removeComponentFromRemote(
          workspaceData.workspacePath,
          `${workspaceData.remoteScopeName}/utils/fs/*`
        );
      });
      it('should indicate the removed components', () => {
        expect(output).to.have.string('utils/fs/read');
        expect(output).to.have.string('utils/fs/write');
      });
      it('should remove only the matched components', async () => {
        const ls = await listRemote(workspaceData.workspacePath, workspaceData.remoteScopeName);
        expect(ls).to.have.lengthOf(3);
      });
    });
  });

  describe('remove from remote with wildcard after removed locally', () => {
    let workspaceData: WorkspaceData;
    before(async () => {
      workspaceData = await createWorkspaceWithComps();
      await tagAll(workspaceData.workspacePath);
      await exportAll(workspaceData.workspacePath);
      await removeComponent(workspaceData.workspacePath, `${workspaceData.remoteScopeName}/**`);

      // as an intermediate step, make sure the remote scope has all components
      const ls = await listRemote(workspaceData.workspacePath, workspaceData.remoteScopeName);
      expect(ls).to.have.lengthOf(5);

      // as an intermediate step, make sure the local scope does not have any components
      const lsLocal = await listLocalScopeJson(workspaceData.workspacePath, workspaceData.remoteScopeName);
      expect(lsLocal).to.have.lengthOf(0);
    });
    describe('when wildcard match some of the components', () => {
      let output: string;
      before(async () => {
        output = await removeComponentFromRemote(
          workspaceData.workspacePath,
          `${workspaceData.remoteScopeName}/utils/fs/*`
        );
      });
      it('should indicate the removed components', () => {
        expect(output).to.have.string('utils/fs/read');
        expect(output).to.have.string('utils/fs/write');
      });
      it('should remove only the matched components', async () => {
        const ls = await listRemote(workspaceData.workspacePath, workspaceData.remoteScopeName);
        expect(ls).to.have.lengthOf(3);
      });
    });
  });

  describe('export with wildcard', () => {
    let workspaceData: WorkspaceData;
    before(async () => {
      workspaceData = await createWorkspaceWithComps();
      await tagAll(workspaceData.workspacePath);

      // as an intermediate step, make sure all components are staged
      const status = await statusJson(workspaceData.workspacePath);
      expect(status.stagedComponents).to.have.lengthOf(5);
    });
    describe('when wildcard does not match any component', () => {
      it('should not export any component', async () => {
        const output = await exportIds(workspaceData.workspacePath, ['none/*']);
        expect(output).to.have.string('nothing to export');
      });
    });
    describe('when wildcard match some of the components', () => {
      let output: string;
      before(async () => {
        output = await exportIds(workspaceData.workspacePath, ['*/fs/*']);
      });
      it('should indicate the exported components', () => {
        expect(output).to.have.string('exported components (2)');
      });
      it('should export only the matched components', async () => {
        const ls = await listRemote(workspaceData.workspacePath, workspaceData.remoteScopeName);
        expect(ls).to.have.lengthOf(2);
      });
      it('should not export the non matched components', async () => {
        const staged = await getStagedIds(workspaceData.workspacePath, workspaceData.remoteScopeName);
        // (staged components were not exported)
        expect(staged).to.have.lengthOf(3);
        expect(staged).to.include('bar/foo');
        expect(staged).to.include('utils/is/string');
        expect(staged).to.include('utils/is/type');
      });
    });
  });

  describe('untag with wildcard', () => {
    let workspaceData: WorkspaceData;
    before(async () => {
      workspaceData = await createWorkspaceWithComps();
      await tagAll(workspaceData.workspacePath);

      // as an intermediate step, make sure all components are staged
      const status = await statusJson(workspaceData.workspacePath);
      expect(status.stagedComponents).to.have.lengthOf(5);
    });
    describe('when wildcard does not match any component', () => {
      it('should throw an error saying that no components found', async () => {
        await expectToReject(
          async () => (await load(workspaceData.workspacePath)).report('reset', ['none/*'], {}),
          'unable to find any component matching'
        );
      });
    });
    describe('when wildcard match some of the components', () => {
      let output: string;
      before(async () => {
        output = await (await load(workspaceData.workspacePath)).report('reset', ['**/*/is/*'], {});
      });
      it('should indicate the untagged components', () => {
        expect(output).to.have.string('2 component(s) reset successfully');
        expect(output).to.have.string('utils/is/string');
        expect(output).to.have.string('utils/is/type');
      });
      it('should untag only the matched components', async () => {
        // "bit reset" sets an "id" property on the Version objects it loads, which breaks them for the next command
        // when it runs in the same process. in a real CLI, the next command is a new process.
        (await load(workspaceData.workspacePath)).scope.legacyScope.objects.clearObjectsFromCache();
        const status = await statusJson(workspaceData.workspacePath);
        expect(status.stagedComponents).to.have.lengthOf(3);
        expect(status.newComponents).to.have.lengthOf(2);
      });
    });
  });

  describe('diff with wildcard', () => {
    let workspaceData: WorkspaceData;
    const diff = async (pattern: string) =>
      (await load(workspaceData.workspacePath)).report('diff', [pattern, undefined, undefined], {});
    before(async () => {
      workspaceData = await createWorkspaceWithComps();
      await tagAll(workspaceData.workspacePath);
      ['utils/is/string', 'utils/is/type', 'utils/fs/read', 'utils/fs/write', 'bar/foo'].forEach((compName) =>
        writeComp(workspaceData.workspacePath, compName, '')
      );

      // as an intermediate step, make sure all components are modified (so then they should show
      // an output for diff command)
      const status = await statusJson(workspaceData.workspacePath);
      expect(status.modifiedComponents).to.have.lengthOf(5);
    });
    describe('when wildcard does not match any component', () => {
      it('should throw an error saying the wildcard does not match any id', async () => {
        await expectToReject(() => diff('none/*'), stripAnsi(new NoIdMatchPattern('none/*').message));
      });
    });
    describe('when wildcard match some of the components', () => {
      let output: string;
      before(async () => {
        output = await diff('**/utils/is/*');
      });
      it('should show diff only for the matched components', () => {
        expect(output).to.have.string('utils/is/string');
        expect(output).to.have.string('utils/is/type');
      });
      it('should not show diff for unmatched unmatched components', () => {
        expect(output).to.not.have.string('utils/fs/read');
        expect(output).to.not.have.string('utils/fs/write');
        expect(output).to.not.have.string('bar/foo');
      });
    });
  });

  describe('list with wildcard', () => {
    let output: string;
    before(async () => {
      const workspaceData = await createWorkspaceWithComps();
      await tagAll(workspaceData.workspacePath);
      output = await listLocalScope(workspaceData.workspacePath, { namespace: 'bar/*' });
    });
    it('should list only for the matched components', () => {
      expect(output).to.have.string('bar/foo');
    });
    it('should not list unmatched components', () => {
      expect(output).to.not.have.string('utils');
    });
  });

  describe('list remote with wildcard', () => {
    let output: string;
    before(async () => {
      const workspaceData = await createWorkspaceWithComps();
      await tagAll(workspaceData.workspacePath);
      await exportAll(workspaceData.workspacePath);
      output = await listRemoteIds(workspaceData.workspacePath, workspaceData.remoteScopeName, {
        namespace: 'bar/*',
      });
    });
    it('should list only for the matched components', () => {
      expect(output).to.have.string('bar/foo');
    });
    it('should not list unmatched components', () => {
      expect(output).to.not.have.string('utils');
    });
  });
});
