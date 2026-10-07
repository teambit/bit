import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import stripAnsi from 'strip-ansi';
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
import { ListerAspect } from '@teambit/lister';
import { RemoveAspect } from '@teambit/remove';
import type { RemoveMain } from '@teambit/remove';
import { HostInitializerMain } from '@teambit/host-initializer';
import { ComponentsList } from '@teambit/legacy.component-list';
import { Lane, ModelComponent, Symlink } from '@teambit/objects';
import { OutdatedIndexJson, Scope } from '@teambit/legacy.scope';
import type { SnappingMain } from './snapping.main.runtime';
import { SnappingAspect } from './snapping.aspect';

/**
 * the components index of the scope (.bit/index.json). it lives in the snapping aspect, since tagging is needed to
 * populate it, and the aspects that own the index (objects, scope) must not depend on it.
 */

/**
 * a fresh harmony per call, to simulate a new process running a new command.
 */
async function loadWorkspace(workspacePath: string) {
  // a new process loads the scope, and its index, from the filesystem. the in-process cache would hide manual changes
  Scope.scopeCache = {};
  const harmony = await loadManyAspects(
    [WorkspaceAspect, SnappingAspect, ExportAspect, ImporterAspect, ListerAspect, RemoveAspect],
    workspacePath
  );
  const cli = harmony.get<CLIMain>(CLIAspect.id);
  const listCmd = cli.getCommand('list');
  if (!listCmd?.json) throw new Error('the "list" command is not registered');
  const workspace = harmony.get<Workspace>(WorkspaceAspect.id);
  return {
    workspace,
    snapping: harmony.get<SnappingMain>(SnappingAspect.id),
    importer: harmony.get<ImporterMain>(ImporterAspect.id),
    remove: harmony.get<RemoveMain>(RemoveAspect.id),
    exportCmd: async () => {
      const cmd = cli.getCommand('export');
      if (!cmd?.report) throw new Error('the "export" command is not registered');
      await cmd.report([[]] as any, {});
    },
    resetCmd: async (pattern: string) => {
      const cmd = cli.getCommand('reset');
      if (!cmd?.report) throw new Error('the "reset" command is not registered');
      await cmd.report([pattern] as any, { silent: true });
    },
    // the local scope, as "bit list --local-scope" lists it
    listLocalScope: async (scopeName: string) =>
      ((await listCmd.json!([], { localScope: true, scope: scopeName })) as Record<string, any>[]) || [],
    // what "bit status" needs first: the components of the scope, which it reads by the index
    listScopeComponents: async () => new ComponentsList(workspace).listAll(false, true),
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
  expect(stripAnsi(error.message)).to.have.string(stripAnsi(messagePart));
}

const indexJsonPath = (workspacePath: string) => path.join(workspacePath, '.bit', 'index.json');
const getIndexJson = (workspacePath: string) => fs.readJsonSync(indexJsonPath(workspacePath));
/**
 * the envs that the in-process workspace imports are recorded in the index too. the e2e workspace had none, so leave
 * them out by filtering by the scope name.
 */
const getIndexComponents = (workspacePath: string, scopeName: string): any[] =>
  getIndexJson(workspacePath).components.filter((item) => item.id.scope === scopeName);
const writeIndexJson = (workspacePath: string, components: any[] = [], lanes: any[] = []) =>
  fs.outputJsonSync(indexJsonPath(workspacePath), { components, lanes });

async function tag(workspacePath: string) {
  const { snapping } = await loadWorkspace(workspacePath);
  await snapping.tag({ build: false, version: '0.0.1', ignoreIssues: '*' });
}

async function addRemote(workspacePath: string, remote: { remoteScopeName: string; remoteScopePath: string }) {
  const scopeJsonPath = path.join(workspacePath, '.bit', 'scope.json');
  const scopeJson = await fs.readJson(scopeJsonPath);
  scopeJson.remotes = { ...scopeJson.remotes, [remote.remoteScopeName]: `file://${remote.remoteScopePath}` };
  await fs.writeJson(scopeJsonPath, scopeJson);
}

describe('scope components index mechanism', function () {
  this.timeout(0);

  describe('after tagging a component', () => {
    let workspaceData: WorkspaceData;
    let remoteName: string;
    let workspacePath: string;
    before(async () => {
      workspaceData = mockWorkspace();
      ({ workspacePath } = workspaceData);
      remoteName = workspaceData.remoteScopeName;
      await mockComponents(workspacePath);
      await tag(workspacePath);
    });
    after(async () => {
      await destroyWorkspace(workspaceData);
    });
    it('should save the component in the index.json file', () => {
      const indexJson = getIndexComponents(workspacePath, remoteName);
      expect(indexJson).to.have.lengthOf(1);
      const indexItem = indexJson[0];
      expect(indexItem).to.have.property('id');
      expect(indexItem).to.have.property('hash');
      expect(indexItem).to.have.property('isSymlink');
      expect(indexItem.isSymlink).to.be.false;
    });
    describe('after exporting the component', () => {
      before(async () => {
        await (await loadWorkspace(workspacePath)).exportCmd();
      });
      it('should create a new record with the new scope', () => {
        const indexJson = getIndexJson(workspacePath).components;
        const scopes = indexJson.map((item) => item.id.scope);
        expect(scopes).to.contain(remoteName);
      });
      it('bit list should show only one component', async () => {
        const list = await (await loadWorkspace(workspacePath)).listLocalScope(remoteName);
        expect(list).to.have.lengthOf(1);
        expect(list[0].id).to.contain(remoteName);
      });
      describe('importing the component to a new scope', () => {
        let importingWorkspaceData: WorkspaceData;
        before(async () => {
          importingWorkspaceData = mockWorkspace();
          await addRemote(importingWorkspaceData.workspacePath, workspaceData);
          const { importer } = await loadWorkspace(importingWorkspaceData.workspacePath);
          const originalCwd = process.cwd();
          process.chdir(importingWorkspaceData.workspacePath); // writeToPath is resolved against the cwd
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
        });
        after(async () => {
          await destroyWorkspace(importingWorkspaceData);
        });
        it('should populate the index.json', () => {
          const indexJson = getIndexComponents(importingWorkspaceData.workspacePath, remoteName);
          expect(indexJson).to.have.lengthOf(1);
        });
      });
      describe('removing the component', () => {
        before(async () => {
          const { remove } = await loadWorkspace(workspacePath);
          await remove.remove({ componentsPattern: 'comp1', force: true });
        });
        it('should remove the record from index.json', () => {
          const indexJson = getIndexComponents(workspacePath, remoteName);
          expect(indexJson).to.have.lengthOf(0);
        });
      });
    });
  });

  describe('changing the index.json file manually to be empty', () => {
    let workspaceData: WorkspaceData;
    let workspacePath: string;
    before(async () => {
      workspaceData = mockWorkspace();
      ({ workspacePath } = workspaceData);
      await mockComponents(workspacePath);
      await tag(workspacePath);

      // as an intermediate step, make sure bit list shows one component
      const list = await (await loadWorkspace(workspacePath)).listLocalScope(workspaceData.remoteScopeName);
      expect(list).to.have.lengthOf(1);

      writeIndexJson(workspacePath, []);
    });
    after(async () => {
      await destroyWorkspace(workspaceData);
    });
    it('bit list should show zero results as it uses the index.json file', async () => {
      const list = await (await loadWorkspace(workspacePath)).listLocalScope(workspaceData.remoteScopeName);
      expect(list).to.have.lengthOf(0);
    });
    it('bit cat-scope should still show the component as it should not be affected by the cache', async () => {
      const { workspace } = await loadWorkspace(workspacePath);
      // what "bit cat-scope" does: lists the objects from the filesystem
      const objects = await workspace.consumer.scope.objects.list([ModelComponent, Symlink, Lane]);
      const ownObjects = objects.filter((object) => (object as ModelComponent).scope === workspaceData.remoteScopeName);
      expect(ownObjects).to.have.lengthOf(1);
    });
    describe('running bit init --reset', () => {
      before(async () => {
        await HostInitializerMain.init(workspacePath, false, false, true, false, false, false, false, true);
      });
      it('should rebuild index.json with the missing components', () => {
        const indexJson = getIndexComponents(workspacePath, workspaceData.remoteScopeName);
        expect(indexJson).to.have.lengthOf(1);
      });
    });
  });

  describe('outdated / out-of-sync index.json', () => {
    describe('adding a non-exist component to index.json', () => {
      let workspaceData: WorkspaceData;
      let workspacePath: string;
      before(async () => {
        workspaceData = mockWorkspace();
        ({ workspacePath } = workspaceData);
        await mockComponents(workspacePath);
        await tag(workspacePath);
        const indexJsonWithComp = getIndexJson(workspacePath).components;
        await (await loadWorkspace(workspacePath)).resetCmd('comp1');
        writeIndexJson(workspacePath, indexJsonWithComp);
        // now, index.json has the component, however the scope doesn't have it
      });
      after(async () => {
        await destroyWorkspace(workspaceData);
      });
      it('bit status should throw an error for the first time and then should work on the second run', async () => {
        // used to show "Cannot read property 'scope' of null"
        const error = new OutdatedIndexJson([`component "${workspaceData.remoteScopeName}/comp1"`]);
        await expectToReject(async () => (await loadWorkspace(workspacePath)).listScopeComponents(), error.message);

        await (await loadWorkspace(workspacePath)).listScopeComponents();
      });
    });
  });
});
