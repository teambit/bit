import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import { parse, stringify } from 'comment-json';
import stripAnsi from 'strip-ansi';
import { loadManyAspects } from '@teambit/harmony.testing.load-aspect';
import type { WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockWorkspace, destroyWorkspace } from '@teambit/workspace.testing.mock-workspace';
import type { Workspace } from '@teambit/workspace';
import { WorkspaceAspect } from '@teambit/workspace';
import type { CLIMain } from '@teambit/cli';
import { CLIAspect } from '@teambit/cli';
import type { TrackerMain } from '@teambit/tracker';
import { TrackerAspect } from '@teambit/tracker';
import type { InstallMain } from '@teambit/install';
import { InstallAspect } from '@teambit/install';
import { ListerAspect } from '@teambit/lister';
import { SnappingAspect } from './snapping.aspect';
import { VersionAlreadyExists } from '@teambit/legacy.scope';

/**
 * the "bit tag" command: its flags, its output and the errors it throws. one harmony load stands in for a
 * process per command, so these run here rather than as e2e.
 */

/** a fresh harmony per call, to simulate a new process running a new command */
async function loadWorkspace(workspacePath: string) {
  const harmony = await loadManyAspects(
    [WorkspaceAspect, SnappingAspect, TrackerAspect, InstallAspect, ListerAspect],
    workspacePath
  );
  const cli = harmony.get<CLIMain>(CLIAspect.id);
  const getCmd = (name: string) => {
    const cmd = cli.getCommand(name);
    if (!cmd) throw new Error(`the "${name}" command is not registered`);
    return cmd;
  };
  return {
    workspace: harmony.get<Workspace>(WorkspaceAspect.id),
    tracker: harmony.get<TrackerMain>(TrackerAspect.id),
    install: harmony.get<InstallMain>(InstallAspect.id),
    getCmd,
  };
}

/** the commands resolve the scope and the paths against the cwd, which is the workspace when run from a shell */
async function inWorkspace<T>(workspacePath: string, fn: () => Promise<T>): Promise<T> {
  const originalCwd = process.cwd();
  process.chdir(workspacePath);
  try {
    return await fn();
  } finally {
    process.chdir(originalCwd);
  }
}

/** write the component files and track them. `files` are relative to the component dir. */
async function addComponent(
  workspacePath: string,
  rootDir: string,
  files: Record<string, string> = { 'index.js': `module.exports = () => '${rootDir}';` },
  componentName?: string
) {
  Object.entries(files).forEach(([filePath, content]) =>
    fs.outputFileSync(path.join(workspacePath, rootDir, filePath), content)
  );
  const { tracker, workspace } = await loadWorkspace(workspacePath);
  await inWorkspace(workspacePath, async () => {
    await tracker.track({ rootDir, componentName: componentName ?? rootDir });
    await workspace.bitMap.write();
  });
}

/** the same as "bit link --rewire": turns the relative imports between the components into package imports */
async function linkAndRewire(workspacePath: string) {
  const { install } = await loadWorkspace(workspacePath);
  await inWorkspace(workspacePath, () => install.link([], { rewire: true }));
}

type TagFlags = Record<string, any>;

async function tag(workspacePath: string, patterns: string[], flags: TagFlags = {}): Promise<string> {
  const { getCmd } = await loadWorkspace(workspacePath);
  const tagCmd = getCmd('tag');
  return inWorkspace(workspacePath, async () => {
    const report = await tagCmd.report!([patterns] as any, { build: false, ...flags });
    return stripAnsi(typeof report === 'string' ? report : report.data);
  });
}

async function listLocalScope(workspacePath: string): Promise<Record<string, any>[]> {
  const { getCmd } = await loadWorkspace(workspacePath);
  const listCmd = getCmd('list');
  return inWorkspace(workspacePath, async () => (await listCmd.json!([], { localScope: true })) as any);
}

async function expectToReject(fn: () => Promise<any>, messagePart: string): Promise<string> {
  let message: string | undefined;
  try {
    await fn();
  } catch (err: any) {
    message = stripAnsi(err.message);
  }
  if (message === undefined) throw new Error(`expected to throw an error containing "${messagePart}", but it didn't`);
  expect(message).to.have.string(messagePart);
  return message;
}

