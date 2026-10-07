import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import stripAnsi from 'strip-ansi';
import { loadManyAspects } from '@teambit/harmony.testing.load-aspect';
import type { WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockWorkspace, destroyWorkspace } from '@teambit/workspace.testing.mock-workspace';
import { mockComponents } from '@teambit/component.testing.mock-components';
import { addFeature, reloadFeatureToggle } from '@teambit/harmony.modules.feature-toggle';
import { WorkspaceAspect, OutsideWorkspaceError } from '@teambit/workspace';
import type { CLIMain } from '@teambit/cli';
import { CLIAspect } from '@teambit/cli';
import { ComponentAspect } from '@teambit/component';
import { ListerAspect } from '@teambit/lister';
import { ExportAspect } from '@teambit/export';
import { ImporterAspect } from '@teambit/importer';
import { RemoveAspect } from '@teambit/remove';
import { SnappingAspect } from '@teambit/snapping';
import type { SnappingMain } from '@teambit/snapping';
import { ScopeAspect } from '@teambit/scope';
import { ConsumerNotFound } from '@teambit/legacy.consumer';
import { GlobalRemotes } from '@teambit/scope.remotes';
import { StatusAspect } from './status.aspect';

/**
 * commands that run outside of a workspace, against a global remote. the global remotes file is replaced with an
 * in-memory one, so the spec never touches the real global config of the machine it runs on.
 */
describe('remote commands outside of a workspace', function () {
  this.timeout(0);

  const originalLoad = GlobalRemotes.load;
  let globalRemotesData: { [key: string]: string };
  let workspaceData: WorkspaceData;
  let outsideDir: string;
  let originalCwd: string;

  /** a fresh harmony per call, to simulate a new process. loaded from the given dir, which is not a workspace */
  async function runOutside(name: string, args: any[] = [], flags: Record<string, any> = {}, mode = 'report') {
    const harmony = await loadManyAspects(
      [
        WorkspaceAspect,
        SnappingAspect,
        ExportAspect,
        ImporterAspect,
        RemoveAspect,
        StatusAspect,
        ListerAspect,
        ComponentAspect,
        ScopeAspect,
        CLIAspect,
      ],
      outsideDir
    );
    const cmd = harmony.get<CLIMain>(CLIAspect.id).getCommand(name);
    if (!cmd) throw new Error(`the "${name}" command is not registered`);
    process.chdir(outsideDir);
    try {
      const output: any = await cmd[mode](args as any, flags);
      if (mode === 'json') return JSON.parse(JSON.stringify(output));
      return stripAnsi(typeof output === 'string' ? output : output.data);
    } finally {
      process.chdir(originalCwd);
    }
  }
  const expectToReject = async (fn: () => Promise<unknown>, messagePart: string) => {
    let message: string | undefined;
    try {
      await fn();
    } catch (err: any) {
      message = stripAnsi(err.message);
    }
    expect(message, `expected to throw an error containing "${messagePart}"`).to.have.string(messagePart);
  };

  before(async () => {
    originalCwd = process.cwd();
    // "bit delete --hard" is blocked in non-interactive sessions unless the feature is explicitly enabled
    addFeature('hard-delete');
    workspaceData = mockWorkspace();
    globalRemotesData = {};
    GlobalRemotes.load = async () => {
      const globalRemotes = new GlobalRemotes(globalRemotesData);
      globalRemotes.write = (() => Promise.resolve()) as any;
      return globalRemotes;
    };
    // bar/foo is exported from a workspace. the global remote is added after it, as in "bit remote add --global"
    await mockComponents(workspaceData.workspacePath, { numOfComponents: 1 });
    const harmony = await loadManyAspects([WorkspaceAspect, SnappingAspect, ExportAspect], workspaceData.workspacePath);
    await harmony.get<SnappingMain>(SnappingAspect.id).tag({ build: false });
    process.chdir(workspaceData.workspacePath);
    try {
      await harmony.get<CLIMain>(CLIAspect.id).getCommand('export')!.report!([[]] as any, {});
    } finally {
      process.chdir(originalCwd);
    }
    globalRemotesData[workspaceData.remoteScopeName] = `file://${workspaceData.remoteScopePath}`;
    outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bit-outside-workspace-'));
  });
  after(async () => {
    GlobalRemotes.load = originalLoad;
    reloadFeatureToggle();
    process.chdir(originalCwd);
    await destroyWorkspace(workspaceData);
    fs.removeSync(outsideDir);
  });

  it('bit status should throw an error OutsideWorkspaceError', async () => {
    await expectToReject(() => runOutside('status'), stripAnsi(new OutsideWorkspaceError().message));
  });
  it('bit list without --remote flag should throw an error ConsumerNotFound', async () => {
    await expectToReject(() => runOutside('list', [], { localScope: true }), stripAnsi(new ConsumerNotFound().message));
  });
  it('bit list with --remote flag should list the global remote successfully', async () => {
    const output = await runOutside('list', [workspaceData.remoteScopeName]);
    expect(output).to.have.string('found 1 components');
  });
  it('bit show --legacy should show the component and not throw an error about missing workspace', async () => {
    const output = await runOutside('show', [`${workspaceData.remoteScopeName}/comp1`], { legacy: true, remote: true });
    expect(output).to.have.string('comp1');
  });
  it('bit show without --legacy should throw a descriptive error', async () => {
    await expectToReject(
      () => runOutside('show', [`${workspaceData.remoteScopeName}/comp1`], { remote: true }),
      'error: the current directory is not a workspace nor a scope'
    );
  });
  describe('bit remove with --remote flag', () => {
    let output: string;
    before(async () => {
      output = await runOutside('delete', [`${workspaceData.remoteScopeName}/comp1`], { silent: true, hard: true });
    });
    it('should not throw an error', () => {
      expect(output).to.have.string('successfully removed');
    });
    it('should remove successfully', async () => {
      const list = await runOutside('list', [workspaceData.remoteScopeName], {}, 'json');
      expect(list).to.have.lengthOf(0);
    });
  });
});
