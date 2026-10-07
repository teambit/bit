import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import stripAnsi from 'strip-ansi';
import { loadManyAspects } from '@teambit/harmony.testing.load-aspect';
import type { WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockWorkspace, destroyWorkspace } from '@teambit/workspace.testing.mock-workspace';
import { mockComponents } from '@teambit/component.testing.mock-components';
import { WorkspaceAspect } from '@teambit/workspace';
import type { Workspace } from '@teambit/workspace';
import type { CLIMain } from '@teambit/cli';
import { CLIAspect } from '@teambit/cli';
import { ExportAspect } from '@teambit/export';
import { ImporterAspect } from '@teambit/importer';
import { SnappingAspect } from '@teambit/snapping';
import { DependencyResolverAspect } from '@teambit/dependency-resolver';
import type { DependencyResolverMain } from '@teambit/dependency-resolver';
import { ScopeAspect } from '@teambit/scope';
import type { ScopeMain } from '@teambit/scope';
import { StatusAspect } from './status.aspect';

/**
 * peer-dependencies of a component: the ones coming from the workspace policy are saved on the Version object
 * (separately from the prod and dev package-dependencies), and show up in "bit show". it lives in the status aspect
 * rather than in the snapping aspect, since one of the flows asserts "bit status", and the snapping aspect cannot
 * depend on it.
 */