describe('bit tag command', function () {
  this.timeout(0);

  const workspaces: WorkspaceData[] = [];
  function createWorkspace(): WorkspaceData {
    const workspaceData = mockWorkspace();
    workspaces.push(workspaceData);
    return workspaceData;
  }
  after(async () => {
    await Promise.all(workspaces.map((workspaceData) => destroyWorkspace(workspaceData)));
  });

  describe('tag component with invalid mainFile in bitmap', () => {
    it('should not tag the component', async () => {
      const { workspacePath, remoteScopeName } = createWorkspace();
      await addComponent(workspacePath, 'bar/foo', { 'foo.js': 'console.log("got foo")' });
      const bitMapPath = path.join(workspacePath, '.bitmap');
      const bitMap = parse(fs.readFileSync(bitMapPath, 'utf8')) as Record<string, any>;
      const bitMapKey = Object.keys(bitMap).find((key) => !key.startsWith('$'));
      if (!bitMapKey) throw new Error(`unable to find bar/foo in the .bitmap: ${Object.keys(bitMap)}`);
      bitMap[bitMapKey].mainFile = '';
      fs.writeFileSync(bitMapPath, stringify(bitMap, null, 4));

      const message = await expectToReject(() => tag(workspacePath, ['bar/foo']), 'error: main file');
      expect(message).to.have.string('was removed');
      expect(remoteScopeName).to.be.a('string');
    });
  });

  describe('semver flags', () => {
    describe('tag specific component', () => {
      let workspacePath: string;
      let scopeName: string;
      before(async () => {
        const workspaceData = createWorkspace();
        workspacePath = workspaceData.workspacePath;
        scopeName = workspaceData.remoteScopeName;
        for (const name of ['patch', 'minor', 'major', 'exact']) {
          await addComponent(workspacePath, `components/${name}`, { [`${name}.js`]: `module.exports = '${name}';` });
        }
        await tag(workspacePath, []);
      });
      it('Should not allow invalid semver', async () => {
        await addComponent(workspacePath, 'components/default', { 'default.js': 'module.exports = "default";' });
        const version = 'invalidVersion';
        await expectToReject(
          () => tag(workspacePath, ['components/default'], { ver: version }),
          `error: version ${version} is not a valid semantic version. learn more: https://semver.org`
        );
      });
      it('Should increment the patch version when no version type specified', async () => {
        const output = await tag(workspacePath, ['components/default'], { unmodified: true });
        expect(output).to.have.string('components/default@0.0.1');
      });
      it('Should increment the patch version when --patch flag specified', async () => {
        const output = await tag(workspacePath, ['components/patch'], { unmodified: true, patch: true });
        expect(output).to.have.string('components/patch@0.0.2');
      });
      it('Should increment the minor version when --minor flag specified', async () => {
        const output = await tag(workspacePath, ['components/minor'], { unmodified: true, minor: true });
        expect(output).to.have.string('components/minor@0.1.0');
      });
      it('Should increment the major version when --major flag specified', async () => {
        const output = await tag(workspacePath, ['components/major'], { unmodified: true, major: true });
        expect(output).to.have.string('components/major@1.0.0');
      });
      it('Should set the exact version when specified on new component', async () => {
        await addComponent(
          workspacePath,
          'components/exact2',
          { 'exact-new.js': 'module.exports = "exact-new";' },
          'components/exact-new'
        );
        const output = await tag(workspacePath, ['components/exact-new@5.12.10'], { unmodified: true });
        expect(output).to.have.string('components/exact-new@5.12.10');
      });
      it('Should increment patch version of dependent when using other flag on tag dependency', async () => {
        await addComponent(workspacePath, 'components/dependency', { 'dependency.js': 'module.exports = "dep";' });
        await addComponent(workspacePath, 'components/dependent', {
          'dependent.js': "import foo from '../dependency/dependency'",
        });
        await linkAndRewire(workspacePath);
        await tag(workspacePath, []);
        await tag(workspacePath, ['components/dependency'], { unmodified: true, major: true });
        const listOutput = await listLocalScope(workspacePath);
        const dependency = listOutput.find((item) => item.id === `${scopeName}/components/dependency`);
        expect(dependency, 'dependency component should be in list output').to.exist;
        expect(dependency).to.include({
          localVersion: '1.0.0',
          deprecated: false,
          currentVersion: '1.0.0',
          remoteVersion: 'N/A',
        });
        const dependent = listOutput.find((item) => item.id === `${scopeName}/components/dependent`);
        expect(dependent, 'dependent component should be in list output').to.exist;
        expect(dependent).to.include({
          localVersion: '0.0.2',
          deprecated: false,
          currentVersion: '0.0.2',
          remoteVersion: 'N/A',
        });
      });
      it('Should throw error when the version already exists', async () => {
        await tag(workspacePath, ['components/exact'], { unmodified: true, ver: '5.5.5' });
        const error = new VersionAlreadyExists('5.5.5', `${scopeName}/components/exact`);
        await expectToReject(
          () => tag(workspacePath, ['components/exact'], { unmodified: true, ver: '5.5.5' }),
          stripAnsi(error.message)
        );
      });
    });
  });

  describe('with removed file/files', () => {
    it('Should not let you tag with a non-existing dependency', async () => {
      const { workspacePath } = createWorkspace();
      await addComponent(
        workspacePath,
        'bar',
        {
          'foo.js': '',
          'index.js': 'var foo = require("./foo.js")',
        },
        'bar/foo'
      );
      fs.removeSync(path.join(workspacePath, 'bar/foo.js'));
      await expectToReject(() => tag(workspacePath, []), 'error: issues found with the following components');
      const listOutput = await listLocalScope(workspacePath);
      expect(listOutput.map((item) => item.id).join()).to.not.have.string('bar/foo');
    });
  });

  describe('with Windows end-of-line characters', () => {
    it('should write the file to the model with Linux EOL characters', async () => {
      const { workspacePath } = createWorkspace();
      await addComponent(workspacePath, 'bar', { 'foo.js': 'hello\r\n world\r\n' }, 'bar/foo');
      await tag(workspacePath, [], { ver: '0.0.1' });
      const { getCmd } = await loadWorkspace(workspacePath);
      await inWorkspace(workspacePath, async () => {
        const barFoo = (await getCmd('cat-component').json!(['bar/foo@latest'] as any, {})) as any;
        const fileHash = barFoo.files[0].file;
        const fileContent = (await getCmd('cat-object').report!([fileHash] as any, { stringify: true })) as string;
        // notice how the \r is stripped
        expect(fileContent).to.have.string('"hello\\n world\\n"');
      });
    });
  });

  describe('tag a component without its dependencies', () => {
    it('should show a descriptive error message', async () => {
      const { workspacePath } = createWorkspace();
      await addComponent(workspacePath, 'comp1', {
        'index.js': "const comp2 = require('../comp2'); module.exports = () => comp2();",
      });
      await addComponent(workspacePath, 'comp2');
      await linkAndRewire(workspacePath);
      await expectToReject(() => tag(workspacePath, ['comp1']), 'this dependency was not included in the tag command');
    });
  });

  describe('tag with an empty string', () => {
    // previously it was throwing `expected log.message to be string, got boolean`.
    it('should not throw an error', async () => {
      const { workspacePath } = createWorkspace();
      await addComponent(workspacePath, 'comp1');
      await tag(workspacePath, [], { message: '' });
    });
  });

  describe('component count display when new component depends on existing tagged component', () => {
    it('should correctly display 2 components tagged, not 3', async () => {
      const { workspacePath } = createWorkspace();
      // Create and tag an existing component
      await addComponent(workspacePath, 'components/comp1', { 'comp1.js': 'module.exports = { test: true };' });
      await tag(workspacePath, []);

      // Modify comp1 so it will be tagged again
      fs.outputFileSync(
        path.join(workspacePath, 'components/comp1/comp1.js'),
        'module.exports = { test: true, modified: true };'
      );

      // Create a new component that depends on comp1
      await addComponent(workspacePath, 'components/comp2', {
        'comp2.js': "const comp1 = require('../comp1/comp1');",
      });
      await linkAndRewire(workspacePath);

      // Tag all components - this should tag both comp2 (new) and comp1 (modified)
      // comp2 should be auto-tagged because its dependency (comp1) changed
      const output = await tag(workspacePath, []);
      // The output should show:
      // - 1 new component (comp2)
      // - 1 changed component (comp1) with auto-tagged dependents (comp2 should be listed)
      // Total: 2 component(s) tagged (not 3)
      expect(output).to.have.string('2 component(s) tagged');
      expect(output).to.not.have.string('3 component(s) tagged');
    });
  });

  describe('tag component with auto-tag should validate component issues', () => {
    it('should throw an error about component issues, not about relativePaths in Version object', async () => {
      const { workspacePath } = createWorkspace();
      // Create two independent components
      await addComponent(workspacePath, 'comp1');
      await addComponent(workspacePath, 'comp2');
      await tag(workspacePath, []);

      // Modify comp1 to depend on comp2 with a relative import (creates a component issue)
      fs.outputFileSync(
        path.join(workspacePath, 'comp1/index.js'),
        "const comp2 = require('../comp2');\nmodule.exports = () => 'comp1 and ' + comp2();"
      );

      // Try to tag comp2 - this should auto-tag comp1, but comp1 has a relative import issue
      const tagError = await expectToReject(() => tag(workspacePath, ['comp2'], { unmodified: true }), 'issues found');
      expect(tagError).to.have.string('relative import');
      expect(tagError).to.not.have.string('unable to save Version object');
      expect(tagError).to.not.have.string('should not have relativePaths');
    });
  });
});
