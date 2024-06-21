import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import { Harmony } from '@teambit/harmony';
import { loadAspect, loadManyAspects } from '@teambit/harmony.testing.load-aspect';
import { RemoveAspect, RemoveMain } from '@teambit/remove';
import { SnappingAspect, SnappingMain } from '@teambit/snapping';
import { WorkspaceAspect, Workspace } from '@teambit/workspace';
import { ExportAspect, ExportMain } from '@teambit/export';
import { LaneId } from '@teambit/lane-id';
import { SUPPORT_LANE_HISTORY, addFeature, removeFeature } from '@teambit/legacy/dist/api/consumer/lib/feature-toggle';
import { mockWorkspace, destroyWorkspace, WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockComponents, modifyMockedComponents } from '@teambit/component.testing.mock-components';
import { ChangeType } from '@teambit/lanes.entities.lane-diff';
import { MergeLanesAspect, MergeLanesMain } from '@teambit/merge-lanes';
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
      await snapping.tag({ ids: ['comp1'], build: false, ignoreIssues: 'MissingManuallyConfiguredPackages' });
      const exporter: ExportMain = await loadAspect(ExportAspect, workspacePath);
      await exporter.export();
      lanes = await loadAspect(LanesAspect, workspacePath);
      await lanes.createLane('stage');
      await modifyMockedComponents(workspacePath, 'v2');
      const result = await snapping.snap({
        pattern: 'comp1',
        build: false,
        ignoreIssues: 'MissingManuallyConfiguredPackages',
      });
      // intermediate step, make sure it is snapped
      expect(result?.snappedComponents.length).to.equal(1);
    });
    after(async () => {
      await destroyWorkspace(workspaceData);
    });
    it('should return that the lane is up to date when the lane is ahead of main', async () => {
      const currentLane = await lanes.getCurrentLane();
      if (!currentLane) throw new Error('unable to get the current lane');
      const isUpToDate = (
        await lanes.diffStatus(currentLane.toLaneId(), undefined, { skipChanges: true })
      ).componentsStatus.every((c) => c.upToDate);

      expect(isUpToDate).to.be.true;
    });
    it('should return that the lane is not up to date when main is ahead', async () => {
      const currentLane = await lanes.getCurrentLane();
      if (!currentLane) throw new Error('unable to get the current lane');
      await lanes.switchLanes('main', { skipDependencyInstallation: true });
      await snapping.snap({
        pattern: 'comp1',
        build: false,
        unmodified: true,
        ignoreIssues: 'MissingManuallyConfiguredPackages',
      });
      const isUpToDate = (
        await lanes.diffStatus(currentLane.toLaneId(), undefined, { skipChanges: true })
      ).componentsStatus.every((c) => c.upToDate);

      expect(isUpToDate).to.be.false;
    });
  });

  describe('laneDiff', () => {
    let lanes: LanesMain;
    let snapping: SnappingMain;
    let workspaceData: WorkspaceData;
    before(async () => {
      workspaceData = mockWorkspace();
      const { workspacePath } = workspaceData;
      await mockComponents(workspacePath);
      snapping = await loadAspect(SnappingAspect, workspacePath);
      await snapping.tag({ ids: ['comp1'], build: false });
      const exporter: ExportMain = await loadAspect(ExportAspect, workspacePath);
      await exporter.export();
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
      const laneDiffResults = await lanes.diffStatus(currentLane.toLaneId());
      expect(laneDiffResults.componentsStatus[0].upToDate).to.be.true;
      expect(laneDiffResults.componentsStatus[0].changeType).to.equal(ChangeType.NONE);
    });
    it('should return that the lane is not up to date when main is ahead', async () => {
      const currentLane = await lanes.getCurrentLane();
      if (!currentLane) throw new Error('unable to get the current lane');
      await lanes.switchLanes('main', { skipDependencyInstallation: true });
      await snapping.snap({ pattern: 'comp1', build: false, unmodified: true });

      const laneDiffResults = await lanes.diffStatus(currentLane.toLaneId());
      expect(laneDiffResults.componentsStatus[0].upToDate).to.be.false;
      expect(laneDiffResults.componentsStatus[0].changeType).to.equal(ChangeType.NONE);
    });
  });

  describe('restoreLane()', () => {
    let lanes: LanesMain;
    let workspaceData: WorkspaceData;
    before(async () => {
      workspaceData = mockWorkspace();
      const { workspacePath } = workspaceData;
      await mockComponents(workspacePath);
      lanes = await loadAspect(LanesAspect, workspacePath);
      await lanes.createLane('stage');

      // as an intermediate step, make sure the lane was created
      const currentLanes = await lanes.getLanes({});
      expect(currentLanes).to.have.lengthOf(1);

      await lanes.switchLanes('main', { skipDependencyInstallation: true });
      await lanes.removeLanes(['stage']);

      // as an intermediate step, make sure the lane was removed
      const lanesAfterDelete = await lanes.getLanes({});
      expect(lanesAfterDelete).to.have.lengthOf(0);

      await lanes.restoreLane(currentLanes[0].hash);
    });
    after(async () => {
      await destroyWorkspace(workspaceData);
    });
    it('should restore the deleted lane', async () => {
      const currentLanes = await lanes.getLanes({});
      expect(currentLanes).to.have.lengthOf(1);
      expect(currentLanes[0].id.name).to.equal('stage');
    });
    describe('delete restored lane', () => {
      let output: string[];
      before(async () => {
        output = await lanes.removeLanes(['stage']);
      });
      it('should not throw', () => {
        expect(output).to.have.lengthOf(1);
      });
    });
  });

  describe('restore lane when an existing lane has the same id', () => {
    let lanes: LanesMain;
    let workspaceData: WorkspaceData;
    let laneHash: string;
    before(async () => {
      workspaceData = mockWorkspace();
      const { workspacePath } = workspaceData;
      await mockComponents(workspacePath);
      lanes = await loadAspect(LanesAspect, workspacePath);
      await lanes.createLane('stage');

      // as an intermediate step, make sure the lane was created
      const currentLanes = await lanes.getLanes({});
      expect(currentLanes).to.have.lengthOf(1);

      await lanes.switchLanes('main', { skipDependencyInstallation: true });
      await lanes.removeLanes(['stage']);

      await lanes.createLane('stage');
      laneHash = currentLanes[0].hash;
    });
    after(async () => {
      await destroyWorkspace(workspaceData);
    });
    it('should throw when restoring the lane', async () => {
      let error: Error | undefined;
      try {
        await lanes.restoreLane(laneHash);
      } catch (err: any) {
        error = err;
      }
      expect(error).to.be.instanceOf(Error);
      expect(error?.message).to.include('unable to restore lane');
    });
  });

  describe('lane history', () => {
    let lanes: LanesMain;
    let workspaceData: WorkspaceData;
    let snapping: SnappingMain;
    let laneId: LaneId;
    before(async () => {
      addFeature(SUPPORT_LANE_HISTORY);
      workspaceData = mockWorkspace();
      const { workspacePath } = workspaceData;
      await mockComponents(workspacePath);
      lanes = await loadAspect(LanesAspect, workspacePath);
      await lanes.createLane('stage');
      snapping = await loadAspect(SnappingAspect, workspacePath);
      const currentLaneId = lanes.getCurrentLaneId();
      if (!currentLaneId) throw new Error('unable to get the current lane-id');
      laneId = currentLaneId;
    });
    after(async () => {
      removeFeature(SUPPORT_LANE_HISTORY);
      await destroyWorkspace(workspaceData);
    });
    it('should create lane history object when creating a new lane', async () => {
      const laneHistory = await lanes.getLaneHistory(laneId);
      const history = laneHistory.getHistory();
      expect(Object.keys(history).length).to.equal(1);
    });
    describe('snapping', () => {
      let snappingResult;
      before(async () => {
        snappingResult = await snapping.snap({ pattern: 'comp1', build: false, message: 'first snap' });
      });
      it('should add a record to LaneHistory when snapping', async () => {
        const laneHistory = await lanes.getLaneHistory(laneId);
        const history = laneHistory.getHistory();
        expect(Object.keys(history).length).to.equal(2);
        const snapHistory = history[Object.keys(history)[1]];
        expect(snapHistory.log.message).to.equal('snap (first snap)');
        expect(snapHistory.components.length).to.equal(1);
        expect(snapHistory.components[0]).to.equal(snappingResult?.snappedComponents[0].id.toString() as string);
      });
      describe('snap again and export', () => {
        let exportResults;

        before(async () => {
          const compFile = path.join(workspaceData.workspacePath, 'comp1/index.js');
          await fs.appendFile(compFile, `\nconsole.log('second-snap');`);
          // make another snap to check to test the checkout later.
          await snapping.snap({ pattern: 'comp1', build: false, message: 'second snap' });
          const laneHistory = await lanes.getLaneHistory(laneId);
          const history = laneHistory.getHistory();
          expect(Object.keys(history).length).to.equal(3);

          const exporter: ExportMain = await loadAspect(ExportAspect, workspaceData.workspacePath);
          exportResults = await exporter.export();
        });
        it('should export successfully', () => {
          expect(exportResults.componentsIds.length).to.equal(1);
          expect(exportResults.exportedLanes.length).to.equal(1);
        });
        describe('import to another workspace', () => {
          let newWorkspace: WorkspaceData;
          before(async () => {
            newWorkspace = mockWorkspace({ bareScopeName: workspaceData.remoteScopeName });

            lanes = await loadAspect(LanesAspect, newWorkspace.workspacePath);
            await lanes.switchLanes(laneId.toString(), { skipDependencyInstallation: true });
            await lanes.importLaneObject(laneId, true, true);
          });
          after(async () => {
            await destroyWorkspace(newWorkspace);
          });
          it('should not add a record to the lane-history', async () => {
            const laneHistory = await lanes.getLaneHistory(laneId);
            const history = laneHistory.getHistory();
            expect(Object.keys(history).length).to.equal(3);
          });
          it('should be able to checkout to a previous state of the lane', async () => {
            const laneHistory = await lanes.getLaneHistory(laneId);
            const history = laneHistory.getHistory();
            const snapHistoryId = Object.keys(history).find((key) => history[key].log.message?.includes('first snap'));
            if (!snapHistoryId) throw new Error('unable to find snap history of the first snap');
            const results = await lanes.checkoutHistory(snapHistoryId, { skipDependencyInstallation: true });
            expect(results.components?.length).to.equal(1);
            expect(results.failedComponents?.length).to.equal(0);
          });
          it('should be able to revert to a previous history id', async () => {
            const revertWorkspace = mockWorkspace({ bareScopeName: workspaceData.remoteScopeName });
            lanes = await loadAspect(LanesAspect, revertWorkspace.workspacePath);
            await lanes.switchLanes(laneId.toString(), { skipDependencyInstallation: true });
            await lanes.importLaneObject(laneId, true, true);
            const laneHistory = await lanes.getLaneHistory(laneId);
            const history = laneHistory.getHistory();
            const snapHistoryId = Object.keys(history).find((key) => history[key].log.message?.includes('first snap'));
            if (!snapHistoryId) throw new Error('unable to find snap history of the first snap');
            const results = await lanes.revertHistory(snapHistoryId, { skipDependencyInstallation: true });
            expect(results.components?.length).to.equal(1);
            expect(results.failedComponents?.length).to.equal(0);

            const compFile = path.join(
              revertWorkspace.workspacePath,
              revertWorkspace.remoteScopeName,
              'comp1/index.js'
            );
            const compFileContent = await fs.readFile(compFile, 'utf8');

            // make sure it reverts to the first snap.
            expect(compFileContent).to.not.include('second-snap');

            // make sure it keeps the version in .bitmap intact and doesn't change it to the first snap. (as with checkout)
            const secondSnapHistoryId = Object.keys(history).find((key) =>
              history[key].log.message?.includes('second snap')
            );
            if (!secondSnapHistoryId) throw new Error('unable to find snap history of the second snap');
            const secondSnapHistory = history[secondSnapHistoryId];
            const workspace: Workspace = await loadAspect(WorkspaceAspect, revertWorkspace.workspacePath);
            const ids = await workspace.listIds();
            expect(ids[0].toString()).to.equal(secondSnapHistory.components[0]);
            await destroyWorkspace(revertWorkspace);
          });
        });
      });
    });
  });

  describe('create lanes with the same name different scope', () => {
    let lanes: LanesMain;
    let workspaceData: WorkspaceData;
    before(async () => {
      workspaceData = mockWorkspace();
      const { workspacePath } = workspaceData;
      await mockComponents(workspacePath);
      lanes = await loadAspect(LanesAspect, workspacePath);
      await lanes.createLane('stage');
      await lanes.switchLanes('main', { skipDependencyInstallation: true });
    });
    after(async () => {
      await destroyWorkspace(workspaceData);
    });
    it('should not throw when creating the second lane', async () => {
      await lanes.createLane('stage', { scope: 'new-scope' });
      const currentLanes = await lanes.getLanes({});
      expect(currentLanes.length).to.equal(2);
      expect(currentLanes[0].id.name).to.equal('stage');
      expect(currentLanes[1].id.name).to.equal('stage');
    });
  });

  describe('delete component on a lane after export', () => {
    let lanes: LanesMain;
    let workspaceData: WorkspaceData;
    let snapping: SnappingMain;
    let laneId: LaneId;
    before(async () => {
      addFeature(SUPPORT_LANE_HISTORY);
      workspaceData = mockWorkspace();
      const { workspacePath } = workspaceData;
      await mockComponents(workspacePath);
      const harmony = await loadManyAspects(
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

      const remove: RemoveMain = harmony.get(RemoveAspect.id);
      await remove.deleteComps('comp1');

      await snapping.snap({ build: false });
    });
    after(async () => {
      removeFeature(SUPPORT_LANE_HISTORY);
      await destroyWorkspace(workspaceData);
    });
    it('should save the deleted data into the lane object', async () => {
      const lane = await lanes.getCurrentLane();
      expect(lane?.components[0].isDeleted).to.be.true;
    });
    it('should save the deleted data into lane history', async () => {
      const laneHistory = await lanes.getLaneHistory(laneId);
      const history = laneHistory.getHistory();
      expect(Object.keys(history).length).to.equal(3);
      const snapHistory = history[Object.keys(history)[2]];
      expect(snapHistory.deleted?.length).to.equal(1);
    });
  });

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
      await lanes.switchLanes('main', { head: true, skipDependencyInstallation: true });
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
