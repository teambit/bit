import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import stripAnsi from 'strip-ansi';
import { parse, assign, stringify } from 'comment-json';
import { loadManyAspects } from '@teambit/harmony.testing.load-aspect';
import type { WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockWorkspace, destroyWorkspace } from '@teambit/workspace.testing.mock-workspace';
import { WorkspaceAspect } from '@teambit/workspace';
import type { Workspace } from '@teambit/workspace';
import type { CLIMain } from '@teambit/cli';
import { CLIAspect } from '@teambit/cli';
import { ExportAspect } from '@teambit/export';
import { ImporterAspect } from '@teambit/importer';
import { SnappingAspect } from '@teambit/snapping';
import { ScopeAspect } from '@teambit/scope';
import type { ScopeMain } from '@teambit/scope';
import { InstallAspect } from '@teambit/install';
import type { InstallMain } from '@teambit/install';
import { TrackerAspect } from '@teambit/tracker';
import type { TrackerMain } from '@teambit/tracker';
import { ComponentCompareAspect } from '@teambit/component-compare';
import { IssuesClasses } from '@teambit/component-issues';
import { statusFailureMsg } from '@teambit/legacy.constants';
import { StatusAspect } from './status.aspect';

/**
 * the dependencies overrides of a workspace variant (a "-" to ignore a dependency, a "+" or a version to add a peer
 * dependency manually): how they show in "bit show", "bit status", the Version object, and after an import. it lives in
 * the status aspect rather than in the snapping aspect, since some of the flows assert "bit status" and "bit diff",
 * and the snapping aspect cannot depend on them.
 */
