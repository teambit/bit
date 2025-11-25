import { expect } from 'chai';
import { loadAspect } from '@teambit/harmony.testing.load-aspect';
import type { WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockWorkspace, destroyWorkspace } from '@teambit/workspace.testing.mock-workspace';
import { mockComponents } from '@teambit/component.testing.mock-components';
import type { DependenciesMain, SetDependenciesResult } from './dependencies.main.runtime';
import { DependenciesAspect } from './dependencies.aspect';

describe('Dependencies Aspect', function () {
  this.timeout(0);

  describe('setDependency() with a snap', () => {
    let workspaceData: WorkspaceData;
    let setDepsResult: SetDependenciesResult;
    before(async () => {
      workspaceData = mockWorkspace();
      const { workspacePath } = workspaceData;
      await mockComponents(workspacePath);
      const dependencies: DependenciesMain = await loadAspect(DependenciesAspect, workspacePath);
      setDepsResult = await dependencies.setDependency('comp1', [
        '@org/scope.some-comp@ccb187997f01c2d8ec180fd321c7cd04034cd2d9',
      ]);
    });
    after(async () => {
      await destroyWorkspace(workspaceData);
    });
    it('should add the snap prefix', () => {
      expect(setDepsResult.addedPackages).to.deep.eq({
        '@org/scope.some-comp': '0.0.0-ccb187997f01c2d8ec180fd321c7cd04034cd2d9',
      });
    });
  });
});
