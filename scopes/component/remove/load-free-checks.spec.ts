import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import type { Harmony } from '@teambit/harmony';
import type { ComponentID } from '@teambit/component-id';
import { loadManyAspects } from '@teambit/harmony.testing.load-aspect';
import type { SnappingMain } from '@teambit/snapping';
import { SnappingAspect } from '@teambit/snapping';
import type { Workspace } from '@teambit/workspace';
import { WorkspaceAspect } from '@teambit/workspace';
import type { DependencyResolverMain } from '@teambit/dependency-resolver';
import { DependencyResolverAspect } from '@teambit/dependency-resolver';
import { componentIdToPackageName } from '@teambit/pkg.modules.component-package-name';
import type { WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockWorkspace, destroyWorkspace } from '@teambit/workspace.testing.mock-workspace';
import { mockComponents } from '@teambit/component.testing.mock-components';
import {
  findComponentUsingAsAspect,
  getPackageNameDataWithoutLoading,
  isModifiedWithoutLoading,
} from './load-free-checks';

describe('remove load-free checks', function () {
  this.timeout(0);
  let workspaceData: WorkspaceData;
  let harmony: Harmony;
  let workspace: Workspace;
  let comp1: ComponentID;
  let comp2: ComponentID;
  let comp1Dir: string;
  before(async () => {
    workspaceData = mockWorkspace();
    const { workspacePath } = workspaceData;
    const compsDirs = await mockComponents(workspacePath, { numOfComponents: 2 });
    [comp1, comp2] = compsDirs.map((c) => c.id);
    comp1Dir = compsDirs[0].dir;
    harmony = await loadManyAspects([SnappingAspect, WorkspaceAspect, DependencyResolverAspect], workspacePath);
    workspace = harmony.get<Workspace>(WorkspaceAspect.id);
  });
  after(async () => {
    await destroyWorkspace(workspaceData);
  });
  describe('when the components are new', () => {
    it('isModifiedWithoutLoading should return "newlyCreated"', async () => {
      expect(await isModifiedWithoutLoading(workspace, comp1)).to.equal('newlyCreated');
    });
    it('findComponentUsingAsAspect should find a component configured with a new component as an aspect', async () => {
      const aspectId = comp2.toStringWithoutVersion();
      expect(await findComponentUsingAsAspect(workspace, [aspectId], [])).to.be.undefined;
      workspace.bitMap.addComponentConfig(comp1, aspectId);
      try {
        const found = await findComponentUsingAsAspect(workspace, [aspectId], []);
        expect(found?.user.toStringWithoutVersion()).to.equal(comp1.toStringWithoutVersion());
        expect(found?.usedId).to.equal(aspectId);
        // the user is removed as well, so it doesn't count
        expect(await findComponentUsingAsAspect(workspace, [aspectId], [comp1])).to.be.undefined;
      } finally {
        workspace.bitMap.removeComponentConfig(comp1, aspectId, false);
      }
    });
  });
  describe('when the components are tagged', () => {
    before(async () => {
      const snapping = harmony.get<SnappingMain>(SnappingAspect.id);
      await snapping.tag({ build: false, ignoreIssues: 'MissingManuallyConfiguredPackages' });
    });
    it('isModifiedWithoutLoading should return false when the files are unchanged', async () => {
      expect(await isModifiedWithoutLoading(workspace, comp1)).to.be.false;
    });
    it('getPackageNameDataWithoutLoading should calculate the same package name as the loaded component', async () => {
      const data = await getPackageNameDataWithoutLoading(workspace, comp1);
      expect(data).to.not.be.undefined;
      const depResolver = harmony.get<DependencyResolverMain>(DependencyResolverAspect.id);
      const component = await workspace.get(comp1);
      expect(componentIdToPackageName(data!)).to.equal(depResolver.getPackageName(component));
    });
    it('isModifiedWithoutLoading should return true when a file is changed', async () => {
      const indexPath = path.join(comp1Dir, 'index.js');
      const original = await fs.readFile(indexPath, 'utf8');
      await fs.appendFile(indexPath, '\n// a change');
      try {
        expect(await isModifiedWithoutLoading(workspace, comp1)).to.be.true;
      } finally {
        await fs.writeFile(indexPath, original);
      }
    });
    it('isModifiedWithoutLoading should return true when a file is added', async () => {
      const newFile = path.join(comp1Dir, 'new-file.js');
      await fs.writeFile(newFile, 'export const a = 1;');
      try {
        expect(await isModifiedWithoutLoading(workspace, comp1)).to.be.true;
      } finally {
        await fs.remove(newFile);
      }
    });
  });
});
