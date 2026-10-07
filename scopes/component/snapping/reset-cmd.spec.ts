import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import stripAnsi from 'strip-ansi';
import { ComponentID } from '@teambit/component-id';
import { MissingBitMapComponent } from '@teambit/legacy.bit-map';
import { loadManyAspects } from '@teambit/harmony.testing.load-aspect';
import type { WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockWorkspace, destroyWorkspace } from '@teambit/workspace.testing.mock-workspace';
import { mockComponents } from '@teambit/component.testing.mock-components';
import type { Workspace } from '@teambit/workspace';
import { WorkspaceAspect } from '@teambit/workspace';
import type { CLIMain } from '@teambit/cli';
import { CLIAspect } from '@teambit/cli';
import { ExportAspect } from '@teambit/export';
import { ImporterAspect } from '@teambit/importer';
import type { ImporterMain } from '@teambit/importer';
import { ComponentsList } from '@teambit/legacy.component-list';
import { DependenciesAspect } from '@teambit/dependencies';
import type { DependenciesMain } from '@teambit/dependencies';
import type { SnappingMain } from './snapping.main.runtime';
import { SnappingAspect } from './snapping.aspect';

/**
 * "bit reset" flows. they live in the snapping aspect, which owns the command, and not in a lower aspect, since
 * tagging and exporting are needed to set up the scenarios.
 */

type ResetFlags = { head?: boolean; force?: boolean; silent?: boolean };

/**
 * a fresh harmony per call, to simulate a new process running a new command.
 */
async function loadWorkspace(workspacePath: string) {
  const harmony = await loadManyAspects(
    [WorkspaceAspect, SnappingAspect, ExportAspect, ImporterAspect, DependenciesAspect],
    workspacePath
  );
  const cli = harmony.get<CLIMain>(CLIAspect.id);
  const runCmd = async (name: string, args: any[], flags: Record<string, any> = {}): Promise<string> => {
    const cmd = cli.getCommand(name);
    if (!cmd?.report) throw new Error(`the "${name}" command is not registered`);
    return stripAnsi((await cmd.report(args as any, flags)) as string);
  };
  const workspace = harmony.get<Workspace>(WorkspaceAspect.id);
  return {
    workspace,
    snapping: harmony.get<SnappingMain>(SnappingAspect.id),
    importer: harmony.get<ImporterMain>(ImporterAspect.id),
    dependencies: harmony.get<DependenciesMain>(DependenciesAspect.id),
    exportCmd: (ids: string[] = []) => runCmd('export', [ids], {}),
    reset: (pattern?: string, flags: ResetFlags = {}) => runCmd('reset', [pattern], flags),
    resetAll: (flags: ResetFlags = {}) => runCmd('reset', [undefined], { silent: true, ...flags }),
    /**
     * the components of the local scope (as "bit list --local-scope" lists them), as a string of the count and the ids
     * with their versions. the envs that the in-process workspace imports are left out by filtering by the scope name.
     */
    list: async (scopeName: string) => {
      const results = (await new ComponentsList(workspace).listAll(false, true)).filter(
        (result) => result.id.scope === scopeName
      );
      return `found ${results.length} components\n${results.map((result) => result.id.toString()).join('\n')}`;
    },
  };
}

async function expectToReject(fn: () => Promise<any>, messagePart: string) {
  let error: Error | undefined;
  try {
    await fn();
  } catch (err: any) {
    error = err;
  }
  if (!error) throw new Error(`expected to throw an error containing "${messagePart}", but it did not throw`);
  expect(stripAnsi(error.message)).to.have.string(messagePart);
}

async function tag(workspacePath: string, params: { version?: string; unmodified?: boolean; ids?: string[] } = {}) {
  const { snapping } = await loadWorkspace(workspacePath);
  await snapping.tag({ build: false, ignoreIssues: '*', ...params });
}

