import { expect } from 'chai';
import type { Harmony } from '@teambit/harmony';
import { loadManyAspects } from '@teambit/harmony.testing.load-aspect';
import { RemoveAspect } from '@teambit/remove';
import type { SnappingMain } from '@teambit/snapping';
import { SnappingAspect } from '@teambit/snapping';
import type { Workspace } from '@teambit/workspace';
import { WorkspaceAspect } from '@teambit/workspace';
import type { ExportMain } from '@teambit/export';
import { ExportAspect } from '@teambit/export';
import type { LaneId } from '@teambit/lane-id';
import type { LanesMain } from '@teambit/lanes';
import { LanesAspect } from '@teambit/lanes';
import type { WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockWorkspace, destroyWorkspace } from '@teambit/workspace.testing.mock-workspace';
import { mockComponents } from '@teambit/component.testing.mock-components';
import type { MergeLanesMain } from './merge-lanes.main.runtime';
import { MergeLanesAspect } from './merge-lanes.aspect';

describe('MergeLanesAspect', function () {
  this.timeout(0);

  describe('create comps on a lane then switch to main with --head', () => {
    let lanes: LanesMain;
    let workspaceData: WorkspaceData;
    let snapping: SnappingMain;
    let laneId: LaneId;
    let harmony: Harmony;
    before(async () => {
      workspaceData = mockWorkspace();
      const { workspacePath } = workspaceData;
      await mockComponents(workspacePath);
      harmony = await loadManyAspects(
        [SnappingAspect, ExportAspect, RemoveAspect, WorkspaceAspect, LanesAspect],
        workspaceData.workspacePath
      );
      lanes = harmony.get(LanesAspect.id);
      await lanes.createLane('stage');

      const currentLaneId = lanes.getCurrentLaneId();
      if (!currentLaneId) throw new Error('unable to get the current lane-id');
      laneId = currentLaneId;

      snapping = harmony.get(SnappingAspect.id);
      await snapping.snap({ build: false });
      const exporter: ExportMain = harmony.get(ExportAspect.id);
      await exporter.export();

      // in another workspace, merge the lane into main.
      const workspaceData2 = mockWorkspace({ bareScopeName: workspaceData.remoteScopeName });
      const harmony2 = await loadManyAspects(
        [SnappingAspect, ExportAspect, RemoveAspect, WorkspaceAspect, LanesAspect, MergeLanesAspect],
        workspaceData2.workspacePath
      );
      const mergeLanes2 = harmony2.get<MergeLanesMain>(MergeLanesAspect.id);
      const lanes2 = harmony2.get<LanesMain>(LanesAspect.id);
      const currentLaneId2 = lanes2.getCurrentLaneId() as LaneId;
      await mergeLanes2.mergeLane(laneId, currentLaneId2, {
        mergeStrategy: 'manual',
        skipDependencyInstallation: true,
      });
      const export2 = harmony2.get<ExportMain>(ExportAspect.id);
      await export2.export();

      // reload harmony, otherwise, the "lanes" aspect has the workspace of harmony2.
      harmony = await loadManyAspects([LanesAspect], workspaceData.workspacePath);
      lanes = harmony.get(LanesAspect.id);
      await lanes.switchLanes('main', { skipDependencyInstallation: true });
    });
    after(async () => {
      await destroyWorkspace(workspaceData);
    });
    it('the components should be available on main', () => {
      const workspace: Workspace = harmony.get(WorkspaceAspect.id);
      const ids = workspace.listIds();
      expect(ids.length).to.equal(1);
    });
  });
});
