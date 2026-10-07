import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import { parse, stringify } from 'comment-json';
import stripAnsi from 'strip-ansi';
import { loadManyAspects } from '@teambit/harmony.testing.load-aspect';
import type { WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockWorkspace, destroyWorkspace } from '@teambit/workspace.testing.mock-workspace';
import { mockComponents } from '@teambit/component.testing.mock-components';
import { WorkspaceAspect } from '@teambit/workspace';
import type { CLIMain } from '@teambit/cli';
import { CLIAspect } from '@teambit/cli';
import { ExportAspect } from '@teambit/export';
import { ImporterAspect } from '@teambit/importer';
import type { ImporterMain } from '@teambit/importer';
import { ListerAspect } from '@teambit/lister';
import type { SnappingMain } from './snapping.main.runtime';
import { SnappingAspect } from './snapping.aspect';

/**
 * "bit list" flows. they live in the snapping aspect rather than next to the command in the lister aspect, since
 * tagging needs this aspect, and the lister aspect must not depend on it.
 */

/**
 * a fresh harmony per call, to simulate a new process running a new command.
 */
async function loadWorkspace(workspacePath: string) {
  const harmony = await loadManyAspects(
    [WorkspaceAspect, SnappingAspect, ExportAspect, ImporterAspect, ListerAspect],
    workspacePath
  );
  const cli = harmony.get<CLIMain>(CLIAspect.id);
  const listCmd = cli.getCommand('list');
  if (!listCmd) throw new Error('the "list" command is not registered');
  return {
    snapping: harmony.get<SnappingMain>(SnappingAspect.id),
    importer: harmony.get<ImporterMain>(ImporterAspect.id),
    exportCmd: async () => {
      const cmd = cli.getCommand('export');
      if (!cmd?.report) throw new Error('the "export" command is not registered');
      await cmd.report([[]] as any, {});
    },
    list: async (flags: Record<string, any> = {}) => stripAnsi((await listCmd.report!([], flags)) as string),
    listJson: async (flags: Record<string, any> = {}) => (await listCmd.json!([], flags)) as Record<string, any>[],
  };
}

async function tag(workspacePath: string, params: { version?: string; unmodified?: boolean } = {}) {
  const { snapping } = await loadWorkspace(workspacePath);
  await snapping.tag({ build: false, ...params });
}

async function exportAll(workspacePath: string) {
  const { exportCmd } = await loadWorkspace(workspacePath);
  await exportCmd();
}

async function addRemote(workspacePath: string, remote: { remoteScopeName: string; remoteScopePath: string }) {
  const scopeJsonPath = path.join(workspacePath, '.bit', 'scope.json');
  const scopeJson = await fs.readJson(scopeJsonPath);
  scopeJson.remotes = { ...scopeJson.remotes, [remote.remoteScopeName]: `file://${remote.remoteScopePath}` };
  await fs.writeJson(scopeJsonPath, scopeJson);
}

async function importComp1(workspacePath: string, remote: WorkspaceData, version: string) {
  await addRemote(workspacePath, remote);
  const { importer } = await loadWorkspace(workspacePath);
  const originalCwd = process.cwd();
  process.chdir(workspacePath); // writeToPath is resolved against the cwd
  try {
    await importer.import({
      ids: [`${remote.remoteScopeName}/comp1@${version}`],
      writeToPath: 'components/comp1',
      installNpmPackages: false,
      writeConfigFiles: false,
    });
  } finally {
    process.chdir(originalCwd);
  }
}