async function snap(workspacePath: string, params: { unmodified?: boolean } = {}) {
  const { snapping } = await loadWorkspace(workspacePath);
  await snapping.snap({ build: false, ignoreIssues: '*', ...params });
}

async function exportAll(workspacePath: string) {
  const { exportCmd } = await loadWorkspace(workspacePath);
  await exportCmd();
}

/**
 * the model-component of the scope (equivalent of "bit cat-component").
 */
async function getModelComponent(workspaceData: WorkspaceData, compName: string) {
  const { workspace } = await loadWorkspace(workspaceData.workspacePath);
  const compId = ComponentID.fromString(`${workspaceData.remoteScopeName}/${compName}`);
  return workspace.consumer.scope.getModelComponent(compId);
}

async function getStagedIds(workspacePath: string): Promise<string[]> {
  const { workspace } = await loadWorkspace(workspacePath);
  return workspace.consumer.getNotExportedIds().map((id) => id.toStringWithoutVersion());
}

async function getAspectConfig(workspaceData: WorkspaceData, compName: string, aspectId: string) {
  const { workspace } = await loadWorkspace(workspaceData.workspacePath);
  const component = await workspace.get(ComponentID.fromString(`${workspaceData.remoteScopeName}/${compName}`));
  return component.state.aspects.get(aspectId)?.config as Record<string, any> | undefined;
}

/**
 * add the remote scope of another workspace to this workspace, so it can import from it (as "bit remote add" does).
 */
async function addRemote(workspacePath: string, remote: { remoteScopeName: string; remoteScopePath: string }) {
  const scopeJsonPath = path.join(workspacePath, '.bit', 'scope.json');
  const scopeJson = await fs.readJson(scopeJsonPath);
  scopeJson.remotes = { ...scopeJson.remotes, [remote.remoteScopeName]: `file://${remote.remoteScopePath}` };
  await fs.writeJson(scopeJsonPath, scopeJson);
}

/**
 * equivalent of "bit init --bare" on a remote that was already used: removes everything but keeps the scope name.
 */
async function reInitRemoteScope(remoteScopePath: string) {
  const scopeJson = await fs.readFile(path.join(remoteScopePath, 'scope.json'));
  const dirs = (await fs.readdir(remoteScopePath)).filter((name) =>
    fs.statSync(path.join(remoteScopePath, name)).isDirectory()
  );
  await fs.emptyDir(remoteScopePath);
  await fs.writeFile(path.join(remoteScopePath, 'scope.json'), scopeJson);
  await Promise.all(dirs.map((dir) => fs.ensureDir(path.join(remoteScopePath, dir))));
}

