import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import { parse } from 'comment-json';
import stripAnsi from 'strip-ansi';
import { loadManyAspects } from '@teambit/harmony.testing.load-aspect';
import type { WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockWorkspace, destroyWorkspace } from '@teambit/workspace.testing.mock-workspace';
import { WorkspaceAspect } from '@teambit/workspace';
import type { Workspace } from '@teambit/workspace';
import type { CLIMain } from '@teambit/cli';
import { CLIAspect } from '@teambit/cli';
import { TrackerAspect } from '@teambit/tracker';
import type { TrackerMain } from '@teambit/tracker';
import { SnappingAspect } from '@teambit/snapping';
import type { SnappingMain } from '@teambit/snapping';
import { NoIdMatchPattern } from '@teambit/scope';
import { ComponentsList } from '@teambit/legacy.component-list';
import { CheckoutAspect } from './checkout.aspect';

/**
 * "bit checkout" with a component-id pattern that has a wildcard.
 */
describe('checkout with wildcard', function () {
  this.timeout(0);

  let workspaceData: WorkspaceData;
  const compNames = ['utils/is/string', 'utils/is/type', 'utils/fs/read', 'utils/fs/write', 'bar/foo'];

  /** a fresh harmony per call, to simulate a new process running a new command */
  async function load() {
    const harmony = await loadManyAspects(
      [WorkspaceAspect, SnappingAspect, TrackerAspect, CheckoutAspect, CLIAspect],
      workspaceData.workspacePath
    );
    return {
      workspace: harmony.get<Workspace>(WorkspaceAspect.id),
      snapping: harmony.get<SnappingMain>(SnappingAspect.id),
      tracker: harmony.get<TrackerMain>(TrackerAspect.id),
      cli: harmony.get<CLIMain>(CLIAspect.id),
    };
  }

  async function checkout(to: string, pattern: string): Promise<string> {
    const { cli } = await load();
    const checkoutCmd = cli.getCommand('checkout');
    if (!checkoutCmd?.report) throw new Error('the "checkout" command is not registered');
    // the pattern is resolved against the cwd
    const originalCwd = process.cwd();
    process.chdir(workspaceData.workspacePath);
    try {
      const output: any = await checkoutCmd.report([to, pattern] as any, { skipDependencyInstallation: true });
      return stripAnsi(typeof output === 'string' ? output : output.data);
    } finally {
      process.chdir(originalCwd);
    }
  }

  const readBitMap = (): Record<string, any> =>
    parse(fs.readFileSync(path.join(workspaceData.workspacePath, '.bitmap'), 'utf8'), undefined, true) as Record<
      string,
      any
    >;

  before(async () => {
    workspaceData = mockWorkspace();
    const { workspacePath } = workspaceData;
    compNames.forEach((compName) =>
      fs.outputFileSync(
        path.join(workspacePath, compName, `${path.basename(compName)}.js`),
        'module.exports = () => {};'
      )
    );
    const { tracker, workspace } = await load();
    for (const compName of compNames) {
      await tracker.track({ rootDir: compName, componentName: compName, mainFile: `${path.basename(compName)}.js` });
    }
    await workspace.bitMap.write();
    await (await load()).snapping.tag({ build: false });
    await (await load()).snapping.tag({ build: false, unmodified: true, version: '0.0.5' });

    // as an intermediate step, make sure all components are staged
    const { workspace: loadedWorkspace } = await load();
    const staged = await new ComponentsList(loadedWorkspace).listExportPendingComponentsIds();
    expect(staged).to.have.lengthOf(5);
  });
  after(async () => {
    await destroyWorkspace(workspaceData);
  });

  describe('when wildcard does not match any component', () => {
    it('should throw an error saying the wildcard does not match any id', async () => {
      let error: Error | undefined;
      try {
        await checkout('0.0.1', 'none/*');
      } catch (err: any) {
        error = err;
      }
      if (!error) throw new Error('expected checkout to throw, but it did not');
      expect(stripAnsi(error.message)).to.have.string(stripAnsi(new NoIdMatchPattern('none/*').message));
    });
  });
  describe('when wildcard match some of the components', () => {
    let output: string;
    before(async () => {
      output = await checkout('0.0.1', '**/utils/is/*');
    });
    it('should indicate the number of checked out components', () => {
      expect(output).to.have.string('successfully switched 2 components');
    });
    it('should checkout only the matched components', () => {
      const bitMap = readBitMap();
      expect(bitMap['utils/is/string'].version).to.equal('0.0.1');
      expect(bitMap['utils/is/type'].version).to.equal('0.0.1');
    });
    it('should not checkout the unmatched components', () => {
      const bitMap = readBitMap();
      expect(bitMap['utils/fs/read'].version).to.equal('0.0.5');
      expect(bitMap['utils/fs/write'].version).to.equal('0.0.5');
      expect(bitMap['bar/foo'].version).to.equal('0.0.5');
    });
  });
});
