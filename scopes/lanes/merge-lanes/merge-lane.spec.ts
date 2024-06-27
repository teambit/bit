import { expect } from 'chai';
import { Harmony } from '@teambit/harmony';
import { loadManyAspects } from '@teambit/harmony.testing.load-aspect';
import {
  mockWorkspace,
  mockBareScope,
  destroyWorkspace,
  WorkspaceData,
} from '@teambit/workspace.testing.mock-workspace';
import { ScopeAspect } from '@teambit/scope';
import { ExportAspect, ExportMain } from '@teambit/export';
import { mockComponents } from '@teambit/component.testing.mock-components';
import { LanesAspect, LanesMain } from '@teambit/lanes';
import { SnappingAspect, SnappingMain } from '@teambit/snapping';
import { MergeLanesAspect } from './merge-lanes.aspect';
import { MergeFromScopeResult, MergeLanesMain } from './merge-lanes.main.runtime';

describe('MergeLane aspect', function () {
  this.timeout(0);

  describe('snap from scope an existing component with newDependencies prop populated', () => {
    let workspaceData: WorkspaceData;
    let harmonyBareScope: Harmony;
    let results: MergeFromScopeResult;
    before(async () => {
      workspaceData = mockWorkspace();
      const { workspacePath } = workspaceData;
      await mockComponents(workspacePath, { numOfComponents: 2 });
      const harmony = await loadManyAspects([SnappingAspect, ExportAspect, LanesAspect], workspacePath);
      const lane = harmony.get<LanesMain>(LanesAspect.id);
      await lane.createLane('dev');
      const snapping = harmony.get<SnappingMain>(SnappingAspect.id);
      await snapping.snap({ build: false, message: 'first snap' });
      const exportMain = harmony.get<ExportMain>(ExportAspect.id);
      await exportMain.export();

      const bareScope = mockBareScope(workspaceData.remoteScopePath, '-bare');
      harmonyBareScope = await loadManyAspects([MergeLanesAspect, ScopeAspect], bareScope.scopePath);
      const mergeLaneMain = harmonyBareScope.get<MergeLanesMain>(MergeLanesAspect.id);
      const remoteScopeName = workspaceData.remoteScopeName;
      results = await mergeLaneMain.mergeFromScope(`${remoteScopeName}/dev`, 'main', {
        pattern: `${remoteScopeName}/comp2`,
      });
    });
    it('should merge successfully the specified pattern only', async () => {
      expect(results.mergedNow).to.have.lengthOf(1);
      expect(results.mergedNow[0].fullName).to.equal('comp2');
      expect(results.unmerged).to.have.lengthOf(1);
      expect(results.unmerged[0].id.name).to.equal('comp1');
    });
    after(async () => {
      await destroyWorkspace(workspaceData);
    });
  });
});
