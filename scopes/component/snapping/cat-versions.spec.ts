import { expect } from 'chai';
import { loadManyAspects } from '@teambit/harmony.testing.load-aspect';
import type { WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockWorkspace, destroyWorkspace } from '@teambit/workspace.testing.mock-workspace';
import { WorkspaceAspect } from '@teambit/workspace';
import type { CLIMain } from '@teambit/cli';
import { CLIAspect } from '@teambit/cli';
import { mockComponents, modifyMockedComponents } from '@teambit/component.testing.mock-components';
import type { SnappingMain } from './snapping.main.runtime';
import { SnappingAspect } from './snapping.aspect';

/**
 * "bit cat" reading a component at a tagged version. it lives here rather than next to the command
 * in the component aspect, since tagging needs this aspect and the component aspect must not depend
 * on it. the output formatting itself is covered in the component aspect (cat.cmd.spec.ts).
 */
describe('bit cat on a tagged component', function () {
  this.timeout(0);

  let workspaceData: WorkspaceData;
  let cat: (id: string) => Promise<string>;
  before(async () => {
    workspaceData = mockWorkspace();
    const { workspacePath } = workspaceData;
    await mockComponents(workspacePath);
    const harmony = await loadManyAspects([WorkspaceAspect, SnappingAspect], workspacePath);
    const snapping = harmony.get<SnappingMain>(SnappingAspect.id);
    await snapping.tag({ build: false, version: '0.0.1' });
    await modifyMockedComponents(workspacePath, '-v2');
    await snapping.tag({ build: false, version: '0.0.2' });

    // the command as registered, so the host it reads from is the one the CLI would give it
    const catCmd = harmony.get<CLIMain>(CLIAspect.id).getCommand('cat');
    if (!catCmd?.report) throw new Error('the "cat" command is not registered');
    cat = async (id) => (await catCmd.report!([id], { config: false, all: false, json: false })) as string;
  });
  after(async () => {
    await destroyWorkspace(workspaceData);
  });

  it('should show the files at a specific historical version', async () => {
    const output = await cat('comp1@0.0.1');
    expect(output).to.have.string('--- index.js ---');
    expect(output).to.have.string("'comp1'");
    expect(output).to.not.have.string('comp1-v2');
  });

  it('should show the latest version when no version is specified', async () => {
    const output = await cat('comp1');
    expect(output).to.have.string('comp1-v2');
  });
});