describe('workspace config: overrides of components dependencies', function () {
  this.timeout(0);

  const workspaces: WorkspaceData[] = [];

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
      [
        WorkspaceAspect,
        SnappingAspect,
        ExportAspect,
        ImporterAspect,
        StatusAspect,
        ScopeAspect,
        TrackerAspect,
        InstallAspect,
        ComponentCompareAspect,
        CLIAspect,
      ],
      workspacePath
    );
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
      tracker: harmony.get<TrackerMain>(TrackerAspect.id),
      install: harmony.get<InstallMain>(InstallAspect.id),
      inWorkspace,
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
  const tagComponent = async (workspacePath: string, name: string) =>
    (await load(workspacePath)).report('tag', [[name]], { build: false });
  const exportAll = async (workspacePath: string) => (await load(workspacePath)).report('export', [[]]);
  const runImport = async (workspacePath: string, ids: string[]) =>
    (await load(workspacePath)).report('import', [ids], { skipDependencyInstallation: true });
  const status = async (workspacePath: string) => (await load(workspacePath)).report('status');
  const diff = async (workspacePath: string, pattern: string, flags: Record<string, any> = {}) =>
    (await load(workspacePath)).report('diff', [pattern, undefined, undefined], flags);
  /** the legacy "bit show --json", which has the dependencies data of the component */
  const showBar = async (workspacePath: string, name = 'bar') =>
    (await load(workspacePath)).json('show', [name], { legacy: true });

  /** write the files and track them, as "bit add" does. each entry is a component dir with its name */
  async function addComponents(workspacePath: string, comps: Array<{ dir: string; name: string }>) {
    const { tracker, workspace } = await load(workspacePath);
    for (const comp of comps) {
      await tracker.track({ rootDir: comp.dir, componentName: comp.name });
    }
    await workspace.bitMap.write();
  }

  const writeFile = (workspacePath: string, filePath: string, content = '') =>
    fs.outputFileSync(path.join(workspacePath, filePath), content);

  /** the Version object of a component, as "bit cat-component <id>@<version>" prints it. "latest" is the head */
  async function catComponent(workspacePath: string, name: string) {
    const { scope, workspace } = await load(workspacePath);
    const compId = await workspace.resolveComponentId(name);
    const modelComponent = await scope.legacyScope.getModelComponent(compId);
    const versionObj = await modelComponent.loadVersion(
      modelComponent.getHeadRegardlessOfLaneAsTagOrHash(),
      scope.legacyScope.objects
    );
    return JSON.parse(JSON.stringify(versionObj.toObject()));
  }

  async function expectStatusToBeClean(workspacePath: string) {
    const statusJson = await (await load(workspacePath)).json('status');
    Object.keys(statusJson).forEach((key) => {
      if (['componentsWithIssues', 'currentLaneId', 'forkedLaneId'].includes(key)) return;
      expect(statusJson[key], `status.${key} should be empty`).to.have.lengthOf(0);
    });
  }

  /** the same as helper.npm.addFakeNpmPackage: a package in the workspace node_modules, with no installation */
  function addFakeNpmPackage(workspacePath: string, name: string, version = '4.4.2') {
    fs.outputFileSync(path.join(workspacePath, 'node_modules', name, 'index.js'), '');
    fs.outputJsonSync(path.join(workspacePath, 'node_modules', name, 'package.json'), { name, version });
  }

  /** the same as helper.workspaceJsonc.setPolicyToVariant: replace the config of the variant with the policy */
  function setPolicyToVariant(workspacePath: string, variant: string, policy: Record<string, any>) {
    const workspaceJsoncPath = path.join(workspacePath, 'workspace.jsonc');
    const content = parse(fs.readFileSync(workspaceJsoncPath, 'utf8')) as Record<string, any>;
    const variantsId = 'teambit.workspace/variants';
    content[variantsId] = assign(content[variantsId] || {}, {
      [variant]: { 'teambit.dependencies/dependency-resolver': { policy } },
    });
    fs.writeFileSync(workspaceJsoncPath, stringify(content, null, 2));
  }

  const barRequiringFoo1AndFoo2 = "require('../foo1/foo1'); require('../foo2/foo2'); ";
  /** foo1, foo2 and bar, where bar requires the other two */
  async function addBarWithTwoDependencies(workspacePath: string) {
    writeFile(workspacePath, 'foo1/foo1.js', 'foo1');
    writeFile(workspacePath, 'foo2/foo2.js', 'foo2');
    writeFile(workspacePath, 'bar/bar.js', barRequiringFoo1AndFoo2);
    await addComponents(workspacePath, [
      { dir: 'foo1', name: 'utils/foo/foo1' },
      { dir: 'foo2', name: 'utils/foo/foo2' },
      { dir: 'bar', name: 'bar' },
    ]);
    // the same as "bit link --rewire": replaces the relative requires with the module paths of the components
    const { install, inWorkspace } = await load(workspacePath);
    await inWorkspace(() => install.link([], { rewire: true }));
  }

  after(async () => {
    await Promise.all(workspaces.map((workspaceData) => destroyWorkspace(workspaceData)));
  });

  describe('ignoring components dependencies', () => {
    describe('ignoring a dependency component when requiring with module path', () => {
      let barData;
      before(async () => {
        const { workspacePath, remoteScopeName } = createWorkspace();
        await addBarWithTwoDependencies(workspacePath);
        setPolicyToVariant(workspacePath, 'bar', { dependencies: { [`@${remoteScopeName}/utils.foo.foo1`]: '-' } });
        barData = await showBar(workspacePath);
      });
      it('should not add the removed dependency to the component', () => {
        expect(barData.dependencies).to.have.lengthOf(1);
        expect(barData.dependencies[0].id).to.not.equal('foo1');
      });
    });
  });

  describe('ignoring packages dependencies', () => {
    describe('ignoring a missing package', () => {
      let workspacePath: string;
      before(async () => {
        workspacePath = createWorkspace().workspacePath;
        writeFile(workspacePath, 'bar/bar.js', "require('non-exist-package')");
        await addComponents(workspacePath, [{ dir: 'bar', name: 'bar' }]);

        // an intermediate step, make sure bit status shows the component with an issue of a missing file
        expect(await status(workspacePath)).to.have.string(statusFailureMsg);
        setPolicyToVariant(workspacePath, 'bar', { dependencies: { 'non-exist-package': '-' } });
      });
      it('bit status should not show the component as missing packages', async () => {
        expect(await status(workspacePath)).to.not.have.string(statusFailureMsg);
      });
    });
    describe('ignoring an existing package', () => {
      let barData;
      before(async () => {
        const { workspacePath } = createWorkspace();
        addFakeNpmPackage(workspacePath, 'existing-package');
        addFakeNpmPackage(workspacePath, 'another-existing-package');
        writeFile(workspacePath, 'bar/bar.js', "require('existing-package'); require('another-existing-package');");
        await addComponents(workspacePath, [{ dir: 'bar', name: 'bar' }]);
        setPolicyToVariant(workspacePath, 'bar', { dependencies: { 'existing-package': '-' } });
        barData = await showBar(workspacePath);
      });
      it('should ignore the specified package but keep other packages intact', () => {
        expect(Object.keys(barData.packageDependencies)).to.have.lengthOf(1);
        expect(Object.keys(barData.packageDependencies)[0]).to.equal('another-existing-package');
      });
      it('should show the package as ignored', () => {
        expect(barData).to.have.property('manuallyRemovedDependencies');
        expect(barData.manuallyRemovedDependencies).to.have.property('dependencies');
        expect(barData.manuallyRemovedDependencies.dependencies).to.include('existing-package');
      });
    });
    describe('ignoring an existing devDependency package', () => {
      let barData;
      before(async () => {
        const { workspacePath } = createWorkspace();
        addFakeNpmPackage(workspacePath, 'existing-package');
        addFakeNpmPackage(workspacePath, 'another-existing-package');
        writeFile(workspacePath, 'bar/bar.js');
        writeFile(
          workspacePath,
          'bar/bar.spec.js',
          "require('existing-package'); require('another-existing-package');"
        );
        await addComponents(workspacePath, [{ dir: 'bar', name: 'bar' }]);
        setPolicyToVariant(workspacePath, 'bar', { devDependencies: { 'existing-package': '-' } });
        barData = await showBar(workspacePath);
      });
      it('should ignore the specified package but keep other packages intact', () => {
        expect(Object.keys(barData.packageDependencies)).to.have.lengthOf(0);
        const devPackagesDependencies = Object.keys(barData.devPackageDependencies);
        expect(devPackagesDependencies).to.include('another-existing-package');
        expect(devPackagesDependencies).to.not.include('existing-package');
      });
      it('should show the package as ignored', () => {
        expect(barData).to.have.property('manuallyRemovedDependencies');
        expect(barData.manuallyRemovedDependencies).to.have.property('devDependencies');
        expect(barData.manuallyRemovedDependencies.devDependencies).to.include('existing-package');
      });
      it('should not confuse ignore of dependencies with ignore of devDependencies', () => {
        expect(barData.manuallyRemovedDependencies).to.not.have.property('dependencies');
      });
    });
  });

  describe('ignoring dependencies components entire flow', () => {
    let remote: WorkspaceData;
    let remoteScopeName: string;
    let authorPath: string;
    before(async () => {
      remote = createWorkspace();
      remoteScopeName = remote.remoteScopeName;
      authorPath = remote.workspacePath;
      await addBarWithTwoDependencies(authorPath);
      await tagAll(authorPath);
      await exportAll(authorPath);
      setPolicyToVariant(authorPath, 'bar', { dependencies: { [`@${remoteScopeName}/utils.foo.foo2`]: '-' } });
    });
    describe('tagging the component', () => {
      let catBar;
      before(async () => {
        await tagComponent(authorPath, 'bar');
        catBar = await catComponent(authorPath, 'bar');
      });
      it('should remove the dependency from the model', () => {
        expect(catBar.dependencies).to.have.lengthOf(1);
      });
      it('should save the overrides data into the model', () => {
        expect(catBar).to.have.property('overrides');
        expect(catBar.overrides).to.have.property('dependencies');
        expect(catBar.overrides.dependencies).to.have.property(`@${remoteScopeName}/utils.foo.foo2`);
        expect(catBar.overrides.dependencies[`@${remoteScopeName}/utils.foo.foo2`]).to.equal('-');
      });
      it('should not show the component as modified', async () => {
        expect(await status(authorPath)).to.not.have.string('modified components');
      });
      describe('importing the component', () => {
        let importerPath: string;
        before(async () => {
          await exportAll(authorPath);
          importerPath = createWorkspaceWithRemote(remote).workspacePath;
          await runImport(importerPath, [`${remoteScopeName}/*`]);
          // the installation is skipped, but the components need to be linked for their package names to resolve
          const { install, inWorkspace } = await load(importerPath);
          await inWorkspace(() => install.link([], {}));
        });
        it('bit status should not show the component as modified', async () => {
          await expectStatusToBeClean(importerPath);
        });
        it('bit diff should not show any diff', async () => {
          expect(await diff(importerPath, 'bar')).to.have.string('no diff');
        });
        describe('changing the imported component to not ignore the dependency', () => {
          before(async () => {
            await (await load(importerPath)).json('eject-conf', ['bar'], {});
            // the extension is removed from the component.json, the same as helper.componentJson.removeExtension
            const componentJsonPath = path.join(importerPath, remoteScopeName, 'bar', 'component.json');
            const componentJson = fs.readJsonSync(componentJsonPath);
            delete (componentJson.extensions || {})['teambit.dependencies/dependency-resolver'];
            fs.writeJsonSync(componentJsonPath, componentJson, { spaces: 2 });
          });
          it('bit status should show the component as modified', async () => {
            expect(await status(importerPath)).to.have.string('modified components');
          });
          it('bit diff should show the overrides differences', async () => {
            const output = await diff(importerPath, 'bar', { verbose: true });
            expect(output).to.have.string('--- Overrides Dependencies (0.0.2 original)');
            expect(output).to.have.string('+++ Overrides Dependencies (0.0.2 modified)');
            expect(output).to.have.string(`- [ @${remoteScopeName}/utils.foo.foo2@-`);
          });
        });
      });
    });
  });

  describe('manually adding dependencies', () => {
    const barFooImportingChai = "import chai from 'chai';";
    describe('moving a package from dependencies to peerDependencies', () => {
      let barData;
      before(async () => {
        const { workspacePath } = createWorkspace();
        writeFile(workspacePath, 'bar/foo.js', barFooImportingChai);
        addFakeNpmPackage(workspacePath, 'chai', '2.2.0');
        fs.outputJsonSync(path.join(workspacePath, 'package.json'), { dependencies: { chai: '2.2.0' } });
        await addComponents(workspacePath, [{ dir: 'bar', name: 'bar/foo' }]);
        setPolicyToVariant(workspacePath, 'bar', { dependencies: { chai: '-' }, peerDependencies: { chai: '+' } });
        barData = await showBar(workspacePath, 'bar/foo');
      });
      it('should ignore the specified package from dependencies', () => {
        expect(Object.keys(barData.packageDependencies)).to.have.lengthOf(0);
      });
      it('should add the specified package to peerDependencies', () => {
        expect(Object.keys(barData.peerPackageDependencies)).to.have.lengthOf(1);
        expect(barData.peerPackageDependencies).to.deep.equal({ chai: '2.2.0' });
      });
      it('should show the package as ignored from dependencies', () => {
        expect(barData).to.have.property('manuallyRemovedDependencies');
        expect(barData.manuallyRemovedDependencies).to.have.property('dependencies');
        expect(barData.manuallyRemovedDependencies.dependencies).to.include('chai');
      });
      it('should show the package as manually added to peerDependencies', () => {
        expect(barData).to.have.property('manuallyAddedDependencies');
        expect(barData.manuallyAddedDependencies).to.have.property('peerDependencies');
        expect(barData.manuallyAddedDependencies.peerDependencies).to.deep.equal(['chai@2.2.0']);
      });
    });
    describe('adding a package with version that does not exist in package.json', () => {
      let barData;
      before(async () => {
        const { workspacePath } = createWorkspace();
        writeFile(workspacePath, 'bar/foo.js', barFooImportingChai);
        await addComponents(workspacePath, [{ dir: 'bar', name: 'bar/foo' }]);
        setPolicyToVariant(workspacePath, 'bar', { peerDependencies: { chai: '2.2.0' } });
        barData = await showBar(workspacePath, 'bar/foo');
      });
      it('should add the specified package to peerDependencies', () => {
        expect(Object.keys(barData.peerPackageDependencies)).to.have.lengthOf(1);
        expect(barData.peerPackageDependencies).to.deep.equal({ chai: '2.2.0' });
      });
      it('should show the package as manually added to peerDependencies', () => {
        expect(barData).to.have.property('manuallyAddedDependencies');
        expect(barData.manuallyAddedDependencies).to.have.property('peerDependencies');
        expect(barData.manuallyAddedDependencies.peerDependencies).to.deep.equal(['chai@2.2.0']);
      });
    });
    describe('adding a package without version that does not exist in package.json', () => {
      let workspacePath: string;
      before(async () => {
        workspacePath = createWorkspace().workspacePath;
        writeFile(workspacePath, 'bar/foo.js', barFooImportingChai);
        await addComponents(workspacePath, [{ dir: 'bar', name: 'bar/foo' }]);
        setPolicyToVariant(workspacePath, 'bar', { peerDependencies: { chai: '+' } });
      });
      // See similar test in show.e2e - component with overrides data
      it('should not show the package in dependencies', async () => {
        const output = await (await load(workspacePath)).report('show', ['bar/foo'], {});
        expect(output).to.not.have.string('chai"');
      });
      // See similar test in status.e2e - when a component is created and added without its package dependencies
      it('should show a missing package in status', async () => {
        const output = (await status(workspacePath)).replace(/\n/g, '');
        const statusJson = await (await load(workspacePath)).json('status');
        const issues = statusJson.componentsWithIssues.map((comp) => comp.issues.map((issue) => issue.type)).flat();
        expect(issues).to.include(IssuesClasses.MissingPackagesDependenciesOnFs.name);
        expect(output).to.have.string('foo.js -> chai');
      });
    });
  });
});
