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
      await mockComponents(workspacePath);
      await fs.writeFile(path.join(workspacePath, 'comp1/index.js'), 'import !');
      snapping = await loadAspect(SnappingAspect, workspacePath);
    });
    it('tag should throw an ComponentsHaveIssues error', async () => {
      try {
        // @ts-ignore
        await snapping.tag({ ids: ['comp1'] });
      } catch (err: any) {
        expect(err.constructor.name).toEqual(ComponentsHaveIssues.name);
      }
    });
    it('should not throw an error if the config was set to ignore ComponentsHaveIssues error', async () => {
      await setWorkspaceConfig(workspaceData.workspacePath, IssuesAspect.id, { ignoreIssues: ['ParseErrors'] });
      snapping = await loadAspect(SnappingAspect, workspaceData.workspacePath);
      // @ts-ignore
      const results = await snapping.tag({ ids: ['comp1'] });
      expect(results?.taggedComponents.length).toEqual(1);
    });
    afterAll(async () => {
      await destroyWorkspace(workspaceData);
    });
  });
});
