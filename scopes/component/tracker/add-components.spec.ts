import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
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

  async function setup(files: Record<string, string>) {
    const workspaceData = mockWorkspace();
    workspaces.push(workspaceData);
    const { workspacePath } = workspaceData;
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
});
