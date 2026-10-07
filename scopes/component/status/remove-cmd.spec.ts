import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import { parse, assign, stringify } from 'comment-json';
import stripAnsi from 'strip-ansi';
import { loadManyAspects } from '@teambit/harmony.testing.load-aspect';
import type { WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockWorkspace, destroyWorkspace } from '@teambit/workspace.testing.mock-workspace';
import { mockComponents } from '@teambit/component.testing.mock-components';
import { fixtures } from '@teambit/legacy.e2e-helper';
import { IssuesClasses } from '@teambit/component-issues';
import { addFeature, reloadFeatureToggle } from '@teambit/harmony.modules.feature-toggle';
import { WorkspaceAspect } from '@teambit/workspace';
import type { Workspace } from '@teambit/workspace';
import type { CLIMain } from '@teambit/cli';
import { CLIAspect } from '@teambit/cli';
import { ComponentAspect } from '@teambit/component';
import { ListerAspect } from '@teambit/lister';
import { ExportAspect } from '@teambit/export';
import { ImporterAspect } from '@teambit/importer';
import type { ImporterMain } from '@teambit/importer';
import { TrackerAspect } from '@teambit/tracker';
import type { TrackerMain } from '@teambit/tracker';
import { RemoveAspect } from '@teambit/remove';
import type { RemoveMain } from '@teambit/remove';
import { SnappingAspect } from '@teambit/snapping';
import type { SnappingMain } from '@teambit/snapping';
import { InstallAspect } from '@teambit/install';
import type { InstallMain } from '@teambit/install';
import { ScopeAspect } from '@teambit/scope';
import type { ScopeMain } from '@teambit/scope';
import { StatusAspect } from './status.aspect';

/**
 * "bit remove" and "bit delete" flows (the soft/hard removal of components, locally and on the remote). they live in
 * the status aspect rather than in the remove aspect, since the flows assert the status, and tag/export are needed to
 * set up the components, which the remove aspect cannot depend on. the lane flows are in the lanes aspect.
 */

const REMOVE_ASPECT_ID = 'teambit.component/remove';

type CompToTrack = { rootDir: string; name: string; main?: string };

