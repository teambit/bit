import LegacyHelper from '@teambit/legacy/dist/e2e-helper/e2e-helper';

export async function mockWorkspace() {
  const legacyHelper = new LegacyHelper();
  legacyHelper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
  legacyHelper.bitJsonc.setupDefault();

  return legacyHelper.scopes.localPath;
}
