import chai, { expect } from 'chai';
import fs from 'fs-extra';
import { Harmony } from '@teambit/harmony';
import { ComponentID } from '@teambit/component-id';
import { loadAspect, loadManyAspects } from '@teambit/harmony.testing.load-aspect';
import { SnappingAspect, SnappingMain } from '@teambit/snapping';
import { WorkspaceAspect, Workspace } from '@teambit/workspace';
import { mockWorkspace, destroyWorkspace, WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockComponents } from '@teambit/component.testing.mock-components';
import { ListerAspect, ListerMain } from '@teambit/lister';
import { CheckoutMain } from './checkout.main.runtime';
import { CheckoutAspect } from './checkout.aspect';

chai.use(require('chai-fs'));

describe('CheckoutAspect', function () {
  this.timeout(0);

  describe('checkout reset when the component files were deleted', () => {
    let checkout: CheckoutMain;
    let workspace: Workspace;
    let workspaceData: WorkspaceData;
    let compDir: string;
    let compId: ComponentID;
    before(async () => {
      workspaceData = mockWorkspace();
      const { workspacePath } = workspaceData;
      const compsDir = await mockComponents(workspacePath);
      const snapping: SnappingMain = await loadAspect(SnappingAspect, workspacePath);
      await snapping.tag({ ids: ['comp1'], build: false, ignoreIssues: 'MissingManuallyConfiguredPackages' });
      const { id, dir } = compsDir[0];
      compId = id;
      compDir = dir;
      await fs.remove(dir);

      // an intermediate step, check sure that the dir is not there and the component is invalid
      expect(dir).to.not.be.a.path();
      workspace = await loadAspect(WorkspaceAspect, workspacePath);
      const { components, invalidComponents } = await workspace.componentLoader.getMany([id], undefined, false);
      expect(components).to.have.lengthOf(0);
      expect(invalidComponents).to.have.lengthOf(1);

      checkout = await loadAspect(CheckoutAspect, workspacePath);
      await checkout.checkout({ reset: true, ids: [id] });
    });
    after(async () => {
      await destroyWorkspace(workspaceData);
    });
    it('should bring the files back', () => {
      expect(compDir).to.be.a.path();
    });
    it('the workspace should get the component as a valid component', async () => {
      workspace = await loadAspect(WorkspaceAspect, workspaceData.workspacePath);
      const { components, invalidComponents } = await workspace.componentLoader.getMany([compId], undefined, false);
      expect(components).to.have.lengthOf(1);
      expect(invalidComponents).to.have.lengthOf(0);
    });
  });

  describe('checkout to an ancestor', () => {
    let workspaceData: WorkspaceData;
    let harmony: Harmony;
    before(async () => {
      workspaceData = mockWorkspace();
      const { workspacePath } = workspaceData;
      await mockComponents(workspacePath, { numOfComponents: 2 });
      harmony = await loadManyAspects([SnappingAspect, ListerAspect, CheckoutAspect], workspacePath);
      const snapping: SnappingMain = harmony.get(SnappingAspect.id);
      const tagOpts = { build: false, ignoreIssues: 'MissingManuallyConfiguredPackages', unmodified: true };
      await snapping.tag(tagOpts); // 0.0.1
      await snapping.tag(tagOpts); // 0.0.2
      await snapping.tag(tagOpts); // 0.0.3
      await snapping.tag(tagOpts); // 0.0.4

      const checkout: CheckoutMain = harmony.get(CheckoutAspect.id);
      await checkout.checkoutByCLIValues('', { ancestor: 2, all: true, skipNpmInstall: true });
    });
    it('should checkout according to the number of generations specified', async () => {
      const lister: ListerMain = harmony.get(ListerAspect.id);
      const list = await lister.localList();
      expect(list).to.have.lengthOf(2);
      expect(list[0].currentlyUsedVersion).to.equal('0.0.2');
      expect(list[1].currentlyUsedVersion).to.equal('0.0.2');
    });
  });
});
