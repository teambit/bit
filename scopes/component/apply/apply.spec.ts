import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import { Harmony } from '@teambit/harmony';
import { loadManyAspects } from '@teambit/harmony.testing.load-aspect';
import { mockWorkspace, destroyWorkspace, WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockComponents } from '@teambit/component.testing.mock-components';
import { ApplyMain, ApplyResults } from './apply.main.runtime';
import { WorkspaceAspect } from '@teambit/workspace';
import { ApplyAspect } from './apply.aspect';
import { SnappingAspect, SnappingMain } from '@teambit/snapping';
import { ExportAspect, ExportMain } from '@teambit/export';
import { StatusAspect, StatusMain } from '@teambit/status';

describe('Apply aspect', function () {
  this.timeout(0);

  describe('apply with forkFrom prop', () => {
    let workspaceData: WorkspaceData;
    let newWorkspace: WorkspaceData;
    let harmony: Harmony;
    let apply: ApplyMain;
    let applyResults: ApplyResults;
    before(async () => {
      workspaceData = mockWorkspace();
      const { workspacePath } = workspaceData;
      await mockComponents(workspacePath, { numOfComponents: 3 });
      harmony = await loadManyAspects([WorkspaceAspect, SnappingAspect, ExportAspect], workspacePath);

      const snapping = harmony.get<SnappingMain>(SnappingAspect.id);
      await snapping.snap({ build: false, message: 'first snap' });
      const exportMain = harmony.get<ExportMain>(ExportAspect.id);
      await exportMain.export();

      newWorkspace = mockWorkspace({ bareScopeName: workspaceData.remoteScopeName });
      harmony = await loadManyAspects([WorkspaceAspect, ApplyAspect], newWorkspace.workspacePath);
      const data = [
        {
          componentId: `${workspaceData.remoteScopeName}/compa`,
          forkFrom: `${workspaceData.remoteScopeName}/comp1`,
          message: `msg for first comp`,
        },
        {
          componentId: `${workspaceData.remoteScopeName}/compb`,
          forkFrom: `${workspaceData.remoteScopeName}/comp2`,
          message: `msg for second comp`,
        },
        {
          componentId: `${workspaceData.remoteScopeName}/compc`,
          forkFrom: `${workspaceData.remoteScopeName}/comp3`,
          message: `msg for third comp`,
        },
      ];
      apply = harmony.get<ApplyMain>(ApplyAspect.id);
      applyResults = await apply.applyWithFork(data, { skipDependencyInstallation: true });
    });
    after(async () => {
      await destroyWorkspace(workspaceData);
    });
    it('should save the components and dependencies according to the new ids', () => {
      expect(applyResults.snappedComponents).to.have.lengthOf(3);
      const compA = applyResults.snappedComponents.find((c) => c.id.name === 'compa');
      const versionObj = compA!.pendingVersion!;
      expect(versionObj.log.message).to.equal('msg for first comp');
      const compBDep = versionObj.dependencies.get().find((d) => d.id.name === 'compb')!;
      expect(compBDep.packageName).to.equal(`@${newWorkspace.remoteScopeName}/compb`);
      const flattenedDepNames = versionObj.flattenedDependencies.map((d) => d.name);
      expect(flattenedDepNames).to.include('compb');
      expect(flattenedDepNames).to.include('compc');
      expect(flattenedDepNames).to.not.include('comp2');
      expect(flattenedDepNames).to.not.include('comp3');
    });
  });

  describe('apply component changes on existing workspace', () => {
    let workspaceData: WorkspaceData;
    let harmony: Harmony;
    let apply: ApplyMain;
    before(async () => {
      workspaceData = mockWorkspace();
      const { workspacePath } = workspaceData;
      await mockComponents(workspacePath);
      harmony = await loadManyAspects(
        [WorkspaceAspect, SnappingAspect, ApplyAspect, ExportAspect, StatusAspect],
        workspacePath
      );

      const snapping = harmony.get<SnappingMain>(SnappingAspect.id);
      await snapping.tag({ build: false, message: 'first tag' });
      const exportMain = harmony.get<ExportMain>(ExportAspect.id);
      await exportMain.export();

      const data = [
        {
          componentId: `${workspaceData.remoteScopeName}/comp1`,
          message: `msg for first comp`,
          files: [
            {
              path: 'index.js',
              content: "require('test-dummy-package')",
            },
          ],
        },
      ];

      apply = harmony.get<ApplyMain>(ApplyAspect.id);
      await apply.apply(data, { skipDependencyInstallation: true });
    });
    it('should modify the component correctly', () => {
      const indexFile = fs.readFileSync(path.join(workspaceData.workspacePath, 'comp1/index.js')).toString();
      expect(indexFile).to.have.string("require('test-dummy-package')");
    });
    it('should leave the component as modified in bit-status', async () => {
      const statusMain = harmony.get<StatusMain>(StatusAspect.id);
      const results = await statusMain.status({});
      expect(results.modifiedComponents).to.have.lengthOf(1);
    });
    // todo: find a way to test this without actually install the package
    // it('should install the new packages according to the added import statement', () => {
    //   expect(output).to.have.string('+ test-dummy-package');
    // });
  });
});