describe('bit reset command', function () {
  this.timeout(0);

  describe('untag single component', () => {
    let workspaceData: WorkspaceData;
    beforeEach(async () => {
      workspaceData = mockWorkspace();
      await mockComponents(workspaceData.workspacePath);
      await tag(workspaceData.workspacePath, { version: '0.0.1' });
      const { list } = await loadWorkspace(workspaceData.workspacePath);
      expect(await list(workspaceData.remoteScopeName)).to.have.string('found 1 components');
    });
    afterEach(async () => {
      await destroyWorkspace(workspaceData);
    });
    describe('with one version', () => {
      it('should delete the entire component from the model', async () => {
        const { reset } = await loadWorkspace(workspaceData.workspacePath);
        await reset('comp1', { head: true });
        const { list } = await loadWorkspace(workspaceData.workspacePath);
        expect(await list(workspaceData.remoteScopeName)).to.have.string('found 0 components');
      });
    });
    describe('with multiple versions when specifying the version', () => {
      beforeEach(async () => {
        await tag(workspaceData.workspacePath, { unmodified: true });
        const modelComponent = await getModelComponent(workspaceData, 'comp1');
        expect(modelComponent.versions).to.have.property('0.0.2');

        const { reset } = await loadWorkspace(workspaceData.workspacePath);
        await reset('comp1', { head: true });
      });
      it('should delete only the specified tag', async () => {
        const modelComponent = await getModelComponent(workspaceData, 'comp1');
        expect(modelComponent.versions).to.not.have.property('0.0.2');
        expect(modelComponent.versions).to.have.property('0.0.1');
      });
      it('should delete the specified version from the "state" attribute', async () => {
        const modelComponent = await getModelComponent(workspaceData, 'comp1');
        expect(modelComponent.state.versions).to.not.have.property('0.0.2');
        expect(modelComponent.state.versions).to.have.property('0.0.1');
      });
      it('bit show should work', async () => {
        const { workspace } = await loadWorkspace(workspaceData.workspacePath);
        const component = await workspace.get(ComponentID.fromString(`${workspaceData.remoteScopeName}/comp1`));
        expect(component.id.fullName).to.equal('comp1');
      });
      it('bit status should show the component as staged', async () => {
        expect(await getStagedIds(workspaceData.workspacePath)).to.deep.equal([
          `${workspaceData.remoteScopeName}/comp1`,
        ]);
      });
    });
    describe('with multiple versions when not specifying the version', () => {
      describe('and all versions are local', () => {
        it('should delete the entire component from the model', async () => {
          await tag(workspaceData.workspacePath, { unmodified: true });
          const modelComponent = await getModelComponent(workspaceData, 'comp1');
          expect(modelComponent.versions).to.have.property('0.0.2');

          const { reset } = await loadWorkspace(workspaceData.workspacePath);
          await reset('comp1');
          const { list } = await loadWorkspace(workspaceData.workspacePath);
          expect(await list(workspaceData.remoteScopeName)).to.have.string('found 0 components');
        });
      });
    });
    describe('when some versions are exported, some are local', () => {
      it('should delete only the local tag and leave the exported tag', async () => {
        await reInitRemoteScope(workspaceData.remoteScopePath);
        await exportAll(workspaceData.workspacePath);
        await tag(workspaceData.workspacePath, { unmodified: true });
        const modelComponent = await getModelComponent(workspaceData, 'comp1');
        expect(modelComponent.versions).to.have.property('0.0.2');

        const { reset } = await loadWorkspace(workspaceData.workspacePath);
        await reset('comp1');
        const afterReset = await getModelComponent(workspaceData, 'comp1');
        expect(afterReset.versions).to.not.have.property('0.0.2');
        expect(afterReset.versions).to.have.property('0.0.1');
      });
    });
    describe('when tagging non-existing component', () => {
      it('should show an descriptive error', async () => {
        const { reset } = await loadWorkspace(workspaceData.workspacePath);
        const error = new MissingBitMapComponent('non-exist-scope/non-exist-comp');
        await expectToReject(() => reset('non-exist-scope/non-exist-comp'), stripAnsi(error.message));
      });
    });
  });

  describe('untag multiple components (--all flag)', () => {
    let workspaceData: WorkspaceData;
    beforeEach(async () => {
      workspaceData = mockWorkspace();
      const { workspacePath } = workspaceData;
      await mockComponents(workspacePath, { numOfComponents: 3 });
      await tag(workspacePath, { version: '0.0.1' });
      await (await loadWorkspace(workspacePath)).exportCmd(['comp3']);
      const { list } = await loadWorkspace(workspacePath);
      expect(await list(workspaceData.remoteScopeName)).to.have.string('found 3 components');
    });
    afterEach(async () => {
      await destroyWorkspace(workspaceData);
    });
    describe('without specifying a version', () => {
      it('should display a descriptive successful message and remove only local components from the model', async () => {
        const { resetAll } = await loadWorkspace(workspaceData.workspacePath);
        const untagOutput = await resetAll();
        expect(untagOutput).to.have.string('2 component(s) reset successfully');

        const { list } = await loadWorkspace(workspaceData.workspacePath);
        const output = await list(workspaceData.remoteScopeName);
        expect(output).to.have.string('found 1 components');
        expect(output).to.have.string('comp3');
      });
    });
    describe('with --head', () => {
      it('should display a descriptive successful message and remove only the specified version from the model', async () => {
        await tag(workspaceData.workspacePath, { unmodified: true, version: '0.0.5' });
        const { resetAll } = await loadWorkspace(workspaceData.workspacePath);
        const untagOutput = await resetAll({ head: true });
        expect(untagOutput).to.have.string('3 component(s) reset successfully');

        const { list } = await loadWorkspace(workspaceData.workspacePath);
        const output = await list(workspaceData.remoteScopeName);
        expect(output).to.have.string('found 3 components');
        expect(output).to.have.string('0.0.1');
        expect(output).to.not.have.string('0.0.5');
      });
    });
  });

  describe('components with dependencies', () => {
    // comp1 depends on comp2
    let workspaceData: WorkspaceData;
    let remoteName: string;
    beforeEach(async () => {
      workspaceData = mockWorkspace();
      remoteName = workspaceData.remoteScopeName;
      await mockComponents(workspaceData.workspacePath, { numOfComponents: 2 });
      await tag(workspaceData.workspacePath, { version: '0.0.1' });
    });
    afterEach(async () => {
      await destroyWorkspace(workspaceData);
    });
    describe('untag only the dependency', () => {
      describe('without force flag', () => {
        it('should throw a descriptive error', async () => {
          const { reset } = await loadWorkspace(workspaceData.workspacePath);
          await expectToReject(
            () => reset('comp2'),
            `unable to reset ${remoteName}/comp2, the version 0.0.1 has the following dependent(s) ${remoteName}/comp1@0.0.1`
          );
        });
      });
      describe('with force flag', () => {
        it('should untag successfully', async () => {
          const { reset } = await loadWorkspace(workspaceData.workspacePath);
          const untagOutput = await reset('comp2', { force: true });
          expect(untagOutput).to.have.string('1 component(s) reset successfully');
        });
      });
      describe('after exporting the component and tagging the scope', () => {
        it('should show an error', async () => {
          await reInitRemoteScope(workspaceData.remoteScopePath);
          await exportAll(workspaceData.workspacePath);
          await tag(workspaceData.workspacePath, { unmodified: true, version: '1.0.5' });
          const { reset } = await loadWorkspace(workspaceData.workspacePath);
          await expectToReject(() => reset('comp2'), `unable to reset ${remoteName}/comp2`);
        });
      });
    });
    describe('untag all components', () => {
      describe('when all components have only local versions', () => {
        it('should remove all the components because it does not leave a damaged component without dependency', async () => {
          const { resetAll } = await loadWorkspace(workspaceData.workspacePath);
          await resetAll();
          const { list } = await loadWorkspace(workspaceData.workspacePath);
          expect(await list(remoteName)).to.have.string('found 0 components');
        });
      });
    });
    describe('untag only the dependent', () => {
      it('should untag successfully the dependent and leave the dependency intact', async () => {
        const { reset } = await loadWorkspace(workspaceData.workspacePath);
        const untagOutput = await reset('comp1');
        expect(untagOutput).to.have.string('1 component(s) reset successfully');
        expect(untagOutput).to.have.string('comp1');

        const { list } = await loadWorkspace(workspaceData.workspacePath);
        expect(await list(remoteName)).to.have.string('comp2');
      });
    });
    describe('after import and tagging', () => {
      let importingWorkspaceData: WorkspaceData;
      let importedFile: string;
      beforeEach(async () => {
        await reInitRemoteScope(workspaceData.remoteScopePath);
        await exportAll(workspaceData.workspacePath);

        importingWorkspaceData = mockWorkspace();
        const { workspacePath } = importingWorkspaceData;
        await addRemote(workspacePath, workspaceData);
        const { importer } = await loadWorkspace(workspacePath);
        const originalCwd = process.cwd();
        process.chdir(workspacePath); // writeToPath is resolved against the cwd
        try {
          await importer.import({
            ids: [`${remoteName}/comp1`],
            writeToPath: 'components/comp1',
            installNpmPackages: false,
            writeConfigFiles: false,
          });
        } finally {
          process.chdir(originalCwd);
        }
        importedFile = path.join(workspacePath, 'components', 'comp1', 'index.js');
      });
      afterEach(async () => {
        await destroyWorkspace(importingWorkspaceData);
      });
      describe('untag using the id without scope-name', () => {
        it('should untag successfully', async () => {
          await tag(importingWorkspaceData.workspacePath, { unmodified: true, ids: ['comp1'] });
          const { reset } = await loadWorkspace(importingWorkspaceData.workspacePath);
          const output = await reset('comp1');
          expect(output).to.have.string('1 component(s) reset successfully');
          expect(output).to.have.string('comp1');
        });
      });
      describe('modify, tag and then untag all', () => {
        it('should show the component as modified', async () => {
          const { workspacePath } = importingWorkspaceData;
          await fs.appendFile(importedFile, '\n// modified');
          await tag(workspacePath, { ids: ['comp1'] });
          const { resetAll } = await loadWorkspace(workspacePath);
          await resetAll();

          const { workspace } = await loadWorkspace(workspacePath);
          const modified = await workspace.modified();
          expect(modified.map((comp) => comp.id.toStringWithoutVersion())).to.include(`${remoteName}/comp1`);
        });
      });
    });
  });

  describe('components with env config after multiple snaps', () => {
    let workspaceData: WorkspaceData;
    async function setEnv(envId: string) {
      const { workspace } = await loadWorkspace(workspaceData.workspacePath);
      const compId = ComponentID.fromString(`${workspaceData.remoteScopeName}/comp1`);
      await workspace.setEnvToComponents(ComponentID.fromString(envId), [compId], false);
      await workspace.bitMap.write('set env');
    }
    beforeEach(async () => {
      workspaceData = mockWorkspace();
      await mockComponents(workspaceData.workspacePath);
      await setEnv('teambit.react/react');
    });
    afterEach(async () => {
      await destroyWorkspace(workspaceData);
    });
    describe('when env is not changed between snaps', () => {
      it('bit reset should restore the env config that was set before the first snap', async () => {
        await snap(workspaceData.workspacePath);
        await snap(workspaceData.workspacePath, { unmodified: true });
        const { resetAll } = await loadWorkspace(workspaceData.workspacePath);
        await resetAll();
        const envData = await getAspectConfig(workspaceData, 'comp1', 'teambit.envs/envs');
        expect(envData?.env).to.equal('teambit.react/react');
      });
    });
    describe('when env is changed between snaps', () => {
      it('bit reset should keep the latest env config (not revert to the first snap env)', async () => {
        await snap(workspaceData.workspacePath);
        await setEnv('teambit.harmony/node');
        await snap(workspaceData.workspacePath);
        const { resetAll } = await loadWorkspace(workspaceData.workspacePath);
        await resetAll();
        const envData = await getAspectConfig(workspaceData, 'comp1', 'teambit.envs/envs');
        expect(envData?.env).to.equal('teambit.harmony/node');
      });
    });
    describe('when a different config (deps) is changed between snaps but env stays the same', () => {
      it('bit reset should restore both the env and the deps config', async () => {
        await snap(workspaceData.workspacePath);
        const { dependencies } = await loadWorkspace(workspaceData.workspacePath);
        await dependencies.setDependency('comp1', ['lodash@4.17.21']);
        await snap(workspaceData.workspacePath);
        const { resetAll } = await loadWorkspace(workspaceData.workspacePath);
        await resetAll();
        const envData = await getAspectConfig(workspaceData, 'comp1', 'teambit.envs/envs');
        expect(envData?.env).to.equal('teambit.react/react');
      });
    });
  });
});
