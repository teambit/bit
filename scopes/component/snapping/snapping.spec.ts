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
import { Version } from '@teambit/scope.objects';
import { Ref } from '@teambit/scope.objects';
import { mockComponents } from '@teambit/component.testing.mock-components';
import { SnappingMain } from './snapping.main.runtime';
import { SnappingAspect } from './snapping.aspect';
import { SnapDataPerCompRaw } from './snap-from-scope.cmd';
import { WorkspaceAspect, Workspace } from '@teambit/workspace';

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
  describe('local-only', () => {
    let harmony: Harmony;
    let workspace: Workspace;
    let workspaceData: WorkspaceData;
    before(async () => {
      workspaceData = mockWorkspace();
      const { workspacePath } = workspaceData;
      await mockComponents(workspacePath, { numOfComponents: 3 });
      harmony = await loadManyAspects([WorkspaceAspect, SnappingAspect], workspacePath);
      workspace = harmony.get<Workspace>(WorkspaceAspect.id);
      const comp1Id = await workspace.idsByPattern('comp1');
      await workspace.setLocalOnly(comp1Id);
    });
    after(async () => {
      await destroyWorkspace(workspaceData);
    });
    it('should be able to list it', async () => {
      const list = workspace.listLocalOnly();
      expect(list).to.have.lengthOf(1);
      expect(list[0].toString()).to.include('comp1');
    });
    it('should be ignored by tag command', async () => {
      const snapping = harmony.get<SnappingMain>(SnappingAspect.id);
      const tagResults = await snapping.tag({});
      expect(tagResults?.taggedComponents).to.have.lengthOf(2);
      const taggedNames = tagResults?.taggedComponents.map((c) => c.name);
      expect(taggedNames).to.not.include('comp1');
    });
    it('should be ignored by snap command', async () => {
      const snapping = harmony.get<SnappingMain>(SnappingAspect.id);
      const tagResults = await snapping.snap({ unmodified: true });
      expect(tagResults?.snappedComponents).to.have.lengthOf(2);
      const taggedNames = tagResults?.snappedComponents.map((c) => c.name);
      expect(taggedNames).to.not.include('comp1');
    });
    it('should be ignored when it is an auto-tag candidate', async () => {
      const snapping = harmony.get<SnappingMain>(SnappingAspect.id);
      await snapping.tag({ unmodified: true });
      const tagResults = await snapping.tag({ ids: ['comp3'], unmodified: true });
      expect(tagResults?.autoTaggedResults).to.have.lengthOf(1); // only comp3 should be auto-tagged
      const taggedNames = tagResults?.autoTaggedResults.map((c) => c.component.name);
      expect(taggedNames).to.not.include('comp1');
    });
    it('should block setting local-only when a component is staged', async () => {
      const snapping = harmony.get<SnappingMain>(SnappingAspect.id);
      await snapping.tag({ unmodified: true });
      const comp2Id = await workspace.idsByPattern('comp2');
      try {
        await workspace.setLocalOnly(comp2Id);
        expect.fail('should have thrown an error');
      } catch (err: any) {
        expect(err.message).to.include('unable to set the following component(s) as local-only');
      }
    });
  });
});
