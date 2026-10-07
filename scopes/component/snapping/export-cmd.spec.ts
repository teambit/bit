import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';
import { parse } from 'comment-json';
import stripAnsi from 'strip-ansi';
import { loadManyAspects } from '@teambit/harmony.testing.load-aspect';
import type { WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockWorkspace, destroyWorkspace } from '@teambit/workspace.testing.mock-workspace';
import { mockComponents } from '@teambit/component.testing.mock-components';
import { WorkspaceAspect } from '@teambit/workspace';
import type { ScopeMain } from '@teambit/scope';
import { ScopeAspect } from '@teambit/scope';
import type { CLIMain } from '@teambit/cli';
import { CLIAspect } from '@teambit/cli';
import { ExportAspect } from '@teambit/export';
import { ImporterAspect } from '@teambit/importer';
import type { ImporterMain } from '@teambit/importer';
import { ComponentAspect } from '@teambit/component';
import type { SnappingMain } from './snapping.main.runtime';
import { SnappingAspect } from './snapping.aspect';

/**
 * "bit export" flows. they live in the snapping aspect rather than next to the command in the export aspect, since
 * tagging needs this aspect, and the export aspect must not depend on it.
 */

const isWin = process.platform === 'win32';

/**
 * a fresh harmony per call, to simulate a new process running a new command.
 */
