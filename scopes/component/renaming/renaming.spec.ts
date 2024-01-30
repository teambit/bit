import chai, { expect } from 'chai';
import {
  ConfigAspect,
  // ConfigMain
} from '@teambit/config';
import { loadManyAspects } from '@teambit/harmony.testing.load-aspect';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import { mockWorkspace, destroyWorkspace, WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockComponents } from '@teambit/component.testing.mock-components';
import { RenamingMain } from './renaming.main.runtime';
import { RenamingAspect } from './renaming.aspect';

chai.use(require('chai-fs'));

describe('Renaming Aspect', function () {
  this.timeout(0);

  // @todo: when running this, it changes the workspace.jsonc of this bit repo itself.
  // see the commented line, it shows why. the config aspect is the config-aspect of bit repo instead of the
  // same Harmony instance for some reason.
  describe.skip('rename scope when a component id has a namespace', () => {
    let renaming: RenamingMain;
    let workspace: Workspace;
    let workspaceData: WorkspaceData;
    before(async () => {
      workspaceData = mockWorkspace();
      const { workspacePath } = workspaceData;
      await mockComponents(workspacePath);

      const harmony = await loadManyAspects([WorkspaceAspect, RenamingAspect, ConfigAspect], workspacePath);
      renaming = harmony.get<RenamingMain>(RenamingAspect.id);
      workspace = harmony.get<Workspace>(WorkspaceAspect.id);

      // console.log('\nworkspace', workspace.path);
      // const config = harmony.get<ConfigMain>('teambit.harmony/config');
      // console.log('\nconfig path ', config.path);

      await renaming.rename('comp1', 'ui/comp1');
      await renaming.renameScope(workspaceData.remoteScopeName, 'another-scope-name');
    });
    after(async () => {
      await destroyWorkspace(workspaceData);
    });
    // previously, it was throwing MissingBitMapComponent due to incorrect replacement of "ui/comp1" with "comp1"
    it('should bring the files back', async () => {
      const ids = await workspace.listIds();
      expect(ids[0].scope).to.equal('another-scope-name');
      expect(ids[0].fullName).to.equal('ui/comp1');
    });
  });
});
