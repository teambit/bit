import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import { parse } from 'comment-json';
import stripAnsi from 'strip-ansi';
import { loadManyAspects } from '@teambit/harmony.testing.load-aspect';
import type { WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockWorkspace, destroyWorkspace } from '@teambit/workspace.testing.mock-workspace';
import { mockComponents } from '@teambit/component.testing.mock-components';
import { WorkspaceAspect } from '@teambit/workspace';
import type { Workspace } from '@teambit/workspace';
import type { CLIMain } from '@teambit/cli';
import { CLIAspect } from '@teambit/cli';
import { ListerAspect } from '@teambit/lister';
import { ExportAspect } from '@teambit/export';
import { ImporterAspect } from '@teambit/importer';
import { TrackerAspect } from '@teambit/tracker';
import type { TrackerMain } from '@teambit/tracker';
import { SnappingAspect, AUTO_TAGGED_MSG } from '@teambit/snapping';
import { InstallAspect } from '@teambit/install';
import type { InstallMain } from '@teambit/install';
import { ScopeAspect } from '@teambit/scope';
import type { ScopeMain } from '@teambit/scope';
import { StatusAspect } from './status.aspect';

/**
 * tagging a component auto-tags its dependents (and their dependents), and "bit status" reports them as pending
 * before the tag. it lives in the status aspect rather than in the snapping aspect, since the flows assert the
 * status, and the snapping aspect cannot depend on it.
 */

type TagOutput = { data: string; details: string };

