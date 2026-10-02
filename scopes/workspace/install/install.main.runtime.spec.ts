import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import { loadAspect } from '@teambit/harmony.testing.load-aspect';
import type { WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockWorkspace, destroyWorkspace } from '@teambit/workspace.testing.mock-workspace';
import { ComponentID } from '@teambit/component-id';
import type { InstallMain } from './install.main.runtime';
import { InstallAspect } from './install.aspect';

type InstallWithWorkspace = {
  workspace: { isPnpmWorkspaceRoot(): boolean };
};

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

  describe('a pnpm workspace root', () => {
    // making a real one takes a component tracked at the root, see "bit pnpm sync"
    let workspace: InstallWithWorkspace['workspace'];
    let originalCheck: () => boolean;
    let packageJsonPath: string;
    let originalPackageJson: string;
    before(async () => {
      workspace = (install as unknown as InstallWithWorkspace).workspace;
      originalCheck = workspace.isPnpmWorkspaceRoot;
      workspace.isPnpmWorkspaceRoot = () => true;
      packageJsonPath = path.join(workspaceData.workspacePath, 'package.json');
      originalPackageJson = '{ "name": "my-root", "private": true }';
      await fs.writeFile(packageJsonPath, originalPackageJson);
    });
    after(() => {
      workspace.isPnpmWorkspaceRoot = originalCheck;
    });
    it('should leave the install of a command that installs as a step of its own to pnpm', async () => {
      const installed = await install.install();
      expect(installed.toArray()).to.have.lengthOf(0);
      // the root package.json belongs to the root component, pnpm reads the projects' own
      expect(await fs.readFile(packageJsonPath, 'utf8')).to.equal(originalPackageJson);
    });
    it('should point "bit install" to pnpm', async () => {
      const explicitInstall = (packages: string[]) =>
        install.install(packages, { showExternalPackageManagerPrompt: true }).then(
          () => '',
          (err: Error) => err.message
        );
      expect(await explicitInstall([])).to.include('run "pnpm install"');
      expect(await explicitInstall(['lodash'])).to.include('run "pnpm add lodash --filter <project>"');
    });
  });
});
