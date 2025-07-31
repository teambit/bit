import chai, { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';

chai.use(require('chai-fs'));

describe('bit lane import with --branch flag', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });

  describe('basic case', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.createLane('my-test-lane');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      // Initialize a new workspace and setup git
      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.git.initNewGitRepo(true);
      const laneNameWithoutScope = 'my-test-lane';

      helper.command.importLane(laneNameWithoutScope, '--branch');
    });
    it('should import the lane successfully', () => {
      const laneNameWithoutScope = 'my-test-lane';
      helper.command.expectCurrentLaneToBe(laneNameWithoutScope);
    });
    it('should checkout to the branch with the same name as the lane id', () => {
      const laneNameWithoutScope = 'my-test-lane';
      const fullLaneName = `${helper.scopes.remote}/${laneNameWithoutScope}`;
      const currentBranch = helper.command.runCmd('git branch --show-current').trim();
      expect(currentBranch).to.equal(fullLaneName);
    });
  });

  describe('when git branch already exists', () => {
    let remoteScope: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.createLane('my-test-lane');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      remoteScope = helper.scopes.remote;

      // Initialize a new workspace and setup git
      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.git.initNewGitRepo(true);
      helper.fs.outputFile('.gitignore', 'node_modules/\n.bit/\n');
      helper.command.runCmd('git add .');
      helper.command.runCmd('git commit -m "initial commit"');
    });

    it('should show a warning when git branch already exists', () => {
      const laneNameWithoutScope = 'my-test-lane';
      const fullLaneName = `${remoteScope}/${laneNameWithoutScope}`;

      // Create a git branch with the same name as the lane
      helper.command.runCmd(`git branch ${fullLaneName}`);

      const result = helper.command.importLane(laneNameWithoutScope, '--branch');

      // The import should succeed but show a warning about the existing branch
      expect(result).to.contain('Failed to create git branch');
      expect(result).to.contain(`fatal: a branch named '${fullLaneName}' already exists`);

      // The lane should still be imported successfully
      helper.command.expectCurrentLaneToBe(laneNameWithoutScope);
    });
  });
});