describe('auto tagging functionality', function () {
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
  async function load(workspacePath: string) {
    const harmony = await loadManyAspects(
      [
        WorkspaceAspect,
        SnappingAspect,
        ExportAspect,
        ImporterAspect,
        StatusAspect,
        ListerAspect,
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
      tracker: harmony.get<TrackerMain>(TrackerAspect.id),
      scope: harmony.get<ScopeMain>(ScopeAspect.id),
      install: harmony.get<InstallMain>(InstallAspect.id),
      workspace: harmony.get<Workspace>(WorkspaceAspect.id),
      inWorkspace,
      report: (name: string, args: any[] = [], flags: Record<string, any> = {}) =>
        inWorkspace(async () => {
          const output: any = await getCmd(name).report!(args as any, flags);
          return stripAnsi(typeof output === 'string' ? output : output.data);
        }),
      /** the report as the CLI prints it (data) and as "bit details" shows it afterwards (details) */
      reportWithDetails: (name: string, args: any[] = [], flags: Record<string, any> = {}) =>
        inWorkspace(async (): Promise<TagOutput> => {
          const output: any = await getCmd(name).report!(args as any, flags);
          if (typeof output === 'string') return { data: stripAnsi(output), details: stripAnsi(output) };
          return { data: stripAnsi(output.data), details: stripAnsi(output.details || output.data) };
        }),
      json: (name: string, args: any[] = [], flags: Record<string, any> = {}) =>
        inWorkspace(async () => JSON.parse(JSON.stringify(await getCmd(name).json!(args as any, flags)))),
    };
  }

  const writeFiles = (workspacePath: string, files: Record<string, string>) =>
    Object.entries(files).forEach(([filePath, content]) =>
      fs.outputFileSync(path.join(workspacePath, filePath), content)
    );

  async function track(workspacePath: string, comps: { rootDir: string; name: string }[]) {
    const { tracker, workspace } = await load(workspacePath);
    for (const comp of comps) {
      await tracker.track({ rootDir: comp.rootDir, componentName: comp.name });
    }
    await workspace.bitMap.write();
  }

  /** the same as "bit link --rewire": turns the relative imports between the components into package imports */
  async function linkAndRewire(workspacePath: string) {
    const { install, inWorkspace } = await load(workspacePath);
    await inWorkspace(() => install.link([], { rewire: true }));
  }

  /** the part of "bit install" that links the workspace components into node_modules, without fetching packages */
  async function link(workspacePath: string) {
    const { install, inWorkspace } = await load(workspacePath);
    await inWorkspace(() => install.link([], {}));
  }

  const tagWithDetails = async (workspacePath: string, patterns: string[], flags: Record<string, any> = {}) =>
    (await load(workspacePath)).reportWithDetails('tag', [patterns], { build: false, ...flags });
  const tagAll = (workspacePath: string, flags: Record<string, any> = {}) => tagWithDetails(workspacePath, [], flags);
  const exportAll = async (workspacePath: string) => (await load(workspacePath)).report('export', [[]]);
  const runImport = async (workspacePath: string, ids: string[]) =>
    (await load(workspacePath)).report('import', [ids], { skipDependencyInstallation: true });
  const statusJson = async (workspacePath: string) => (await load(workspacePath)).json('status');
  const listRemote = async (workspacePath: string, remoteScopeName: string) =>
    (await load(workspacePath)).json('list', [remoteScopeName]);

  async function getModelComponent(workspacePath: string, name: string) {
    const { scope, workspace } = await load(workspacePath);
    const compId = await workspace.resolveComponentId(name);
    return scope.legacyScope.getModelComponent(compId);
  }

  /** the Version object of a component, as "bit cat-component <id>@<version>" prints it. "latest" is the head */
  async function catComponent(workspacePath: string, name: string, version = 'latest') {
    const { scope } = await load(workspacePath);
    const modelComponent = await getModelComponent(workspacePath, name);
    const legacyScope = scope.legacyScope;
    const versionToLoad = version === 'latest' ? modelComponent.getHeadRegardlessOfLaneAsTagOrHash() : version;
    const versionObj = await modelComponent.loadVersion(versionToLoad, legacyScope.objects);
    return JSON.parse(JSON.stringify(versionObj.toObject()));
  }

  async function expectStatusToBeClean(workspacePath: string) {
    const status = await statusJson(workspacePath);
    Object.keys(status).forEach((key) => {
      if (['componentsWithIssues', 'currentLaneId', 'forkedLaneId'].includes(key)) return;
      expect(status[key], `status.${key} should be empty`).to.have.lengthOf(0);
    });
  }

  after(async () => {
    await Promise.all(workspaces.map((workspaceData) => destroyWorkspace(workspaceData)));
  });

  describe('with dependencies of dependencies', () => {
    /** comp1 => comp2 => comp3, all tagged. then comp3 is modified */
    async function setup(): Promise<WorkspaceData> {
      const workspaceData = createWorkspace();
      const { workspacePath } = workspaceData;
      await mockComponents(workspacePath, { numOfComponents: 3 });
      await tagAll(workspacePath);
      fs.appendFileSync(path.join(workspacePath, 'comp3', 'index.js'), ' ');
      const statusOutput = await (await load(workspacePath)).report('status');
      expect(statusOutput).to.have.string('components pending auto-tag');
      return workspaceData;
    }

    describe('tagging the dependency', () => {
      let workspaceData: WorkspaceData;
      let tagOutput: TagOutput;
      before(async () => {
        workspaceData = await setup();
        tagOutput = await tagWithDetails(workspaceData.workspacePath, ['comp3']);
      });
      it('should auto tag the dependencies and the nested dependencies', () => {
        expect(tagOutput.data).to.have.string('3 component(s) tagged');
        expect(tagOutput.data).to.have.string('auto-tagged dependents');
        // "bit details" shows what the tag command saved as its details
        expect(tagOutput.details).to.have.string('comp1@0.0.2');
        expect(tagOutput.details).to.have.string('comp2@0.0.2');
      });
      it('should update the dependencies and the flattenedDependencies of the dependent with the new versions', async () => {
        const barFoo = await catComponent(workspaceData.workspacePath, 'comp2');
        expect(barFoo.dependencies[0].id.name).to.equal('comp3');
        expect(barFoo.dependencies[0].id.version).to.equal('0.0.2');

        expect(barFoo.flattenedDependencies).to.deep.include({
          scope: workspaceData.remoteScopeName,
          name: 'comp3',
          version: '0.0.2',
        });
      });
      it('should update the dependencies and the flattenedDependencies of the dependent of the dependent with the new versions', async () => {
        const barFoo = await catComponent(workspaceData.workspacePath, 'comp1');
        expect(barFoo.dependencies[0].id.name).to.equal('comp2');
        expect(barFoo.dependencies[0].id.version).to.equal('0.0.2');

        expect(barFoo.flattenedDependencies).to.deep.include({
          scope: workspaceData.remoteScopeName,
          name: 'comp3',
          version: '0.0.2',
        });
        expect(barFoo.flattenedDependencies).to.deep.include({
          scope: workspaceData.remoteScopeName,
          name: 'comp2',
          version: '0.0.2',
        });
      });
      it('bit-status should show them all as staged and not modified', async () => {
        const status = await statusJson(workspaceData.workspacePath);
        expect(status.modifiedComponents).to.be.empty;
        const staged = status.stagedComponents.map((stagedComp) =>
          stagedComp.id.replace(`${workspaceData.remoteScopeName}/`, '')
        );
        expect(staged).to.include('comp1');
        expect(staged).to.include('comp2');
        expect(staged).to.include('comp3');
      });
    });

    describe('with --skip-auto-tag', () => {
      let workspaceData: WorkspaceData;
      let tagOutput: TagOutput;
      before(async () => {
        workspaceData = await setup();
        tagOutput = await tagWithDetails(workspaceData.workspacePath, ['comp3'], { skipAutoTag: true });
      });
      it('should not auto tag the dependencies', () => {
        expect(tagOutput.data).to.not.have.string(AUTO_TAGGED_MSG);
        expect(tagOutput.data).to.not.have.string('comp1@0.0.2');
        expect(tagOutput.data).to.not.have.string('comp2@0.0.2');
      });
      it('bitmap should show the correct versions', async () => {
        const bitmap = parse(fs.readFileSync(path.join(workspaceData.workspacePath, '.bitmap'), 'utf8')) as any;
        const getVersion = (name: string) => bitmap[name].version;
        expect(getVersion('comp1')).to.equal('0.0.1');
        expect(getVersion('comp2')).to.equal('0.0.1');
      });
    });
  });

  describe('with cyclic dependencies', () => {
    const ignoreCircular = { ignoreIssues: 'CircularDependencies' };
    /** a => b => c => a. all are tagged, then c is modified */
    async function setup(): Promise<WorkspaceData> {
      const workspaceData = createWorkspace();
      const { workspacePath } = workspaceData;
      writeFiles(workspacePath, {
        'bar/a/a.js': 'require("../b/b")',
        'bar/b/b.js': 'require("../c/c")',
        'bar/c/c.js': 'require("../a/a"); console.log("I am C v1")',
      });
      await track(
        workspacePath,
        ['a', 'b', 'c'].map((name) => ({ rootDir: `bar/${name}`, name: `bar/${name}` }))
      );
      await linkAndRewire(workspacePath);
      await tagAll(workspacePath, ignoreCircular);
      writeFiles(workspacePath, { 'bar/c/c.js': 'require("../a/a"); console.log("I am C v2")' });
      await linkAndRewire(workspacePath);
      return workspaceData;
    }

    describe('bit status', () => {
      let workspaceData: WorkspaceData;
      before(async () => {
        workspaceData = await setup();
      });
      it('bit status should recognize the auto tag pending components', async () => {
        const output = await statusJson(workspaceData.workspacePath);
        expect(output.autoTagPendingComponents).to.deep.include(`${workspaceData.remoteScopeName}/bar/a`);
        expect(output.autoTagPendingComponents).to.deep.include(`${workspaceData.remoteScopeName}/bar/b`);
      });
    });

    describe('tagging the components with auto-version-bump', () => {
      let workspaceData: WorkspaceData;
      let tagOutput: TagOutput;
      before(async () => {
        workspaceData = await setup();
        tagOutput = await tagAll(workspaceData.workspacePath, ignoreCircular);
      });
      it('should auto tag all dependents', () => {
        expect(tagOutput.data).to.have.string('3 component(s) tagged');
        expect(tagOutput.data).to.have.string('auto-tagged dependents');
        expect(tagOutput.details).to.have.string('bar/a@0.0.2');
        expect(tagOutput.details).to.have.string('bar/b@0.0.2');
      });
      it('should update the dependencies and the flattenedDependencies of the all dependents with the new versions', async () => {
        const { workspacePath, remoteScopeName } = workspaceData;
        const barA = await catComponent(workspacePath, 'bar/a');
        expect(barA.dependencies[0].id.name).to.equal('bar/b');
        expect(barA.dependencies[0].id.version).to.equal('0.0.2');

        expect(barA.flattenedDependencies).to.deep.include({ scope: remoteScopeName, name: 'bar/b', version: '0.0.2' });
        expect(barA.flattenedDependencies).to.deep.include({ scope: remoteScopeName, name: 'bar/c', version: '0.0.2' });

        const barB = await catComponent(workspacePath, 'bar/b');
        expect(barB.dependencies[0].id.name).to.equal('bar/c');
        expect(barB.dependencies[0].id.version).to.equal('0.0.2');

        expect(barB.flattenedDependencies).to.deep.include({ scope: remoteScopeName, name: 'bar/c', version: '0.0.2' });
        expect(barB.flattenedDependencies).to.deep.include({ scope: remoteScopeName, name: 'bar/a', version: '0.0.2' });
      });
      it('should update the dependencies and the flattenedDependencies of the modified component with the cycle dependency', async () => {
        const { workspacePath, remoteScopeName } = workspaceData;
        const barC = await catComponent(workspacePath, 'bar/c');
        expect(barC.dependencies[0].id.name).to.equal('bar/a');
        expect(barC.dependencies[0].id.version).to.equal('0.0.2');

        expect(barC.flattenedDependencies).to.deep.include({ scope: remoteScopeName, name: 'bar/a', version: '0.0.2' });
        expect(barC.flattenedDependencies).to.deep.include({ scope: remoteScopeName, name: 'bar/b', version: '0.0.2' });

        expect(barC.flattenedDependencies).to.have.lengthOf(2);
      });
    });

    describe('tagging the components with a specific version', () => {
      // see https://github.com/teambit/bit/issues/2034 for the issue this test for
      let workspaceData: WorkspaceData;
      let tagOutput: TagOutput;
      before(async () => {
        workspaceData = await setup();
        tagOutput = await tagAll(workspaceData.workspacePath, { ...ignoreCircular, ver: '2.0.0' });
      });
      it('should auto tag all dependents', () => {
        expect(tagOutput.data).to.have.string('3 component(s) tagged');
        expect(tagOutput.data).to.have.string('bar/c@2.0.0');
        expect(tagOutput.details).to.have.string('bar/a@0.0.2');
        expect(tagOutput.details).to.have.string('bar/b@0.0.2');
      });
      it('should update the dependencies and the flattenedDependencies of the all dependents with the new versions', async () => {
        const { workspacePath, remoteScopeName } = workspaceData;
        const barA = await catComponent(workspacePath, 'bar/a');
        expect(barA.dependencies[0].id.name).to.equal('bar/b');
        expect(barA.dependencies[0].id.version).to.equal('0.0.2');

        expect(barA.flattenedDependencies).to.deep.include({ scope: remoteScopeName, name: 'bar/b', version: '0.0.2' });
        expect(barA.flattenedDependencies).to.deep.include({ scope: remoteScopeName, name: 'bar/c', version: '2.0.0' });

        const barB = await catComponent(workspacePath, 'bar/b');
        expect(barB.dependencies[0].id.name).to.equal('bar/c');
        expect(barB.dependencies[0].id.version).to.equal('2.0.0');

        expect(barB.flattenedDependencies).to.deep.include({ scope: remoteScopeName, name: 'bar/c', version: '2.0.0' });
        expect(barB.flattenedDependencies).to.deep.include({ scope: remoteScopeName, name: 'bar/a', version: '0.0.2' });
      });
      it('should update the dependencies and the flattenedDependencies of the modified component according to the specified version', async () => {
        const { workspacePath, remoteScopeName } = workspaceData;
        const barC = await catComponent(workspacePath, 'bar/c');
        expect(barC.dependencies[0].id.name).to.equal('bar/a');
        expect(barC.dependencies[0].id.version).to.equal('0.0.2');

        expect(barC.flattenedDependencies).to.deep.include({ scope: remoteScopeName, name: 'bar/a', version: '0.0.2' });
        expect(barC.flattenedDependencies).to.deep.include({ scope: remoteScopeName, name: 'bar/b', version: '0.0.2' });

        expect(barC.flattenedDependencies).to.have.lengthOf(2);
      });
      describe('exporting the component', () => {
        before(async () => {
          await exportAll(workspaceData.workspacePath);
        });
        it('should be successful', async () => {
          const listScope = await listRemote(workspaceData.workspacePath, workspaceData.remoteScopeName);
          expect(listScope).to.have.lengthOf(3);
        });
      });
    });
  });

  describe('with same component as direct and indirect dependent (A in: A => B => C, A => C)', () => {
    let remote: WorkspaceData;
    let importer: WorkspaceData;
    before(async () => {
      remote = createWorkspace();
      const { workspacePath } = remote;
      writeFiles(workspacePath, {
        'bar/a/a.js': 'require("../b/b"); require("../c/c");',
        'bar/b/b.js': 'require("../c/c")',
        'bar/c/c.js': 'console.log("I am C v1")',
      });
      await track(
        workspacePath,
        ['a', 'b', 'c'].map((name) => ({ rootDir: `bar/${name}`, name: `bar/${name}` }))
      );
      await linkAndRewire(workspacePath);
      await tagAll(workspacePath);
      await exportAll(workspacePath);

      importer = createWorkspaceWithRemote(remote);
      await runImport(importer.workspacePath, [`${remote.remoteScopeName}/bar/*`]);
      // the import command skipped the installation, which is also what links the components to each other
      await link(importer.workspacePath);

      // as an intermediate step, make sure the re-link done by import C, didn't break anything
      await expectStatusToBeClean(importer.workspacePath);

      writeFiles(importer.workspacePath, { [`${remote.remoteScopeName}/bar/c/c.js`]: 'console.log("I am C v2")' });
    });
    it('bit-status should show the auto-tagged pending', async () => {
      const status = await statusJson(importer.workspacePath);
      expect(status.autoTagPendingComponents).to.include(`${remote.remoteScopeName}/bar/a`);
      expect(status.autoTagPendingComponents).to.include(`${remote.remoteScopeName}/bar/b`);
    });
    describe('tagging the dependency', () => {
      let tagOutput: TagOutput;
      before(async () => {
        tagOutput = await tagWithDetails(importer.workspacePath, ['bar/c']);
      });
      it('should bump the component version that is direct and indirect dependent only once', async () => {
        expect(tagOutput.data).to.have.string('3 component(s) tagged');
        expect(tagOutput.details).to.have.string('bar/a@0.0.2');

        const barA = await getModelComponent(importer.workspacePath, `${remote.remoteScopeName}/bar/a`);
        const barAVersions = Object.keys(barA.versions);
        expect(barAVersions).to.include('0.0.1');
        expect(barAVersions).to.include('0.0.2');
        expect(barAVersions).to.have.lengthOf(2);
      });
    });
  });
});
