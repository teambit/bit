import chai, { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';

chai.use(require('chai-fs'));

describe('ci commands', function () {
  this.timeout(0);
  let helper: Helper;

  before(() => {
    helper = new Helper();
  });

  after(() => {
    helper.scopeHelper.destroy();
  });

  function setupWorkspaceWithGitRemote() {
    helper.scopeHelper.setWorkspaceWithRemoteScope();

    // Create a bare git repository to serve as remote
    const { scopePath } = helper.scopeHelper.getNewBareScope();
    const bareRepoPath = scopePath.replace('.bit', '.git');
    helper.command.runCmd(`git init --bare ${bareRepoPath}`);

    // Initialize git in workspace and set up remote
    helper.git.initNewGitRepo();
    helper.git.addGitConfig('user.name', 'Test User');
    helper.git.addGitConfig('user.email', 'test@example.com');
    helper.command.runCmd(`git remote add origin ${bareRepoPath}`);

    return bareRepoPath;
  }

  function setupComponentsAndInitialCommit(numComponents = 2) {
    // Create components and initial export
    helper.fixtures.populateComponents(numComponents);
    helper.command.tagAllWithoutBuild();
    helper.command.export();

    // Create .gitignore file
    helper.fs.outputFile('.gitignore', 'node_modules/\n.bit/\n');

    // Initial git commit and push to remote
    helper.command.runCmd('git add .');
    helper.command.runCmd('git commit -m "initial commit"');

    // Get the current branch name (could be main or master depending on git version)
    const currentBranch = helper.command.runCmd('git branch --show-current').trim();
    helper.command.runCmd(`git push -u origin ${currentBranch}`);

    // Store the default branch name for later use
    return currentBranch;
  }

  describe('bit ci pr workflow', () => {
    let prOutput: string;
    before(() => {
      setupWorkspaceWithGitRemote();
      setupComponentsAndInitialCommit();

      // Create a feature branch
      helper.command.runCmd('git checkout -b feature/test-pr');

      // Make some changes
      helper.fs.outputFile('comp1/comp1.js', 'console.log("updated component");');
      helper.command.runCmd('git add comp1/comp1.js');
      helper.command.runCmd('git commit -m "feat: update component"');

      // in real world scenario, you would push the branch to the remote
      // and this "bit ci" command would be run in a CI environment

      prOutput = helper.command.runCmd('bit ci pr --message "test pr message"');
    });
    it('should complete successfully', () => {
      expect(prOutput).to.include('PR command executed successfully');
    });
    it('should create a lane with the components and switch back to main', () => {
      const lanes = helper.command.listLanesParsed();
      expect(lanes.currentLane).to.equal('main');
      expect(lanes.lanes).to.have.lengthOf(2);
      expect(lanes.lanes[0].name).to.equal('feature-test-pr');
      expect(lanes.lanes[0].components).to.have.lengthOf(1);
    });
    it('should export the lane to the remote', () => {
      const remoteLanes = helper.command.listRemoteLanesParsed();
      expect(remoteLanes.lanes[0].name).to.equal('feature-test-pr');
      expect(remoteLanes.lanes[0].components).to.have.lengthOf(1);
    });
    describe('importing the lane to a new workspace', () => {
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteScope();
        helper.command.importLane(`feature-test-pr`, '-x');
      });
      it('should import the lane successfully', () => {
        const lanes = helper.command.listLanesParsed();
        expect(lanes.currentLane).to.equal(`feature-test-pr`);
      });
      it('should save the git message into the snap message', () => {
        const log = helper.command.logParsed('comp1');
        const lastLog = log[log.length - 1];
        expect(lastLog.message).to.include('test pr message');
      });
    });
  });

  describe('bit ci merge workflow', () => {
    let mergeOutput: string;
    before(() => {
      setupWorkspaceWithGitRemote();
      const defaultBranch = setupComponentsAndInitialCommit();

      // Create feature branch and make changes
      helper.command.runCmd('git checkout -b feature/test-merge');
      helper.fs.outputFile('comp1/comp1.js', 'console.log("merge test");');
      helper.command.runCmd('git add comp1/comp1.js');
      helper.command.runCmd('git commit -m "fix: component update for merge"');

      // Simulate PR merge scenario by going back to default branch
      helper.command.runCmd(`git checkout ${defaultBranch}`);
      helper.command.runCmd('git merge feature/test-merge');

      // Run bit ci merge command
      mergeOutput = helper.command.runCmd('bit ci merge --message "test merge message"');
    });
    it('should complete successfully', () => {
      expect(mergeOutput).to.include('Merged PR');
    });
    it('should tag the component', () => {
      const list = helper.command.listParsed();
      const comp1 = list.find((comp) => comp.id.includes('comp1'));
      expect(comp1).to.exist;
      expect(comp1?.currentVersion).to.equal('0.0.2');
    });
    it('status should be clean', () => {
      const status = helper.command.statusJson();
      expect(status.modifiedComponents).to.have.lengthOf(0);
      helper.command.expectStatusToBeClean();
    });
    it('should export tagged components to remote', () => {
      const list = helper.command.listRemoteScopeParsed();
      const comp1 = list.find((comp) => comp.id.includes('comp1'));
      expect(comp1?.localVersion).to.equal('0.0.2');
    });
    it('should save the "ci pr" message into the tag message', () => {
      const log = helper.command.logParsed('comp1');
      const lastLog = log[log.length - 1];
      expect(lastLog.message).to.include('test merge message');
    });
  });

  describe('multi-workspace scenario', () => {
    let prOutput: string;
    before(() => {
      // Original workspace setup with git remote
      setupComponentsAndInitialCommit(1);

      // Create and push feature branch
      helper.command.runCmd('git checkout -b feature/multi-workspace');
      helper.fs.outputFile('comp1/comp1.js', 'console.log("multi workspace test");');
      helper.command.runCmd('git add comp1/comp1.js');
      helper.command.runCmd('git commit -m "feat: multi workspace changes"');
      helper.command.runCmd('git push -u origin feature/multi-workspace');

      // Simulate cloning to new workspace using git helpers
      helper.git.mimicGitCloneLocalProjectHarmony();
      helper.scopeHelper.addRemoteScope();

      // Set up git remote in the new workspace
      helper.command.runCmd('git fetch origin');
      helper.command.runCmd('git checkout feature/multi-workspace');

      // Run ci pr command in the "cloned" workspace
      prOutput = helper.command.runCmd(`bit ci pr --lane ${helper.scopes.remote}/test-clone-lane`);
    });
    it('should complete successfully', () => {
      expect(prOutput).to.include('PR command executed successfully');
    });
    it('should create the specified lane', () => {
      const lanes = helper.command.listLanesParsed();
      expect(lanes.currentLane).to.equal('main');
      expect(lanes.lanes).to.have.lengthOf(2);
      expect(lanes.lanes[0].name).to.equal('test-clone-lane');
      expect(lanes.lanes[0].components).to.have.lengthOf(1);
    });
    it('should export the lane to the remote', () => {
      const remoteLanes = helper.command.listRemoteLanesParsed();
      expect(remoteLanes.lanes[0].name).to.equal('test-clone-lane');
      expect(remoteLanes.lanes[0].components).to.have.lengthOf(1);
    });
  });

  describe('bit ci merge when checked out to a lane', () => {
    let mergeOutput: string;
    before(() => {
      setupWorkspaceWithGitRemote();
      const defaultBranch = setupComponentsAndInitialCommit();

      helper.fs.outputFile('comp1/comp1.js', 'console.log("merge test");');
      helper.command.createLane('test-merge-lane');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.command.runCmd('git checkout -b feature/test-merge');
      helper.command.runCmd('git add .');
      helper.command.runCmd('git commit -m "fix: component update for merge"');

      // Simulate PR merge scenario by going back to default branch
      helper.command.runCmd(`git checkout ${defaultBranch}`);
      helper.command.runCmd('git merge feature/test-merge');

      // Run bit ci merge command
      mergeOutput = helper.command.runCmd('bit ci merge');
    });
    it('should complete successfully', () => {
      expect(mergeOutput).to.include('Merged PR');
    });
    it('should tag the component', () => {
      const list = helper.command.listParsed();
      const comp1 = list.find((comp) => comp.id.includes('comp1'));
      expect(comp1).to.exist;
      expect(comp1?.currentVersion).to.equal('0.0.2');
    });
    it('status should be clean', () => {
      const status = helper.command.statusJson();
      expect(status.modifiedComponents).to.have.lengthOf(0);
      helper.command.expectStatusToBeClean();
    });
    it('should export tagged components to remote', () => {
      const list = helper.command.listRemoteScopeParsed();
      const comp1 = list.find((comp) => comp.id.includes('comp1'));
      expect(comp1?.localVersion).to.equal('0.0.2');
    });
    it('should delete the remote lane', () => {
      const remoteLanes = helper.command.listRemoteLanesParsed();
      expect(remoteLanes.lanes).to.have.lengthOf(0);
    });
  });
});
