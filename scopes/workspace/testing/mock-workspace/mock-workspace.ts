import fs from 'fs-extra';
import LegacyHelper from '@teambit/legacy/dist/e2e-helper/e2e-helper';

export type WorkspaceData = { workspacePath: string; remoteScopePath: string; remoteScopeName: string };

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

export async function destroyWorkspace(workspaceData: WorkspaceData) {
  const { workspacePath, remoteScopePath } = workspaceData;
  await Promise.all([workspacePath, remoteScopePath].map((_) => fs.remove(_)));
}
