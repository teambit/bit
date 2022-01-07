import LegacyHelper from '@teambit/legacy/dist/e2e-helper/e2e-helper';

export class Helper {
  private legacyHelper: LegacyHelper;
  constructor() {
    this.legacyHelper = new LegacyHelper();
  }
  get workspacePath() {
    return this.legacyHelper.scopes.localPath;
  }
  get remotePath() {
    return this.legacyHelper.scopes.remotePath;
  }
  /**
   * setup a new workspace on a temp directory. other commands in this helper will be running on this directory.
   * also, setup a bare-scope locally to simulate a remote scope for commands such as `bit export`.
   * call `destroyWorkspace()` once the tests completed to keep the filesystem clean.
   */
  setupWorkspace() {
    this.legacyHelper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
    this.legacyHelper.bitJsonc.setupDefault();
  }
  /**
   * delete the workspace and scopes directories created by `setupWorkspace()`
   */
  destroy() {
    this.legacyHelper.scopeHelper.destroy();
  }
  /**
   * add dummy components. if `numOfComponents` is more than one, the components will depend on each other.
   */
  populateComponents(numOfComponents = 1) {
    return this.legacyHelper.fixtures.populateComponents(numOfComponents);
  }
  createLane(laneName: string) {
    return this.legacyHelper.command.createLane(laneName);
  }
}
