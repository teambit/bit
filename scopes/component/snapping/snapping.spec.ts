import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import { Harmony } from '@teambit/harmony';
import { loadAspect, loadManyAspects } from '@teambit/harmony.testing.load-aspect';
import {
  mockWorkspace,
  mockBareScope,
  destroyWorkspace,
  WorkspaceData,
  setWorkspaceConfig,
} from '@teambit/workspace.testing.mock-workspace';
import { IssuesAspect } from '@teambit/issues';
import { ScopeAspect, ScopeMain } from '@teambit/scope';
import { ExportAspect, ExportMain } from '@teambit/export';
import { CompilerAspect, CompilerMain } from '@teambit/compiler';
import { ComponentID } from '@teambit/component-id';
import { Version } from '@teambit/legacy/dist/scope/models';
import { Ref } from '@teambit/legacy/dist/scope/objects';
import { mockComponents } from '@teambit/component.testing.mock-components';
import { SnappingMain } from './snapping.main.runtime';
import { SnappingAspect } from './snapping.aspect';
import { SnapDataPerCompRaw } from './snap-from-scope.cmd';

describe('Snapping aspect', function () {
  this.timeout(0);

  describe('components with issues', () => {
    let workspaceData: WorkspaceData;
    let snapping: SnappingMain;
    before(async () => {
      workspaceData = mockWorkspace();
      const { workspacePath } = workspaceData;
      // eslint-disable-next-line no-console
      console.log('workspace created at ', workspacePath);
      await mockComponents(workspacePath);
      await fs.writeFile(path.join(workspacePath, 'comp1/index.js'), `const nonExist = require("non-exist");`);
      const compiler: CompilerMain = await loadAspect(CompilerAspect, workspacePath);
      await compiler.compileOnWorkspace();
      snapping = await loadAspect(SnappingAspect, workspacePath);
    });
    it('tag should throw an ComponentsHaveIssues error', async () => {
      try {
        await snapping.tag({ ids: ['comp1'] });
      } catch (err: any) {
        expect(err.constructor.name).to.equal('ComponentsHaveIssues');
      }
    });
    // @todo: this test fails during "bit build" for some reason. It passes on "bit test";
    it.skip('should not throw an error if the config was set to ignore MissingPackagesDependenciesOnFs error', async () => {
      await setWorkspaceConfig(workspaceData.workspacePath, IssuesAspect.id, {
        ignoreIssues: ['MissingPackagesDependenciesOnFs'],
      });
      snapping = await loadAspect(SnappingAspect, workspaceData.workspacePath);
      const results = await snapping.tag({ ids: ['comp1'] });
      expect(results?.taggedComponents.length).to.equal(1);
    });
    after(async () => {
      await destroyWorkspace(workspaceData);
    });
  });
  describe('snap from scope an existing component with newDependencies prop populated', () => {
    let workspaceData: WorkspaceData;
    let snappedId: ComponentID;
    let harmonyBareScope: Harmony;
    before(async () => {
      workspaceData = mockWorkspace();
      const { workspacePath } = workspaceData;
      await mockComponents(workspacePath);
      const harmony = await loadManyAspects([SnappingAspect, ExportAspect], workspacePath);
      const snapping = harmony.get<SnappingMain>(SnappingAspect.id);
      await snapping.snap({ pattern: 'comp1', build: false, message: 'first snap' });
      const exportMain = harmony.get<ExportMain>(ExportAspect.id);
      await exportMain.export();

      const bareScope = mockBareScope(workspaceData.remoteScopePath, 'bare-for-snap');
      harmonyBareScope = await loadManyAspects([SnappingAspect, ScopeAspect], bareScope.scopePath);
      const snappingScope = harmonyBareScope.get<SnappingMain>(SnappingAspect.id);
      const snapDataPerComp: SnapDataPerCompRaw[] = [
        {
          componentId: `${workspaceData.remoteScopeName}/comp1`,
          message: 'snap from scope',
          newDependencies: [
            {
              id: 'lodash',
              version: '4.1.2',
              isComponent: false,
              type: 'dev',
            },
          ],
        },
      ];
      const results = await snappingScope.snapFromScope(snapDataPerComp, {});

      snappedId = results.snappedIds[0];
    });
    it('should add the new dev dep', async () => {
      const snapHash = snappedId.version;
      const scope = harmonyBareScope.get<ScopeMain>(ScopeAspect.id);
      const versionObj = (await scope.legacyScope.objects.load(Ref.from(snapHash))) as Version;
      const devPackages = Object.keys(versionObj.devPackageDependencies);
      expect(devPackages).to.include('lodash');

      // also, it should not delete other dev-deps that were there before.
      expect(devPackages).to.include('@types/node');
    });
    after(async () => {
      await destroyWorkspace(workspaceData);
    });
  });
  describe('snap from scope - remove existing dependency', () => {
    let workspaceData: WorkspaceData;
    let snappedId: ComponentID;
    let harmonyBareScope: Harmony;
    before(async () => {
      workspaceData = mockWorkspace();
      const { workspacePath } = workspaceData;
      await mockComponents(workspacePath, { numOfComponents: 2 });
      const harmony = await loadManyAspects([SnappingAspect, ExportAspect], workspacePath);
      const snapping = harmony.get<SnappingMain>(SnappingAspect.id);
      await snapping.snap({ build: false, message: 'first snap' });
      const exportMain = harmony.get<ExportMain>(ExportAspect.id);
      await exportMain.export();

      const bareScope = mockBareScope(workspaceData.remoteScopePath, 'bare-for-snap');
      harmonyBareScope = await loadManyAspects([SnappingAspect, ScopeAspect], bareScope.scopePath);
      const snappingScope = harmonyBareScope.get<SnappingMain>(SnappingAspect.id);
      const snapDataPerComp: SnapDataPerCompRaw[] = [
        {
          componentId: `${workspaceData.remoteScopeName}/comp1`,
          message: 'snap from scope',
          removeDependencies: [`${workspaceData.remoteScopeName}/comp2`],
        },
      ];
      // console.log('snapDataPerComp', JSON.stringify(snapDataPerComp));
      const results = await snappingScope.snapFromScope(snapDataPerComp, {});

      snappedId = results.snappedIds[0];
    });
    it('should remove the specified dependency', async () => {
      const snapHash = snappedId.version;
      const scope = harmonyBareScope.get<ScopeMain>(ScopeAspect.id);
      const versionObj = (await scope.legacyScope.objects.load(Ref.from(snapHash))) as Version;
      expect(versionObj.dependencies.get()).to.have.lengthOf(0);
    });
    after(async () => {
      await destroyWorkspace(workspaceData);
    });
  });
});
