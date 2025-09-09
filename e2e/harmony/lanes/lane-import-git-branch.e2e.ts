import chai, { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';
chai.use(chaiFs);

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

  describe('import lane after remote lane changes', () => {
    const laneName = 'my-test-lane';
    const comp1Name = 'comp1';
    let workspaceBackup: string;
    let mainBranch: string;
    before(() => {
      // Step 1: On main, populate components, tag, export
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(); // creates 3 components: comp1, comp2, comp3
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      // Setup local bare git repo and push main branch
      const { scopePath } = helper.scopeHelper.getNewBareScope();
      const bareRepoPath = scopePath.replace('.bit', '.git');
      helper.command.runCmd(`git init --bare ${bareRepoPath}`);
      helper.git.initNewGitRepo(true);
      helper.command.runCmd(`git remote add origin ${bareRepoPath}`);
      helper.fs.outputFile('.gitignore', 'node_modules/\n.bit/\n');
      helper.command.runCmd('git add .');
      helper.command.runCmd('git commit -m "initial commit"');
      mainBranch = helper.command.runCmd('git branch --show-current').trim();
      helper.command.runCmd(`git push -u origin ${mainBranch}`);

      // Backup workspace before lane creation
      workspaceBackup = helper.scopeHelper.cloneWorkspace();

      // Step 2: Create lane, change comp1, snap, export
      helper.command.createLane(laneName);
      helper.fs.appendFile(`${comp1Name}/index.js`, '\n console.log(1)');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      // Step 3: Restore workspace to before lane creation
      helper.scopeHelper.getClonedWorkspace(workspaceBackup);

      helper.command.importLane(laneName, '--branch');
      helper.command.expectCurrentLaneToBe(laneName);

      helper.command.runCmd('git add .');
      helper.command.runCmd('git commit -m "commit on a PR"');
      helper.command.runCmd(`git push origin ${mainBranch}`);
    });
    it('switching git back to main should switch the lane as well to main and keep status clean', () => {
      helper.command.runCmd(`git checkout ${mainBranch}`);
      helper.command.expectCurrentLaneToBe('main');
      helper.command.expectStatusToBeClean();
    });
  });
});
