import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import stripAnsi from 'strip-ansi';
import { parse } from 'comment-json';
import { loadManyAspects } from '@teambit/harmony.testing.load-aspect';
import type { WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockWorkspace, destroyWorkspace } from '@teambit/workspace.testing.mock-workspace';
import type { Workspace } from '@teambit/workspace';
import { WorkspaceAspect, OutsideWorkspaceError } from '@teambit/workspace';
import { HostInitializerMain } from '@teambit/host-initializer';
import { InvalidName } from '@teambit/legacy-bit-id';
import type { Logger } from '@teambit/logger';
import { MainFileIsDir, PathOutsideConsumer, VersionShouldBeRemoved } from './exceptions';
import { AddCmd } from './add-cmd';
import { TrackerAspect } from './tracker.aspect';
import { TrackerMain } from './tracker.main.runtime';

/**
 * the "bit add" command: its flags, its output and the errors it throws. one harmony load stands in
 * for a process per command, so these run here rather than as e2e.
 */
describe('bit add command', function () {
  this.timeout(0);

  type Loaded = { workspacePath: string; workspace: Workspace; tracker: TrackerMain; addCmd: AddCmd };

  const workspaces: WorkspaceData[] = [];

  function createWorkspace(files: Record<string, string> = {}): WorkspaceData {
    const workspaceData = mockWorkspace();
    workspaces.push(workspaceData);
    writeFiles(workspaceData.workspacePath, files);
    return workspaceData;
  }

  function writeFiles(workspacePath: string, files: Record<string, string>) {
    Object.entries(files).forEach(([filePath, content]) =>
      fs.outputFileSync(path.join(workspacePath, filePath), content)
    );
  }

  /** a fresh harmony load is what a new process gets: nothing in memory from the previous command */
  async function load(workspacePath: string): Promise<Loaded> {
    const harmony = await loadManyAspects([WorkspaceAspect, TrackerAspect], workspacePath);
    const tracker = harmony.get<TrackerMain>(TrackerAspect.id);
    return {
      workspacePath,
      workspace: harmony.get<Workspace>(WorkspaceAspect.id),
      tracker,
      addCmd: new AddCmd(tracker),
    };
  }

  async function setup(files: Record<string, string> = {}): Promise<Loaded> {
    return load(createWorkspace(files).workspacePath);
  }

  /** the command resolves the paths it gets against the cwd, which is the workspace when run from a shell */
  async function inWorkspace<T>(loaded: Loaded, fn: () => Promise<T>): Promise<T> {
    const originalCwd = process.cwd();
    process.chdir(loaded.workspacePath);
    try {
      return await fn();
    } finally {
      process.chdir(originalCwd);
    }
  }

  const add = (loaded: Loaded, paths: string[], flags: Record<string, any> = {}) =>
    inWorkspace(loaded, async () =>
      stripAnsi(await loaded.addCmd.report([paths], { override: false, ...flags } as any))
    );

  /** what was written to disk, .bitmap opens with a comment banner */
  const bitMapOf = (loaded: Loaded): Record<string, any> =>
    parse(fs.readFileSync(path.join(loaded.workspacePath, '.bitmap'), 'utf8')) as Record<string, any>;

  const filesOf = (loaded: Loaded, name: string) =>
    loaded.workspace.bitMap
      .getBitmapEntry(loaded.workspace.consumer.getParsedId(name), { ignoreVersion: true })
      .files.map((file) => file.relativePath);

  /** chai has no async throw assertion that also matches a message */
  async function expectToReject(fn: () => Promise<unknown>, messagePart: string) {
    try {
      await fn();
    } catch (err: any) {
      expect(stripAnsi(err.message)).to.have.string(messagePart);
      return;
    }
    throw new Error(`expected to reject with "${messagePart}", but it resolved`);
  }

  const expectToRejectWith = (fn: () => Promise<unknown>, expectedError: Error) =>
    expectToReject(fn, stripAnsi(expectedError.message));

  after(async () => {
    await Promise.all(workspaces.map((workspaceData) => destroyWorkspace(workspaceData)));
  });

  describe('outside a workspace', () => {
    it('should throw OutsideWorkspaceError', async () => {
      // with no workspace around, the workspace aspect provides nothing, which is what the tracker gets
      const tracker = new TrackerMain(undefined as unknown as Workspace, {} as Logger);
      await expectToRejectWith(
        () => tracker.addForCLI({ componentPaths: ['bar'], override: false }),
        new OutsideWorkspaceError()
      );
    });
  });

  describe('a workspace whose scope is inside .git/bit', () => {
    let loaded: Loaded;
    before(async () => {
      const { workspacePath } = createWorkspace({ 'bar/foo.js': 'module.exports = "foo";\n' });
      fs.removeSync(path.join(workspacePath, '.bitmap'));
      fs.removeSync(path.join(workspacePath, '.bit'));
      fs.mkdirpSync(path.join(workspacePath, '.git'));
      await HostInitializerMain.init(
        workspacePath,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        {},
        undefined,
        undefined,
        {
          skipDefaultMcp: true,
          skipAgentInstructions: true,
        }
      );
      loaded = await load(workspacePath);
    });
    it('should find the scope there and add the component', async () => {
      expect(path.join(loaded.workspacePath, '.git/bit')).to.satisfy((scopePath: string) => fs.existsSync(scopePath));
      const output = await add(loaded, ['bar'], { id: 'bar/foo' });
      expect(output).to.have.string('tracking component');
      expect(bitMapOf(loaded)).to.have.property('bar/foo');
    });
  });

  describe('add one component', () => {
    it('should print the id of the component it tracks', async () => {
      const loaded = await setup({ 'bar/foo.js': '' });
      const output = await add(loaded, ['bar'], { id: 'bar/foo' });
      expect(output).to.have.string('tracking component');
      expect(output).to.have.string('bar/foo');
    });
    it('should warn when the files are already tracked by another id, and not add the new one', async () => {
      const loaded = await setup({ 'bar/foo.js': '' });
      await add(loaded, ['bar'], { id: 'bar/foo' });
      const output = await add(loaded, ['bar'], { id: 'bar/new' });
      const { defaultScope } = loaded.workspace;
      expect(output).to.have.string(`files bar/foo.js already used by component: ${defaultScope}/bar/foo`);
      expect(bitMapOf(loaded)).to.not.have.property('bar/new');
    });
    it('should prefix the name with the namespace given with -n', async () => {
      const loaded = await setup({ 'bar/foo2.js': '' });
      await add(loaded, ['bar'], { namespace: 'test' });
      expect(bitMapOf(loaded)).to.have.property('test/bar');
    });
    it('should refuse -i and -n together', async () => {
      // the command validates its flags before reaching the workspace
      const addCmd = new AddCmd({} as TrackerMain);
      await expectToReject(
        () => addCmd.json([['bar']], { id: 'jaja', namespace: 'test', main: undefined, override: false }),
        'please use either [id] or [namespace] to add a particular component'
      );
    });
    // the name rules themselves are unit-tested in @teambit/legacy-bit-id (is-valid-id-chunk.spec). this
    // guards the wiring: that an id given with -i is validated at all before it reaches the .bitmap.
    it('should throw InvalidName when the id given with -i is not a valid component name', async () => {
      const loaded = await setup({ 'bar/foo.js': '' });
      await expectToRejectWith(() => add(loaded, ['bar'], { id: 'bar/fo.o' }), new InvalidName('bar/fo.o'));
    });
    it('should resolve a main file given with the DSL', async () => {
      const loaded = await setup({ 'bar/bar.js': '', 'bar/foo1.js': '' });
      await add(loaded, ['bar'], { main: path.normalize('{PARENT}/{PARENT}.js'), namespace: 'test' });
      const bitMap = bitMapOf(loaded);
      expect(bitMap).to.have.property('test/bar');
      expect(bitMap['test/bar'].mainFile).to.equal('bar.js');
    });
    it('should accept an id with only one level', async () => {
      const loaded = await setup({ 'bar/foo.js': '' });
      await add(loaded, ['bar'], { id: 'foo' });
      expect(bitMapOf(loaded)).to.have.property('foo');
    });
  });

  describe('gitignore', () => {
    it('should warn that there are no files to add when gitignore excludes them all', async () => {
      const loaded = await setup({ 'bar/foo2.js': '', '.gitignore': 'bar/foo2.js' });
      await expectToReject(
        () => add(loaded, ['bar'], { id: 'bar/foo2' }),
        `warning: no files to add, the following files were ignored: ${path.normalize('bar/foo2.js')}`
      );
    });
    it('should track only the files gitignore does not exclude', async () => {
      const loaded = await setup({
        'bar/foo.js': '',
        'bar/foo3.js': '',
        'bar/boo.js': '',
        'bar/index.js': '',
        '.gitignore': 'bar/foo.js\nbar/foo3.js',
      });
      await add(loaded, ['bar'], { id: 'bar/foo' });
      expect(filesOf(loaded, 'bar/foo')).to.have.members(['boo.js', 'index.js']);
    });
  });

  describe('invalid input', () => {
    it('should throw VersionShouldBeRemoved when the id includes a version', async () => {
      const loaded = await setup({ 'bar/foo.js': '' });
      await expectToRejectWith(
        () => add(loaded, ['bar'], { id: 'bar/foo@0.0.4' }),
        new VersionShouldBeRemoved('bar/foo@0.0.4')
      );
    });
    it('should throw MainFileIsDir when the main file is a directory', async () => {
      const loaded = await setup({ 'bar/foo.js': '', 'mainDir/mainFile.js': '' });
      await expectToRejectWith(
        () => add(loaded, ['bar'], { id: 'bar/foo', main: 'mainDir' }),
        new MainFileIsDir(path.join(loaded.workspacePath, 'mainDir'))
      );
    });
    it('should throw PathOutsideConsumer for a directory outside the workspace', async () => {
      const loaded = await setup();
      const outsideDirName = `outside-${path.basename(loaded.workspacePath)}`;
      const outsideDir = path.join(loaded.workspacePath, '..', outsideDirName);
      fs.outputFileSync(path.join(outsideDir, 'foo.js'), '');
      try {
        const relativePath = path.join('..', outsideDirName);
        await expectToRejectWith(() => add(loaded, [relativePath]), new PathOutsideConsumer(relativePath));
      } finally {
        fs.removeSync(outsideDir);
      }
    });
  });

  describe('adding the main file when it was removed before', () => {
    let output: string;
    let invalidErrorNames: string[];
    before(async () => {
      const { workspacePath } = createWorkspace({ 'bar/foo.js': '', 'bar/foo-main.js': '' });
      await add(await load(workspacePath), ['bar'], { id: 'bar/foo', main: 'bar/foo-main.js' });
      fs.removeSync(path.join(workspacePath, 'bar/foo-main.js'));
      const loaded = await load(workspacePath);
      invalidErrorNames = (await loaded.workspace.listInvalid()).map((invalid) => invalid.err.name);
      fs.outputFileSync(path.join(workspacePath, 'bar/foo-main2.js'), '');
      output = await add(loaded, ['bar'], { id: 'bar/foo', main: 'bar/foo-main2.js' });
    });
    it('should make the component invalid once the main file is gone', () => {
      expect(invalidErrorNames).to.include('MainFileRemoved');
    });
    it('should add the new main file successfully', () => {
      expect(output).to.have.string('added foo-main2.js');
    });
  });

  describe('directory is with upper case and the main flag is written with lower case', () => {
    it('should fail on a case-sensitive filesystem saying no main file was found, and work on others', async () => {
      const loaded = await setup({ 'Bar/foo.js': '' });
      let output: string;
      try {
        output = await add(loaded, ['Bar'], { id: 'bar', main: 'bar/foo.js' });
      } catch (err: any) {
        expect(err.message).to.have.string('does not contain a main file');
        return;
      }
      expect(output).to.have.string('added');
      expect(filesOf(loaded, 'bar')).to.include('foo.js');
      const bitMap = bitMapOf(loaded);
      expect(bitMap).to.have.property('bar');
      expect(bitMap.bar.rootDir).to.equal('Bar');
    });
  });
});
