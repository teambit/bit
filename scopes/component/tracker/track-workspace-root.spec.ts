import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import { loadManyAspects } from '@teambit/harmony.testing.load-aspect';
import type { WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockWorkspace, destroyWorkspace } from '@teambit/workspace.testing.mock-workspace';
import type { Workspace } from '@teambit/workspace';
import { WorkspaceAspect } from '@teambit/workspace';
import { TrackerAspect } from './tracker.aspect';
import type { TrackerMain } from './tracker.main.runtime';

/**
 * tracking a component at the workspace root (rootDir "."). these cases only need `bit add` and the
 * resulting .bitmap, so they run here rather than as e2e - one harmony load stands in for a process
 * per command. the flows that need a remote (export, import onto ".", clone) stay in
 * e2e/harmony/add-harmony.e2e.ts.
 */
describe('tracking the workspace root', function () {
  this.timeout(0);

  type Tracked = { workspaceData: WorkspaceData; workspacePath: string; workspace: Workspace; tracker: TrackerMain };

  async function setupWorkspace(files: Record<string, string>): Promise<Tracked> {
    const workspaceData = mockWorkspace();
    const { workspacePath } = workspaceData;
    Object.entries(files).forEach(([filePath, content]) =>
      fs.outputFileSync(path.join(workspacePath, filePath), content)
    );
    const harmony = await loadManyAspects([WorkspaceAspect, TrackerAspect], workspacePath);
    return {
      workspaceData,
      workspacePath,
      workspace: harmony.get<Workspace>(WorkspaceAspect.id),
      tracker: harmony.get<TrackerMain>(TrackerAspect.id),
    };
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

  const inWs = (tracked: Tracked, relPath: string) => path.join(tracked.workspacePath, relPath);

  const rootDirOf = (tracked: Tracked, name: string) =>
    tracked.workspace.bitMap.getBitmapEntry(tracked.workspace.consumer.getParsedId(name), { ignoreVersion: true })
      .rootDir;
  const mainFileOf = (tracked: Tracked, name: string) =>
    tracked.workspace.bitMap.getBitmapEntry(tracked.workspace.consumer.getParsedId(name), { ignoreVersion: true })
      .mainFile;

  describe('re-adding and double-adding the workspace root', () => {
    let tracked: Tracked;
    before(async () => {
      tracked = await setupWorkspace({ 'README.md': '# workspace root\n' });
      await tracked.tracker.addForCLI({
        componentPaths: [tracked.workspacePath],
        id: 'ws-root',
        main: inWs(tracked, 'README.md'),
        override: false,
      });
    });
    after(async () => {
      await destroyWorkspace(tracked.workspaceData);
    });
    it('should take the main file given explicitly over the default', () => {
      expect(mainFileOf(tracked, 'ws-root')).to.equal('README.md');
    });
    it('should allow re-adding the same component', async () => {
      fs.outputFileSync(path.join(tracked.workspacePath, 'extra.md'), 'extra\n');
      await tracked.tracker.addForCLI({ componentPaths: [tracked.workspacePath], id: 'ws-root', override: false });
      expect(rootDirOf(tracked, 'ws-root')).to.equal('.');
    });
    it('should allow re-adding it without repeating its name, and keep its main file', async () => {
      await tracked.tracker.addForCLI({ componentPaths: [tracked.workspacePath], override: false });
      // no second component was created out of the unnamed re-add
      expect(tracked.workspace.bitMap.getAllRootDirs()).to.deep.equal(['.']);
      expect(mainFileOf(tracked, 'ws-root')).to.equal('README.md');
    });
    it('should reject a second component claiming the workspace root', async () => {
      await expectToReject(
        () =>
          tracked.tracker.addForCLI({ componentPaths: [tracked.workspacePath], id: 'another-root', override: false }),
        'already tracked by'
      );
    });
    it('should pick up dotfiles at add time, not only on the next rescan', async () => {
      fs.outputFileSync(path.join(tracked.workspacePath, '.npmrc'), 'registry=https://example.com\n');
      const results = await tracked.tracker.addForCLI({
        componentPaths: [tracked.workspacePath],
        id: 'ws-root',
        override: false,
      });
      const files = results.addedComponents[0].files.map((file) => file.relativePath);
      expect(files).to.include('.npmrc');
      // its auto-generated banner must not get it dropped, the rescan tracks it
      expect(files).to.include('.bitmap');
    });
  });

  describe('adding a nested component that holds the main file of the workspace root', () => {
    let tracked: Tracked;
    before(async () => {
      tracked = await setupWorkspace({ 'packages/comp1/index.js': 'module.exports = () => "comp1";\n' });
      await tracked.tracker.addForCLI({
        componentPaths: [tracked.workspacePath],
        id: 'ws-root',
        main: inWs(tracked, 'packages/comp1/index.js'),
        override: false,
      });
    });
    after(async () => {
      await destroyWorkspace(tracked.workspaceData);
    });
    it('should refuse, because the root would fail to load without its main file', async () => {
      await expectToReject(
        () =>
          tracked.tracker.addForCLI({
            componentPaths: [inWs(tracked, 'packages/comp1')],
            id: 'comp1',
            override: false,
          }),
        'main file of the workspace-root component'
      );
    });
    it('should refuse even when the nested component ignores that file, its directory is what the root loses', async () => {
      fs.outputFileSync(path.join(tracked.workspacePath, 'packages/comp1/.bitignore'), 'index.js\n');
      fs.outputFileSync(path.join(tracked.workspacePath, 'packages/comp1/other.js'), '');
      await expectToReject(
        () =>
          tracked.tracker.addForCLI({
            componentPaths: [inWs(tracked, 'packages/comp1')],
            id: 'comp1',
            override: false,
          }),
        'main file of the workspace-root component'
      );
    });
  });
});
