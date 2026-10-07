import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import stripAnsi from 'strip-ansi';
import { loadManyAspects } from '@teambit/harmony.testing.load-aspect';
import type { WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockWorkspace, destroyWorkspace } from '@teambit/workspace.testing.mock-workspace';
import { IssuesClasses } from '@teambit/component-issues';
import { WorkspaceAspect } from '@teambit/workspace';
import type { CLIMain } from '@teambit/cli';
import { CLIAspect } from '@teambit/cli';
import { ListerAspect } from '@teambit/lister';
import { ExportAspect } from '@teambit/export';
import { ImporterAspect } from '@teambit/importer';
import { TrackerAspect } from '@teambit/tracker';
import type { TrackerMain } from '@teambit/tracker';
import { SnappingAspect } from '@teambit/snapping';
import { InstallAspect } from '@teambit/install';
import type { InstallMain } from '@teambit/install';
import { InsightsAspect } from '@teambit/insights';
import { ScopeAspect } from '@teambit/scope';
import type { ScopeMain } from '@teambit/scope';
import type { Workspace } from '@teambit/workspace';
import { fixtures } from '@teambit/legacy.e2e-helper';
import { StatusAspect } from './status.aspect';

/**
 * components that depend on each other in a circle: tagging is blocked unless the issue is ignored, the circles are
 * saved correctly in the Version objects, they can be exported/imported and "bit insights" shows them. it lives in the
 * status aspect rather than in the snapping aspect, since the flows assert the status and the insights, and the
 * snapping aspect cannot depend on them.
 */

const fixtureA = `const b = require('../b/b');
console.log('got ' + b() + ' and got A')`;
const fixtureB = `const a = require('../a/a');
console.log('got ' + a() + ' and got B')`;

type CompToTrack = { rootDir: string; name: string };

