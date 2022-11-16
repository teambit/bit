import { expect } from 'chai';
import { loadAspect } from '@teambit/harmony.testing.load-aspect';
import SnappingAspect, { SnappingMain } from '@teambit/snapping';
import { mockWorkspace, destroyWorkspace, WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockComponents } from '@teambit/component.testing.mock-components';
import { LanesAspect } from './lanes.aspect';
import { LanesMain } from './lanes.main.runtime';

describe('LanesAspect', function () {
  this.timeout(0);

  describe('getLanes()', () => {
    let lanes: LanesMain;
    let workspaceData: WorkspaceData;
    before(async () => {
      workspaceData = mockWorkspace();
      const { workspacePath } = workspaceData;
      await mockComponents(workspacePath);
      lanes = await loadAspect(LanesAspect, workspacePath);
      await lanes.createLane('stage');
    });
    after(async () => {
      await destroyWorkspace(workspaceData);
    });
    it('should list all lanes', async () => {
      const currentLanes = await lanes.getLanes({});
      expect(currentLanes).to.have.lengthOf(1);
      expect(currentLanes[0].name).to.equal('stage');
    });
  });

  describe('isLaneUpToDate', () => {
    let lanes: LanesMain;
    let snapping: SnappingMain;
    let workspaceData: WorkspaceData;
    before(async () => {
      workspaceData = mockWorkspace();
      const { workspacePath } = workspaceData;
      await mockComponents(workspacePath);
      snapping = await loadAspect(SnappingAspect, workspacePath);
      await snapping.tag({ ids: ['comp1'], build: false });
      lanes = await loadAspect(LanesAspect, workspacePath);
      await lanes.createLane('stage');
      const result = await snapping.snap({ pattern: 'comp1', build: false, unmodified: true });
      // intermediate step, make sure it is snapped
      expect(result?.snappedComponents.length).to.equal(1);
    });
    after(async () => {
      await destroyWorkspace(workspaceData);
    });
    it('should return that the lane is up to date when the lane is ahead of main', async () => {
      const currentLane = await lanes.getCurrentLane();
      if (!currentLane) throw new Error('unable to get the current lane');
      const isUpToDate = await lanes.isLaneUpToDate(currentLane);
      expect(isUpToDate).to.be.true;
    });
    it('should return that the lane is not up to date when main is ahead', async () => {
      const currentLane = await lanes.getCurrentLane();
      if (!currentLane) throw new Error('unable to get the current lane');
      await lanes.switchLanes('main', { skipDependencyInstallation: true });
      await snapping.snap({ pattern: 'comp1', build: false, unmodified: true });
      const isUpToDate = await lanes.isLaneUpToDate(currentLane);
      expect(isUpToDate).to.be.false;
    });
  });
});