describe('bit remove command', function () {
  this.timeout(0);

  const workspaces: WorkspaceData[] = [];

  /** a workspace with its own bare scope. the scope is where components get exported to */
  function createWorkspace(): WorkspaceData {
    const workspaceData = mockWorkspace();
    workspaces.push(workspaceData);
    return workspaceData;
  }

  /**
   * a workspace that has the scope of `remote` as a remote and as its default scope, which is what
   * "bit init" + "bit remote add" do
   */
  function createWorkspaceWithRemote(remote: WorkspaceData): WorkspaceData {
    const workspaceData = createWorkspace();
    const scopeJsonPath = path.join(workspaceData.workspacePath, '.bit', 'scope.json');
    const scopeJson = fs.readJsonSync(scopeJsonPath);
    scopeJson.remotes = { ...scopeJson.remotes, [remote.remoteScopeName]: `file://${remote.remoteScopePath}` };
    fs.writeJsonSync(scopeJsonPath, scopeJson, { spaces: 2 });
    const workspaceJsoncPath = path.join(workspaceData.workspacePath, 'workspace.jsonc');
    const workspaceJsonc = parse(fs.readFileSync(workspaceJsoncPath, 'utf8')) as Record<string, any>;
    workspaceJsonc['teambit.workspace/workspace'] = assign(workspaceJsonc['teambit.workspace/workspace'] || {}, {
      defaultScope: remote.remoteScopeName,
    });
    fs.writeFileSync(workspaceJsoncPath, stringify(workspaceJsonc, null, 2));
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
        RemoveAspect,
        StatusAspect,
        ListerAspect,
        ComponentAspect,
        ScopeAspect,
        InstallAspect,
        TrackerAspect,
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
      snapping: harmony.get<SnappingMain>(SnappingAspect.id),
      importer: harmony.get<ImporterMain>(ImporterAspect.id),
      tracker: harmony.get<TrackerMain>(TrackerAspect.id),
      remove: harmony.get<RemoveMain>(RemoveAspect.id),
      scope: harmony.get<ScopeMain>(ScopeAspect.id),
      install: harmony.get<InstallMain>(InstallAspect.id),
      workspace: harmony.get<Workspace>(WorkspaceAspect.id),
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

  const removeComponent = async (workspacePath: string, pattern: string, flags: Record<string, any> = {}) =>
    (await load(workspacePath)).report('remove', [pattern], { silent: true, ...flags });
  const deleteComponent = async (workspacePath: string, pattern: string, flags: Record<string, any> = {}) =>
    (await load(workspacePath)).report('delete', [pattern], { silent: true, ...flags });
  const removeComponentFromRemote = (workspacePath: string, pattern: string, flags: Record<string, any> = {}) =>
    deleteComponent(workspacePath, pattern, { hard: true, ...flags });
  const statusJson = async (workspacePath: string) => (await load(workspacePath)).json('status');
  const statusReport = async (workspacePath: string) => (await load(workspacePath)).report('status');
  const listWorkspace = async (workspacePath: string) => (await load(workspacePath)).json('list');
  const listLocalScope = async (workspacePath: string, scope?: string) =>
    (await load(workspacePath)).report('list', [], { localScope: true, scope });
  const listRemoteIds = async (workspacePath: string, remoteScopeName: string) =>
    (await load(workspacePath)).report('list', [remoteScopeName], { ids: true });
  const listRemote = async (workspacePath: string, remoteScopeName: string) =>
    (await load(workspacePath)).json('list', [remoteScopeName]);
  const exportAll = async (workspacePath: string) => (await load(workspacePath)).report('export', [[]]);
  const recoverComponent = async (workspacePath: string, pattern: string) =>
    (await load(workspacePath)).report('recover', [pattern], { skipDependencyInstallation: true });

  async function track(workspacePath: string, comps: CompToTrack[]) {
    const { tracker, workspace } = await load(workspacePath);
    for (const comp of comps) {
      await tracker.track({ rootDir: comp.rootDir, componentName: comp.name, mainFile: comp.main });
    }
    await workspace.bitMap.write();
  }

  async function tag(
    workspacePath: string,
    params: { version?: string; unmodified?: boolean; soft?: boolean; releaseType?: 'patch' } = {}
  ) {
    const { snapping } = await load(workspacePath);
    await snapping.tag({ build: false, ...params });
  }

  async function persistTag(workspacePath: string) {
    const { snapping } = await load(workspacePath);
    await snapping.tag({ persist: true, build: false });
  }

  async function snap(workspacePath: string, params: { ignoreIssues?: string } = {}) {
    const { snapping } = await load(workspacePath);
    await snapping.snap({ build: false, message: 'msg', ...params });
  }

  /** the part of "bit install" that links the workspace components into node_modules, without fetching packages */
  async function link(workspacePath: string) {
    const { install, inWorkspace } = await load(workspacePath);
    await inWorkspace(() => install.link([], {}));
  }

  /** import by ids, as "bit import -x" does */
  async function importIds(workspacePath: string, ids: string[]) {
    const { importer, inWorkspace } = await load(workspacePath);
    await inWorkspace(() => importer.import({ ids, installNpmPackages: false, writeConfigFiles: false }));
  }

  /** import by the import command, so patterns are supported */
  const runImport = async (workspacePath: string, ids: string[]) =>
    (await load(workspacePath)).report('import', [ids], { skipDependencyInstallation: true });

  const readBitMap = (workspacePath: string): Record<string, any> =>
    parse(fs.readFileSync(path.join(workspacePath, '.bitmap'), 'utf8'), undefined, true) as Record<string, any>;

  /** bar/foo, tagged */
  async function createAndTagBarFoo(workspacePath: string) {
    fs.outputFileSync(path.join(workspacePath, 'bar/foo.js'), `module.exports = function foo() { return 'got foo'; };`);
    await track(workspacePath, [{ rootDir: 'bar', name: 'bar/foo' }]);
    await tag(workspacePath);
  }

  /** a workspace with tagged and exported components. they depend on each other: comp1 -> comp2 -> ... */
  async function createExportedComps(numOfComponents: number): Promise<WorkspaceData> {
    const workspaceData = createWorkspace();
    await mockComponents(workspaceData.workspacePath, { numOfComponents });
    await tag(workspaceData.workspacePath);
    await exportAll(workspaceData.workspacePath);
    return workspaceData;
  }

  async function showRemoveConfig(workspacePath: string, compId: string) {
    const show: any[] = await (await load(workspacePath)).json('show', [compId]);
    return show.find((row) => row.title === 'configuration').json.find((row) => row.id === REMOVE_ASPECT_ID);
  }

  async function getAllIssuesFromStatus(workspacePath: string): Promise<string[]> {
    const status = await statusJson(workspacePath);
    return status.componentsWithIssues.map((comp) => comp.issues.map((issue) => issue.type)).flat();
  }

  async function expectStatusToBeClean(workspacePath: string) {
    const status = await statusJson(workspacePath);
    Object.keys(status).forEach((key) => {
      if (['componentsWithIssues', 'currentLaneId', 'forkedLaneId'].includes(key)) return;
      expect(status[key], `status.${key} should be empty`).to.have.lengthOf(0);
    });
  }

  /** the head Version object of a component, as "bit cat-component <id>@latest" prints it */
  async function getHeadVersion(workspacePath: string, name: string) {
    const { scope, workspace } = await load(workspacePath);
    const compId = await workspace.resolveComponentId(name);
    const legacyScope = scope.legacyScope;
    const modelComponent = await legacyScope.getModelComponent(compId);
    const version = await modelComponent.loadVersion(modelComponent.head!.toString(), legacyScope.objects);
    return JSON.parse(JSON.stringify(version.toObject()));
  }

  before(() => {
    // "bit delete --hard" is blocked in non-interactive sessions unless the feature is explicitly enabled
    addFeature('hard-delete');
  });
  after(async () => {
    reloadFeatureToggle();
    await Promise.all(workspaces.map((workspaceData) => destroyWorkspace(workspaceData)));
  });

  describe('with tagged components and --track=false ', () => {
    let workspaceData: WorkspaceData;
    let output: string;
    before(async () => {
      workspaceData = createWorkspace();
      await createAndTagBarFoo(workspaceData.workspacePath);
      output = await removeComponent(workspaceData.workspacePath, 'bar/foo');
    });
    it('should remove component', () => {
      expect(output).to.have.string('removed components');
      expect(output).to.have.string('bar/foo');
    });
    it('should not show in bitmap', () => {
      const bitMap = readBitMap(workspaceData.workspacePath);
      expect(bitMap).to.not.have.property('bar/foo');
    });
    it('removed component should not be in new component when checking status', async () => {
      const listOutput = await listLocalScope(workspaceData.workspacePath);
      expect(listOutput).to.not.have.string('bar/foo');
      const status = await statusReport(workspaceData.workspacePath);
      expect(status.includes('bar/foo')).to.be.false;
    });
  });

  describe('with tagged components and -t=true', () => {
    let workspaceData: WorkspaceData;
    before(async () => {
      workspaceData = createWorkspace();
      await createAndTagBarFoo(workspaceData.workspacePath);
      await removeComponent(workspaceData.workspacePath, 'bar/foo', { track: true, keepFiles: true });
    });
    it('should show in bitmap', () => {
      const bitMap = readBitMap(workspaceData.workspacePath);
      expect(bitMap).to.have.property('bar/foo');
    });
    it('removed component should  be in new component', async () => {
      const listOutput = await listLocalScope(workspaceData.workspacePath);
      expect(listOutput).to.not.have.string('bar/foo');
      const status = await statusReport(workspaceData.workspacePath);
      expect(status.includes('new components')).to.be.true;
      expect(status.includes('bar/foo')).to.be.true;
    });
  });

  describe('with remote scope without dependencies', () => {
    let workspaceData: WorkspaceData;
    before(async () => {
      workspaceData = createWorkspace();
      await createAndTagBarFoo(workspaceData.workspacePath);
      await exportAll(workspaceData.workspacePath);
    });
    describe('without --remote flag', () => {
      let output: string;
      before(async () => {
        output = await removeComponent(workspaceData.workspacePath, `${workspaceData.remoteScopeName}/bar/foo`);
      });
      it('should show a successful message', () => {
        expect(output).to.have.string('removed components');
        expect(output).to.have.string(`${workspaceData.remoteScopeName}/bar/foo`);
      });
      it('should remove the component from the local scope', async () => {
        // the scope filter leaves out the envs, which the in-process workspace imports into its local scope
        const lsScope = await listLocalScope(workspaceData.workspacePath, workspaceData.remoteScopeName);
        expect(lsScope).to.have.string('found 0 components');
      });
      it('should not remove the component from the remote scope', async () => {
        const lsScope = await listRemoteIds(workspaceData.workspacePath, workspaceData.remoteScopeName);
        expect(lsScope).to.not.have.string('found 0 components');
      });
    });
    describe('with --remote flag', () => {
      let output: string;
      before(async () => {
        output = await removeComponentFromRemote(
          workspaceData.workspacePath,
          `${workspaceData.remoteScopeName}/bar/foo`
        );
      });
      it('should show a successful message', () => {
        expect(output).to.have.string('removed components from the remote scope');
        expect(output).to.have.string(`${workspaceData.remoteScopeName}/bar/foo`);
      });
      it('should remove the component from the remote scope', async () => {
        const lsScope = await listRemoteIds(workspaceData.workspacePath, workspaceData.remoteScopeName);
        expect(lsScope).to.have.string('found 0 components');
      });
    });
  });

  describe('with remote scope with dependencies', () => {
    const componentName = 'comp2';
    let workspaceData: WorkspaceData;
    before(async () => {
      workspaceData = await createExportedComps(3);
    });
    it('should not remove component with dependencies when -f flag is false', async () => {
      const output = await removeComponentFromRemote(
        workspaceData.workspacePath,
        `${workspaceData.remoteScopeName}/${componentName}`
      );
      expect(output).to.have.string(
        `unable to delete ${workspaceData.remoteScopeName}/${componentName}, because the following components depend on it`
      );
    });
    it('should remove component with dependencies when -f flag is true', async () => {
      const output = await removeComponentFromRemote(
        workspaceData.workspacePath,
        `${workspaceData.remoteScopeName}/${componentName}`,
        { force: true }
      );
      expect(output).to.have.string('removed components');
      expect(output).to.have.string(`${workspaceData.remoteScopeName}/${componentName}`);
    });
  });

  describe('with imported components, no dependencies', () => {
    let importerData: WorkspaceData;
    let remoteName: string;
    before(async () => {
      const remote = createWorkspace();
      remoteName = remote.remoteScopeName;
      await createAndTagBarFoo(remote.workspacePath);
      await exportAll(remote.workspacePath);

      importerData = createWorkspaceWithRemote(remote);
      await importIds(importerData.workspacePath, [`${remoteName}/bar/foo`]);
    });
    it('should remove components with no dependencies when -f flag is false', async () => {
      const output = await removeComponent(importerData.workspacePath, `${remoteName}/bar/foo`);
      expect(output).to.have.string('removed components');
      expect(output).to.have.string(`${remoteName}/bar/foo`);
      const bitMap = readBitMap(importerData.workspacePath);
      expect(bitMap).to.not.have.property(`bar/foo`);
    });
  });

  describe('remove modified component', () => {
    let workspaceData: WorkspaceData;
    before(async () => {
      workspaceData = createWorkspace();
      await createAndTagBarFoo(workspaceData.workspacePath);
      fs.appendFileSync(path.join(workspaceData.workspacePath, 'bar/foo.js'), '\n// modified');
    });
    it('should not remove modified component ', async () => {
      const output = await removeComponent(workspaceData.workspacePath, 'bar/foo@0.0.1');
      expect(output).to.have.string('unable to remove modified components');
      expect(output).to.have.string('bar/foo');
    });
  });

  describe('remove a component when the main file is missing', () => {
    let output: string;
    before(async () => {
      const { workspacePath } = createWorkspace();
      fs.outputFileSync(path.join(workspacePath, 'bar/foo.js'), '');
      fs.outputFileSync(path.join(workspacePath, 'bar/foo-main.js'), '');
      await track(workspacePath, [{ rootDir: 'bar', name: 'bar/foo', main: 'foo-main.js' }]);
      await tag(workspacePath);
      fs.removeSync(path.join(workspacePath, 'bar/foo-main.js'));
      const status = await statusReport(workspacePath);
      expect(status).to.have.string('main-file was removed');
      output = await removeComponent(workspacePath, 'bar/foo');
    });
    it('should remove the component successfully', () => {
      expect(output).to.have.string('successfully removed component');
    });
  });

  // todo: not sure this test makes sense. it was converted from the legacy somehow
  describe('remove a component when a dependency has a file with the same content as other component file', () => {
    let output: string;
    let importerData: WorkspaceData;
    before(async () => {
      const remote = createWorkspace();
      const { workspacePath } = remote;
      await mockComponents(workspacePath, { numOfComponents: 2 });
      fs.outputFileSync(path.join(workspacePath, 'comp2/index.js'), fixtures.isType);
      fs.outputFileSync(path.join(workspacePath, 'comp2-b/index.js'), fixtures.isType);
      await track(workspacePath, [{ rootDir: 'comp2-b', name: 'comp2-b' }]);
      await tag(workspacePath);

      // this additional is to prevent another bug, where nested are imported only with their
      // latest version and then when 'bit remove' tries to remove all versions array of
      // ModelComponent, it doesn't find some of them and throws ENOENT error
      await tag(workspacePath, { unmodified: true, version: '1.0.0' });

      await exportAll(workspacePath);
      importerData = createWorkspaceWithRemote(remote);
      await importIds(importerData.workspacePath, [`${remote.remoteScopeName}/comp1`]);
      await importIds(importerData.workspacePath, [`${remote.remoteScopeName}/comp2`]);
      await link(importerData.workspacePath);

      // now, the hash "b417426ea2f7f0e80fa2ee2e6c825e18fcb8a897", which has the content of fixtures.isType
      // is shared between two components: utils/is-type and utils/is-type2
      // deleting utils/is-string, causes removal of its dependency utils/is-type as well.
      // a previous bug, deleted also the files associated with utils/is-type, leaving utils/is-type2
      // with missing files from the scope.
      output = await removeComponent(importerData.workspacePath, 'comp1');
    });
    it('should successfully remove', () => {
      expect(output).to.have.string('removed components');
    });
    it('bit status should not throw an error about missing file from the model', async () => {
      await statusJson(importerData.workspacePath); // throws if a file is missing from the model
    });
    it('expect the shared hash to not be deleted', () => {
      const hashLocation = path.join(
        importerData.workspacePath,
        '.bit/objects/b4/17426ea2f7f0e80fa2ee2e6c825e18fcb8a897'
      );
      expect(fs.existsSync(hashLocation) && fs.statSync(hashLocation).isFile()).to.be.true;
    });
  });

  describe('soft remove', () => {
    /** comp1 -> comp2, exported. then comp2 is soft-removed */
    async function createSoftRemoved() {
      const workspaceData = await createExportedComps(2);
      await deleteComponent(workspaceData.workspacePath, 'comp2');
      return workspaceData;
    }
    let workspaceData: WorkspaceData;
    let workspacePath: string;
    before(async () => {
      workspaceData = await createSoftRemoved();
      workspacePath = workspaceData.workspacePath;
    });
    it('bit status should show a section of removed components', async () => {
      const status = await statusJson(workspacePath);
      expect(status.locallySoftRemoved).to.have.lengthOf(1);
    });
    it('bit status should show the dependent component with an issue because it is now missing the dependency', async () => {
      expect(await getAllIssuesFromStatus(workspacePath)).to.include(
        IssuesClasses.MissingPackagesDependenciesOnFs.name
      );
    });
    it('bit status should not show the component as unavailable on main', async () => {
      const status = await statusJson(workspacePath);
      expect(status.unavailableOnMain).to.have.lengthOf(0);
    });
    it('bit list should not show the removed component', async () => {
      const list = await listWorkspace(workspacePath);
      expect(list).to.have.lengthOf(1);
      expect(list[0].id).to.not.have.string('comp2');
    });
    it('bit show should show the component as removed', async () => {
      const removeData = await showRemoveConfig(workspacePath, 'comp2');
      expect(removeData.config.removed).to.be.true;
    });
    describe('tagging the component', () => {
      before(async () => {
        fs.outputFileSync(path.join(workspacePath, 'comp1/index.js'), '');
        await tag(workspacePath);
      });
      it('should tag the removed components', async () => {
        const status = await statusJson(workspacePath);
        const stagedIds = status.stagedComponents.map((staged) => staged.id);
        expect(stagedIds.includes(`${workspaceData.remoteScopeName}/comp2`)).to.be.true;
      });
      it('bit show should still show the component as removed', async () => {
        const removeData = await showRemoveConfig(workspacePath, 'comp2');
        expect(removeData.config.removed).to.be.true;
      });
      describe('exporting the components', () => {
        let exportOutput: string;
        before(async () => {
          exportOutput = await exportAll(workspacePath);
        });
        it('should export the deleted components', () => {
          expect(exportOutput).to.have.string('exported components (2)');
        });
        it('bit status should be clean', async () => {
          await expectStatusToBeClean(workspacePath);
        });
        it('bit list remote should not show the removed component', async () => {
          const list = await listRemote(workspacePath, workspaceData.remoteScopeName);
          expect(list).to.have.lengthOf(1);
          expect(list[0].id).to.not.have.string('comp2');
        });
        describe('importing the component to a new workspace', () => {
          let importOutput: string;
          let importerPath: string;
          before(async () => {
            importerPath = createWorkspaceWithRemote(workspaceData).workspacePath;
            importOutput = await runImport(importerPath, [`${workspaceData.remoteScopeName}/comp2`]);
          });
          it('should indicate that the component is removed', () => {
            expect(importOutput).to.have.string('deleted');
          });
          it('bit status should show them as remotelySoftRemoved', async () => {
            const status = await statusJson(importerPath);
            expect(status.remotelySoftRemoved).to.have.lengthOf(1);
          });
        });
        describe('importing the entire scope to a new workspace', () => {
          let importerPath: string;
          before(async () => {
            importerPath = createWorkspaceWithRemote(workspaceData).workspacePath;
            await runImport(importerPath, [`${workspaceData.remoteScopeName}/*`]);
          });
          it('should not import the removed component', async () => {
            const list = await listWorkspace(importerPath);
            expect(list).to.have.lengthOf(1);
            expect(list[0].id).to.not.have.string('comp2');
          });
        });
      });
    });
    describe('soft-tagging the component', () => {
      let softTagPath: string;
      before(async () => {
        // a workspace as it was right after the removal, before the tagging above
        softTagPath = (await createSoftRemoved()).workspacePath;
        fs.outputFileSync(path.join(softTagPath, 'comp1/index.js'), '');
        await tag(softTagPath, { soft: true, releaseType: 'patch' });
      });
      it('should leave the .bitmap entry and soft-tag it as well', () => {
        const bitMap = readBitMap(softTagPath);
        expect(bitMap).to.have.property('comp2');
        const bitMapEntry = bitMap.comp2;
        expect(bitMapEntry).to.have.property('config');
        expect(bitMapEntry).to.have.property('nextVersion');
      });
      describe('tag --persist', () => {
        before(async () => {
          await persistTag(softTagPath);
        });
        it('should remove the entry from .bitmap', () => {
          const bitMap = readBitMap(softTagPath);
          expect(bitMap).to.not.have.property('comp2');
        });
      });
    });
  });

  describe('removing from workspace when it had dependents previously in old tags', () => {
    let workspacePath: string;
    before(async () => {
      workspacePath = (await createExportedComps(2)).workspacePath;
      fs.outputFileSync(path.join(workspacePath, 'comp1/index.js'), ''); // remove the dependency of comp2
      await tag(workspacePath);
      await exportAll(workspacePath);
      await removeComponent(workspacePath, 'comp2');
    });
    // only removing from scope needs the --force. from workspace it's not an irreversible action.
    it('should remove successfully without the need for --force flag', () => {
      expect(readBitMap(workspacePath)).to.not.have.property('comp2');
    });
  });

  describe('remove new component with --keep-files flag', () => {
    let workspaceData: WorkspaceData;
    before(async () => {
      workspaceData = createWorkspace();
      await mockComponents(workspaceData.workspacePath);
      await removeComponent(workspaceData.workspacePath, 'comp1', { keepFiles: true });
    });
    it('should remove the component from .bitmap', () => {
      const bitMap = readBitMap(workspaceData.workspacePath);
      expect(bitMap).to.not.have.property('comp1');
    });
    it('should not delete the directory from the filesystem', () => {
      const compDir = path.join(workspaceData.workspacePath, 'comp1');
      expect(fs.existsSync(compDir) && fs.statSync(compDir).isDirectory()).to.be.true;
    });
    it('should delete the directory from the node_modules', () => {
      expect(
        fs.existsSync(path.join(workspaceData.workspacePath, `node_modules/@${workspaceData.remoteScopeName}`, 'comp1'))
      ).to.be.false;
    });
  });

  describe('remove new component without --keep-files flag', () => {
    let workspaceData: WorkspaceData;
    before(async () => {
      workspaceData = createWorkspace();
      await mockComponents(workspaceData.workspacePath);
      await removeComponent(workspaceData.workspacePath, 'comp1');
    });
    it('should remove the component from .bitmap', () => {
      const bitMap = readBitMap(workspaceData.workspacePath);
      expect(bitMap).to.not.have.property('comp1');
    });
    it('should delete the directory from the filesystem', () => {
      expect(fs.existsSync(path.join(workspaceData.workspacePath, 'comp1'))).to.be.false;
    });
    it('should delete the directory from the node_modules', () => {
      expect(
        fs.existsSync(path.join(workspaceData.workspacePath, `node_modules/@${workspaceData.remoteScopeName}`, 'comp1'))
      ).to.be.false;
    });
  });

  describe('soft-remove then snap with --ignore-issues', () => {
    let workspacePath: string;
    before(async () => {
      workspacePath = createWorkspace().workspacePath;
      await mockComponents(workspacePath);
      await snap(workspacePath);
      await deleteComponent(workspacePath, 'comp1');
      await snap(workspacePath, { ignoreIssues: '*' });
    });
    it('should show it as removed', async () => {
      const removeAspect = await showRemoveConfig(workspacePath, 'comp1');
      expect(removeAspect).to.be.an('Object');
      expect(removeAspect.config.removed).to.be.true;
    });
  });

  describe('soft remove then tagging the dependent without removing the references to the removed component', () => {
    let workspacePath: string;
    before(async () => {
      workspacePath = (await createExportedComps(2)).workspacePath;
      await deleteComponent(workspacePath, 'comp2');
    });
    it('bit status should show RemovedDependency issue', async () => {
      expect(await getAllIssuesFromStatus(workspacePath)).to.include(IssuesClasses.RemovedDependencies.name);
    });
  });

  describe('soft remove then tagging the dependent without removing the references to the removed component then recovering it', () => {
    let workspacePath: string;
    before(async () => {
      const remote = await createExportedComps(2);
      const remoteName = remote.remoteScopeName;

      const secondPath = createWorkspaceWithRemote(remote).workspacePath;
      await importIds(secondPath, [`${remoteName}/comp2`]);
      await deleteComponent(secondPath, 'comp2');
      await tag(secondPath);
      await exportAll(secondPath);

      workspacePath = createWorkspaceWithRemote(remote).workspacePath;
      await importIds(workspacePath, [`${remoteName}/comp1`, `${remoteName}/comp2`]);
    });
    it('bit status should show RemovedDependency issue before the component is recovered', async () => {
      expect(await getAllIssuesFromStatus(workspacePath)).to.include(IssuesClasses.RemovedDependencies.name);
    });
    it('bit status should not show RemovedDependency issue because it was recovered', async () => {
      await recoverComponent(workspacePath, 'comp2');
      await link(workspacePath); // as "bit install" does, so the dependency is resolved to the workspace component
      expect(await getAllIssuesFromStatus(workspacePath)).to.not.include(IssuesClasses.RemovedDependencies.name);
    });
  });

  describe('soft remove then snapping with --build', () => {
    let snapOutput: string;
    let workspacePath: string;
    before(async () => {
      workspacePath = createWorkspace().workspacePath;
      await mockComponents(workspacePath, { numOfComponents: 2 });
      await snap(workspacePath);
      await deleteComponent(workspacePath, 'comp1');
      snapOutput = await (await load(workspacePath)).report('snap', [undefined], { build: true, message: 'msg' });
    });
    it('should not build the removed component', async () => {
      expect(snapOutput).to.not.have.string('pipeline');
      const versionObj = await getHeadVersion(workspacePath, 'comp1');
      expect(versionObj.buildStatus).to.equal('skipped');
    });
    it('should remove successfully', async () => {
      const versionObj = await getHeadVersion(workspacePath, 'comp1');
      const removeExt = versionObj.extensions.find((ext) => ext.name === REMOVE_ASPECT_ID);
      expect(removeExt.config.removed).to.be.true;
    });
  });

  describe('remove component that exists in workspace.jsonc', () => {
    let workspaceData: WorkspaceData;
    let aspectId: string;
    before(async () => {
      workspaceData = createWorkspace();
      const { workspacePath, remoteScopeName } = workspaceData;
      const dir = 'my-aspect';
      aspectId = `${remoteScopeName}/my-aspect`;
      fs.outputFileSync(
        path.join(workspacePath, dir, 'index.ts'),
        `import { MyAspectAspect } from './my-aspect.aspect';

export default MyAspectAspect;
export { MyAspectAspect };
`
      );
      fs.outputFileSync(
        path.join(workspacePath, dir, 'my-aspect.aspect.ts'),
        `import { Aspect } from '@teambit/harmony';

export const MyAspectAspect = Aspect.create({
  id: '${aspectId}',
});
`
      );
      await track(workspacePath, [{ rootDir: dir, name: 'my-aspect' }]);
      await (await load(workspacePath)).workspace.use(aspectId);
      const wsJsonc = parse(fs.readFileSync(path.join(workspacePath, 'workspace.jsonc'), 'utf8')) as any;
      expect(wsJsonc).to.have.property(aspectId);
      await removeComponent(workspacePath, 'my-aspect');
    });
    it('should remove the id from the root of workspace.jsonc', () => {
      const ws = parse(fs.readFileSync(path.join(workspaceData.workspacePath, 'workspace.jsonc'), 'utf8')) as any;
      expect(ws).to.not.have.property(aspectId);
    });
  });
});
