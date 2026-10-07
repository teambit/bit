import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import stripAnsi from 'strip-ansi';
import { loadManyAspects } from '@teambit/harmony.testing.load-aspect';
import type { CLIMain } from '@teambit/cli';
import { CLIAspect } from '@teambit/cli';
import type { SnappingMain } from '@teambit/snapping';
import { SnappingAspect } from '@teambit/snapping';
import type { ExportMain } from '@teambit/export';
import { ExportAspect } from '@teambit/export';
import { ImporterAspect } from '@teambit/importer';
import type { Workspace } from '@teambit/workspace';
import { WorkspaceAspect } from '@teambit/workspace';
import type { WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockWorkspace, destroyWorkspace } from '@teambit/workspace.testing.mock-workspace';
import { mockComponents } from '@teambit/component.testing.mock-components';
import type { CheckoutMain } from './checkout.main.runtime';
import { CheckoutAspect } from './checkout.aspect';

const ASPECTS = [WorkspaceAspect, SnappingAspect, ExportAspect, ImporterAspect, CheckoutAspect, CLIAspect];
const importFlags = { skipDependencyInstallation: true, skipWriteConfigFiles: true };

/**
 * "bit import" as a fresh process would run it: a newly loaded harmony and the command as registered.
 */
async function runImport(workspacePath: string, ids: string[], flags: Record<string, any> = {}): Promise<string> {
  const harmony = await loadManyAspects(ASPECTS, workspacePath);
  const importCmd = harmony.get<CLIMain>(CLIAspect.id).getCommand('import');
  if (!importCmd?.report) throw new Error('the "import" command is not registered');
  const originalCwd = process.cwd();
  process.chdir(workspacePath);
  try {
    return stripAnsi((await importCmd.report([ids], { ...importFlags, ...flags })) as string);
  } finally {
    process.chdir(originalCwd);
  }
}

async function expectImportToReject(workspacePath: string, ids: string[], flags: Record<string, any>, part: string) {
  let error: Error | undefined;
  try {
    await runImport(workspacePath, ids, flags);
  } catch (err: any) {
    error = err;
  }
  if (!error) throw new Error(`expected "bit import" to throw an error containing "${part}", but it succeeded`);
  expect(stripAnsi(error.message)).to.have.string(part);
}

/**
 * author a component in one workspace (optionally exporting it), then create a second empty workspace that shares the
 * same remote and has only the .bitmap of the first one. it's the same as re-initializing a workspace and copying the
 * .bitmap into it.
 */
async function setupWorkspaceWithBitmapOnly({ exportComp }: { exportComp: boolean }) {
  const authorData = mockWorkspace();
  await mockComponents(authorData.workspacePath);
  const harmony = await loadManyAspects([WorkspaceAspect, SnappingAspect, ExportAspect], authorData.workspacePath);
  const snapping = harmony.get<SnappingMain>(SnappingAspect.id);
  await snapping.tag({ ids: ['comp1'], build: false, ignoreIssues: 'MissingManuallyConfiguredPackages' });
  if (exportComp) {
    await harmony.get<ExportMain>(ExportAspect.id).export();
  }
  const bitmapContent = await fs.readFile(path.join(authorData.workspacePath, '.bitmap'), 'utf8');
  const workspaceData = mockWorkspace({ bareScopeName: authorData.remoteScopeName });
  await fs.writeFile(path.join(workspaceData.workspacePath, '.bitmap'), bitmapContent);
  await fs.remove(authorData.workspacePath);
  return workspaceData;
}