describe('cyclic dependencies', function () {
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
        InsightsAspect,
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
      json: (name: string, args: any[] = [], flags: Record<string, any> = {}) =>
        inWorkspace(async () => JSON.parse(JSON.stringify(await getCmd(name).json!(args as any, flags)))),
    };
  }

  /** chai has no async throw assertion that also matches a message */
  async function expectToReject(fn: () => Promise<unknown>, messagePart?: string) {
    try {
      await fn();
    } catch (err: any) {
      if (messagePart) expect(stripAnsi(err.message)).to.have.string(messagePart);
      return;
    }
    throw new Error('expected to reject, but it resolved');
  }

  const writeFiles = (workspacePath: string, files: Record<string, string>) =>
    Object.entries(files).forEach(([filePath, content]) =>
      fs.outputFileSync(path.join(workspacePath, filePath), content)
    );

  async function track(workspacePath: string, comps: CompToTrack[]) {
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

  const tagAll = async (workspacePath: string, flags: Record<string, any> = {}) =>
    (await load(workspacePath)).report('tag', [[]], { build: false, ...flags });
  const exportAll = async (workspacePath: string) => (await load(workspacePath)).report('export', [[]]);
  const runImport = async (workspacePath: string, ids: string[]) =>
    (await load(workspacePath)).report('import', [ids], { skipDependencyInstallation: true });
  const listLocalScope = async (workspacePath: string) =>
    (await load(workspacePath)).report('list', [], { localScope: true });

  /** the Version object of a component, as "bit cat-component <id>@<version>" prints it */
  async function catComponent(workspacePath: string, name: string, version: string) {
    const { scope, workspace } = await load(workspacePath);
    const compId = await workspace.resolveComponentId(name);
    const legacyScope = scope.legacyScope;
    const modelComponent = await legacyScope.getModelComponent(compId);
    const versionObj = await modelComponent.loadVersion(version, legacyScope.objects);
    return JSON.parse(JSON.stringify(versionObj.toObject()));
  }

  async function expectStatusToBeClean(workspacePath: string) {
    const status = await (await load(workspacePath)).json('status');
    Object.keys(status).forEach((key) => {
      if (['componentsWithIssues', 'currentLaneId', 'forkedLaneId'].includes(key)) return;
      expect(status[key], `status.${key} should be empty`).to.have.lengthOf(0);
    });
  }

  after(async () => {
    await Promise.all(workspaces.map((workspaceData) => destroyWorkspace(workspaceData)));
  });

  describe('a => b, b => a (component A requires B, component B requires A)', () => {
    let remote: WorkspaceData;
    let output: string;
    before(async () => {
      remote = createWorkspace();
      const { workspacePath } = remote;
      writeFiles(workspacePath, { 'comp/a/a.js': fixtureA, 'comp/b/b.js': fixtureB });
      await track(workspacePath, [
        { rootDir: 'comp/a', name: 'comp/a' },
        { rootDir: 'comp/b', name: 'comp/b' },
      ]);
      await linkAndRewire(workspacePath);

      // an intermediate step, make sure it throws when CircularDependencies issue is not ignored.
      // the error lists the issue by its description (e.g. "circular dependencies"), not by its class name
      await expectToReject(() => tagAll(workspacePath), new IssuesClasses.CircularDependencies().description);

      output = await tagAll(workspacePath, { ignoreIssues: 'CircularDependencies' });
    });
    it('should be able to tag both with no errors', () => {
      expect(output).to.have.string('2 component(s) tagged');
    });
    it('should save the dependencies and flattenedDependencies of A correctly', async () => {
      const compA = await catComponent(remote.workspacePath, 'comp/a', '0.0.1');
      expect(compA.dependencies[0].id).to.deep.equal({
        name: 'comp/b',
        scope: remote.remoteScopeName,
        version: '0.0.1',
      });
      expect(compA.flattenedDependencies[0]).to.deep.equal({
        name: 'comp/b',
        scope: remote.remoteScopeName,
        version: '0.0.1',
      });
    });
    it('should save the dependencies and flattenedDependencies of B correctly', async () => {
      const compB = await catComponent(remote.workspacePath, 'comp/b', '0.0.1');
      expect(compB.dependencies[0].id).to.deep.equal({
        name: 'comp/a',
        scope: remote.remoteScopeName,
        version: '0.0.1',
      });
      expect(compB.flattenedDependencies[0]).to.deep.equal({
        name: 'comp/a',
        scope: remote.remoteScopeName,
        version: '0.0.1',
      });
    });
    describe('exporting the component', () => {
      let exportOutput: string;
      before(async () => {
        exportOutput = await exportAll(remote.workspacePath);
      });
      it('should export successfully with no errors', () => {
        expect(exportOutput).to.have.string('exported');
      });
      describe('importing to a new environment', () => {
        let importer: WorkspaceData;
        let importOutput: string;
        before(async () => {
          importer = createWorkspaceWithRemote(remote);
          await runImport(importer.workspacePath, [`${remote.remoteScopeName}/comp/a`]);
          importOutput = await runImport(importer.workspacePath, [`${remote.remoteScopeName}/comp/b`]);
          // the import command skipped the installation, which is also what links the components to each other
          await link(importer.workspacePath);
        });
        it('should import successfully and not throw any error', () => {
          // a previous bug caused to throw an error 'failed running npm install'
          expect(importOutput).to.have.string('successfully imported');
        });
        it('should bring in the components', async () => {
          const list = await listLocalScope(importer.workspacePath);
          expect(list).to.have.string('comp/a');
          expect(list).to.have.string('comp/b');
        });
        it('should not show a clean workspace', async () => {
          await expectStatusToBeClean(importer.workspacePath);
        });
      });
    });
  });

  describe('a complex case with a long chain of dependencies', () => {
    let remote: WorkspaceData;
    let output: string;
    const depId = (name: string) => ({ name, scope: remote.remoteScopeName, version: '0.0.1' });
    before(async () => {
      remote = createWorkspace();
      const { workspacePath } = remote;
      // isString => isType
      writeFiles(workspacePath, {
        'is-type/is-type.js': '',
        'is-string/is-string.js': fixtures.isStringHarmony,
      });
      await track(workspacePath, [
        { rootDir: 'is-type', name: 'utils/is-type' },
        { rootDir: 'is-string', name: 'utils/is-string' },
      ]);
      await linkAndRewire(workspacePath);
      await tagAll(workspacePath);

      // A1 => A2 => A3 (leaf)
      // B1 => B2 => B3 => B4
      // A1 => B1, B2 => A1
      // B4 => is-string => is-type (leaf)
      writeFiles(workspacePath, {
        'comp/A1/index.js': "const A2 = require('../A2'); const B1 = require ('../B1');",
        'comp/A2/index.js': "const A3 = require('../A3')",
        'comp/A3/index.js': "console.log('Im a leaf')",
        'comp/B1/index.js': "const B2 = require('../B2');",
        'comp/B2/index.js': "const B3 = require('../B3'); const A1 = require ('../A1');",
        'comp/B3/index.js': "const B4 = require('../B4')",
        'comp/B4/index.js': "const isString = require('../../is-string/is-string')",
      });
      await track(
        workspacePath,
        ['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'B4'].map((name) => ({
          rootDir: `comp/${name}`,
          name: `comp/${name.toLowerCase()}`,
        }))
      );
      await linkAndRewire(workspacePath);
      output = await tagAll(workspacePath, { ignoreIssues: 'CircularDependencies' });
    });
    it('should be able to tag with no errors', () => {
      expect(output).to.have.string('7 component(s) tagged');
    });
    it('bit insights should show the circular with the correct order: dependent -> dependency', async () => {
      const { json } = await load(remote.workspacePath);
      const parsedResults = await json('insights', ['circular'], {});
      expect(parsedResults[0].data[0]).to.deep.equal([
        `${remote.remoteScopeName}/comp/a1@0.0.1`,
        `${remote.remoteScopeName}/comp/b1@0.0.1`,
        `${remote.remoteScopeName}/comp/b2@0.0.1`,
        `${remote.remoteScopeName}/comp/a1@0.0.1`,
      ]);
    });
    it('leaves (A3 and is-type) should not have any dependency', async () => {
      const leaves = ['comp/a3', 'utils/is-type'];
      for (const leaf of leaves) {
        const catComp = await catComponent(remote.workspacePath, leaf, '0.0.1');
        expect(catComp.dependencies).to.have.lengthOf(0);
        expect(catComp.flattenedDependencies).to.have.lengthOf(0);
      }
    });
    // A2 => A3 (leaf)
    it('A2 should have only A3 as a dependency and flattenedDependency', async () => {
      const A2 = await catComponent(remote.workspacePath, 'comp/a2', '0.0.1');
      expect(A2.dependencies).to.have.lengthOf(1);
      expect(A2.flattenedDependencies).to.have.lengthOf(1);
      expect(A2.dependencies[0].id).to.deep.equal(depId('comp/a3'));
      expect(A2.flattenedDependencies[0]).to.deep.equal(depId('comp/a3'));
    });
    // A1 => A2 => A3 (leaf). A1 => B1. B1 => B2 => B3 => B4.
    it('A1 should have A2 and B1 as direct dependencies, and all the rest as flattenedDependencies', async () => {
      const A1 = await catComponent(remote.workspacePath, 'comp/a1', '0.0.1');
      expect(A1.dependencies).to.have.lengthOf(2);
      const dependenciesIds = A1.dependencies.map((dep) => dep.id);
      expect(dependenciesIds).to.deep.include(depId('comp/a2'));
      expect(dependenciesIds).to.deep.include(depId('comp/b1'));
      expect(A1.flattenedDependencies).to.have.lengthOf(8);
      ['comp/a2', 'comp/a3', 'comp/b1', 'comp/b2', 'comp/b3', 'comp/b4', 'utils/is-type', 'utils/is-string'].forEach(
        (name) => expect(A1.flattenedDependencies).to.deep.include(depId(name))
      );
    });
    // B2 => B3 => B4. B2 => A1. A1 => A2 => A3 (leaf). A1 => B1.
    it('B2 should have A1 and B3 as direct dependencies, and all the rest as flattenedDependencies', async () => {
      const B2 = await catComponent(remote.workspacePath, 'comp/b2', '0.0.1');
      expect(B2.dependencies).to.have.lengthOf(2);
      const dependenciesIds = B2.dependencies.map((dep) => dep.id);
      expect(dependenciesIds).to.deep.include(depId('comp/b3'));
      expect(dependenciesIds).to.deep.include(depId('comp/a1'));
      expect(B2.flattenedDependencies).to.have.lengthOf(8);
      ['comp/a1', 'comp/a2', 'comp/a3', 'comp/b1', 'comp/b3', 'comp/b4', 'utils/is-type', 'utils/is-string'].forEach(
        (name) => expect(B2.flattenedDependencies).to.deep.include(depId(name))
      );
    });
    // B1 => B2 => B3 => B4. B2 => A1. A1 => A2 => A3 (leaf)
    it('B1 should have B2 as direct dependencies, and all the rest as flattenedDependencies', async () => {
      const B1 = await catComponent(remote.workspacePath, 'comp/b1', '0.0.1');
      expect(B1.dependencies).to.have.lengthOf(1);
      const dependenciesIds = B1.dependencies.map((dep) => dep.id);
      expect(dependenciesIds).to.deep.include(depId('comp/b2'));
      expect(B1.flattenedDependencies).to.have.lengthOf(8);
      ['comp/a1', 'comp/a2', 'comp/a3', 'comp/b2', 'comp/b3', 'comp/b4', 'utils/is-type', 'utils/is-string'].forEach(
        (name) => expect(B1.flattenedDependencies).to.deep.include(depId(name))
      );
    });
    // B3 => B4 => is-string => is-type (leaf)
    it('B3 should have B4 as direct dependencies, and B4, is-type, is-string as flattenedDependencies', async () => {
      const B3 = await catComponent(remote.workspacePath, 'comp/b3', '0.0.1');
      expect(B3.dependencies).to.have.lengthOf(1);
      const dependenciesIds = B3.dependencies.map((dep) => dep.id);
      expect(dependenciesIds).to.deep.include(depId('comp/b4'));
      expect(B3.flattenedDependencies).to.have.lengthOf(3);
      ['comp/b4', 'utils/is-type', 'utils/is-string'].forEach((name) =>
        expect(B3.flattenedDependencies).to.deep.include(depId(name))
      );
    });
    // B4 => is-string => is-type (leaf)
    it('B4 should have is-string as a direct dependency, and is-type, is-string as flattenedDependencies', async () => {
      const B4 = await catComponent(remote.workspacePath, 'comp/b4', '0.0.1');
      expect(B4.dependencies).to.have.lengthOf(1);
      const dependenciesIds = B4.dependencies.map((dep) => dep.id);
      expect(dependenciesIds).to.deep.include(depId('utils/is-string'));
      expect(B4.flattenedDependencies).to.have.lengthOf(2);
      expect(B4.flattenedDependencies).to.deep.include(depId('utils/is-type'));
      expect(B4.flattenedDependencies).to.deep.include(depId('utils/is-string'));
    });
    describe('exporting the component', () => {
      let exportOutput: string;
      before(async () => {
        exportOutput = await exportAll(remote.workspacePath);
      });
      it('should export successfully with no errors', () => {
        expect(exportOutput).to.have.string('exported');
      });
      describe('importing to a new environment', () => {
        let importer: WorkspaceData;
        let importOutput: string;
        before(async () => {
          importer = createWorkspaceWithRemote(remote);
          importOutput = await runImport(importer.workspacePath, [`${remote.remoteScopeName}/comp/a1`]);
        });
        it('should import successfully and not throw any error', () => {
          // a previous bug caused to throw an error 'failed running npm install'
          expect(importOutput).to.have.string('successfully imported');
        });
        it('should bring in the components', async () => {
          const list = await listLocalScope(importer.workspacePath);
          expect(list).to.have.string('comp/a1');
        });
        it('bit status should the circular dependency issue', async () => {
          const status = await (await load(importer.workspacePath)).report('status');
          expect(status).to.have.string('issues found');
          expect(status).to.have.string('circular dependencies');
        });
      });
    });
  });

  describe('same component require itself using module path', () => {
    let remote: WorkspaceData;
    before(async () => {
      remote = createWorkspace();
      const { workspacePath } = remote;
      writeFiles(workspacePath, { 'bar/foo.js': fixtures.fooFixture });
      await track(workspacePath, [{ rootDir: 'bar', name: 'bar/foo' }]);
      await tagAll(workspacePath);
      await exportAll(workspacePath);
      // after export, the author now has a link from node_modules.
      writeFiles(workspacePath, { 'bar/foo.js': `require('@${remote.remoteScopeName}/bar.foo');` });
    });
    it('should block the tag by default', async () => {
      await expectToReject(() => tagAll(remote.workspacePath));
    });
    it('should tag successfully with --ignore-issues flag and should not save the component itself as a dependency', async () => {
      const tagOutput = await tagAll(remote.workspacePath, { ignoreIssues: 'SelfReference' });
      // we had a bug where this was leading to an error "unable to save Version object, it has dependencies but its flattenedDependencies is empty"
      expect(tagOutput).to.have.string('1 component(s) tagged');

      const catComponent_ = await catComponent(remote.workspacePath, 'bar/foo', '0.0.2');
      expect(catComponent_.dependencies).to.be.lengthOf(0);
    });
  });
});
