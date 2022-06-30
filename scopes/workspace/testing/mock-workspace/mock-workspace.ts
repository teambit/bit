import fs from 'fs-extra';
import path from 'path';
import LegacyHelper from '@teambit/legacy/dist/e2e-helper/e2e-helper';
import { assign, parse, stringify } from 'comment-json';

export type WorkspaceData = { workspacePath: string; remoteScopePath: string; remoteScopeName: string };

/**
 * setup a new workspace on a temp directory and setup a bare-scope locally to simulate a remote scope for commands
 * such as `bit export`.
 * call `destroyWorkspace()` once the tests completed to keep the filesystem clean.
 */
export function mockWorkspace(): WorkspaceData {
  const legacyHelper = new LegacyHelper();
  legacyHelper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
  legacyHelper.bitJsonc.setupDefault();

  return {
    workspacePath: legacyHelper.scopes.localPath,
    remoteScopePath: legacyHelper.scopes.remotePath,
    remoteScopeName: legacyHelper.scopes.remote,
  };
}

/**
 * deletes the paths created by mockWorkspace. pass the results you got from `mockWorkspace()`
 */
export async function destroyWorkspace(workspaceData: WorkspaceData) {
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
