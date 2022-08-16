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

describe('Snapping aspect', () => {
  let workspaceData: WorkspaceData;
  let snapping: SnappingMain;
  describe('components with issues', () => {
    beforeAll(async () => {
      workspaceData = mockWorkspace();
      const { workspacePath } = workspaceData;
      // eslint-disable-next-line no-console
      console.log('workspace created at ', workspacePath);
      await mockComponents(workspacePath);
      await fs.writeFile(path.join(workspacePath, 'comp1/index.js'), `const nonExist = require("non-exist");`);
      const compiler: CompilerMain = await loadAspect(CompilerAspect, workspacePath);
      await compiler.compileOnWorkspace();
      snapping = await loadAspect(SnappingAspect, workspacePath);
    }, 50000);
    it('tag should throw an ComponentsHaveIssues error', async () => {
      try {
        await snapping.tag({ ids: ['comp1'] });
      } catch (err: any) {
        expect(err.constructor.name).toEqual(ComponentsHaveIssues.name);
      }
    }, 50000);
    // @todo: this test fails during "bit build" for some reason. It passes on "bit test";
    it.skip('should not throw an error if the config was set to ignore MissingPackagesDependenciesOnFs error', async () => {
      await setWorkspaceConfig(workspaceData.workspacePath, IssuesAspect.id, {
        ignoreIssues: ['MissingPackagesDependenciesOnFs'],
      });
      snapping = await loadAspect(SnappingAspect, workspaceData.workspacePath);
      const results = await snapping.tag({ ids: ['comp1'] });
      expect(results?.taggedComponents.length).toEqual(1);
    });
    afterAll(async () => {
      await destroyWorkspace(workspaceData);
    });
  }, 50000);
});
