import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import stripAnsi from 'strip-ansi';
import { parse } from 'comment-json';
import { loadManyAspects } from '@teambit/harmony.testing.load-aspect';
import type { WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockWorkspace, destroyWorkspace } from '@teambit/workspace.testing.mock-workspace';
import { mockComponents } from '@teambit/component.testing.mock-components';
import { MergeConflict, MergeConflictOnRemote } from '@teambit/legacy.scope';
import { WorkspaceAspect } from '@teambit/workspace';
import type { Workspace } from '@teambit/workspace';
import type { CLIMain } from '@teambit/cli';
import { CLIAspect } from '@teambit/cli';
import type { ExportMain } from '@teambit/export';
import { ExportAspect } from '@teambit/export';
import { ImporterAspect } from '@teambit/importer';
import type { SnappingMain } from './snapping.main.runtime';
import { SnappingAspect } from './snapping.aspect';

/**
 * merging on import: re-exporting/importing a version that exists on the remote, and "bit import --merge".
 * it lives in the snapping aspect, since authoring needs tag and the importer cannot depend on it.
 */

const isType = "module.exports = function isType() { return 'got is-type'; };";
const isTypeV2 = "module.exports = function isType() { return 'got is-type v2'; };";
const isTypeV3 = "module.exports = function isType() { return 'got is-type v3'; };";

