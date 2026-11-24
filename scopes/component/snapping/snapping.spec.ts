import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import type { Harmony } from '@teambit/harmony';
import { loadAspect, loadManyAspects } from '@teambit/harmony.testing.load-aspect';
import type { WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import {
  mockWorkspace,
  mockBareScope,
  destroyWorkspace,
  setWorkspaceConfig,
} from '@teambit/workspace.testing.mock-workspace';
import { IssuesAspect } from '@teambit/issues';
import type { ScopeMain } from '@teambit/scope';
import { ScopeAspect } from '@teambit/scope';
import type { ExportMain } from '@teambit/export';
import { ExportAspect } from '@teambit/export';
import type { CompilerMain } from '@teambit/compiler';
import { CompilerAspect } from '@teambit/compiler';
import type { ComponentID } from '@teambit/component-id';
import type { Version } from '@teambit/objects';
import { Ref } from '@teambit/objects';
import { mockComponents } from '@teambit/component.testing.mock-components';
import { ExtensionDataEntry } from '@teambit/legacy.extension-data';
import type { SnapDataPerCompRaw, SnappingMain } from './snapping.main.runtime';
import { SnappingAspect } from './snapping.aspect';
import type { Workspace } from '@teambit/workspace';
import { WorkspaceAspect } from '@teambit/workspace';

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
  describe('snap from scope with changed files', () => {
    let workspaceData: WorkspaceData;
    let versionObj: Version;
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
      const harmonyBareScope = await loadManyAspects([SnappingAspect, ScopeAspect], bareScope.scopePath);
      const snappingScope = harmonyBareScope.get<SnappingMain>(SnappingAspect.id);
      const content = `/**\n * returns the greeting.\n */\nexport function greet() {\n  return 'hello';\n}\n`;
      const results = await snappingScope.snapFromScope(
        [
          {
            componentId: `${workspaceData.remoteScopeName}/comp1`,
            message: 'snap from scope',
            files: [{ path: 'index.js', content }],
          },
        ],
        {}
      );
      const scope = harmonyBareScope.get<ScopeMain>(ScopeAspect.id);
      versionObj = (await scope.legacyScope.objects.load(Ref.from(results.snappedIds[0].version))) as Version;
    });
    it('should parse the docs from the new files, as a workspace does', () => {
      const docs = versionObj.docs || [];
      expect(docs).to.have.lengthOf(1);
      expect(docs[0].description).to.equal('returns the greeting.');
      expect(docs[0].filePath).to.equal('index.js');
    });
    after(async () => {
      await destroyWorkspace(workspaceData);
    });
  });
  describe('snap from scope an app without a build', () => {
    let workspaceData: WorkspaceData;
    let compId: string;
    let loadedAspectIds: string[];
    let appData: Record<string, any> | undefined;
    before(async () => {
      workspaceData = mockWorkspace();
      const { workspacePath } = workspaceData;
      await mockComponents(workspacePath);
      const harmony = await loadManyAspects([SnappingAspect, ExportAspect, ScopeAspect], workspacePath);
      const snapping = harmony.get<SnappingMain>(SnappingAspect.id);
      const results = await snapping.snap({ pattern: 'comp1', build: false, message: 'first snap' });
      // make it an app, as the data of a component whose app was loaded when it was snapped
      const { objects } = harmony.get<ScopeMain>(ScopeAspect.id).legacyScope;
      const snapped = (await objects.load(Ref.from(results!.snappedComponents[0].id.version!))) as Version;
      snapped.extensions.push(
        new ExtensionDataEntry(undefined, undefined, 'teambit.harmony/application', {}, { appName: 'my-app' })
      );
      objects.add(snapped);
      await objects.persist();
      await harmony.get<ExportMain>(ExportAspect.id).export();

      const bareScope = mockBareScope(workspaceData.remoteScopePath, 'bare-for-snap');
      const harmonyBareScope = await loadManyAspects([SnappingAspect, ScopeAspect], bareScope.scopePath);
      const scope = harmonyBareScope.get<ScopeMain>(ScopeAspect.id);
      loadedAspectIds = [];
      scope.loadAspects = async (ids: string[]) => {
        loadedAspectIds.push(...ids);
        return [];
      };
      compId = `${workspaceData.remoteScopeName}/comp1`;
      const snappingScope = harmonyBareScope.get<SnappingMain>(SnappingAspect.id);
      const scopeResults = await snappingScope.snapFromScope([{ componentId: compId, message: 'snap from scope' }], {});
      const scopeSnap = scopeResults.snappedIds[0].version;
      const versionObj = (await scope.legacyScope.objects.load(Ref.from(scopeSnap))) as Version;
      appData = versionObj.extensions.findCoreExtension('teambit.harmony/application')?.data;
    });
    it('should not load the app itself as an aspect, only its aspects', () => {
      expect(loadedAspectIds).to.not.be.empty;
      expect(loadedAspectIds.filter((id) => id.startsWith(compId))).to.be.empty;
    });
    it('should keep the app data of the previous version', () => {
      expect(appData).to.deep.equal({ appName: 'my-app' });
    });
    after(async () => {
      await destroyWorkspace(workspaceData);
    });
  });
  describe('batchId', () => {
    let workspaceData: WorkspaceData | undefined;
    after(async () => {
      if (workspaceData) await destroyWorkspace(workspaceData);
    });
    it('should assign the same batchId to all components snapped together', async () => {
      workspaceData = mockWorkspace();
      const { workspacePath } = workspaceData;
      await mockComponents(workspacePath, { numOfComponents: 3 });
      const harmony = await loadManyAspects([SnappingAspect, ScopeAspect], workspacePath);
      const snapping = harmony.get<SnappingMain>(SnappingAspect.id);
      const scope = harmony.get<ScopeMain>(ScopeAspect.id);
      const results = await snapping.snap({ build: false, message: 'snap multiple' });
      expect(results).to.not.be.null;
      expect(results!.snappedComponents).to.have.lengthOf(3);

      const versionObjects = await Promise.all(
        results!.snappedComponents.map(async (comp) => {
          const snapHash = comp.id.version!;
          return (await scope.legacyScope.objects.load(Ref.from(snapHash))) as Version;
        })
      );

      const batchIds = versionObjects.map((v) => v.batchId);
      // all should be defined
      batchIds.forEach((id) => expect(id).to.be.a('string').and.not.be.empty);
      // all should be the same UUID
      expect(batchIds[0]).to.equal(batchIds[1]);
      expect(batchIds[1]).to.equal(batchIds[2]);
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
