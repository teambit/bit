import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import { AUTO_GENERATED_MSG } from '@teambit/legacy.constants';
import { loadManyAspects } from '@teambit/harmony.testing.load-aspect';
import type { WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockWorkspace, destroyWorkspace } from '@teambit/workspace.testing.mock-workspace';
import { WorkspaceAspect } from '@teambit/workspace';
import { TrackerAspect } from './tracker.aspect';
import type { TrackerMain } from './tracker.main.runtime';

/**
 * which files `bit add` ends up tracking. one harmony load stands in for a process per command, so
 * the rules that pick the files are covered here rather than as e2e.
 */
describe('the files bit add tracks', function () {
  this.timeout(0);

  const workspaces: WorkspaceData[] = [];

  /** a component whose own ignore file hides the .json next to its source */
  const compWithIgnoredJson = {
    'comp1/index.js': 'module.exports = () => "comp1";\n',
    'comp1/.bitignore': '*.json\n',
    'comp1/hello.json': '{ "hello": "world" }\n',
  };

  /** the workspace aspect holds the flag, and workspace.jsonc carries comments that JSON.parse rejects */
  function enableTrackAllFiles(workspacePath: string) {
    const configPath = path.join(workspacePath, 'workspace.jsonc');
    const content = fs.readFileSync(configPath, 'utf8');
    const workspaceKey = '"teambit.workspace/workspace": {';
    if (!content.includes(workspaceKey)) throw new Error(`"${workspaceKey}" is no longer in the mock workspace.jsonc`);
    fs.writeFileSync(configPath, content.replace(workspaceKey, `${workspaceKey}\n    "trackAllFiles": true,`));
  }

  async function setup(files: Record<string, string>, opts: { trackAllFiles?: boolean } = {}) {
    const workspaceData = mockWorkspace();
    workspaces.push(workspaceData);
    const { workspacePath } = workspaceData;
    if (opts.trackAllFiles) enableTrackAllFiles(workspacePath);
    Object.entries(files).forEach(([filePath, content]) =>
      fs.outputFileSync(path.join(workspacePath, filePath), content)
    );
    const harmony = await loadManyAspects([WorkspaceAspect, TrackerAspect], workspacePath);
    // addForCLI resolves componentPaths and main against the cwd, so the tests pass absolute paths
    return { workspacePath, tracker: harmony.get<TrackerMain>(TrackerAspect.id) };
  }

  /** chai has no async throw assertion that also matches a message */
  async function expectToReject(fn: () => Promise<unknown>, messagePart: string) {
    try {
      await fn();
    } catch (err: any) {
      expect(err.message).to.have.string(messagePart);
      return;
    }
    throw new Error(`expected to reject with "${messagePart}", but it resolved`);
  }

  after(async () => {
    await Promise.all(workspaces.map((workspaceData) => destroyWorkspace(workspaceData)));
  });

  describe('the ignore file of the component being added', () => {
    let addedFiles: string[];
    before(async () => {
      const { workspacePath, tracker } = await setup(compWithIgnoredJson);
      const results = await tracker.addForCLI({
        componentPaths: [path.join(workspacePath, 'comp1')],
        id: 'comp1',
        override: false,
      });
      addedFiles = results.addedComponents[0].files.map((file) => file.relativePath);
    });
    it('should apply it at add time, as the rescan does', () => {
      expect(addedFiles).to.include('index.js');
      expect(addedFiles).to.not.include('hello.json');
    });
    it('should keep the ignore file itself, it is a source of the component', () => {
      expect(addedFiles).to.include('.bitignore');
    });
    it('should refuse a main file it excludes, rather than track what the next rescan drops', async () => {
      const { workspacePath, tracker } = await setup(compWithIgnoredJson);
      await expectToReject(
        () =>
          tracker.addForCLI({
            componentPaths: [path.join(workspacePath, 'comp1')],
            id: 'comp1',
            main: path.join(workspacePath, 'comp1/hello.json'),
            override: false,
          }),
        'was excluded from file list'
      );
    });
  });

  describe('a config file bit treats as generated, at the component root', () => {
    const compWithTsconfig = {
      'comp1/index.js': 'module.exports = () => "comp1";\n',
      'comp1/tsconfig.json': '{}\n',
    };
    const addWithTsconfigAsMain = async (trackAllFiles: boolean) => {
      const { workspacePath, tracker } = await setup(compWithTsconfig, { trackAllFiles });
      return tracker.addForCLI({
        componentPaths: [path.join(workspacePath, 'comp1')],
        id: 'comp1',
        main: path.join(workspacePath, 'comp1/tsconfig.json'),
        override: false,
      });
    };
    it('should refuse it as a main file, rather than track what the next rescan drops', async () => {
      // it used to fail further down with "main file tsconfig.json was removed from <id>", which
      // sends the user to "bit remove" for a component they are adding
      await expectToReject(() => addWithTsconfigAsMain(false), 'was excluded from file list');
    });
    it('should accept it with trackAllFiles on, where the rescan keeps it', async () => {
      const results = await addWithTsconfigAsMain(true);
      expect(results.addedComponents[0].files.map((file) => file.relativePath)).to.include('tsconfig.json');
    });
  });

  describe('a file bit generated, which carries its banner', () => {
    const compWithGeneratedFile = {
      'comp1/index.js': 'module.exports = () => "comp1";\n',
      'comp1/package.json': `${AUTO_GENERATED_MSG}{ "name": "comp1" }\n`,
    };
    const filesOf = async (trackAllFiles: boolean) => {
      const { workspacePath, tracker } = await setup(compWithGeneratedFile, { trackAllFiles });
      const results = await tracker.addForCLI({
        componentPaths: [path.join(workspacePath, 'comp1')],
        id: 'comp1',
        override: false,
      });
      return results.addedComponents[0].files.map((file) => file.relativePath);
    };
    it('should drop it by default, it is not source', async () => {
      expect(await filesOf(false)).to.not.include('package.json');
    });
    it('should keep it with trackAllFiles on, which is what the rescan does', async () => {
      // the rescan never looks at the banner, so dropping it here would leave the two disagreeing:
      // the file is missing from the add, then turns up as a new file on the next status
      expect(await filesOf(true)).to.include('package.json');
    });
  });
});
