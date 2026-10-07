import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
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
import type { RemoveMain } from '@teambit/remove';
import { RemoveAspect } from '@teambit/remove';
import type { ScopeMain } from '@teambit/scope';
import { ScopeAspect } from '@teambit/scope';
import type { ConfigStoreMain } from '@teambit/config-store';
import { ConfigStoreAspect } from '@teambit/config-store';
import { ComponentCompareAspect } from '@teambit/component-compare';
import { MissingBitMapComponent } from '@teambit/legacy.bit-map';
import { VersionNotFound } from '@teambit/legacy.scope';
import type { SnappingMain } from './snapping.main.runtime';
import { SnappingAspect } from './snapping.aspect';

/**
 * "bit diff": the diff between the workspace and the model, between two versions, the --parent flag and
 * the output flags. it lives here rather than next to the command in component-compare, since tagging
 * needs this aspect and component-compare must not depend on it. the flags validation is covered in
 * component-compare (diff-cmd.spec.ts).
 */
const barFooV1 = "module.exports = function foo() { return 'got foo'; };\n";
const barFooV2 = "module.exports = function foo() { return 'got foo v2'; };\n";
const barFooV3 = "module.exports = function foo() { return 'got foo v3'; };\n";
const barFooV4 = "module.exports = function foo() { return 'got foo v4'; };\n";
const isTypeContent = "module.exports = function isType() { return 'got is-type'; };";
const isStringContent = "module.exports = function isString() { return 'got is-string'; };";
const noDiffMessage = 'no diff for';
const successDiffMessage = 'showing diff for';
const barFooFile = 'foo.js';

type Loaded = {
  workspacePath: string;
  workspace: Workspace;
  snapping: SnappingMain;
  tracker: TrackerMain;
  remove: RemoveMain;
  scope: ScopeMain;
  configStore: ConfigStoreMain;
  /** the command as registered, so it reads the host the CLI would give it */
  diff: (args?: string[], flags?: Record<string, any>, cwd?: string) => Promise<string>;
  diffJson: (args: string[], flags?: Record<string, any>) => Promise<any>;
};

/** a fresh harmony load is what a new process gets: nothing in memory from the previous command */
async function load(workspacePath: string, loadFrom = workspacePath): Promise<Loaded> {
  const harmony = await loadManyAspects(
    [
      WorkspaceAspect,
      SnappingAspect,
      ComponentCompareAspect,
      TrackerAspect,
      RemoveAspect,
      ScopeAspect,
      ConfigStoreAspect,
      CLIAspect,
    ],
    loadFrom
  );
  const diffCmd = harmony.get<CLIMain>(CLIAspect.id).getCommand('diff');
  if (!diffCmd?.report || !diffCmd.json) throw new Error('the "diff" command is not registered');
  // the pattern is resolved against the cwd, which is where the command is run from
  const inCwd = async <T>(cwd: string, fn: () => Promise<T>): Promise<T> => {
    const originalCwd = process.cwd();
    process.chdir(cwd);
    try {
      return await fn();
    } finally {
      process.chdir(originalCwd);
    }
  };
  return {
    workspacePath,
    workspace: harmony.get<Workspace>(WorkspaceAspect.id),
    snapping: harmony.get<SnappingMain>(SnappingAspect.id),
    tracker: harmony.get<TrackerMain>(TrackerAspect.id),
    remove: harmony.get<RemoveMain>(RemoveAspect.id),
    scope: harmony.get<ScopeMain>(ScopeAspect.id),
    configStore: harmony.get<ConfigStoreMain>(ConfigStoreAspect.id),
    diff: async (args = [], flags = {}, cwd = workspacePath) =>
      inCwd(cwd, async () => {
        const [pattern, version, toVersion] = args;
        return stripAnsi((await diffCmd.report!([pattern, version, toVersion], flags)) as string);
      }),
    diffJson: async (args, flags = {}) =>
      inCwd(workspacePath, async () => {
        const [pattern, version, toVersion] = args;
        return JSON.parse(JSON.stringify(await diffCmd.json!([pattern, version, toVersion], flags)));
      }),
  };
}

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

