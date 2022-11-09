import { expect } from 'chai';
import { loadAspect } from '@teambit/harmony.testing.load-aspect';
import { mockWorkspace, destroyWorkspace, WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockComponents } from '@teambit/component.testing.mock-components';
import { LanesAspect } from './lanes.aspect';
import { LanesMain } from './lanes.main.runtime';

// describe('LanesAspect', function () {
//   let lanes: LanesMain;
//   let workspaceData: WorkspaceData;
//   beforeAll(async () => {
//     workspaceData = mockWorkspace();
//     const { workspacePath } = workspaceData;
//     await mockComponents(workspacePath);
//     lanes = await loadAspect(LanesAspect, workspacePath);
//     await lanes.createLane('stage');
//   });
//   afterAll(async () => {
//     await destroyWorkspace(workspaceData);
//   });
//   describe('getLanes()', () => {
//     it('should list all lanes', async () => {
//       const currentLanes = await lanes.getLanes({});
//       expect(currentLanes).toBeDefined();
//       expect(currentLanes[0].name).toEqual('stage');
//     });
//   });
// });

describe('LanesAspect', function () {
  this.timeout(0);
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
  describe('getLanes()', () => {
    it('should list all lanes', async () => {
      const currentLanes = await lanes.getLanes({});
      expect(currentLanes).to.have.lengthOf(1);
      expect(currentLanes[0].name).to.equal('stage');
    });
  });
});