describe('bit list command', function () {
  this.timeout(0);

  describe('when a component is created but not tagged', () => {
    let workspaceData: WorkspaceData;
    before(async () => {
      workspaceData = mockWorkspace();
      await mockComponents(workspaceData.workspacePath);
    });
    after(async () => {
      await destroyWorkspace(workspaceData);
    });
    // the scope filter leaves out the envs, which the in-process workspace imports into its local scope
    it('should display "found 0 components"', async () => {
      const { list } = await loadWorkspace(workspaceData.workspacePath);
      expect(await list({ localScope: true, scope: workspaceData.remoteScopeName })).to.include('found 0 components');
    });
  });

  describe('when a component is created and tagged', () => {
    let workspaceData: WorkspaceData;
    before(async () => {
      workspaceData = mockWorkspace();
      await mockComponents(workspaceData.workspacePath);
      await tag(workspaceData.workspacePath, { version: '0.0.1' });
    });
    after(async () => {
      await destroyWorkspace(workspaceData);
    });
    it('should display "found 1 components"', async () => {
      const { list } = await loadWorkspace(workspaceData.workspacePath);
      expect(await list({ localScope: true, scope: workspaceData.remoteScopeName })).to.include('found 1 components');
    });
  });

  describe('with --outdated flag', () => {
    describe('when a remote component has a higher version than the local component', () => {
      let workspaceData: WorkspaceData;
      let importingWorkspaceData: WorkspaceData;
      let output: Record<string, any>[];
      before(async () => {
        workspaceData = mockWorkspace();
        await mockComponents(workspaceData.workspacePath);
        await tag(workspaceData.workspacePath, { version: '0.0.1' });
        await exportAll(workspaceData.workspacePath);

        importingWorkspaceData = mockWorkspace();
        await importComp1(importingWorkspaceData.workspacePath, workspaceData, '0.0.1');

        // a newer version gets exported from elsewhere
        await tag(workspaceData.workspacePath, { unmodified: true });
        await exportAll(workspaceData.workspacePath);

        const { listJson } = await loadWorkspace(importingWorkspaceData.workspacePath);
        output = await listJson({ localScope: true, outdated: true });
      });
      after(async () => {
        await destroyWorkspace(workspaceData);
        await destroyWorkspace(importingWorkspaceData);
      });
      it('should show that it has a later version in the remote', () => {
        const comp = output.find((item) => item.id === `${workspaceData.remoteScopeName}/comp1`);
        expect(comp?.remoteVersion).to.equal('0.0.2');
        expect(comp?.localVersion).to.equal('0.0.1');
      });
    });

    describe('when a remote component has the same version as the local component', () => {
      let workspaceData: WorkspaceData;
      let importingWorkspaceData: WorkspaceData;
      let output: Record<string, any>[];
      before(async () => {
        workspaceData = mockWorkspace();
        await mockComponents(workspaceData.workspacePath);
        await tag(workspaceData.workspacePath, { version: '0.0.1' });
        await exportAll(workspaceData.workspacePath);

        importingWorkspaceData = mockWorkspace();
        await importComp1(importingWorkspaceData.workspacePath, workspaceData, '0.0.1');
        const { listJson } = await loadWorkspace(importingWorkspaceData.workspacePath);
        output = await listJson({ localScope: true, outdated: true });
      });
      after(async () => {
        await destroyWorkspace(workspaceData);
        await destroyWorkspace(importingWorkspaceData);
      });
      it('should display the same version for the local and remote', () => {
        const comp = output.find((item) => item.id === `${workspaceData.remoteScopeName}/comp1`);
        expect(comp).to.exist;
        expect(comp?.remoteVersion).to.equal(comp?.localVersion);
      });
    });

    describe('when a component is local only (never exported)', () => {
      let workspaceData: WorkspaceData;
      let output: Record<string, any>[];
      before(async () => {
        workspaceData = mockWorkspace();
        // no remote scope as the default scope, as in a workspace that was never set up with a remote
        const workspaceJsoncPath = path.join(workspaceData.workspacePath, 'workspace.jsonc');
        const workspaceJsonc = parse(await fs.readFile(workspaceJsoncPath, 'utf8')) as any;
        workspaceJsonc['teambit.workspace/workspace'].defaultScope = 'my-scope';
        await fs.writeFile(workspaceJsoncPath, stringify(workspaceJsonc, null, 2));
        await mockComponents(workspaceData.workspacePath);
        await tag(workspaceData.workspacePath, { version: '0.0.1' });
        const { listJson } = await loadWorkspace(workspaceData.workspacePath);
        output = await listJson({ localScope: true, outdated: true });
      });
      after(async () => {
        await destroyWorkspace(workspaceData);
      });
      it('should show that the component does not have a remote version', () => {
        const comp = output.find((item) => item.id === 'my-scope/comp1');
        expect(comp?.remoteVersion).to.equal('N/A');
      });
    });
  });
});