async function loadWorkspace(workspacePath: string) {
  const harmony = await loadManyAspects(
    [WorkspaceAspect, SnappingAspect, ExportAspect, ImporterAspect, ComponentAspect, ScopeAspect],
    workspacePath
  );
  const cli = harmony.get<CLIMain>(CLIAspect.id);
  const runCmd = async (name: string, args: string[], flags: Record<string, any> = {}): Promise<string> => {
    const cmd = cli.getCommand(name);
    if (!cmd?.report) throw new Error(`the "${name}" command is not registered`);
    return stripAnsi((await cmd.report(args as any, flags)) as string);
  };
  return {
    snapping: harmony.get<SnappingMain>(SnappingAspect.id),
    importer: harmony.get<ImporterMain>(ImporterAspect.id),
    scope: harmony.get<ScopeMain>(ScopeAspect.id),
    exportCmd: (ids: string[] = [], flags: Record<string, any> = {}) => runCmd('export', [ids as any], flags),
    show: (id: string) => runCmd('show', [id as any], {}),
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

async function tag(workspacePath: string, params: { version?: string; unmodified?: boolean } = {}) {
  const { snapping } = await loadWorkspace(workspacePath);
  await snapping.tag({ build: false, ...params });
}

function readBitMap(workspacePath: string) {
  return parse(fs.readFileSync(path.join(workspacePath, '.bitmap'), 'utf8')) as any;
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

async function setRemoteGroupName(remoteScopePath: string, groupName: string) {
  const scopeJsonPath = path.join(remoteScopePath, 'scope.json');
  const scopeJson = await fs.readJson(scopeJsonPath);
  scopeJson.groupName = groupName;
  await fs.writeJson(scopeJsonPath, scopeJson);
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

describe('bit export', function () {
  this.timeout(0);

  describe('with no components to export', () => {
    let workspaceData: WorkspaceData;
    before(() => {
      workspaceData = mockWorkspace();
    });
    after(async () => {
      await destroyWorkspace(workspaceData);
    });
    it('should print nothing to export', async () => {
      const { exportCmd } = await loadWorkspace(workspaceData.workspacePath);
      expect(await exportCmd()).to.include('nothing to export');
    });
  });

  describe('with multiple versions', () => {
    let workspaceData: WorkspaceData;
    before(async () => {
      workspaceData = mockWorkspace();
      const { workspacePath } = workspaceData;
      await mockComponents(workspacePath);
      await tag(workspacePath, { version: '0.0.1' });
      await (await loadWorkspace(workspacePath)).exportCmd(['comp1']);
      await tag(workspacePath, { unmodified: true });
      await (await loadWorkspace(workspacePath)).exportCmd(['comp1']);
    });
    after(async () => {
      await destroyWorkspace(workspaceData);
    });
    it('should export it with no errors', async () => {
      const { scope } = await loadWorkspace(workspaceData.workspacePath);
      const remoteIds = await scope.listRemoteScope(workspaceData.remoteScopeName);
      expect(remoteIds).to.have.lengthOf(1);
      expect(remoteIds[0].toStringWithoutVersion()).to.equal(`${workspaceData.remoteScopeName}/comp1`);
      expect(remoteIds[0].version).to.equal('0.0.2'); // this is the version
    });
  });

  describe('imported (v1), exported (v2) and then exported again (v3)', () => {
    let workspaceData: WorkspaceData;
    let importingWorkspaceData: WorkspaceData;
    before(async () => {
      workspaceData = mockWorkspace();
      await mockComponents(workspaceData.workspacePath);
      await tag(workspaceData.workspacePath, { version: '0.0.1' });
      await (await loadWorkspace(workspaceData.workspacePath)).exportCmd(); // v1

      importingWorkspaceData = mockWorkspace();
      const { workspacePath } = importingWorkspaceData;
      await addRemote(workspacePath, workspaceData);
      const { importer } = await loadWorkspace(workspacePath);
      const originalCwd = process.cwd();
      process.chdir(workspacePath); // writeToPath is resolved against the cwd
      try {
        await importer.import({
          ids: [`${workspaceData.remoteScopeName}/comp1`],
          writeToPath: 'components/comp1',
          installNpmPackages: false,
          writeConfigFiles: false,
        });
      } finally {
        process.chdir(originalCwd);
      }

      const filePath = path.join(workspacePath, 'components', 'comp1', 'index.js');
      await fs.writeFile(filePath, 'console.log("got comp1 v2")');
      await tag(workspacePath);
      await (await loadWorkspace(workspacePath)).exportCmd(); // v2

      await fs.writeFile(filePath, 'console.log("got comp1 v3")');
      await tag(workspacePath);
      await (await loadWorkspace(workspacePath)).exportCmd(); // v3
    });
    after(async () => {
      await destroyWorkspace(workspaceData);
      await destroyWorkspace(importingWorkspaceData);
    });
    it('should export it with no errors', async () => {
      const { scope } = await loadWorkspace(importingWorkspaceData.workspacePath);
      const remoteIds = await scope.listRemoteScope(workspaceData.remoteScopeName);
      expect(remoteIds.map((id) => id.toString())).to.include(`${workspaceData.remoteScopeName}/comp1@0.0.3`);
    });
  });

  describe('with a PNG file', () => {
    let workspaceData: WorkspaceData;
    let pngSize: number;
    let destPngFile: string;
    before(async () => {
      workspaceData = mockWorkspace();
      const { workspacePath } = workspaceData;
      await mockComponents(workspacePath);
      const sourcePngFile = path.join(__dirname, '..', '..', '..', 'e2e', 'fixtures', 'png_fixture.png');
      destPngFile = path.join(workspacePath, 'comp1', 'png_fixture.png');
      await fs.copy(sourcePngFile, destPngFile);
      pngSize = (await fs.stat(destPngFile)).size;
      await tag(workspacePath);
      await (await loadWorkspace(workspacePath)).exportCmd();
    });
    after(async () => {
      await destroyWorkspace(workspaceData);
    });
    it('should export it with no errors', async () => {
      const { scope } = await loadWorkspace(workspaceData.workspacePath);
      const remoteIds = await scope.listRemoteScope(workspaceData.remoteScopeName);
      expect(remoteIds).to.have.lengthOf(1);
      expect(remoteIds[0].toStringWithoutVersion()).to.equal(`${workspaceData.remoteScopeName}/comp1`);
    });
    describe('after importing the file', () => {
      before(async () => {
        const { importer } = await loadWorkspace(workspaceData.workspacePath);
        await importer.import({
          ids: [`${workspaceData.remoteScopeName}/comp1`],
          installNpmPackages: false,
          writeConfigFiles: false,
        });
      });
      it('the size of the binary file should not be changed', async () => {
        const currentSize = (await fs.stat(destPngFile)).size;
        expect(currentSize).to.equal(pngSize);
      });
    });
  });

  describe('export a component, do not modify it and export again to the same scope', () => {
    let workspaceData: WorkspaceData;
    let output: string;
    before(async () => {
      workspaceData = mockWorkspace();
      const { workspacePath } = workspaceData;
      await mockComponents(workspacePath);
      await tag(workspacePath);
      await (await loadWorkspace(workspacePath)).exportCmd(['comp1']);
      output = await (await loadWorkspace(workspacePath)).exportCmd(['comp1']);
    });
    after(async () => {
      await destroyWorkspace(workspaceData);
    });
    it('should not export the component', () => {
      expect(output).to.have.string('nothing to export');
    });
  });

  describe('export a component when the checked out version is not the latest', () => {
    let workspaceData: WorkspaceData;
    let compFile: string;
    before(async () => {
      workspaceData = mockWorkspace();
      const { workspacePath } = workspaceData;
      compFile = path.join(workspacePath, 'comp1', 'index.js');
      await mockComponents(workspacePath);
      await fs.writeFile(compFile, '// v2');
      await tag(workspacePath, { unmodified: true, version: '2.0.0' });
      await (await loadWorkspace(workspacePath)).exportCmd();
      await fs.writeFile(compFile, '// v1');
      await tag(workspacePath, { unmodified: true, version: '1.0.0' });
      await (await loadWorkspace(workspacePath)).exportCmd();
    });
    after(async () => {
      await destroyWorkspace(workspaceData);
    });
    it('.bitmap should keep the current version and do not update to the latest version', () => {
      const bitMap = readBitMap(workspaceData.workspacePath);
      expect(bitMap.comp1.version).to.equal('1.0.0');
    });
    it('bit show should display the component with the current version, not the latest', async () => {
      const { show } = await loadWorkspace(workspaceData.workspacePath);
      const output = await show('comp1');
      expect(output).to.have.string('1.0.0');
      expect(output).to.not.have.string('2.0.0');
    });
    it('the file content should not be changed', async () => {
      expect(await fs.readFile(compFile, 'utf8')).to.equal('// v1');
    });
  });

  // each case has its own remote, because the scope.json of a remote is cached in-process (unlike in separate processes)
  describe('applying permissions on the remote scope when was init with shared flag', () => {
    const setupWorkspace = async (groupName: string) => {
      const workspaceData = mockWorkspace();
      await mockComponents(workspaceData.workspacePath);
      await tag(workspaceData.workspacePath);
      await setRemoteGroupName(workspaceData.remoteScopePath, groupName);
      return workspaceData;
    };
    describe('when the group name does not exist', () => {
      let workspaceData: WorkspaceData;
      before(async () => {
        workspaceData = await setupWorkspace('nonExistGroup');
      });
      after(async () => {
        await destroyWorkspace(workspaceData);
      });
      it('should throw an error indicating that the group does not exist (unless it is Windows)', async () => {
        const { exportCmd } = await loadWorkspace(workspaceData.workspacePath);
        if (isWin) {
          expect(await exportCmd()).to.have.string('exported components (1)');
        } else {
          await expectToReject(() => exportCmd(), 'unable to resolve group id of "nonExistGroup"');
        }
      });
    });
    describe('when the group exists and the current user has permission to that group', function () {
      let workspaceData: WorkspaceData;
      before(async function () {
        if (isWin) return this.skip();
        workspaceData = await setupWorkspace(execSync('id -gn').toString().trim());
      });
      after(async () => {
        if (workspaceData) await destroyWorkspace(workspaceData);
      });
      it('should export the component successfully and change the owner to that group', async () => {
        const { exportCmd } = await loadWorkspace(workspaceData.workspacePath);
        expect(await exportCmd()).to.have.string('exported components (1)');
      });
    });
  });

  describe('export after re-creating the remote', () => {
    let workspaceData: WorkspaceData;
    const listRemote = async () => {
      const { scope } = await loadWorkspace(workspaceData.workspacePath);
      return scope.listRemoteScope(workspaceData.remoteScopeName);
    };
    before(async () => {
      workspaceData = mockWorkspace();
      const { workspacePath } = workspaceData;
      await mockComponents(workspacePath);
      await tag(workspacePath);
      await (await loadWorkspace(workspacePath)).exportCmd();
      await reInitRemoteScope(workspaceData.remoteScopePath);
    });
    after(async () => {
      await destroyWorkspace(workspaceData);
    });
    describe('export without any flag', () => {
      it('should show a message that nothing to export', async () => {
        const { exportCmd } = await loadWorkspace(workspaceData.workspacePath);
        expect(await exportCmd()).to.have.string('nothing to export');
      });
    });
    describe('export with --all flag', () => {
      before(async () => {
        await reInitRemoteScope(workspaceData.remoteScopePath);
        const { exportCmd } = await loadWorkspace(workspaceData.workspacePath);
        await exportCmd([workspaceData.remoteScopeName, `${workspaceData.remoteScopeName}/*`], { all: true });
      });
      it('should export them successfully', async () => {
        expect(await listRemote()).to.have.lengthOf(1);
      });
    });
    describe('export with --all-versions flag', () => {
      before(async () => {
        await reInitRemoteScope(workspaceData.remoteScopePath);
        const { exportCmd } = await loadWorkspace(workspaceData.workspacePath);
        await exportCmd([workspaceData.remoteScopeName, `${workspaceData.remoteScopeName}/*`], { allVersions: true });
      });
      it('should export them successfully', async () => {
        expect(await listRemote()).to.have.lengthOf(1);
      });
    });
  });

  describe('re-export using the component name without the scope name', () => {
    let workspaceData: WorkspaceData;
    let output: string;
    before(async () => {
      workspaceData = mockWorkspace();
      const { workspacePath } = workspaceData;
      await mockComponents(workspacePath);
      await tag(workspacePath);
      await (await loadWorkspace(workspacePath)).exportCmd();
      await tag(workspacePath, { unmodified: true });
      await (await loadWorkspace(workspacePath)).exportCmd();
      await tag(workspacePath, { unmodified: true });
      output = await (await loadWorkspace(workspacePath)).exportCmd(['comp1']);
    });
    after(async () => {
      await destroyWorkspace(workspaceData);
    });
    // this was a bug where on the third export, it parses the id "comp1" as: { scope: comp1, name: ... }
    it('should not show the "fork" prompt', () => {
      expect(output).to.have.string('exported components (1)');
    });
  });
});