describe('bit diff command', function () {
  this.timeout(0);

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
  async function track(loaded: Loaded, rootDir: string, componentName: string, mainFile?: string): Promise<void> {
    await loaded.tracker.track({ rootDir, componentName, mainFile });
    await loaded.workspace.bitMap.write();
  }
  const tag = async (loaded: Loaded, opts: Record<string, any> = {}) => {
    const results = await loaded.snapping.tag({ build: false, ...opts });
    if (!results) throw new Error('nothing was tagged');
  };
  const snap = async (loaded: Loaded) => {
    const results = await loaded.snapping.snap({ build: false, message: 'snap' });
    if (!results) throw new Error('nothing was snapped');
  };
  const headOf = async (loaded: Loaded, id: string): Promise<string> => {
    const compId = await loaded.workspace.resolveComponentId(id);
    const modelComponent = await loaded.scope.legacyScope.getModelComponent(compId);
    return modelComponent.getHeadRegardlessOfLane()!.toString();
  };
  const remoteScopeId = (workspaceData: WorkspaceData, name: string) => `${workspaceData.remoteScopeName}/${name}`;

  after(async () => {
    await Promise.all(workspaces.map((workspaceData) => destroyWorkspace(workspaceData)));
  });

  describe('for non existing component and no modified components', () => {
    let loaded: Loaded;
    before(async () => {
      loaded = await load(createWorkspace().workspacePath);
    });
    it('show an error saying the component was not found', async () => {
      await expectToReject(
        () => loaded.diff(['utils/non-exist']),
        stripAnsi(new MissingBitMapComponent('utils/non-exist').message)
      );
    });
    it('show an error saying that there are no modified components', async () => {
      const output = await loaded.diff();
      expect(output).to.have.string('no modified components');
    });
  });

  describe('after the component was created', () => {
    let workspaceData: WorkspaceData;
    before(async () => {
      workspaceData = createWorkspace({ 'bar/foo.js': barFooV1 });
      const loaded = await load(workspaceData.workspacePath);
      await track(loaded, 'bar', 'bar/foo');
    });
    it('diff should show that all files were added', async () => {
      const loaded = await load(workspaceData.workspacePath);
      const output = await loaded.diff(['bar/foo']);
      expect(output).to.not.have.string(noDiffMessage);
      expect(output).to.have.string(`+module.exports = function foo() { return 'got foo'; };`);
    });
    describe('after the component was tagged', () => {
      before(async () => {
        const loaded = await load(workspaceData.workspacePath);
        await tag(loaded, { version: '0.0.5' });
      });
      it('should still indicate that there is no diff for that component', async () => {
        const loaded = await load(workspaceData.workspacePath);
        const output = await loaded.diff(['bar/foo']);
        expect(output).to.have.string(noDiffMessage);
        expect(output).to.have.string('bar/foo');
      });
      describe('and component was modified', () => {
        let diffOutput: string;
        before(async () => {
          writeFiles(workspaceData.workspacePath, { 'bar/foo.js': barFooV2 });
          const loaded = await load(workspaceData.workspacePath);
          diffOutput = await loaded.diff(['bar/foo']);
        });
        it('should show a success message', () => {
          expect(diffOutput).to.have.string(successDiffMessage);
        });
        it('should indicate the original files with ---', () => {
          expect(diffOutput).to.have.string(`--- ${barFooFile} (0.0.5 original)`);
        });
        it('should indicate the modified files with +++', () => {
          expect(diffOutput).to.have.string(`+++ ${barFooFile} (0.0.5 modified)`);
        });
        it('should show the deleted part with leading - (minus sign)', () => {
          expect(diffOutput).to.have.string("-module.exports = function foo() { return 'got foo'; };");
        });
        it('should show the added part with leading + (plus sign)', () => {
          expect(diffOutput).to.have.string("+module.exports = function foo() { return 'got foo v2'; };");
        });
        it('should show a success message also when running from an inner directory', async () => {
          const innerDir = path.join(workspaceData.workspacePath, 'bar');
          const loaded = await load(workspaceData.workspacePath, innerDir);
          const outputInner = await loaded.diff(['bar/foo'], {}, innerDir);
          expect(outputInner).to.have.string(successDiffMessage);
        });
        describe('when git path is configured incorrectly', () => {
          let loaded: Loaded;
          before(async () => {
            loaded = await load(workspaceData.workspacePath);
            await loaded.configStore.setConfig('git_path', '/non/exist/location', 'workspace');
          });
          after(async () => {
            await loaded.configStore.delConfig('git_path', 'workspace');
          });
          it('should throw an error GitNotFound', async () => {
            await expectToReject(
              () => loaded.diff(['bar/foo']),
              'unable to run command because git executable not found'
            );
          });
        });
      });
    });
  });

  describe('when there are several modified components and non modified components', () => {
    let workspaceData: WorkspaceData;
    before(async () => {
      workspaceData = createWorkspace({
        'bar/foo.js': barFooV1,
        'is-type/is-type.js': isTypeContent,
        'is-string/is-string.js': isStringContent,
      });
      const loaded = await load(workspaceData.workspacePath);
      await track(loaded, 'bar', 'bar/foo');
      await track(loaded, 'is-type', 'utils/is-type');
      await track(loaded, 'is-string', 'utils/is-string');
      await tag(loaded);

      // modify only bar/foo and utils/is-type, not utils/is-string
      writeFiles(workspaceData.workspacePath, { 'bar/foo.js': barFooV2 });
      fs.appendFileSync(path.join(workspaceData.workspacePath, 'is-type/is-type.js'), '\n');
    });
    describe('running bit diff with no ids', () => {
      let output: string;
      before(async () => {
        const loaded = await load(workspaceData.workspacePath);
        output = await loaded.diff();
      });
      it('should show diff for all modified components', () => {
        expect(output).to.have.string(`showing diff for ${remoteScopeId(workspaceData, 'bar/foo')}`);
        expect(output).to.have.string(`showing diff for ${remoteScopeId(workspaceData, 'utils/is-type')}`);
        expect(output).to.have.string(barFooV1);
        expect(output).to.have.string(barFooV2);
      });
      it('should not show non modified components', () => {
        expect(output).to.not.have.string(`showing diff for ${remoteScopeId(workspaceData, 'utils/is-string')}`);
      });
    });
    describe('running bit diff with multiple ids', () => {
      let output: string;
      before(async () => {
        const loaded = await load(workspaceData.workspacePath);
        output = await loaded.diff(['**/utils/is-type, **/utils/is-string']);
      });
      it('should not show diff for non modified components', () => {
        expect(output).to.not.have.string(isStringContent);
      });
      it('should mention the components with no diff', () => {
        expect(output).to.have.string('utils/is-string');
        expect(output).to.have.string(noDiffMessage);
      });
    });
  });

  describe('when a file is deleted and another is added', () => {
    let workspaceData: WorkspaceData;
    let output: string;
    before(async () => {
      workspaceData = createWorkspace({ 'bar/foo.js': barFooV1 });
      let loaded = await load(workspaceData.workspacePath);
      await track(loaded, 'bar', 'bar/foo');
      await tag(loaded);
      writeFiles(workspaceData.workspacePath, { 'bar/foo2.js': barFooV2 });
      fs.removeSync(path.join(workspaceData.workspacePath, 'bar/foo.js'));
      loaded = await load(workspaceData.workspacePath);
      await track(loaded, 'bar', 'bar/foo', 'foo2.js');
      loaded = await load(workspaceData.workspacePath);
      output = await loaded.diff(['bar/foo']);
    });
    it('should indicate the deleted files as deleted', () => {
      expect(output).to.have.string(`--- ${barFooFile} (0.0.1 original)`);
      expect(output).to.have.string(`+++ ${barFooFile} (0.0.1 modified)`);
      // notice the leading minus sign
      expect(output).to.have.string(`-${barFooV1}`);
    });
    it('should indicate the added files as added', () => {
      const barFoo2File = 'foo2.js';
      expect(output).to.have.string(`--- ${barFoo2File} (0.0.1 original)`);
      expect(output).to.have.string(`+++ ${barFoo2File} (0.0.1 modified)`);
      // notice the leading plus sign
      expect(output).to.have.string(`+${barFooV2}`);
    });
    describe('other fields diff', () => {
      it('should indicate that the mainFile was changed', () => {
        expect(output).to.have.string('--- Main File (0.0.1 original)');
        expect(output).to.have.string('+++ Main File (0.0.1 modified)');
        expect(output).to.have.string('- foo.js');
        expect(output).to.have.string('+ foo2.js');
      });
      it('should indicate that the files array were changed', () => {
        expect(output).to.have.string('--- Files (0.0.1 original)');
        expect(output).to.have.string('+++ Files (0.0.1 modified)');
        expect(output).to.have.string('- [ foo.js ]');
        expect(output).to.have.string('+ [ foo2.js ]');
      });
    });
    describe('running bit diff between the previous version and the last version', () => {
      let versionsOutput: string;
      before(async () => {
        let loaded = await load(workspaceData.workspacePath);
        await tag(loaded);
        loaded = await load(workspaceData.workspacePath);
        versionsOutput = await loaded.diff(['bar/foo', '0.0.1', '0.0.2']);
      });
      it('should indicate the deleted files as deleted', () => {
        expect(versionsOutput).to.have.string(`--- ${barFooFile} (0.0.1)`);
        expect(versionsOutput).to.have.string(`+++ ${barFooFile} (0.0.2)`);
        expect(versionsOutput).to.have.string(`-${barFooV1}`);
      });
      it('should indicate the added files as added', () => {
        const barFoo2File = 'foo2.js';
        expect(versionsOutput).to.have.string(`--- ${barFoo2File} (0.0.1)`);
        expect(versionsOutput).to.have.string(`+++ ${barFoo2File} (0.0.2)`);
        expect(versionsOutput).to.have.string(`+${barFooV2}`);
      });
      describe('other fields diff', () => {
        it('should indicate that the mainFile was changed', () => {
          expect(versionsOutput).to.have.string('--- Main File (0.0.1)');
          expect(versionsOutput).to.have.string('+++ Main File (0.0.2)');
          expect(versionsOutput).to.have.string('- foo.js');
          expect(versionsOutput).to.have.string('+ foo2.js');
        });
        it('should indicate that the files array were changed', () => {
          expect(versionsOutput).to.have.string('--- Files (0.0.1)');
          expect(versionsOutput).to.have.string('+++ Files (0.0.2)');
          expect(versionsOutput).to.have.string('- [ foo.js ]');
          expect(versionsOutput).to.have.string('+ [ foo2.js ]');
        });
      });
      it('should have the same output as running diff of the previous version', async () => {
        const loaded = await load(workspaceData.workspacePath);
        const diffOfVersionOutput = await loaded.diff(['bar/foo', '0.0.1']);
        expect(diffOfVersionOutput).to.be.equal(versionsOutput);
      });
    });
  });

  describe('component with multiple versions', () => {
    let workspaceData: WorkspaceData;
    before(async () => {
      workspaceData = createWorkspace({ 'bar/foo.js': barFooV1 });
      let loaded = await load(workspaceData.workspacePath);
      await track(loaded, 'bar', 'bar/foo');
      await tag(loaded); // 0.0.1
      writeFiles(workspaceData.workspacePath, { 'bar/foo.js': barFooV2 });
      loaded = await load(workspaceData.workspacePath);
      await tag(loaded); // 0.0.2
      writeFiles(workspaceData.workspacePath, { 'bar/foo.js': barFooV3 });
      loaded = await load(workspaceData.workspacePath);
      await tag(loaded); // 0.0.3
    });
    describe('diff between a non-exist version and current version', () => {
      it('should throw an VersionNotFound error', async () => {
        const error = new VersionNotFound('1.0.6', remoteScopeId(workspaceData, 'bar/foo'));
        const loaded = await load(workspaceData.workspacePath);
        await expectToReject(() => loaded.diff(['bar/foo', '1.0.6']), stripAnsi(error.message));
      });
    });
    describe('diff between an earlier version and current version', () => {
      let output: string;
      before(async () => {
        const loaded = await load(workspaceData.workspacePath);
        output = await loaded.diff(['bar/foo', '0.0.1']);
      });
      it('should show the earlier version with leading - (minus sign)', () => {
        expect(output).to.have.string(`--- ${barFooFile} (0.0.1)`);
        expect(output).to.have.string(`-${barFooV1}`);
      });
      it('should show the current version with leading + (plus sign)', () => {
        expect(output).to.have.string(`+++ ${barFooFile} (0.0.3)`);
        expect(output).to.have.string(`+${barFooV3}`);
      });
    });
    describe('diff between two different versions', () => {
      let output: string;
      before(async () => {
        const loaded = await load(workspaceData.workspacePath);
        output = await loaded.diff(['bar/foo', '0.0.1', '0.0.2']);
      });
      it('should show the first version with leading - (minus sign)', () => {
        expect(output).to.have.string(`--- ${barFooFile} (0.0.1)`);
        expect(output).to.have.string(`-${barFooV1}`);
      });
      it('should show the second version with leading + (plus sign)', () => {
        expect(output).to.have.string(`+++ ${barFooFile} (0.0.2)`);
        expect(output).to.have.string(`+${barFooV2}`);
      });
    });
  });

  describe('ai-agent output flags', () => {
    let loaded: Loaded;
    before(async () => {
      const workspaceData = createWorkspace({ 'bar/foo.js': barFooV1, 'is-type/is-type.js': isTypeContent });
      loaded = await load(workspaceData.workspacePath);
      await track(loaded, 'bar', 'bar/foo');
      await track(loaded, 'is-type', 'utils/is-type');
      await tag(loaded);
      // modify source in bar/foo, and add a file in utils/is-type so both filesDiff and fieldsDiff appear
      writeFiles(workspaceData.workspacePath, {
        'bar/foo.js': barFooV2,
        'is-type/extra.js': "module.exports = 'extra';\n",
      });
      loaded = await load(workspaceData.workspacePath);
      await track(loaded, 'is-type', 'utils/is-type', 'is-type.js');
      loaded = await load(workspaceData.workspacePath);
    });
    describe('--name-only', () => {
      let output: string;
      before(async () => {
        output = await loaded.diff(['bar/foo'], { nameOnly: true });
      });
      it('should print the component header once', () => {
        expect(output).to.have.string('showing diff for');
        expect(output).to.have.string('bar/foo');
      });
      it('should list changed files with a status letter and path', () => {
        expect(output).to.match(/^M foo\.js$/m);
      });
      it('should not include the unified diff body', () => {
        expect(output).to.not.have.string('--- foo.js');
        expect(output).to.not.have.string(barFooV2);
      });
    });
    describe('--stat', () => {
      let output: string;
      before(async () => {
        output = await loaded.diff(['bar/foo'], { stat: true });
      });
      it('should include the changed file with +N -M counts', () => {
        expect(output).to.match(/M foo\.js\s+\+\d+ -\d+/);
      });
      it('should not include the unified diff body', () => {
        expect(output).to.not.have.string('@@ ');
      });
    });
    describe('--file <path>', () => {
      let output: string;
      before(async () => {
        output = await loaded.diff(['utils/is-type'], { file: 'extra.js' });
      });
      it('should include the matching file diff', () => {
        expect(output).to.have.string('extra.js');
      });
      it('should not include fields diff (implies --files-only)', () => {
        expect(output).to.not.have.string('--- Main File');
        expect(output).to.not.have.string('--- Files');
      });
    });
    describe('--files-only', () => {
      let output: string;
      before(async () => {
        output = await loaded.diff(['utils/is-type'], { filesOnly: true });
      });
      it('should include file diffs', () => {
        expect(output).to.have.string('extra.js');
      });
      it('should drop fields diff', () => {
        expect(output).to.not.have.string('--- Files');
        expect(output).to.not.have.string('--- Main File');
      });
    });
    describe('--configs-only', () => {
      let output: string;
      before(async () => {
        output = await loaded.diff(['utils/is-type'], { configsOnly: true });
      });
      it('should include fields diff', () => {
        expect(output).to.have.string('--- Files');
      });
      it('should drop file-content diffs', () => {
        expect(output).to.not.have.string('@@ ');
      });
    });
    describe('--json', () => {
      let parsed: any;
      before(async () => {
        parsed = await loaded.diffJson(['bar/foo'], {});
      });
      it('should return an array with one entry per matching component', () => {
        expect(parsed).to.be.an('array');
        expect(parsed).to.have.lengthOf(1);
      });
      it('should expose id, hasDiff, filesDiff, fieldsDiff', () => {
        expect(parsed[0]).to.have.property('id').that.is.a('string');
        expect(parsed[0]).to.have.property('hasDiff').that.is.a('boolean');
        expect(parsed[0]).to.have.property('filesDiff');
      });
      it('should include diffOutput in each filesDiff entry by default', () => {
        expect(parsed[0].filesDiff[0]).to.have.property('diffOutput').that.is.a('string');
      });
    });
    describe('--json --name-only', () => {
      let parsed: any;
      before(async () => {
        parsed = await loaded.diffJson(['bar/foo'], { nameOnly: true });
      });
      it('should omit diffOutput from filesDiff entries', () => {
        expect(parsed[0].filesDiff[0]).to.have.property('filePath');
        expect(parsed[0].filesDiff[0]).to.have.property('status');
        expect(parsed[0].filesDiff[0]).to.not.have.property('diffOutput');
      });
    });
    describe('--json --stat', () => {
      let parsed: any;
      before(async () => {
        parsed = await loaded.diffJson(['bar/foo'], { stat: true });
      });
      it('should include additions/deletions and omit diffOutput', () => {
        expect(parsed[0].filesDiff[0]).to.have.property('additions').that.is.a('number');
        expect(parsed[0].filesDiff[0]).to.have.property('deletions').that.is.a('number');
        expect(parsed[0].filesDiff[0]).to.not.have.property('diffOutput');
      });
    });
  });

  describe('diff with --parent flag', () => {
    let workspaceData: WorkspaceData;
    let firstSnap: string;
    let secondSnap: string;
    before(async () => {
      workspaceData = createWorkspace({ 'bar/foo.js': barFooV1 });
      let loaded = await load(workspaceData.workspacePath);
      await track(loaded, 'bar', 'bar/foo');
      await tag(loaded); // 0.0.1
      writeFiles(workspaceData.workspacePath, { 'bar/foo.js': barFooV2 });
      loaded = await load(workspaceData.workspacePath);
      await tag(loaded); // 0.0.2
      writeFiles(workspaceData.workspacePath, { 'bar/foo.js': barFooV3 });
      loaded = await load(workspaceData.workspacePath);
      await snap(loaded);
      firstSnap = await headOf(loaded, 'bar/foo');
      writeFiles(workspaceData.workspacePath, { 'bar/foo.js': barFooV4 });
      loaded = await load(workspaceData.workspacePath);
      await snap(loaded);
      secondSnap = await headOf(loaded, 'bar/foo');
    });
    const freshLoad = () => load(workspaceData.workspacePath);

    describe('when the version is a tag', () => {
      it('should show the diff between the tag and its parent tag', async () => {
        const output = await (await freshLoad()).diff(['bar/foo', '0.0.2'], { parent: true });
        expect(output).to.have.string(`--- ${barFooFile} (0.0.1)`);
        expect(output).to.have.string(`+++ ${barFooFile} (0.0.2)`);
        expect(output).to.have.string("-module.exports = function foo() { return 'got foo'; };");
        expect(output).to.have.string("+module.exports = function foo() { return 'got foo v2'; };");
      });
    });
    describe('when the parent is a snap', () => {
      it('should show the diff between the snap and its parent snap', async () => {
        const output = await (await freshLoad()).diff(['bar/foo', secondSnap], { parent: true });
        expect(output).to.have.string(`--- ${barFooFile} (${firstSnap})`);
        expect(output).to.have.string(`+++ ${barFooFile} (${secondSnap})`);
        expect(output).to.have.string("-module.exports = function foo() { return 'got foo v3'; };");
        expect(output).to.have.string("+module.exports = function foo() { return 'got foo v4'; };");
      });
    });
    describe('when no version is specified', () => {
      it('should show the diff between the current version and its parent', async () => {
        const output = await (await freshLoad()).diff(['bar/foo'], { parent: true });
        expect(output).to.have.string(`--- ${barFooFile} (${firstSnap})`);
        expect(output).to.have.string(`+++ ${barFooFile} (${secondSnap})`);
        expect(output).to.have.string("-module.exports = function foo() { return 'got foo v3'; };");
        expect(output).to.have.string("+module.exports = function foo() { return 'got foo v4'; };");
      });
    });
    describe('when the version is the first version', () => {
      it('should show all files as added', async () => {
        const output = await (await freshLoad()).diff(['bar/foo', '0.0.1'], { parent: true });
        expect(output).to.not.have.string(noDiffMessage);
        expect(output).to.have.string(`--- ${barFooFile} (no parent)`);
        expect(output).to.have.string(`+++ ${barFooFile} (0.0.1)`);
        expect(output).to.have.string("+module.exports = function foo() { return 'got foo'; };");
        expect(output).to.not.have.string('-module.exports');
      });
    });
    describe('when two versions are specified along with --parent', () => {
      it('should throw an error', async () => {
        await expectToReject(
          async () => (await freshLoad()).diff(['bar/foo', '0.0.1', '0.0.2'], { parent: true }),
          '--parent flag expects to get only one version'
        );
      });
    });
    describe('when the parent has identical content (e.g. a tag created on top of a squashed merge-snap)', () => {
      before(async () => {
        // create a tag identical in content to its parent snap, simulating the tag created on main
        // when merging a lane, which is identical to the squashed snap it points to as its parent
        await tag(await freshLoad(), { unmodified: true });
      });
      it('should skip identical ancestors and diff against the first ancestor with different content', async () => {
        const output = await (await freshLoad()).diff(['bar/foo', '0.0.3'], { parent: true });
        expect(output).to.have.string(`--- ${barFooFile} (${firstSnap})`);
        expect(output).to.have.string(`+++ ${barFooFile} (0.0.3)`);
        expect(output).to.have.string("-module.exports = function foo() { return 'got foo v3'; };");
        expect(output).to.have.string("+module.exports = function foo() { return 'got foo v4'; };");
      });
    });
    describe('when the parent is a tag with identical content (a legit tag with no changes)', () => {
      let newTag: string;
      before(async () => {
        // create two tags with no changes, so the last tag's parent is a tag with identical content
        await tag(await freshLoad(), { unmodified: true });
        const loaded = await freshLoad();
        await tag(loaded, { unmodified: true });
        const reloaded = await freshLoad();
        const compId = await reloaded.workspace.resolveComponentId('bar/foo');
        const modelComponent = await reloaded.scope.legacyScope.getModelComponent(compId);
        newTag = Object.keys(modelComponent.versions).pop() as string;
      });
      it('should show no diff rather than walking further up the history', async () => {
        const output = await (await freshLoad()).diff([`bar/foo`, newTag], { parent: true });
        expect(output).to.have.string(noDiffMessage);
      });
    });
    describe('when the component is soft-deleted in the workspace', () => {
      before(async () => {
        await (await freshLoad()).remove.deleteComps('bar/foo');
      });
      it('should still compare the stored versions rather than showing the files as deleted', async () => {
        // no component-pattern. a soft-deleted component cannot be resolved by a pattern.
        const output = await (await freshLoad()).diff([], { parent: true });
        // the current version was created with --unmodified, so it has no diff against its parent.
        // without --parent precedence, the output would show all the files as deleted.
        expect(output).to.not.have.string("-module.exports = function foo() { return 'got foo v4'; };");
        expect(output).to.have.string(noDiffMessage);
      });
    });
    describe('when the only ancestor is a snap with identical content', () => {
      before(async () => {
        writeFiles(workspaceData.workspacePath, { 'comp2/index.js': 'console.log("hello");' });
        let loaded = await freshLoad();
        await track(loaded, 'comp2', 'comp2');
        loaded = await freshLoad();
        const snapResults = await loaded.snapping.snap({ pattern: 'comp2', build: false, message: 'snap' });
        if (!snapResults) throw new Error('nothing was snapped');
        loaded = await freshLoad();
        await tag(loaded, { ids: ['comp2'], unmodified: true });
      });
      it('should treat the version as having no parent and show all files as added', async () => {
        const output = await (await freshLoad()).diff(['comp2', '0.0.1'], { parent: true });
        expect(output).to.not.have.string(noDiffMessage);
        expect(output).to.have.string('--- index.js (no parent)');
        expect(output).to.have.string('+++ index.js (0.0.1)');
        expect(output).to.have.string('+console.log("hello");');
      });
    });
  });
});
