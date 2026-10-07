import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import stripAnsi from 'strip-ansi';
import { parse } from 'comment-json';
import { loadManyAspects } from '@teambit/harmony.testing.load-aspect';
import type { WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockWorkspace, destroyWorkspace } from '@teambit/workspace.testing.mock-workspace';
import type { Workspace } from '@teambit/workspace';
import { WorkspaceAspect } from '@teambit/workspace';
import type { CLIMain } from '@teambit/cli';
import { CLIAspect } from '@teambit/cli';
import type { TrackerMain } from '@teambit/tracker';
import { TrackerAspect } from '@teambit/tracker';
import type { ExportMain } from '@teambit/export';
import { ExportAspect } from '@teambit/export';
import { ImporterAspect } from '@teambit/importer';
import { MoverAspect } from '@teambit/mover';
import type { SnappingMain } from './snapping.main.runtime';
import { SnappingAspect } from './snapping.aspect';

/**
 * the "bit move" command. it lives in the snapping aspect since the flows need tag/export/import,
 * and the mover cannot depend on them (component-writer depends on the mover).
 */
describe('bit move command', function () {
  this.timeout(0);

  const workspaces: WorkspaceData[] = [];

  function createWorkspace(files: Record<string, string> = {}): WorkspaceData {
    const workspaceData = mockWorkspace();
    workspaces.push(workspaceData);
    Object.entries(files).forEach(([filePath, content]) =>
      fs.outputFileSync(path.join(workspaceData.workspacePath, filePath), content)
    );
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

  /** run from the workspace dir, as a shell does, since the paths are resolved against the cwd */
  async function inWorkspace<T>(workspacePath: string, fn: () => Promise<T>): Promise<T> {
    const originalCwd = process.cwd();
    process.chdir(workspacePath);
    try {
      return await fn();
    } finally {
      process.chdir(originalCwd);
    }
  }

  async function trackBar(workspacePath: string, trackOpts: { main?: string } = {}) {
    const harmony = await loadManyAspects([WorkspaceAspect, TrackerAspect], workspacePath);
    await harmony
      .get<TrackerMain>(TrackerAspect.id)
      .track({ rootDir: 'bar', componentName: 'bar/foo', mainFile: trackOpts.main });
    await harmony.get<Workspace>(WorkspaceAspect.id).bitMap.write('track');
  }

  /** a fresh harmony per call, as a new process */
  async function runMove(workspacePath: string, from: string, to: string): Promise<string> {
    const harmony = await loadManyAspects([WorkspaceAspect, MoverAspect, CLIAspect], workspacePath);
    const moveCmd = harmony.get<CLIMain>(CLIAspect.id).getCommand('move');
    if (!moveCmd?.report) throw new Error('the "move" command is not registered');
    return inWorkspace(workspacePath, async () => stripAnsi((await moveCmd.report!([from, to], {})) as string));
  }

  /** .bitmap opens with a comment banner */
  const readBitMap = (workspacePath: string): Record<string, any> =>
    parse(fs.readFileSync(path.join(workspacePath, '.bitmap'), 'utf8'), undefined, true) as Record<string, any>;

  /** the real files of the workspace (not symlinks), relative to it, excluding node_modules and the bit internals */
  const getConsumerFiles = (workspacePath: string): string[] =>
    (fs.readdirSync(workspacePath, { recursive: true }) as string[])
      .map((file) => path.normalize(file))
      .filter((file) => !/^(\.bit|\.git|node_modules)/.test(file))
      // files at the workspace root (config, package.json, etc.) are not component files
      .filter((file) => file.includes(path.sep))
      .filter((file) => fs.lstatSync(path.join(workspacePath, file)).isFile());

  after(async () => {
    await Promise.all(workspaces.map((workspaceData) => destroyWorkspace(workspaceData)));
  });

  describe('move a directory', () => {
    let workspacePath: string;
    before(async () => {
      workspacePath = createWorkspace({
        'bar/foo1.js': '',
        'bar/foo2.js': '',
        'bar/foo1.spec.js': '',
      }).workspacePath;
      await trackBar(workspacePath, { main: path.normalize('foo1.js') });
      await runMove(workspacePath, 'bar', 'utils');
    });
    it('should move physically the directory', () => {
      const sourceFiles = getConsumerFiles(workspacePath);
      expect(sourceFiles).to.not.be.empty;
      sourceFiles.forEach((file) => {
        expect(file.startsWith('utils'), `checking file: ${file}`).to.be.true;
      });
    });
    it('should update the rootDir of bit.map', () => {
      expect(readBitMap(workspacePath)['bar/foo'].rootDir).to.equal('utils');
    });
  });

  describe('when the destination starts with the source dir', () => {
    it('should not throw an error saying the path is not a directory', async () => {
      const { workspacePath } = createWorkspace({ 'bar/foo.js': 'module.exports = "foo";\n' });
      await trackBar(workspacePath);
      const output = await runMove(workspacePath, 'bar', 'bar2');
      expect(output).to.have.string('moved component');
    });
  });

  describe('move root directory after import', () => {
    const oldPath = path.join('components', 'bar');
    const newPath = path.join('components', 'utils');
    let workspacePath: string;
    before(async () => {
      const remote = createWorkspace({ 'bar/foo.js': 'module.exports = "foo";\n' });
      const remoteHarmony = await loadManyAspects(
        [WorkspaceAspect, TrackerAspect, SnappingAspect, ExportAspect],
        remote.workspacePath
      );
      await remoteHarmony.get<TrackerMain>(TrackerAspect.id).track({ rootDir: 'bar', componentName: 'bar/foo' });
      await remoteHarmony.get<SnappingMain>(SnappingAspect.id).tag({ build: false });
      await remoteHarmony.get<ExportMain>(ExportAspect.id).export();

      workspacePath = createWorkspaceWithRemote(remote).workspacePath;
      const importHarmony = await loadManyAspects([WorkspaceAspect, ImporterAspect, CLIAspect], workspacePath);
      const importCmd = importHarmony.get<CLIMain>(CLIAspect.id).getCommand('import');
      if (!importCmd?.report) throw new Error('the "import" command is not registered');
      await inWorkspace(workspacePath, async () =>
        importCmd.report!([[`${remote.remoteScopeName}/bar/foo`]], { path: 'components/bar' })
      );
      await runMove(workspacePath, oldPath, newPath);
    });
    it('should move physically the directory', () => {
      const localConsumerFiles = getConsumerFiles(workspacePath);
      expect(localConsumerFiles).to.not.be.empty;
      localConsumerFiles.forEach((file) => {
        expect(file.startsWith(newPath), `checking file: ${file}`).to.be.true;
      });
    });
    it('should not recognize the component as modified', async () => {
      const harmony = await loadManyAspects([WorkspaceAspect], workspacePath);
      const modified = await harmony.get<Workspace>(WorkspaceAspect.id).modified();
      expect(modified).to.have.lengthOf(0);
    });
  });

  describe('move directory manually then run bit move', () => {
    it('should be able to run bit move with no error', async () => {
      const { workspacePath } = createWorkspace({ 'bar/foo.js': 'module.exports = "foo";\n' });
      const harmony = await loadManyAspects([WorkspaceAspect, TrackerAspect, SnappingAspect], workspacePath);
      await harmony.get<TrackerMain>(TrackerAspect.id).track({ rootDir: 'bar', componentName: 'bar/foo' });
      await harmony.get<SnappingMain>(SnappingAspect.id).tag({ build: false });
      fs.moveSync(path.join(workspacePath, 'bar'), path.join(workspacePath, 'baz'));

      await runMove(workspacePath, 'bar', 'baz');
      expect(readBitMap(workspacePath)['bar/foo'].rootDir).to.equal('baz');
    });
  });
});
