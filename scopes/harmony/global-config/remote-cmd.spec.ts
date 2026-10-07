import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import stripAnsi from 'strip-ansi';
import type { WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockWorkspace, destroyWorkspace } from '@teambit/workspace.testing.mock-workspace';
import { GlobalRemotes } from '@teambit/scope.remotes';
import { ScopeNotFound } from '@teambit/legacy.scope';
import { RemoteCmd } from './remote-cmd';

/**
 * the "bit remote" command (add, del, list) with local and global remotes. the global remotes file is replaced
 * with an in-memory one, so the spec never touches the real global config of the machine it runs on.
 */
describe('bit remote command', function () {
  this.timeout(0);

  const remoteCmd = new RemoteCmd();
  const subCommand = (name: string) => remoteCmd.commands!.find((cmd) => cmd.name.startsWith(name))!;

  const originalLoad = GlobalRemotes.load;
  let globalRemotesData: { [key: string]: string };
  const workspaces: WorkspaceData[] = [];
  let remoteScopeName: string;
  let remoteScopePath: string;
  let originalCwd: string;

  function createWorkspace(): string {
    const workspaceData = mockWorkspace();
    workspaces.push(workspaceData);
    return workspaceData.workspacePath;
  }

  async function inWorkspace<T>(workspacePath: string, fn: () => Promise<T>): Promise<T> {
    process.chdir(workspacePath);
    try {
      return await fn();
    } finally {
      process.chdir(originalCwd);
    }
  }

  const run = async (workspacePath: string, command: string, args: string[], flags = {}) =>
    inWorkspace(workspacePath, async () => {
      const cmd: any = command === 'remote' ? remoteCmd : subCommand(command);
      return stripAnsi(String(await cmd.report!(args, flags)));
    });
  const addRemote = (workspacePath: string, flags = {}) =>
    run(workspacePath, 'add', [`file://${remoteScopePath}`], flags);
  const listRemotes = (workspacePath: string) => run(workspacePath, 'remote', [], {});
  const expectToReject = async (fn: () => Promise<unknown>, messagePart: string) => {
    let message: string | undefined;
    try {
      await fn();
    } catch (err: any) {
      message = stripAnsi(err.message);
    }
    expect(message, `expected to throw an error containing "${messagePart}"`).to.have.string(messagePart);
  };

  before(() => {
    originalCwd = process.cwd();
    const first = mockWorkspace();
    workspaces.push(first);
    remoteScopeName = first.remoteScopeName;
    remoteScopePath = first.remoteScopePath;
  });
  beforeEach(() => {
    globalRemotesData = {};
    GlobalRemotes.load = async () => {
      const globalRemotes = new GlobalRemotes(globalRemotesData);
      globalRemotes.write = (() => Promise.resolve()) as any;
      return globalRemotes;
    };
  });
  after(async () => {
    GlobalRemotes.load = originalLoad;
    process.chdir(originalCwd);
    await Promise.all(workspaces.map((workspaceData) => destroyWorkspace(workspaceData)));
  });

  describe('adding a global remote', () => {
    let workspacePath: string;
    beforeEach(async () => {
      workspacePath = createWorkspace();
      await addRemote(workspacePath, { global: true });
    });
    it('should be shown when running "bit remote"', async () => {
      expect(await listRemotes(workspacePath)).to.have.string(remoteScopeName);
    });
    it('should be shown from any other workspace as well', async () => {
      expect(await listRemotes(createWorkspace())).to.have.string(remoteScopeName);
    });
    describe('deleting remote', () => {
      it('deleting a non-exist remote should throw an error', async () => {
        await expectToReject(
          () => run(workspacePath, 'del', ['non-exist-remote']),
          'remote "non-exist-remote" was not found'
        );
      });
      it('deleting the global remote without "--global" flag should throw an error', async () => {
        await expectToReject(
          () => run(workspacePath, 'del', [remoteScopeName]),
          `remote "${remoteScopeName}" was not found locally, to remove a global remote, please use "--global" flag`
        );
      });
      it('should successfully delete the global remote when "--global" flag was used', async () => {
        const output = await run(workspacePath, 'del', [remoteScopeName], { global: true });
        expect(output).to.have.string('removed remote');

        expect(await listRemotes(workspacePath)).to.not.have.string(remoteScopeName);
      });
    });
  });

  describe('adding a local remote', () => {
    let workspacePath: string;
    beforeEach(async () => {
      workspacePath = createWorkspace();
      await addRemote(workspacePath);
    });
    it('should be shown when running "bit remote"', async () => {
      expect(await listRemotes(workspacePath)).to.have.string(remoteScopeName);
    });
    it('should not be shown from other workspace', async () => {
      expect(await listRemotes(createWorkspace())).to.not.have.string(remoteScopeName);
    });
    describe('deleting remote', () => {
      it('deleting the remote with "--global" flag should throw an error', async () => {
        await expectToReject(
          () => run(workspacePath, 'del', [remoteScopeName], { global: true }),
          `remote "${remoteScopeName}" was not found globally, to remove a local remote, please omit the "--global" flag`
        );
      });
      it('should successfully delete the remote when "--global" flag was not used', async () => {
        const output = await run(workspacePath, 'del', [remoteScopeName]);
        expect(output).to.have.string('removed remote');

        expect(await listRemotes(workspacePath)).to.not.have.string(remoteScopeName);
      });
    });
  });

  describe('adding a non exist local remote with relative path', () => {
    it('should throw ScopeNotFound error', async () => {
      const workspacePath = fs.realpathSync(createWorkspace());
      const error = new ScopeNotFound(path.join(workspacePath, 'non-exist-dir'));
      await expectToReject(() => run(workspacePath, 'add', ['file://non-exist-dir']), stripAnsi(error.message));
    });
  });
});
