import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import { loadManyAspects } from '@teambit/harmony.testing.load-aspect';
import type { WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockWorkspace, destroyWorkspace } from '@teambit/workspace.testing.mock-workspace';
import { WorkspaceAspect } from '@teambit/workspace';
import type { CLIMain } from '@teambit/cli';
import { CLIAspect } from '@teambit/cli';
import type { TrackerMain } from '@teambit/tracker';
import { TrackerAspect } from '@teambit/tracker';
import type { SnappingMain } from './snapping.main.runtime';
import { SnappingAspect } from './snapping.aspect';

describe('component with package.json as a file of the component', function () {
  this.timeout(0);

  describe('package.json files are ignored altogether', () => {
    let workspaceData: WorkspaceData;
    let bar: any;
    before(async () => {
      workspaceData = mockWorkspace();
      const { workspacePath } = workspaceData;
      fs.outputFileSync(path.join(workspacePath, 'bar', 'package.json'), '');
      fs.outputFileSync(path.join(workspacePath, 'bar', 'foo.js'), '');
      const harmony = await loadManyAspects([WorkspaceAspect, TrackerAspect, SnappingAspect], workspacePath);
      await harmony.get<TrackerMain>(TrackerAspect.id).track({ rootDir: 'bar', componentName: 'bar' });
      await harmony.get<SnappingMain>(SnappingAspect.id).tag({ build: false, ids: ['bar'] });
      const catComponent = harmony.get<CLIMain>(CLIAspect.id).getCommand('cat-component');
      const originalCwd = process.cwd();
      process.chdir(workspacePath);
      try {
        bar = await catComponent!.json!(['bar@latest'] as any, {});
      } finally {
        process.chdir(originalCwd);
      }
    });
    after(async () => {
      await destroyWorkspace(workspaceData);
    });
    it('should not track the package.json file', () => {
      expect(bar.files).to.have.lengthOf(1);
    });
  });
});
