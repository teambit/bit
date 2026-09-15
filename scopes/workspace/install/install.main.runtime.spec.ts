import { expect } from 'chai';
import { loadAspect } from '@teambit/harmony.testing.load-aspect';
import type { WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockWorkspace, destroyWorkspace } from '@teambit/workspace.testing.mock-workspace';
import { ComponentID } from '@teambit/component-id';
import type { InstallMain } from './install.main.runtime';
import { InstallAspect } from './install.aspect';

type InstallWithEnvPackage = {
  _getEnvPackage(envId: ComponentID): Promise<Record<string, string> | undefined>;
};

describe('InstallMain', function () {
  this.timeout(0);
  let workspaceData: WorkspaceData;
  let install: InstallMain;
  before(async () => {
    workspaceData = mockWorkspace();
    install = await loadAspect(InstallAspect, workspaceData.workspacePath);
  });
  after(async () => {
    await destroyWorkspace(workspaceData);
  });

  describe('env root manifest of an env shipped with bit', () => {
    // envs shipped with bit are loaded from the bit installation itself. adding their npm package
    // to the env root makes the package manager fetch the whole bit core into the workspace.
    // only empty-env is asserted here: it stays a core env after the other core envs become
    // regular envs, so this spec must not assume anything about them.
    it('should not add the empty-env package to its env root', async () => {
      // reaching the private method directly to avoid running a real package installation
      const installWithEnvPackage = install as unknown as InstallWithEnvPackage;
      const envId = ComponentID.fromString('teambit.harmony/empty-env');
      const envPackage = await installWithEnvPackage._getEnvPackage(envId);
      expect(envPackage).to.be.undefined;
    });
  });
});
