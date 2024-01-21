import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import { loadAspect } from '@teambit/harmony.testing.load-aspect';
import {
  mockWorkspace,
  destroyWorkspace,
  WorkspaceData,
  setWorkspaceConfig,
} from '@teambit/workspace.testing.mock-workspace';
import IssuesAspect from '@teambit/issues';
import { CompilerAspect, CompilerMain } from '@teambit/compiler';
import { mockComponents } from '@teambit/component.testing.mock-components';
import { SnappingMain } from './snapping.main.runtime';
import { SnappingAspect } from './snapping.aspect';
import { ComponentsHaveIssues } from './components-have-issues';

describe('Snapping aspect', function () {
  this.timeout(0);

  let workspaceData: WorkspaceData;
  let snapping: SnappingMain;
  describe('components with issues', () => {
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
        expect(err.constructor.name).to.equal(ComponentsHaveIssues.name);
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
});