describe('peer-dependencies functionality', function () {
  this.timeout(0);

  const workspaces: WorkspaceData[] = [];
  const policyByWorkspace = new Map<string, Record<string, any>>();

  function createWorkspace(): WorkspaceData {
    const workspaceData = mockWorkspace();
    workspaces.push(workspaceData);
    return workspaceData;
  }

  /** a workspace that has the scope of `remote` as a remote, which is what "bit remote add" does */
  function createWorkspaceWithRemote(remote: WorkspaceData): WorkspaceData {
    const workspaceData = createWorkspace();
    const scopeJsonPath = path.join(workspaceData.workspacePath, '.bit', 'scope.json');
    const scopeJson = fs.readJsonSync(scopeJsonPath);
    scopeJson.remotes = { ...scopeJson.remotes, [remote.remoteScopeName]: `file://${remote.remoteScopePath}` };
    fs.writeJsonSync(scopeJsonPath, scopeJson, { spaces: 2 });
    return workspaceData;
  }

  /** a fresh harmony per call, to simulate a new process running a new command */
  async function load(workspacePath: string) {
    const harmony = await loadManyAspects(
      [WorkspaceAspect, SnappingAspect, ExportAspect, ImporterAspect, StatusAspect, ScopeAspect, CLIAspect],
      workspacePath
    );
    const depResolver = harmony.get<DependencyResolverMain>(DependencyResolverAspect.id);
    depResolver.config.policy = policyByWorkspace.get(workspacePath) || {};
    depResolver.clearCache();
    const cli = harmony.get<CLIMain>(CLIAspect.id);
    // commands resolve against the cwd
    const inWorkspace = async <T>(fn: () => Promise<T>): Promise<T> => {
      const originalCwd = process.cwd();
      process.chdir(workspacePath);
      try {
        return await fn();
      } finally {
        process.chdir(originalCwd);
      }
    };
    const getCmd = (name: string) => {
      const cmd = cli.getCommand(name);
      if (!cmd) throw new Error(`the "${name}" command is not registered`);
      return cmd;
    };
    return {
      scope: harmony.get<ScopeMain>(ScopeAspect.id),
      workspace: harmony.get<Workspace>(WorkspaceAspect.id),
      report: (name: string, args: any[] = [], flags: Record<string, any> = {}) =>
        inWorkspace(async () => {
          const output: any = await getCmd(name).report!(args as any, flags);
          return stripAnsi(typeof output === 'string' ? output : output.data);
        }),
      json: (name: string, args: any[] = [], flags: Record<string, any> = {}) =>
        inWorkspace(async () => JSON.parse(JSON.stringify(await getCmd(name).json!(args as any, flags)))),
    };
  }

  const tagAll = async (workspacePath: string) => (await load(workspacePath)).report('tag', [[]], { build: false });
  const exportAll = async (workspacePath: string) => (await load(workspacePath)).report('export', [[]]);
  const runImport = async (workspacePath: string, ids: string[]) =>
    (await load(workspacePath)).report('import', [ids], { skipDependencyInstallation: true });

  /** the Version object of a component, as "bit cat-component <id>@<version>" prints it. "latest" is the head */
  async function catComponent(workspacePath: string, name: string, version = 'latest') {
    const { scope, workspace } = await load(workspacePath);
    const compId = await workspace.resolveComponentId(name);
    const modelComponent = await scope.legacyScope.getModelComponent(compId);
    const versionToLoad = version === 'latest' ? modelComponent.getHeadRegardlessOfLaneAsTagOrHash() : version;
    const versionObj = await modelComponent.loadVersion(versionToLoad, scope.legacyScope.objects);
    return JSON.parse(JSON.stringify(versionObj.toObject()));
  }

  async function expectStatusToBeClean(workspacePath: string) {
    const status = await (await load(workspacePath)).json('status');
    Object.keys(status).forEach((key) => {
      if (['componentsWithIssues', 'currentLaneId', 'forkedLaneId'].includes(key)) return;
      expect(status[key], `status.${key} should be empty`).to.have.lengthOf(0);
    });
  }

  /** the same as helper.npm.addFakeNpmPackage: a package in the workspace node_modules, with no installation */
  function addFakeNpmPackage(workspacePath: string, name: string, version: string) {
    fs.outputFileSync(path.join(workspacePath, 'node_modules', name, 'index.js'), '');
    fs.outputJsonSync(path.join(workspacePath, 'node_modules', name, 'package.json'), { name, version });
  }

  /**
   * the policy is applied on the loaded aspect rather than written to workspace.jsonc, because the developer's global
   * config (~/.bitrc.jsonc) may configure the dependency-resolver and it replaces the workspace one entirely.
   */
  function addPolicyToDependencyResolver(workspacePath: string, policy: Record<string, any>) {
    policyByWorkspace.set(workspacePath, { ...policyByWorkspace.get(workspacePath), ...policy });
  }

  after(async () => {
    await Promise.all(workspaces.map((workspaceData) => destroyWorkspace(workspaceData)));
  });

  describe('when a package is a regular dependency and a peer dependency', () => {
    let catComponentOutput;
    let workspacePath: string;
    before(async () => {
      workspacePath = createWorkspace().workspacePath;
      await mockComponents(workspacePath);
      fs.outputFileSync(path.join(workspacePath, 'comp1', 'index.js'), "const chai = require('chai');");
      addPolicyToDependencyResolver(workspacePath, { peerDependencies: { chai: '>= 2.1.2 < 5' } });
      addFakeNpmPackage(workspacePath, 'chai', '2.4');
      await tagAll(workspacePath);
      catComponentOutput = await catComponent(workspacePath, 'comp1');
    });
    it('should save the peer dependencies in the model', () => {
      expect(catComponentOutput).to.have.property('peerPackageDependencies');
      expect(catComponentOutput.peerPackageDependencies).to.have.property('chai');
      expect(catComponentOutput.peerPackageDependencies.chai).to.equal('>= 2.1.2 < 5');
    });
    it('should not save the peer-dependency as a package-dependency nor as a dev-package-dependency', () => {
      expect(catComponentOutput.packageDependencies).to.not.have.property('chai');
      expect(catComponentOutput.devPackageDependencies).to.not.have.property('chai');
    });
    it('bit show should display the peer dependencies', async () => {
      const output = await (await load(workspacePath)).json('show', ['comp1'], { legacy: true });
      expect(output).to.have.property('peerPackageDependencies');
      expect(output.peerPackageDependencies).to.have.property('chai');
      expect(output.peerPackageDependencies.chai).to.equal('>= 2.1.2 < 5');
    });
    describe('when the component is imported', () => {
      let importer: WorkspaceData;
      before(async () => {
        const remote = createWorkspace();
        await mockComponents(remote.workspacePath);
        fs.outputFileSync(path.join(remote.workspacePath, 'comp1', 'index.js'), "const chai = require('chai');");
        addPolicyToDependencyResolver(remote.workspacePath, { peerDependencies: { chai: '>= 2.1.2 < 5' } });
        addFakeNpmPackage(remote.workspacePath, 'chai', '2.4');
        await tagAll(remote.workspacePath);
        await exportAll(remote.workspacePath);

        importer = createWorkspaceWithRemote(remote);
        await runImport(importer.workspacePath, [`${remote.remoteScopeName}/comp1`]);
        // the import skips the installation here. the peer-dependency is not installed automatically, so make it available
        addFakeNpmPackage(importer.workspacePath, 'chai', '2.4');
      });
      it('should not be shown as modified', async () => {
        await expectStatusToBeClean(importer.workspacePath);
      });
    });
  });

  describe('when a package is only a peer dependency but not required in the code', () => {
    let workspacePath: string;
    before(async () => {
      workspacePath = createWorkspace().workspacePath;
      await mockComponents(workspacePath);
      addPolicyToDependencyResolver(workspacePath, { peerDependencies: { chai: '>= 2.1.2 < 5' } });
      addFakeNpmPackage(workspacePath, 'chai', '2.4');
      await tagAll(workspacePath);
    });
    it('should not save the peer dependencies in the model', async () => {
      const output = await catComponent(workspacePath, 'comp1');
      expect(output).to.have.property('peerPackageDependencies');
      expect(output.peerPackageDependencies).to.not.have.property('chai');
    });
  });
});