describe('bit import command with no ids', function () {
  this.timeout(0);

  describe('with a component in bit.map and --merge flag', () => {
    let workspaceData: WorkspaceData;
    before(async () => {
      workspaceData = await setupWorkspaceWithBitmapOnly({ exportComp: true });
    });
    after(async () => {
      await destroyWorkspace(workspaceData);
    });
    it('should throw an error and suggest using bit checkout reset', async () => {
      await expectImportToReject(workspaceData.workspacePath, [], { merge: true }, 'checkout reset');
    });
  });

  describe('with components in bit.map when they are modified locally', () => {
    let workspaceData: WorkspaceData;
    let backupPath: string;
    const compFile = (workspacePath: string) => path.join(workspacePath, 'comp1', 'index.js');
    before(async () => {
      workspaceData = await setupWorkspaceWithBitmapOnly({ exportComp: true });
      const { workspacePath } = workspaceData;
      const harmony = await loadManyAspects(ASPECTS, workspacePath);
      const checkout = harmony.get<CheckoutMain>(CheckoutAspect.id);
      await checkout.checkout({ reset: true, all: true, skipNpmInstall: true });
      await fs.outputFile(compFile(workspacePath), "module.exports = function foo() { return 'got foo v2'; };");
      // equivalent of cloning the workspace, so each scenario starts with the same state
      backupPath = `${workspacePath}-backup`;
      await fs.copy(workspacePath, backupPath);
    });
    after(async () => {
      await destroyWorkspace(workspaceData);
      await fs.remove(backupPath);
    });
    const restoreWorkspace = async () => {
      await fs.emptyDir(workspaceData.workspacePath);
      await fs.copy(backupPath, workspaceData.workspacePath);
    };
    const isModified = async (): Promise<boolean> => {
      const harmony = await loadManyAspects([WorkspaceAspect], workspaceData.workspacePath);
      const workspace = harmony.get<Workspace>(WorkspaceAspect.id);
      const modified = await workspace.modified();
      return modified.length > 0;
    };

    describe('without any flag', () => {
      // should import objects only
      let output: string;
      before(async () => {
        output = await runImport(workspaceData.workspacePath, []);
      });
      it('should not display a warning saying it was unable to import', () => {
        expect(output).to.not.have.string('unable to import');
      });
      it('should display a successful message', () => {
        expect(output).to.have.string('successfully imported');
      });
    });
    describe('with --override flag', () => {
      before(restoreWorkspace);
      it('should throw an error and suggest using bit checkout reset', async () => {
        await expectImportToReject(workspaceData.workspacePath, [], { override: true }, 'checkout reset');
      });
    });
    describe('with --merge=manual flag', () => {
      let output: string;
      before(async () => {
        await restoreWorkspace();
        output = await runImport(workspaceData.workspacePath, [`${workspaceData.remoteScopeName}/comp1`], {
          merge: 'manual',
        });
      });
      it('should display a successful message', () => {
        expect(output).to.have.string('successfully imported');
      });
      it('should show them as modified', async () => {
        expect(await isModified()).to.be.true;
      });
    });
    describe('after tagging', () => {
      let output: string;
      before(async () => {
        await restoreWorkspace();
        const harmony = await loadManyAspects(ASPECTS, workspaceData.workspacePath);
        const snapping = harmony.get<SnappingMain>(SnappingAspect.id);
        await snapping.tag({ all: true, build: false, ignoreIssues: 'MissingManuallyConfiguredPackages' });
        output = await runImport(workspaceData.workspacePath, [`${workspaceData.remoteScopeName}/comp1`], {
          merge: 'manual',
        });
      });
      it('should display a successful message', () => {
        // before, it'd throw an error component-not-found as the tag exists only locally
        expect(output).to.have.string('successfully imported');
      });
    });
  });

  describe('with an AUTHORED component which was only tagged but not exported', () => {
    let workspaceData: WorkspaceData;
    before(async () => {
      workspaceData = await setupWorkspaceWithBitmapOnly({ exportComp: false });
    });
    after(async () => {
      await destroyWorkspace(workspaceData);
    });
    it('should not try to import that component as it was not exported yet', async () => {
      let output: string | undefined;
      let error: Error | undefined;
      try {
        output = await runImport(workspaceData.workspacePath, [], { merge: true });
      } catch (err: any) {
        error = err;
      }
      expect(stripAnsi(output ?? error?.message ?? '')).to.have.string('nothing to import');
    });
  });
});
