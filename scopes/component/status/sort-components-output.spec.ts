import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import stripAnsi from 'strip-ansi';
import { loadManyAspects } from '@teambit/harmony.testing.load-aspect';
import type { WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockWorkspace, destroyWorkspace } from '@teambit/workspace.testing.mock-workspace';
import { mockComponents } from '@teambit/component.testing.mock-components';
import { WorkspaceAspect } from '@teambit/workspace';
import type { CLIMain } from '@teambit/cli';
import { CLIAspect } from '@teambit/cli';
import { ListerAspect } from '@teambit/lister';
import { SnappingAspect } from '@teambit/snapping';
import type { SnappingMain } from '@teambit/snapping';
import { StatusAspect } from './status.aspect';

/**
 * expect the components 'comp1', 'comp2', 'comp3' to be sorted in this order
 */
function expectComponentsToBeSortedAlphabetically(output: string, start = 0) {
  expect(output.indexOf('comp1', start)).to.be.below(output.indexOf('comp2', start));
  expect(output.indexOf('comp2', start)).to.be.below(output.indexOf('comp3', start));
}

/**
 * the status and list outputs sort the components alphabetically. it lives in the status aspect rather than in the
 * lister aspect, since tagging needs the snapping aspect, which is a dependent of the lister aspect.
 */
describe('sort components output', function () {
  this.timeout(0);
  let workspaceData: WorkspaceData;
  let workspacePath: string;

  /** a fresh harmony per call, to simulate a new process running a new command */
  async function run(commandName: string, flags: Record<string, any> = {}): Promise<string> {
    const harmony = await loadManyAspects([WorkspaceAspect, SnappingAspect, StatusAspect, ListerAspect], workspacePath);
    const cmd = harmony.get<CLIMain>(CLIAspect.id).getCommand(commandName);
    if (!cmd?.report) throw new Error(`the "${commandName}" command is not registered`);
    const originalCwd = process.cwd();
    process.chdir(workspacePath);
    try {
      const output: any = await cmd.report([], flags);
      return stripAnsi(typeof output === 'string' ? output : output.data);
    } finally {
      process.chdir(originalCwd);
    }
  }
  // the scope filter leaves out the envs, which the in-process workspace imports into its local scope
  const listLocalScope = () => run('list', { localScope: true, scope: workspaceData.remoteScopeName });

  before(async () => {
    workspaceData = mockWorkspace();
    workspacePath = workspaceData.workspacePath;
    await mockComponents(workspacePath, { numOfComponents: 3 });
  });
  after(async () => {
    await destroyWorkspace(workspaceData);
  });

  describe('after adding components', () => {
    describe('bit status', () => {
      let output: string;
      before(async () => {
        output = await run('status');
      });
      it('should show all of them under new components', () => {
        expect(output).to.not.have.string('no new components');
        expect(output).to.have.string('new components');
      });
      it('should show new components sorted alphabetically', () => {
        expectComponentsToBeSortedAlphabetically(output);
      });
    });
    it('bit list --local-scope should not show any component', async () => {
      expect(await listLocalScope()).to.have.string('found 0 components');
    });
  });

  describe('after tagging the components', () => {
    before(async () => {
      const harmony = await loadManyAspects([WorkspaceAspect, SnappingAspect], workspacePath);
      await harmony.get<SnappingMain>(SnappingAspect.id).tag({ build: false, version: '0.0.1' });
    });
    describe('bit status', () => {
      let output: string;
      before(async () => {
        output = await run('status');
      });
      it('should show all of them under staged components', () => {
        expect(output).to.not.have.string('no staged components');
        expect(output).to.have.string('staged components');
      });
      it('should show staged components sorted alphabetically', () => {
        expectComponentsToBeSortedAlphabetically(output);
      });
    });
    it('bit list should show the components sorted alphabetically', async () => {
      expectComponentsToBeSortedAlphabetically(await listLocalScope());
    });

    describe('after deleting the components', () => {
      const names = ['comp1', 'comp2', 'comp3'];
      before(() => {
        names.forEach((name) => fs.moveSync(path.join(workspacePath, name), path.join(workspacePath, `${name}-bak`)));
      });
      after(() => {
        names.forEach((name) => fs.moveSync(path.join(workspacePath, `${name}-bak`), path.join(workspacePath, name)));
      });
      describe('bit status', () => {
        let output: string;
        before(async () => {
          output = await run('status');
        });
        it('should show all of them under deleted components', () => {
          expect(output).to.have.string('component files were deleted');
        });
        it('should show deleted components sorted alphabetically', () => {
          expectComponentsToBeSortedAlphabetically(output);
        });
      });
    });
  });
});
