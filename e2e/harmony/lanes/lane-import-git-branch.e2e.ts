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

  // both scenarios import the same exported lane into a fresh git workspace, so the lane is
  // created and exported once. reInitWorkspace cleans the workspace dir (including .git), so each
  // scenario still starts from a clean git repo.
  describe('importing an exported lane into a git repo', () => {
    const laneName = 'my-test-lane';
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.createLane(laneName);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
    });

    describe('when no git branch with the lane name exists', () => {
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteScope();
        helper.git.initNewGitRepo(true);
        helper.command.importLane(laneName, '--branch');
      });
      it('should import the lane successfully', () => {
        helper.command.expectCurrentLaneToBe(laneName);
      });
      it('should checkout to the branch with the same name as the lane id', () => {
        const currentBranch = helper.command.runCmd('git branch --show-current').trim();
        expect(currentBranch).to.equal(`${helper.scopes.remote}/${laneName}`);
      });
    });

    describe('when the git branch already exists', () => {
      let importOutput: string;
      let fullLaneName: string;
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteScope();
        helper.git.initNewGitRepo(true);
        // a commit is needed before `git branch` can create one
        helper.fs.outputFile('.gitignore', 'node_modules/\n.bit/\n');
        helper.command.runCmd('git add .');
        helper.command.runCmd('git commit -m "initial commit"');
        fullLaneName = `${helper.scopes.remote}/${laneName}`;
        helper.command.runCmd(`git branch ${fullLaneName}`);
        importOutput = helper.command.importLane(laneName, '--branch');
      });

      it('should warn that the git branch could not be created', () => {
        expect(importOutput).to.contain('Failed to create git branch');
        expect(importOutput).to.contain(`fatal: a branch named '${fullLaneName}' already exists`);
      });
      it('should still import the lane successfully', () => {
        helper.command.expectCurrentLaneToBe(laneName);
      });
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
