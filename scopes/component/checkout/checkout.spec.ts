import chai, { expect } from 'chai';
import fs from 'fs-extra';
import { ComponentID } from '@teambit/component-id';
import { loadAspect } from '@teambit/harmony.testing.load-aspect';
import { SnappingAspect, SnappingMain } from '@teambit/snapping';
import { WorkspaceAspect, Workspace } from '@teambit/workspace';
import { mockWorkspace, destroyWorkspace, WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockComponents } from '@teambit/component.testing.mock-components';
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
});
