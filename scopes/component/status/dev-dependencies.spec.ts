import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import stripAnsi from 'strip-ansi';
import { parse, assign, stringify } from 'comment-json';
import { loadManyAspects } from '@teambit/harmony.testing.load-aspect';
import type { WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockWorkspace, destroyWorkspace } from '@teambit/workspace.testing.mock-workspace';
import { mockComponents } from '@teambit/component.testing.mock-components';
import { WorkspaceAspect } from '@teambit/workspace';
import type { CLIMain } from '@teambit/cli';
import { CLIAspect } from '@teambit/cli';
import { ExportAspect } from '@teambit/export';
import { ImporterAspect } from '@teambit/importer';
import { SnappingAspect } from '@teambit/snapping';
import { InstallAspect } from '@teambit/install';
import type { InstallMain } from '@teambit/install';
import { EnvsAspect } from '@teambit/envs';
import type { EnvsMain } from '@teambit/envs';
import { NodeAspect } from '@teambit/node';
import type { NodeMain } from '@teambit/node';
import { DependenciesAspect } from '@teambit/dependencies';
import type { DependenciesMain } from '@teambit/dependencies';
import { TrackerAspect } from '@teambit/tracker';
import type { TrackerMain } from '@teambit/tracker';
import { ScopeAspect } from '@teambit/scope';
import type { ScopeMain } from '@teambit/scope';
import type { Workspace } from '@teambit/workspace';
import { StatusAspect } from './status.aspect';

/**
 * dev-dependencies of a component: the ones detected from its test files (and the ones coming from the env). they
 * are saved on the Version object separately from the prod dependencies, and the flattened-dependencies include both.
 * it lives in the status aspect rather than in the snapping aspect, since the flows assert "bit status", and the
 * snapping aspect cannot depend on it.
 */
