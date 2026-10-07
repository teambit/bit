import { expect } from 'chai';
import { loadManyAspects } from '@teambit/harmony.testing.load-aspect';
import type { WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockWorkspace, destroyWorkspace } from '@teambit/workspace.testing.mock-workspace';
import { mockComponents } from '@teambit/component.testing.mock-components';
import { WorkspaceAspect } from '@teambit/workspace';
import type { Workspace } from '@teambit/workspace';
import { ExportAspect } from '@teambit/export';
import type { ExportMain } from '@teambit/export';
import { ImporterAspect } from '@teambit/importer';
import type { ImporterMain } from '@teambit/importer';
import { RemoveAspect } from '@teambit/remove';
import type { RemoveMain } from '@teambit/remove';
import { SnappingAspect } from '@teambit/snapping';
import type { SnappingMain } from '@teambit/snapping';
import { LanesAspect } from './lanes.aspect';
import type { LanesMain } from './lanes.main.runtime';

/**
 * "bit remove" and "bit delete --lane" when the workspace is on a lane. the rest of the removal flows (on main) are
 * in the status aspect (remove-cmd.spec.ts).
 */
describe('removing components on a lane', function () {
  this.timeout(0);

  const workspaces: WorkspaceData[] = [];
  const createWorkspace = () => {
    const workspaceData = mockWorkspace();
    workspaces.push(workspaceData);
    return workspaceData;
  };
  after(async () => {
    await Promise.all(workspaces.map((workspaceData) => destroyWorkspace(workspaceData)));
  });

  /** a fresh harmony per call, to simulate a new process running a new command */
  async function load(workspacePath: string) {
    const harmony = await loadManyAspects(
      [WorkspaceAspect, SnappingAspect, ExportAspect, ImporterAspect, RemoveAspect, LanesAspect],
      workspacePath
    );
    return {
      snapping: harmony.get<SnappingMain>(SnappingAspect.id),
      exporter: harmony.get<ExportMain>(ExportAspect.id),
      importer: harmony.get<ImporterMain>(ImporterAspect.id),
      remove: harmony.get<RemoveMain>(RemoveAspect.id),
      lanes: harmony.get<LanesMain>(LanesAspect.id),
      workspace: harmony.get<Workspace>(WorkspaceAspect.id),
    };
  }

  describe('remove when a lane is new', () => {
    let workspacePath: string;
    before(async () => {
      workspacePath = createWorkspace().workspacePath;
      await mockComponents(workspacePath, { numOfComponents: 2 });
      const { lanes, snapping } = await load(workspacePath);
      await lanes.createLane('dev');
      await snapping.snap({ build: false, message: 'msg' });
      await (await load(workspacePath)).remove.remove({ componentsPattern: 'comp1' });
    });
    it('should remove the components from the local lane', async () => {
      const { lanes } = await load(workspacePath);
      const lane = await lanes.getCurrentLane();
      expect(lane?.name).to.equal('dev');
      expect((lane?.toComponentIds() || []).map((id) => id.toString()).join('\n')).to.not.have.string('comp1');
    });
    it('should remove the components from the workspace', async () => {
      const { workspace } = await load(workspacePath);
      const ids = workspace.listIds().map((id) => id.toString());
      expect(ids.join('\n')).to.not.have.string('comp1');
    });
  });

  describe('soft-remove then import', () => {
    let workspaceData: WorkspaceData;
    before(async () => {
      workspaceData = createWorkspace();
      const { workspacePath } = workspaceData;
      const { lanes } = await load(workspacePath);
      await lanes.createLane('dev');
      await mockComponents(workspacePath, { numOfComponents: 2 });
      await (await load(workspacePath)).snapping.snap({ build: false, message: 'msg' });
      await (await load(workspacePath)).exporter.export();
      // "bit delete comp2 --lane"
      await (await load(workspacePath)).remove.deleteComps('comp2');
    });
    it('should not throwing an error upon import', async () => {
      const { importer } = await load(workspaceData.workspacePath);
      await importer.import({
        ids: [`${workspaceData.remoteScopeName}/comp2`],
        installNpmPackages: false,
        writeConfigFiles: false,
      });
    });
  });
});
