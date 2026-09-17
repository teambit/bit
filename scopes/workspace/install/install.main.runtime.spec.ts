import path from 'path';
import fs from 'fs-extra';
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

type InstallWithRootLookup = {
  isLegacyCoreEnvSatisfiedAtRoot(packageName: string, pinnedVersion: string): boolean;
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

  describe('legacy core env already installed at the workspace root', () => {
    // the pinned version is a floor, not an exact requirement. pinning an older version over the
    // one the root already provides moves what the rest of the tree resolved its peers against,
    // which re-links the whole tree and rewrites the dists a running bit is loaded from.
    const installedPackageName = '@teambit/react';
    const missingPackageName = '@teambit/mdx';
    const installedVersion = '1.0.1169';
    let installWithRootLookup: InstallWithRootLookup;
    before(async () => {
      // reaching the private method directly to avoid running a real package installation
      installWithRootLookup = install as unknown as InstallWithRootLookup;
      await fs.outputJson(
        path.join(workspaceData.workspacePath, 'node_modules', installedPackageName, 'package.json'),
        { name: installedPackageName, version: installedVersion }
      );
    });
    it('should be satisfied by a root version newer than the pinned one', () => {
      expect(installWithRootLookup.isLegacyCoreEnvSatisfiedAtRoot(installedPackageName, '1.0.1107')).to.be.true;
    });
    it('should be satisfied by a root version equal to the pinned one', () => {
      expect(installWithRootLookup.isLegacyCoreEnvSatisfiedAtRoot(installedPackageName, installedVersion)).to.be.true;
    });
    it('should not be satisfied by a root version older than the pinned one', () => {
      expect(installWithRootLookup.isLegacyCoreEnvSatisfiedAtRoot(installedPackageName, '1.0.1200')).to.be.false;
    });
    it('should not be satisfied when the package is not installed at the root', () => {
      expect(installWithRootLookup.isLegacyCoreEnvSatisfiedAtRoot(missingPackageName, '1.0.1108')).to.be.false;
    });
  });
});
