import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import stripAnsi from 'strip-ansi';
import { loadManyAspects } from '@teambit/harmony.testing.load-aspect';
import type { WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockWorkspace, destroyWorkspace } from '@teambit/workspace.testing.mock-workspace';
import { WorkspaceAspect } from '@teambit/workspace';
import type { Workspace } from '@teambit/workspace';
import type { CLIMain } from '@teambit/cli';
import { CLIAspect } from '@teambit/cli';
import { ComponentAspect } from '@teambit/component';
import { TrackerAspect } from '@teambit/tracker';
import type { TrackerMain } from '@teambit/tracker';
import { SnappingAspect } from '@teambit/snapping';
import type { SnappingMain } from '@teambit/snapping';
import { StatusAspect } from './status.aspect';

/**
 * deleting a file from a component, before and after it was tagged. it lives in the status aspect rather than in
 * the snapping aspect, since the flows assert the status, and tag is needed to set up the component.
 */
describe('delete files from a component', function () {
  this.timeout(0);

  const workspaces: WorkspaceData[] = [];

  /** a fresh harmony per call, to simulate a new process running a new command */
  async function load(workspacePath: string) {
    const harmony = await loadManyAspects(
      [WorkspaceAspect, SnappingAspect, StatusAspect, ComponentAspect, TrackerAspect, CLIAspect],
      workspacePath
    );
    const cli = harmony.get<CLIMain>(CLIAspect.id);
    return {
      tracker: harmony.get<TrackerMain>(TrackerAspect.id),
      snapping: harmony.get<SnappingMain>(SnappingAspect.id),
      workspace: harmony.get<Workspace>(WorkspaceAspect.id),
      report: async (name: string, args: any[] = [], flags: Record<string, any> = {}) => {
        const cmd = cli.getCommand(name);
        if (!cmd) throw new Error(`the "${name}" command is not registered`);
        const originalCwd = process.cwd();
        process.chdir(workspacePath);
        try {
          const output: any = await cmd.report!(args as any, flags);
          return stripAnsi(typeof output === 'string' ? output : output.data);
        } finally {
          process.chdir(originalCwd);
        }
      },
    };
  }

  /** bar/foo with two files: foo.js (the main file) and baz.js */
  async function createBarFoo(): Promise<string> {
    const workspaceData = mockWorkspace();
    workspaces.push(workspaceData);
    const { workspacePath } = workspaceData;
    fs.outputFileSync(path.join(workspacePath, 'bar/foo.js'), `module.exports = function foo() { return 'got foo'; };`);
    fs.outputFileSync(path.join(workspacePath, 'bar/baz.js'), '');
    const { tracker, workspace } = await load(workspacePath);
    await tracker.track({ rootDir: 'bar', componentName: 'bar/foo', mainFile: 'bar/foo.js' });
    await workspace.bitMap.write();
    return workspacePath;
  }

  const tagBarFoo = async (workspacePath: string) => {
    const { snapping } = await load(workspacePath);
    await snapping.tag({ build: false, ids: ['bar/foo'] } as any);
  };
  const deleteBaz = (workspacePath: string) => fs.removeSync(path.join(workspacePath, 'bar/baz.js'));

  after(async () => {
    await Promise.all(workspaces.map((workspaceData) => destroyWorkspace(workspaceData)));
  });

  describe('after adding it', () => {
    let statusOutput: string;
    before(async () => {
      const workspacePath = await createBarFoo();
      deleteBaz(workspacePath);
      statusOutput = await (await load(workspacePath)).report('status');
    });
    it('bit status should not throw an error and should show it as a new component', () => {
      expect(statusOutput.includes('new components')).to.be.true;
      expect(statusOutput.includes('bar/foo')).to.be.true;
    });
  });
  describe('tag and then delete a file', () => {
    let statusOutput: string;
    before(async () => {
      const workspacePath = await createBarFoo();
      await tagBarFoo(workspacePath);
      deleteBaz(workspacePath);
      statusOutput = await (await load(workspacePath)).report('status');
    });
    it('bit status should show the component as modified', () => {
      expect(statusOutput.includes('modified components')).to.be.true;
      expect(statusOutput.includes('bar/foo')).to.be.true;
    });
  });
  describe('adding a file, tagging it, deleting it and then tagging again', () => {
    let showOutput: string;
    before(async () => {
      const workspacePath = await createBarFoo();
      await tagBarFoo(workspacePath);
      deleteBaz(workspacePath);
      await tagBarFoo(workspacePath);
      showOutput = await (await load(workspacePath)).report('show', ['bar/foo']);
    });
    it('should not show the deleted file in bit show command', () => {
      expect(showOutput).to.have.string('foo.js');
      expect(showOutput).not.to.have.string('baz.js');
    });
  });
});
