import fs from 'fs-extra';
import path from 'path';
import LegacyHelper from '@teambit/legacy/dist/e2e-helper/e2e-helper';
import { assign, parse, stringify } from 'comment-json';

export type WorkspaceData = { workspacePath: string; remoteScopePath: string; remoteScopeName: string };

const isDebugMode = () => process.argv.includes('--debug');

/**
 * setup a new workspace on a temp directory and setup a bare-scope locally to simulate a remote scope for commands
 * such as `bit export`.
 * call `destroyWorkspace()` once the tests completed to keep the filesystem clean.
 *
 * to print the path of the workspace, run the tests with `--debug` flag.
 */
export function mockWorkspace(opts: { bareScopeName?: string } = {}): WorkspaceData {
  const legacyHelper = new LegacyHelper();
  if (opts.bareScopeName) {
    legacyHelper.scopeHelper.reInitLocalScope();
    legacyHelper.scopes.setRemoteScope(undefined, undefined, opts.bareScopeName);
    legacyHelper.scopeHelper.addRemoteScope();
  } else {
    legacyHelper.scopeHelper.setNewLocalAndRemoteScopes();
  }
  legacyHelper.workspaceJsonc.setupDefault();
  if (isDebugMode()) {
    // eslint-disable-next-line no-console
    console.log('workspace created at ', legacyHelper.scopes.localPath);
  }

  return {
    workspacePath: legacyHelper.scopes.localPath,
    remoteScopePath: legacyHelper.scopes.remotePath,
    remoteScopeName: legacyHelper.scopes.remote,
  };
}

export function mockBareScope(remoteToAdd: string, scopeNameSuffix?: string) {
  const legacyHelper = new LegacyHelper();
  const { scopeName, scopePath } = legacyHelper.scopeHelper.getNewBareScope(scopeNameSuffix, undefined, remoteToAdd);
  if (isDebugMode()) {
    // eslint-disable-next-line no-console
    console.log('base-scope created at ', scopePath);
  }

  return { scopeName, scopePath };
}

/**
 * deletes the paths created by mockWorkspace. pass the results you got from `mockWorkspace()`
 *
 * to keep the workspace and the remote scope, run the tests with `--debug` flag.
 */
export async function destroyWorkspace(workspaceData: WorkspaceData) {
  if (isDebugMode()) return;
  const { workspacePath, remoteScopePath } = workspaceData;
  await Promise.all([workspacePath, remoteScopePath].map((_) => fs.remove(_)));
}

export async function setWorkspaceConfig(workspacePath: string, key: string, val: any) {
  const workspaceConfigPath = path.join(workspacePath, 'workspace.jsonc');
  const content = await fs.readFile(workspaceConfigPath, 'utf-8');
  const workspaceConfig = parse(content);
  const obj = {
    [key]: val,
  };
  const updated = assign(workspaceConfig, obj);
  const contentToWrite = stringify(updated, null, 2);
  await fs.writeFile(workspaceConfigPath, contentToWrite);
}