describe('dev-dependencies functionality', function () {
  this.timeout(0);

  const workspaces: WorkspaceData[] = [];

  /** a workspace with its own bare scope. the scope is where components get exported to */
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
  async function load(workspacePath: string, { devDepEnvId }: { devDepEnvId?: string } = {}) {
    const harmony = await loadManyAspects(
      [
        WorkspaceAspect,
        SnappingAspect,
        ExportAspect,
        ImporterAspect,
        StatusAspect,
        ScopeAspect,
        InstallAspect,
        EnvsAspect,
        NodeAspect,
        DependenciesAspect,
        TrackerAspect,
        CLIAspect,
      ],
      workspacePath
    );
    const cli = harmony.get<CLIMain>(CLIAspect.id);
    if (devDepEnvId) {
      // an env that has a devDependency, as the "node-env-dev-dep" custom env of the e2e fixtures did. the slot is keyed
      // by the id of the registering aspect, so set the id directly
      const nodeEnv = harmony.get<NodeMain>(NodeAspect.id).compose([]);
      nodeEnv.getDependencies = async () => ({ devDependencies: { 'is-positive': '1.0.0' } });
      (harmony.get<EnvsMain>(EnvsAspect.id) as any).envSlot.map.set(devDepEnvId, nodeEnv);
    }
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
      install: harmony.get<InstallMain>(InstallAspect.id),
      inWorkspace,
      tracker: harmony.get<TrackerMain>(TrackerAspect.id),
      dependencies: harmony.get<DependenciesMain>(DependenciesAspect.id),
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

  /** the part of "bit install" that links the workspace components into node_modules, without fetching packages */
  async function link(workspacePath: string) {
    const { install, inWorkspace } = await load(workspacePath);
    await inWorkspace(() => install.link([], {}));
  }

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

  function addPolicyToDependencyResolver(workspacePath: string, policy: Record<string, any>) {
    const workspaceJsoncPath = path.join(workspacePath, 'workspace.jsonc');
    const content = parse(fs.readFileSync(workspaceJsoncPath, 'utf8')) as Record<string, any>;
    const depResolverId = 'teambit.dependencies/dependency-resolver';
    const depResolver = content[depResolverId] || {};
    depResolver.policy = assign(depResolver.policy || {}, policy);
    content[depResolverId] = depResolver;
    fs.writeFileSync(workspaceJsoncPath, stringify(content, null, 2));
  }

  /** move the content of the component main file into a test file, so the main file has no dependencies */
  function moveIndexToSpecFile(workspacePath: string, compName: string) {
    const compDir = path.join(workspacePath, compName);
    fs.moveSync(path.join(compDir, 'index.js'), path.join(compDir, 'foo.spec.js'));
    fs.outputFileSync(path.join(compDir, 'index.js'), '');
  }

  /** sets the env on a component with a variant, as "bit envs set" does */
  function setEnvOnComponent(workspacePath: string, compName: string, envId: string) {
    const workspaceJsoncPath = path.join(workspacePath, 'workspace.jsonc');
    const content = parse(fs.readFileSync(workspaceJsoncPath, 'utf8')) as Record<string, any>;
    const variantsId = 'teambit.workspace/variants';
    content[variantsId] = assign(content[variantsId] || {}, { [compName]: { [envId]: {} } });
    fs.writeFileSync(workspaceJsoncPath, stringify(content, null, 2));
  }

  /** .bitmap opens with a comment banner */
  const readBitMap = (workspacePath: string): Record<string, any> =>
    parse(fs.readFileSync(path.join(workspacePath, '.bitmap'), 'utf8'), undefined, true) as Record<string, any>;

  after(async () => {
    await Promise.all(workspaces.map((workspaceData) => destroyWorkspace(workspaceData)));
  });

  describe('environment with compiler and tester', () => {
    describe('with dev-dependencies same as dependencies', () => {
      let comp1;
      let remoteScopeName: string;
      before(async () => {
        const workspaceData = createWorkspace();
        const { workspacePath } = workspaceData;
        remoteScopeName = workspaceData.remoteScopeName;
        await mockComponents(workspacePath, { numOfComponents: 3 });
        fs.outputFileSync(path.join(workspacePath, 'comp1', 'foo.spec.js'), 'require("chai");');
        addFakeNpmPackage(workspacePath, 'chai', '4.1.2');
        addPolicyToDependencyResolver(workspacePath, { dependencies: { chai: '4.1.2' } });
        await tagAll(workspacePath);
        comp1 = await catComponent(workspacePath, 'comp1', '0.0.1');
      });
      it('should not save the dev-dependencies because they are the same as dependencies', () => {
        expect(comp1.devDependencies).to.be.an('array').that.is.empty;
      });
      it('should save "chai" in the dev-packages because it is only required in the tests files', () => {
        expect(comp1.devPackageDependencies).to.be.an('object').that.has.property('chai');
      });
      it('should not save "chai" in the packages because it is not required in non-test files', () => {
        expect(comp1.packageDependencies).to.be.an('object').that.is.empty;
      });
      it('should leave the dependencies intact', () => {
        expect(comp1.dependencies).to.be.an('array').that.have.lengthOf(1);
        expect(comp1.dependencies[0].id.name).to.equal('comp2');
        expect(comp1.dependencies[0].id.version).to.equal('0.0.1');
      });
      it('should leave the flattened-dependencies intact', () => {
        expect(comp1.flattenedDependencies).to.deep.include({
          name: 'comp3',
          scope: remoteScopeName,
          version: '0.0.1',
        });
        expect(comp1.flattenedDependencies).to.deep.include({
          name: 'comp2',
          scope: remoteScopeName,
          version: '0.0.1',
        });
      });
    });
    describe('without dependencies and with dev-dependencies', () => {
      let comp1;
      let remoteScopeName: string;
      let statusOutput: string;
      before(async () => {
        const workspaceData = createWorkspace();
        const { workspacePath } = workspaceData;
        remoteScopeName = workspaceData.remoteScopeName;
        // foo.js doesn't have any dependencies. foo.spec.js does have dependencies.
        await mockComponents(workspacePath, { numOfComponents: 3 });
        fs.outputFileSync(
          path.join(workspacePath, 'comp1', 'foo.spec.js'),
          `require("chai"); require('@${remoteScopeName}/comp2');`
        );
        fs.outputFileSync(path.join(workspacePath, 'comp1', 'index.js'), '');
        addFakeNpmPackage(workspacePath, 'chai', '4.1.2');
        addPolicyToDependencyResolver(workspacePath, { dependencies: { chai: '4.1.2' } });
        await tagAll(workspacePath);
        comp1 = await catComponent(workspacePath, 'comp1', '0.0.1');
        statusOutput = await (await load(workspacePath)).report('status');
      });
      it('should save the dev-dependencies', () => {
        expect(comp1.devDependencies).to.be.an('array').that.have.lengthOf(1);
        expect(comp1.devDependencies[0].id).to.deep.equal({
          name: 'comp2',
          scope: remoteScopeName,
          version: '0.0.1',
        });
      });
      it('should save the flattened dev-dependencies into flattened-dependencies', () => {
        expect(comp1.flattenedDependencies).to.be.an('array').with.lengthOf(2);
        expect(comp1.flattenedDependencies).to.deep.include({
          name: 'comp3',
          scope: remoteScopeName,
          version: '0.0.1',
        });
        expect(comp1.flattenedDependencies).to.deep.include({
          name: 'comp2',
          scope: remoteScopeName,
          version: '0.0.1',
        });
      });
      it('should not save anything into dependencies', () => {
        expect(comp1.dependencies).to.be.an('array').that.is.empty;
      });
      it('bit status should not show any component as modified', () => {
        expect(statusOutput).to.have.string('staged components');
      });
    });
  });

  // (bar ->(prod)-> is-string ->(dev)->is-type ->(prod)-> baz)
  describe('dev-dependency of a nested component that originated from a prod dep', () => {
    let output: string;
    let remote: WorkspaceData;
    let importer: WorkspaceData;
    before(async () => {
      remote = createWorkspace();
      await mockComponents(remote.workspacePath, { numOfComponents: 4 });
      moveIndexToSpecFile(remote.workspacePath, 'comp2');
      await tagAll(remote.workspacePath);
      await exportAll(remote.workspacePath);

      importer = createWorkspaceWithRemote(remote);
      output = await runImport(importer.workspacePath, [`${remote.remoteScopeName}/*`]);
    });
    it('should be able to import with no errors', () => {
      expect(output).to.have.string('successfully imported');
    });
    it('bit status should show a clean state', async () => {
      // the import command skipped the installation, which is also what links the components to each other
      await link(importer.workspacePath);
      await expectStatusToBeClean(importer.workspacePath);
    });
    it('the nested dev-dependency and nested prod of the nested dev-dependency should be saved in the flattenedDependencies', async () => {
      const barFoo = await catComponent(importer.workspacePath, `${remote.remoteScopeName}/comp1`, 'latest');
      expect(barFoo.flattenedDependencies).to.have.lengthOf(3);
      const names = barFoo.flattenedDependencies.map((d) => d.name);
      expect(names).to.deep.equal(['comp2', 'comp3', 'comp4']);
    });
  });

  // (comp1 ->(dev)-> comp2 ->(dev)->comp3
  describe('dev-dependency of a nested component that originated from a dev dep', () => {
    let workspacePath: string;
    before(async () => {
      workspacePath = createWorkspace().workspacePath;
      await mockComponents(workspacePath, { numOfComponents: 3 });
      moveIndexToSpecFile(workspacePath, 'comp1');
      moveIndexToSpecFile(workspacePath, 'comp2');
      fs.outputFileSync(path.join(workspacePath, 'comp3', 'index.js'), '');
      await tagAll(workspacePath);
    });
    it('the flattened dependencies should contain the entire chain of the dependencies', async () => {
      const barFoo = await catComponent(workspacePath, 'comp1', 'latest');
      const names = barFoo.flattenedDependencies.map((d) => d.name);
      expect(names).to.include('comp3');
      expect(names).to.include('comp2');
    });
  });

  describe('dev-dependency that requires prod-dependency', () => {
    let barFoo;
    let remoteScopeName: string;
    before(async () => {
      const workspaceData = createWorkspace();
      const { workspacePath } = workspaceData;
      remoteScopeName = workspaceData.remoteScopeName;
      await mockComponents(workspacePath, { numOfComponents: 3 });
      moveIndexToSpecFile(workspacePath, 'comp1');
      await tagAll(workspacePath);
      barFoo = await catComponent(workspacePath, 'comp1', 'latest');

      // as an intermediate step, make sure barFoo has is-string as a dev dependency only
      expect(barFoo.dependencies).to.have.lengthOf(0);
      expect(barFoo.devDependencies).to.have.lengthOf(1);
      expect(barFoo.devDependencies[0].id.name).to.equal('comp2');
    });
    it('should include the prod dependencies inside flattenedDependencies', () => {
      expect(barFoo.flattenedDependencies).to.deep.include({
        name: 'comp3',
        scope: remoteScopeName,
        version: '0.0.1',
      });
    });
  });
  describe('component with devDependency coming from an env and is used as prod', () => {
    let workspacePath: string;
    let envId: string;
    before(async () => {
      const workspaceData = createWorkspace();
      workspacePath = workspaceData.workspacePath;
      envId = `${workspaceData.remoteScopeName}/node-env-dev-dep`;
      await mockComponents(workspacePath, { numOfComponents: 1 });
      // the env is registered in-process by the loads below. the workspace needs it as a component too, and the
      // env has to be set only after the components were tracked, as it is not registered while tracking
      fs.outputFileSync(path.join(workspacePath, 'node-env-dev-dep', 'index.js'), '');
      const { tracker, workspace, inWorkspace } = await load(workspacePath);
      await inWorkspace(async () => {
        await tracker.track({ rootDir: 'node-env-dev-dep', componentName: 'node-env-dev-dep' });
        await workspace.bitMap.write();
      });
      setEnvOnComponent(workspacePath, 'comp1', envId);
      fs.outputFileSync(path.join(workspacePath, 'comp1', 'index.js'), "const isPositive = require('is-positive');");
      addFakeNpmPackage(workspacePath, 'is-positive', '1.0.0');
      await (await load(workspacePath, { devDepEnvId: envId })).report('tag', [[]], { build: false });
    });
    it('should be able to remove it from DevDependency only by "bit deps remove --dev"', async () => {
      const { dependencies, inWorkspace } = await load(workspacePath, { devDepEnvId: envId });
      await inWorkspace(() => dependencies.removeDependency('comp1', ['is-positive'], { dev: true }));
      const bitMap = readBitMap(workspacePath);
      expect(bitMap.comp1.config['teambit.dependencies/dependency-resolver'].policy).to.have.property(
        'devDependencies'
      );
      expect(
        bitMap.comp1.config['teambit.dependencies/dependency-resolver'].policy.devDependencies['is-positive']
      ).to.equal('-');
    });
  });
});