describe('merge functionality', function () {
  this.timeout(0);

  const workspaces: WorkspaceData[] = [];

  /** a workspace with its own bare scope. the scope is where components get exported to */
  function createWorkspace(): WorkspaceData {
    const workspaceData = mockWorkspace();
    workspaces.push(workspaceData);
    return workspaceData;
  }

  /** a workspace that has the scope of `remote` as a remote, which is what `bit remote add` does */
  function createWorkspaceWithRemote(remote: WorkspaceData): WorkspaceData {
    const workspaceData = createWorkspace();
    const scopeJsonPath = path.join(workspaceData.workspacePath, '.bit', 'scope.json');
    const scopeJson = fs.readJsonSync(scopeJsonPath);
    scopeJson.remotes = { ...scopeJson.remotes, [remote.remoteScopeName]: `file://${remote.remoteScopePath}` };
    fs.writeJsonSync(scopeJsonPath, scopeJson, { spaces: 2 });
    return workspaceData;
  }

  /** a fresh harmony per call, as a new process */
  const load = (workspacePath: string) =>
    loadManyAspects([WorkspaceAspect, SnappingAspect, ExportAspect, ImporterAspect, CLIAspect], workspacePath);

  async function tag(workspacePath: string, params: { ids?: string[]; unmodified?: boolean } = {}) {
    const harmony = await load(workspacePath);
    await harmony.get<SnappingMain>(SnappingAspect.id).tag({ build: false, ...params });
  }

  async function exportAll(workspacePath: string) {
    const harmony = await load(workspacePath);
    await harmony.get<ExportMain>(ExportAspect.id).export();
  }

  /** run "bit import" the way a new process would: from the workspace dir, with a fresh harmony */
  async function runImport(workspacePath: string, ids: string[], flags: Record<string, any> = {}): Promise<string> {
    const harmony = await load(workspacePath);
    const importCmd = harmony.get<CLIMain>(CLIAspect.id).getCommand('import');
    if (!importCmd?.report) throw new Error('the "import" command is not registered');
    const originalCwd = process.cwd();
    process.chdir(workspacePath);
    try {
      return stripAnsi((await importCmd.report([ids], flags)) as string);
    } finally {
      process.chdir(originalCwd);
    }
  }

  async function getModifiedIds(workspacePath: string): Promise<string[]> {
    const harmony = await load(workspacePath);
    const modified = await harmony.get<Workspace>(WorkspaceAspect.id).modified();
    return modified.map((comp) => comp.id.toStringWithoutVersion());
  }

  /** chai has no async throw assertion that also matches a message */
  async function expectToReject(fn: () => Promise<unknown>, messagePart: string) {
    try {
      await fn();
    } catch (err: any) {
      const message = stripAnsi(err.message);
      expect(message).to.have.string(messagePart);
      expect(message).to.not.have.string('unhandled rejection found');
      return;
    }
    throw new Error(`expected to reject with "${messagePart}", but it resolved`);
  }

  /** .bitmap opens with a comment banner */
  const readBitMap = (workspacePath: string): Record<string, any> =>
    parse(fs.readFileSync(path.join(workspacePath, '.bitmap'), 'utf8'), undefined, true) as Record<string, any>;

  after(async () => {
    await Promise.all(workspaces.map((workspaceData) => destroyWorkspace(workspaceData)));
  });

  describe('re-exporting/importing an existing version', () => {
    let remote: WorkspaceData;
    let remoteName: string;
    let workspacePath: string;
    before(async () => {
      remote = createWorkspace();
      remoteName = remote.remoteScopeName;
      await mockComponents(remote.workspacePath, { numOfComponents: 2 });
      await tag(remote.workspacePath);
      await exportAll(remote.workspacePath);

      // two workspaces having v1. the first tags and exports v2, the second tags its own v2
      const exporter = createWorkspaceWithRemote(remote);
      await runImport(exporter.workspacePath, [`${remoteName}/comp1`, `${remoteName}/comp2`]);
      const importer = createWorkspaceWithRemote(remote);
      await runImport(importer.workspacePath, [`${remoteName}/comp1`, `${remoteName}/comp2`]);
      workspacePath = importer.workspacePath;

      await tag(exporter.workspacePath, { unmodified: true });
      await exportAll(exporter.workspacePath); // v2 is exported
      await tag(workspacePath, { unmodified: true });
    });
    it('should throw MergeConflictOnRemote error when exporting the component', async () => {
      const idsAndVersions = [
        { id: `${remoteName}/comp1`, versions: ['0.0.2'] },
        { id: `${remoteName}/comp2`, versions: ['0.0.2'] },
      ];
      const error = new MergeConflictOnRemote(idsAndVersions, []);
      await expectToReject(() => exportAll(workspacePath), stripAnsi(error.message));
    });
    it('should throw MergeConflict error when importing the component', async () => {
      const error = new MergeConflict(`${remoteName}/comp1`, ['0.0.2']);
      await expectToReject(() => runImport(workspacePath, [`${remoteName}/comp1`]), stripAnsi(error.message));
    });
  });

  describe('importing a component with --merge flag', () => {
    let remote: WorkspaceData;
    let remoteName: string;
    before(async () => {
      remote = createWorkspace();
      remoteName = remote.remoteScopeName;
      await mockComponents(remote.workspacePath, { numOfComponents: 2 });
      fs.outputFileSync(path.join(remote.workspacePath, 'comp2/is-type.js'), isType);
      await tag(remote.workspacePath);
      fs.outputFileSync(path.join(remote.workspacePath, 'comp2/is-type.js'), isTypeV2);
      await tag(remote.workspacePath);
      await exportAll(remote.workspacePath);
    });

    /** a workspace with comp2@0.0.1 imported into components/comp2 */
    async function createImporterWithComp2V1(): Promise<string> {
      const { workspacePath } = createWorkspaceWithRemote(remote);
      await runImport(workspacePath, [`${remoteName}/comp2@0.0.1`], { path: 'components/comp2' });
      return workspacePath;
    }
    const isTypePath = (workspacePath: string) => path.join(workspacePath, 'components/comp2/is-type.js');

    describe('using invalid value for merge flag', () => {
      it('should throw an error', async () => {
        const workspacePath = await createImporterWithComp2V1();
        await expectToReject(
          () => runImport(workspacePath, [`${remoteName}/comp2`], { merge: 'invalid' }),
          'merge must be one of the following'
        );
      });
    });

    describe('modifying the component so it will get conflict upon importing', () => {
      async function createConflictingWorkspace(): Promise<string> {
        const workspacePath = await createImporterWithComp2V1();
        fs.outputFileSync(isTypePath(workspacePath), isTypeV3);
        return workspacePath;
      }
      describe('merge with strategy=manual', () => {
        let workspacePath: string;
        let output: string;
        let fileContent: string;
        before(async () => {
          workspacePath = await createConflictingWorkspace();
          output = await runImport(workspacePath, [`${remoteName}/comp2`], { merge: 'manual' });
          fileContent = fs.readFileSync(isTypePath(workspacePath), 'utf8');
        });
        it('should indicate that there were files with conflicts', () => {
          expect(output).to.have.string('conflicts');
        });
        it('should rewrite the file with the conflicts segments labeled according to the versions', () => {
          expect(fileContent).to.have.string('<<<<<<< 0.0.1 modified'); // current-change
          expect(fileContent).to.have.string('=======');
          expect(fileContent).to.have.string('>>>>>>> 0.0.2'); // incoming-change
        });
        it('should show the component as modified and update bitmap with the imported version', async () => {
          expect(await getModifiedIds(workspacePath)).to.include(`${remoteName}/comp2`);
          expect(readBitMap(workspacePath).comp2.version).to.equal('0.0.2');
        });
      });
      describe('merge with strategy=theirs', () => {
        let workspacePath: string;
        let output: string;
        let fileContent: string;
        before(async () => {
          workspacePath = await createConflictingWorkspace();
          output = await runImport(workspacePath, [`${remoteName}/comp2`], { merge: 'theirs' });
          fileContent = fs.readFileSync(isTypePath(workspacePath), 'utf8');
        });
        it('should not indicate that there were files with conflicts', () => {
          expect(output).to.not.have.string('conflicts');
        });
        it('should rewrite the file according to the imported version', () => {
          expect(fileContent).to.have.string(isTypeV2);
        });
        it('should not show the component as modified and update bitmap with the imported version', async () => {
          expect(await getModifiedIds(workspacePath)).to.not.include(`${remoteName}/comp2`);
          expect(readBitMap(workspacePath).comp2.version).to.equal('0.0.2');
        });
      });
      describe('merge with strategy=ours', () => {
        let workspacePath: string;
        let output: string;
        let fileContent: string;
        before(async () => {
          workspacePath = await createConflictingWorkspace();
          output = await runImport(workspacePath, [`${remoteName}/comp2`], { merge: 'ours' });
          fileContent = fs.readFileSync(isTypePath(workspacePath), 'utf8');
        });
        it('should not indicate that there were files with conflicts', () => {
          expect(output).to.not.have.string('conflicts');
        });
        it('should leave the modified file intact', () => {
          expect(fileContent).to.have.string(isTypeV3);
        });
        it('should show the component as modified', async () => {
          expect(await getModifiedIds(workspacePath)).to.include(`${remoteName}/comp2`);
        });
        it('should update bitmap with the imported version', () => {
          expect(readBitMap(workspacePath).comp2.version).to.equal('0.0.2');
        });
      });
    });

    describe('modifying the component to be the same as the imported component (so the merge will succeed with no conflicts)', () => {
      describe('merge with strategy=manual', () => {
        // strategies of ours and theirs are leading to the same results
        let workspacePath: string;
        let output: string;
        let fileContent: string;
        before(async () => {
          // same state as the e2e flow: the component was already merged (ours) into the latest version
          workspacePath = await createImporterWithComp2V1();
          fs.outputFileSync(isTypePath(workspacePath), isTypeV3);
          await runImport(workspacePath, [`${remoteName}/comp2`], { merge: 'ours' });
          fs.outputFileSync(isTypePath(workspacePath), isTypeV2);
          output = await runImport(workspacePath, [`${remoteName}/comp2`], { merge: 'manual' });
          fileContent = fs.readFileSync(isTypePath(workspacePath), 'utf8');
        });
        it('should not indicate that there were files with conflicts', () => {
          expect(output).to.not.have.string('conflicts');
        });
        it('should rewrite the file according to both the imported version and modified version', () => {
          expect(fileContent).to.have.string(isTypeV2);
        });
        it('should not show the component as modified', async () => {
          expect(await getModifiedIds(workspacePath)).to.not.include(`${remoteName}/comp2`);
        });
      });
    });

    describe('modifying the dependency then import --merge of the dependent', () => {
      let workspacePath: string;
      before(async () => {
        workspacePath = createWorkspaceWithRemote(remote).workspacePath;
        await runImport(workspacePath, [`${remoteName}/comp2@0.0.1`], { path: 'components/comp2' });
        await runImport(workspacePath, [`${remoteName}/comp1@0.0.1`], { path: 'components/comp1' });
        fs.outputFileSync(isTypePath(workspacePath), isTypeV3);
        // an intermediate step, make sure the component shows as modified
        expect(await getModifiedIds(workspacePath)).to.include(`${remoteName}/comp2`);
        await runImport(workspacePath, [`${remoteName}/comp1`], { merge: true });
      });
      it('should not remove the dependency changes', async () => {
        expect(fs.readFileSync(isTypePath(workspacePath), 'utf8')).to.equal(isTypeV3);
        expect(await getModifiedIds(workspacePath)).to.include(`${remoteName}/comp2`);
      });
    });
  });
});
