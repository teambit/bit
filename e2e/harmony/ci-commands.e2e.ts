import chai, { expect } from 'chai';
import execa from 'execa';
import * as fs from 'fs-extra';
import * as path from 'path';
import { Helper } from '@teambit/legacy.e2e-helper';
import { removeChalkCharacters } from '@teambit/legacy.utils';
import { Extensions } from '@teambit/legacy.constants';
import chaiFs from 'chai-fs';
chai.use(chaiFs);

describe('ci commands', function () {
  this.timeout(0);
  let helper: Helper;

  before(() => {
    helper = new Helper();
  });

  after(() => {
    helper.scopeHelper.destroy();
  });

  function setupGitRemote() {
    // Create a bare git repository to serve as remote
    const { scopePath } = helper.scopeHelper.getNewBareScope();
    const bareRepoPath = scopePath.replace('.bit', '.git');
    helper.command.runCmd(`git init --bare ${bareRepoPath}`);

    // Initialize git in workspace and set up remote
    helper.git.initNewGitRepo(true);
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
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      setupGitRemote();
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

  /**
   * Subsequent commits to the same PR branch should re-use the existing remote lane rather than
   * deleting and recreating it. This preserves the lane's history (cloud UI shows the snap
   * progression), keeps user-made edits on the lane, and prevents a pile of archived lanes from
   * accumulating in the cloud UI.
   */
  describe('bit ci pr reuses the existing remote lane across subsequent PR commits', () => {
    let firstPrOutput: string;
    let secondPrOutput: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      setupGitRemote();
      setupComponentsAndInitialCommit();

      helper.command.runCmd('git checkout -b feature/reuse-lane-test');

      helper.fs.outputFile('comp1/comp1.js', 'console.log("first commit");');
      helper.command.runCmd('git add comp1/comp1.js');
      helper.command.runCmd('git commit -m "feat: first commit"');
      firstPrOutput = helper.command.runCmd('bit ci pr --keep-lane --message "first"');

      helper.fs.outputFile('comp2/comp2.js', 'console.log("second commit");');
      helper.command.runCmd('git add comp2/comp2.js');
      helper.command.runCmd('git commit -m "feat: second commit"');
      secondPrOutput = helper.command.runCmd('bit ci pr --keep-lane --message "second"');
    });
    it('should report that the lane was reused on the second run', () => {
      const cleanOutput = removeChalkCharacters(secondPrOutput) as string;
      expect(cleanOutput).to.match(/Lane .+\/feature-reuse-lane-test exists on remote, reusing it/);
    });
    it('should not log any temp-lane creation in either run', () => {
      const cleanFirst = removeChalkCharacters(firstPrOutput) as string;
      const cleanSecond = removeChalkCharacters(secondPrOutput) as string;
      expect(cleanFirst).to.not.match(/Created temporary lane/);
      expect(cleanSecond).to.not.match(/Created temporary lane/);
    });
    it('should leave exactly one lane on the remote with that name', () => {
      const remoteLanes = helper.command.listRemoteLanesParsed();
      const matching = remoteLanes.lanes.filter((l: any) => l.name === 'feature-reuse-lane-test');
      expect(matching).to.have.lengthOf(1);
    });
  });

  /**
   * When a PR is in flight and main moves ahead with a config change (`bit deps set`, `bit env set`,
   * etc., then `tag` + `export`), the next `bit ci pr` for that PR must merge main into the lane
   * so the lane builds against current production config. The config lives in Version objects under
   * `.bit/objects` — not git-tracked — so a git checkout of the PR branch alone won't surface it.
   */
  describe('bit ci pr merges main into the lane on subsequent runs (config-change propagation)', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      setupGitRemote();
      const defaultBranch = setupComponentsAndInitialCommit();

      // First PR commit + ci pr — lane is created with comp1's original config.
      helper.command.runCmd('git checkout -b feature/main-merge-test');
      helper.fs.outputFile('comp1/comp1.js', 'console.log("pr commit 1");');
      helper.command.runCmd('git add comp1/comp1.js');
      helper.command.runCmd('git commit -m "feat: pr commit 1"');
      helper.command.runCmd('bit ci pr --keep-lane --message "first pr commit"');

      // Main moves ahead: register a fake npm package, set it as a dep on comp1, tag, export, push.
      helper.command.runCmd(`git checkout ${defaultBranch}`);
      helper.npm.addFakeNpmPackage('is-positive', '1.0.0');
      helper.workspaceJsonc.addPolicyToDependencyResolver({ dependencies: { 'is-positive': '1.0.0' } });
      helper.command.dependenciesSet('comp1', 'is-positive@1.0.0');
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.runCmd('git add .');
      helper.command.runCmd('git commit -m "chore: bump comp1 deps on main"');
      helper.command.runCmd(`git push origin ${defaultBranch}`);

      // Second PR commit + ci pr — the PR branch picks up main's commits via merge, then ci pr
      // runs and should merge main into the lane (bringing the deps change with it).
      helper.command.runCmd('git checkout feature/main-merge-test');
      helper.command.runCmd(`git merge ${defaultBranch}`);
      helper.fs.outputFile('comp2/comp2.js', 'console.log("pr commit 2");');
      helper.command.runCmd('git add comp2/comp2.js');
      helper.command.runCmd('git commit -m "feat: pr commit 2"');
      helper.command.runCmd('bit ci pr --keep-lane --message "second pr commit"');
    });

    it("should propagate main's deps-set config change to comp1 on the lane", () => {
      // Switch to the lane locally and inspect comp1's resolved deps.
      helper.command.switchLocalLane('feature-main-merge-test');
      const showConfig = helper.command.showAspectConfig('comp1', Extensions.dependencyResolver);
      const dep = showConfig.data.dependencies.find((d: any) => d.id === 'is-positive');
      expect(
        dep,
        `expected 'is-positive' on comp1's deps after merging main, got: ${JSON.stringify(showConfig.data.dependencies, null, 2)}`
      ).to.exist;
      expect(dep.version).to.equal('1.0.0');
    });
  });

  /**
   * Same as the deps-set propagation test, but for an `bit env set` on main. Env config has its own
   * strategy in the config merger, so it's worth covering explicitly: a long-running PR's lane must
   * pick up an env that another PR changed (and tagged into objects) on main.
   */
  describe('bit ci pr propagates an env-set on main to the lane on subsequent runs', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      setupGitRemote();
      const defaultBranch = setupComponentsAndInitialCommit();

      // First PR commit + ci pr — lane is created with comp1's original (default) env.
      helper.command.runCmd('git checkout -b feature/main-env-test');
      helper.fs.outputFile('comp1/comp1.js', 'console.log("pr commit 1");');
      helper.command.runCmd('git add comp1/comp1.js');
      helper.command.runCmd('git commit -m "feat: pr commit 1"');
      helper.command.runCmd('bit ci pr --keep-lane --message "first pr commit"');

      // Main moves ahead: change comp1's env, tag, export, push.
      helper.command.runCmd(`git checkout ${defaultBranch}`);
      helper.command.setEnv('comp1', 'teambit.harmony/aspect');
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.runCmd('git add .');
      helper.command.runCmd('git commit -m "chore: change comp1 env on main"');
      helper.command.runCmd(`git push origin ${defaultBranch}`);

      // Second PR commit + ci pr — PR picks up main's commits via git merge, then ci pr should
      // sync the env change from main onto the lane.
      helper.command.runCmd('git checkout feature/main-env-test');
      helper.command.runCmd(`git merge ${defaultBranch}`);
      helper.fs.outputFile('comp2/comp2.js', 'console.log("pr commit 2");');
      helper.command.runCmd('git add comp2/comp2.js');
      helper.command.runCmd('git commit -m "feat: pr commit 2"');
      helper.command.runCmd('bit ci pr --keep-lane --message "second pr commit"');
    });

    it("should propagate main's env-set change to comp1 on the lane", () => {
      helper.command.switchLocalLane('feature-main-env-test');
      const envData = helper.command.showAspectConfig('comp1', 'teambit.envs/envs');
      expect(
        envData.config.env,
        `expected comp1's env to be updated from main, got: ${JSON.stringify(envData.config)}`
      ).to.equal('teambit.harmony/aspect');
    });
  });

  /**
   * Mirror of the test above, but the PR branch is NOT brought up to date with main (no
   * `git merge <default>`). When the PR is behind, `bit ci pr --keep-lane` must SKIP merging main
   * into the lane — pulling main's newer bit state into a lane whose git checkout still reflects
   * the older fork point would desync the lane from the source. The merge happens later, once the
   * author merges the default branch into their PR.
   */
  describe('bit ci pr does NOT merge main into the lane when the PR branch is behind', () => {
    let secondPrOutput: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      setupGitRemote();
      const defaultBranch = setupComponentsAndInitialCommit();

      // First PR commit + ci pr — lane is created with comp1's original config.
      helper.command.runCmd('git checkout -b feature/behind-main-test');
      helper.fs.outputFile('comp1/comp1.js', 'console.log("pr commit 1");');
      helper.command.runCmd('git add comp1/comp1.js');
      helper.command.runCmd('git commit -m "feat: pr commit 1"');
      helper.command.runCmd('bit ci pr --keep-lane --message "first pr commit"');

      // Main moves ahead with a deps-set config change, exported + pushed.
      helper.command.runCmd(`git checkout ${defaultBranch}`);
      helper.npm.addFakeNpmPackage('is-positive', '1.0.0');
      helper.workspaceJsonc.addPolicyToDependencyResolver({ dependencies: { 'is-positive': '1.0.0' } });
      helper.command.dependenciesSet('comp1', 'is-positive@1.0.0');
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.runCmd('git add .');
      helper.command.runCmd('git commit -m "chore: bump comp1 deps on main"');
      helper.command.runCmd(`git push origin ${defaultBranch}`);

      // Second PR commit + ci pr — crucially WITHOUT merging the default branch into the PR, so
      // the PR branch is behind. ci pr should detect this and skip the main→lane merge.
      helper.command.runCmd('git checkout feature/behind-main-test');
      helper.fs.outputFile('comp2/comp2.js', 'console.log("pr commit 2");');
      helper.command.runCmd('git add comp2/comp2.js');
      helper.command.runCmd('git commit -m "feat: pr commit 2"');
      secondPrOutput = helper.command.runCmd('bit ci pr --keep-lane --message "second pr commit"');
    });

    it('should report that it skipped merging main because the PR branch is behind', () => {
      const cleanOutput = removeChalkCharacters(secondPrOutput) as string;
      expect(cleanOutput).to.include('PR branch is behind the default branch');
    });

    it("should NOT propagate main's deps-set change to comp1 on the lane", () => {
      helper.command.switchLocalLane('feature-behind-main-test');
      const showConfig = helper.command.showAspectConfig('comp1', Extensions.dependencyResolver);
      const dep = showConfig.data.dependencies.find((d: any) => d.id === 'is-positive');
      expect(
        dep,
        `expected 'is-positive' to be absent on a behind PR, got: ${JSON.stringify(showConfig.data.dependencies, null, 2)}`
      ).to.not.exist;
    });
  });

  /**
   * When main and the PR lane both modify the same component, the bit-level lane→main merge
   * must keep the PR's version. File-level conflicts are the user's to resolve in git; once
   * resolved, the workspace already reflects the PR author's intent — bit shouldn't silently
   * override it with main's content.
   */
  describe("bit ci pr keeps the PR's content when main and lane both modified the same component", () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      setupGitRemote();
      const defaultBranch = setupComponentsAndInitialCommit();

      // 1. PR branch: write comp1 with PR's content, snap it onto the lane via ci pr.
      helper.command.runCmd('git checkout -b feature/conflict-resolution-test');
      helper.fs.outputFile('comp1/index.js', "module.exports = () => 'PR-VERSION';");
      helper.command.runCmd('git add .');
      helper.command.runCmd('git commit -m "feat: PR changes comp1"');
      helper.command.runCmd('bit ci pr --keep-lane --message "first pr commit"');

      // 2. On main: independently write comp1 with a different value, tag, export, commit, push.
      //    Now main's bit-objects have a comp1 tag whose content disagrees with the PR snap's.
      helper.command.runCmd(`git checkout ${defaultBranch}`);
      helper.fs.outputFile('comp1/index.js', "module.exports = () => 'MAIN-VERSION';");
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.runCmd('git add .');
      helper.command.runCmd('git commit -m "fix: main changes comp1 too"');
      helper.command.runCmd(`git push origin ${defaultBranch}`);

      // 3. Back to PR branch, simulate the user git-merging main with `-X ours`: the workspace
      //    keeps the PR's content for the conflicted file. (This step models user-resolved
      //    git conflicts — by the time ci pr runs, the workspace is consistent.)
      helper.command.runCmd('git checkout feature/conflict-resolution-test');
      helper.command.runCmd(`git merge ${defaultBranch} -X ours --no-edit`);

      // 4. Make an unrelated PR change + commit, then run ci pr — this triggers
      //    mergeMainIntoLane, which must use 'ours' to preserve the PR's comp1 content.
      helper.fs.outputFile('comp2/index.js', "module.exports = () => 'pr-comp2';");
      helper.command.runCmd('git add .');
      helper.command.runCmd('git commit -m "feat: more pr changes"');
      helper.command.runCmd('bit ci pr --keep-lane --message "second pr commit"');
    });

    it("lane's comp1 should still have the PR's version, not main's", () => {
      helper.command.switchLocalLane('feature-conflict-resolution-test');
      const comp1Content = helper.fs.readFile('comp1/index.js');
      expect(comp1Content, `expected PR's content on comp1, got: ${comp1Content}`).to.include('PR-VERSION');
      expect(comp1Content).to.not.include('MAIN-VERSION');
    });
  });

  describe('bit ci merge workflow', () => {
    let mergeOutput: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      setupGitRemote();
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

  describe('bit ci merge with --skip-push flag', () => {
    let mergeOutput: string;
    let defaultBranch: string;
    let localCommitSha: string;
    let remoteCommitSha: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      setupGitRemote();
      defaultBranch = setupComponentsAndInitialCommit();

      // Create feature branch and make changes
      helper.command.runCmd('git checkout -b feature/test-skip-push');
      helper.fs.outputFile('comp1/comp1.js', 'console.log("skip push test");');
      helper.command.runCmd('git add comp1/comp1.js');
      helper.command.runCmd('git commit -m "fix: component update for skip-push test"');

      // Simulate PR merge scenario by going back to default branch
      helper.command.runCmd(`git checkout ${defaultBranch}`);
      helper.command.runCmd('git merge feature/test-skip-push');

      // Get the remote commit SHA before running ci merge
      remoteCommitSha = helper.command.runCmd(`git rev-parse origin/${defaultBranch}`).trim();

      // Run bit ci merge command with --skip-push
      mergeOutput = helper.command.runCmd('bit ci merge --skip-push --message "test skip-push message"');

      // Get the local commit SHA after running ci merge
      localCommitSha = helper.command.runCmd('git rev-parse HEAD').trim();
    });
    it('should complete successfully', () => {
      expect(mergeOutput).to.include('Merged PR');
    });
    it('should show skip-push message in output', () => {
      expect(mergeOutput).to.include('Skipping git push');
    });
    it('should tag the component', () => {
      const list = helper.command.listParsed();
      const comp1 = list.find((comp) => comp.id.includes('comp1'));
      expect(comp1).to.exist;
      expect(comp1?.currentVersion).to.equal('0.0.2');
    });
    it('should export tagged components to remote scope', () => {
      const list = helper.command.listRemoteScopeParsed();
      const comp1 = list.find((comp) => comp.id.includes('comp1'));
      expect(comp1?.localVersion).to.equal('0.0.2');
    });
    it('should create local git commit but NOT push to remote', () => {
      // Local should be ahead of remote
      expect(localCommitSha).to.not.equal(remoteCommitSha);

      // Verify remote is still at the old commit
      const currentRemoteSha = helper.command.runCmd(`git rev-parse origin/${defaultBranch}`).trim();
      expect(currentRemoteSha).to.equal(remoteCommitSha);
    });
    it('should allow manual push after ci merge', () => {
      // Simulate user pushing manually after ci merge
      helper.command.runCmd(`git push origin ${defaultBranch}`);

      // Now remote should be at the same commit as local
      const currentRemoteSha = helper.command.runCmd(`git rev-parse origin/${defaultBranch}`).trim();
      expect(currentRemoteSha).to.equal(localCommitSha);
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

  describe('bit ci merge with versions file', () => {
    let mergeOutput: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      setupGitRemote();
      const defaultBranch = setupComponentsAndInitialCommit(3);

      // Create feature branch and make changes
      helper.command.runCmd('git checkout -b feature/test-versions-file');
      helper.fs.outputFile('comp1/comp1.js', 'console.log("versions file test");');
      helper.fs.outputFile('comp2/comp2.js', 'console.log("versions file test 2");');
      helper.fs.outputFile('comp3/comp3.js', 'console.log("versions file test 3");');
      helper.command.runCmd('git add .');
      helper.command.runCmd('git commit -m "feat: update components for versions file test"');

      // Simulate PR merge scenario by going back to default branch
      helper.command.runCmd(`git checkout ${defaultBranch}`);
      helper.command.runCmd('git merge feature/test-versions-file');

      // Create versions file
      const versionsFileContent = `# Default version for unspecified components
DEFAULT: minor

# Component-specific versions
${helper.scopes.remote}/comp1: 2.0.0
${helper.scopes.remote}/comp3: 1.5.0`;
      helper.fs.outputFile('versions.txt', versionsFileContent);

      // Add the versions file to git so it survives the git operations in ci merge
      helper.command.runCmd('git add versions.txt');
      helper.command.runCmd('git commit -m "add versions file"');

      // Run bit ci merge command with versions file (use same approach as working tag test)
      mergeOutput = helper.command.runCmd('bit ci merge --versions-file versions.txt');
    });
    it('should complete successfully', () => {
      expect(mergeOutput).to.include('Merged PR');
    });
    it('should tag components according to the versions file', () => {
      const list = helper.command.listParsed();
      const comp1 = list.find((comp) => comp.id.includes('comp1'));
      const comp2 = list.find((comp) => comp.id.includes('comp2'));
      const comp3 = list.find((comp) => comp.id.includes('comp3'));

      expect(comp1?.currentVersion).to.equal('2.0.0'); // specific version from file
      expect(comp2?.currentVersion).to.equal('0.1.0'); // default version (minor) from file
      expect(comp3?.currentVersion).to.equal('1.5.0'); // specific version from file
    });
    it('status should be clean', () => {
      const status = helper.command.statusJson();
      expect(status.modifiedComponents).to.have.lengthOf(0);
      helper.command.expectStatusToBeClean();
    });
    it('should export tagged components to remote', () => {
      const list = helper.command.listRemoteScopeParsed();
      const comp1 = list.find((comp) => comp.id.includes('comp1'));
      const comp2 = list.find((comp) => comp.id.includes('comp2'));
      const comp3 = list.find((comp) => comp.id.includes('comp3'));

      expect(comp1?.localVersion).to.equal('2.0.0');
      expect(comp2?.localVersion).to.equal('0.1.0');
      expect(comp3?.localVersion).to.equal('1.5.0');
    });
  });

  describe('bit ci merge when checked out to a lane', () => {
    let mergeOutput: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      setupGitRemote();
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

  describe('bit ci merge when lane has config changes (env-set)', () => {
    let mergeOutput: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      setupGitRemote();
      const defaultBranch = setupComponentsAndInitialCommit();

      // Create lane and change env on comp1
      helper.command.createLane('config-lane');
      helper.command.setEnv('comp1', 'teambit.harmony/aspect');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      // Create git branch, commit, and merge to default branch
      helper.command.runCmd('git checkout -b feature/config-change');
      helper.command.runCmd('git add .');
      helper.command.runCmd('git commit -m "feat: env config change on lane"');

      helper.command.runCmd(`git checkout ${defaultBranch}`);
      helper.command.runCmd('git merge feature/config-change');

      // Run bit ci merge
      mergeOutput = helper.command.runCmd('bit ci merge');
    });
    it('should preserve the env config from the lane', () => {
      const envData = helper.command.showAspectConfig('comp1', 'teambit.envs/envs');
      expect(envData.config.env).to.equal('teambit.harmony/aspect');
    });
    it('should tag the component', () => {
      expect(mergeOutput).to.include('Merged PR');
      const list = helper.command.listParsed();
      const comp1 = list.find((comp) => comp.id.includes('comp1'));
      expect(comp1).to.exist;
      expect(comp1?.currentVersion).to.equal('0.0.2');
    });
    it('should export tagged components to remote', () => {
      const list = helper.command.listRemoteScopeParsed();
      const comp1 = list.find((comp) => comp.id.includes('comp1'));
      expect(comp1?.localVersion).to.equal('0.0.2');
    });
    it('status should be clean', () => {
      helper.command.expectStatusToBeClean();
    });
    it('should delete the remote lane', () => {
      const remoteLanes = helper.command.listRemoteLanesParsed();
      expect(remoteLanes.lanes).to.have.lengthOf(0);
    });
  });

  describe('bit ci merge when components are new to the lane (never existed on main)', () => {
    let mergeOutput: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      setupGitRemote();

      // Initial git commit with just the workspace setup (no bit components)
      helper.fs.outputFile('.gitignore', 'node_modules/\n.bit/\n');
      helper.command.runCmd('git add .');
      helper.command.runCmd('git commit -m "initial commit"');
      const defaultBranch = helper.command.runCmd('git branch --show-current').trim();
      helper.command.runCmd(`git push -u origin ${defaultBranch}`);

      // Create a lane and add NEW components directly on the lane
      helper.command.createLane('new-comps-lane');
      helper.fixtures.populateComponents(2);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      // Create a git branch, commit, and merge back to default branch
      helper.command.runCmd('git checkout -b feature/new-comps');
      helper.command.runCmd('git add .');
      helper.command.runCmd('git commit -m "feat: add new components on lane"');

      helper.command.runCmd(`git checkout ${defaultBranch}`);
      helper.command.runCmd('git merge feature/new-comps');

      // Run bit ci merge (workspace .bitmap still references the lane)
      mergeOutput = helper.command.runCmd('bit ci merge --message "merge new lane components"');
    });
    it('should complete successfully', () => {
      expect(mergeOutput).to.include('Merged PR');
    });
    it('should tag the new components', () => {
      const list = helper.command.listParsed();
      const comp1 = list.find((comp) => comp.id.includes('comp1'));
      const comp2 = list.find((comp) => comp.id.includes('comp2'));
      expect(comp1).to.exist;
      expect(comp2).to.exist;
      expect(comp1?.currentVersion).to.equal('0.0.1');
      expect(comp2?.currentVersion).to.equal('0.0.1');
    });
    it('status should be clean', () => {
      helper.command.expectStatusToBeClean();
    });
    it('should export tagged components to remote', () => {
      const list = helper.command.listRemoteScopeParsed();
      const comp1 = list.find((comp) => comp.id.includes('comp1'));
      const comp2 = list.find((comp) => comp.id.includes('comp2'));
      expect(comp1?.localVersion).to.equal('0.0.1');
      expect(comp2?.localVersion).to.equal('0.0.1');
    });
    it('should delete the remote lane', () => {
      const remoteLanes = helper.command.listRemoteLanesParsed();
      expect(remoteLanes.lanes).to.have.lengthOf(0);
    });
  });

  describe('bit ci merge after lane import --branch', () => {
    let mergeOutput: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.createLane('test-merge-lane');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      setupGitRemote();
      helper.fs.outputFile('.gitignore', 'node_modules/\n.bit/\n');
      // Get the current branch name (could be main or master depending on git version)
      const mainBranch = helper.command.runCmd('git branch --show-current').trim();
      helper.command.runCmd('git add .');
      helper.command.runCmd('git commit -m "initial commit"');

      helper.command.importLane('test-merge-lane', '--branch -x');
      const branchName = `${helper.scopes.remote}/test-merge-lane`;
      helper.fs.outputFile(`${helper.scopes.remote}/comp1/comp1.js`, 'console.log("merge test");');
      helper.command.runCmd('git commit -am "fix: component update for merge"');
      helper.command.runCmd(`git push -u origin ${branchName}`);

      helper.command.runCmd('bit ci pr');
      helper.command.runCmd(`git checkout ${mainBranch}`);
      helper.command.runCmd(`git merge ${branchName}`);
      helper.command.runCmd(`git push origin ${mainBranch}`);

      mergeOutput = helper.command.runCmd('bit ci merge');
    });
    it('should tag the components that were created on the lane', () => {
      expect(mergeOutput).not.to.include('No components to tag');

      const list = helper.command.listParsed();
      const comp1 = list.find((comp) => comp.id.includes('comp1'));
      expect(comp1).to.exist;
      expect(comp1?.currentVersion).to.equal('0.0.1');
    });
  });

  describe('bit ci merge with workspace.jsonc conflicts due to dependency version changes', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      setupGitRemote();

      // Create a fake npm package that we'll use as a dependency
      helper.npm.addFakeNpmPackage('is-positive', '1.0.0');

      // Create comp-a with a dependency on the fake package
      helper.fs.outputFile(
        'comp-a/comp-a.js',
        `const isPositive = require('is-positive');
module.exports = { isPositive };`
      );
      helper.command.addComponent('comp-a');

      helper.workspaceJsonc.addPolicyToDependencyResolver({ dependencies: { 'is-positive': '1.0.0' } });

      // Create .gitignore and initial commit
      helper.fs.outputFile('.gitignore', 'node_modules/\n.bit/\n');
      helper.command.runCmd('git add .');
      helper.command.runCmd('git commit -m "initial commit with is-positive@1.0.0"');
      const defaultBranch = helper.command.runCmd('git branch --show-current').trim();
      helper.command.runCmd(`git push -u origin ${defaultBranch}`);

      helper.command.tagAllWithoutBuild();
      helper.command.export();

      helper.command.runCmd(`git push origin ${defaultBranch}`);

      // Clone the workspace to simulate a parallel development scenario
      const workspaceBeforeDivergence = helper.scopeHelper.cloneWorkspace();

      // Bump the dependency version and tag/export again
      helper.npm.addFakeNpmPackage('is-positive', '2.0.0');
      helper.workspaceJsonc.addPolicyToDependencyResolver({ dependencies: { 'is-positive': '2.0.0' } });

      // Update workspace.jsonc with new version
      const wsConfigUpdated = helper.workspaceJsonc.read();
      wsConfigUpdated['teambit.dependencies/dependency-resolver'].policy.dependencies['is-positive'] = '2.0.0';
      helper.workspaceJsonc.write(wsConfigUpdated);

      helper.command.tagAllWithoutBuild('--unmodified');
      helper.command.export();

      // Go back to the cloned workspace (still on 1.0.0)
      helper.scopeHelper.getClonedWorkspace(workspaceBeforeDivergence);
    });

    it('should fail with clear error message about workspace.jsonc conflicts', () => {
      let error: Error | undefined;
      try {
        helper.command.runCmd('bit ci merge --auto-merge-resolve manual');
      } catch (err: any) {
        error = err;
      }

      expect(error).to.exist;
      expect(error?.message).to.include('workspace.jsonc conflicts');
      expect(error?.message).to.include('bit checkout head');
    });
  });

  /**
   * Simulates two CI runners racing `bit ci pr --build` on the same PR branch:
   * a developer pushes commit A, CI runner A starts; before A finishes, the developer
   * pushes commit B, CI runner B starts. Both runners run concurrently and both push
   * to the same remote lane.
   *
   * We model this with two cloned workspaces sharing the same remote scope and git
   * remote — each clone is a separate "runner" with its own .bit/objects and .bitmap.
   * `--build` provides a real time window in which both runners have snapped locally
   * but neither has exported yet, which is exactly when the remote race happens.
   *
   * Uses `populateComponents` for cheap, reliably-compiling components. `--build` still
   * runs the full pipeline (compile, schema, pkg), giving enough overlap between the two
   * runners that they reach the export step around the same time.
   */
  describe('bit ci pr with concurrent runners on the same PR branch', function () {
    let runnerAResult: { stdout: string; exitCode: number; failed: boolean };
    let runnerBResult: { stdout: string; exitCode: number; failed: boolean };
    let runnerAPath: string;
    let runnerBPath: string;

    before(async () => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      setupGitRemote();

      helper.fixtures.populateComponents(3);
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      helper.fs.outputFile('.gitignore', 'node_modules/\n.bit/\n');
      helper.command.runCmd('git add .');
      helper.command.runCmd('git commit -m "initial commit"');
      const defaultBranch = helper.command.runCmd('git branch --show-current').trim();
      helper.command.runCmd(`git push -u origin ${defaultBranch}`);

      helper.command.runCmd('git checkout -b feature/concurrent-ci-pr');

      // First PR commit — runner A will pick this up
      helper.fs.appendFile('comp1/index.js', '\n// concurrent test - commit A\n');
      helper.command.runCmd('git add .');
      helper.command.runCmd('git commit -m "feat: concurrent commit A"');

      runnerAPath = helper.scopes.localPath;

      // Clone the workspace to act as runner B. Both clones share the remote scope and
      // the bare git repo, so this mirrors two CI runners against the same PR.
      runnerBPath = helper.scopeHelper.cloneWorkspace();

      // Second PR commit on runner B (different file, so the two snaps touch different
      // components and don't even need a merge-base resolution to coexist on the lane).
      fs.appendFileSync(path.join(runnerBPath, 'comp2', 'index.js'), '\n// concurrent test - commit B\n');
      execa.sync('git', ['add', '.'], { cwd: runnerBPath });
      execa.sync('git', ['commit', '-m', 'feat: concurrent commit B'], { cwd: runnerBPath });

      const bitBin = helper.command.bitBin;
      const ciPrArgs = ['ci', 'pr', '--build', '--keep-lane'];

      const procA = execa(bitBin, [...ciPrArgs, '--message', 'commit-A'], {
        cwd: runnerAPath,
        reject: false,
      });
      const procB = execa(bitBin, [...ciPrArgs, '--message', 'commit-B'], {
        cwd: runnerBPath,
        reject: false,
      });

      const [a, b] = await Promise.all([procA, procB]);
      runnerAResult = {
        stdout: `${a.stdout || ''}\n${a.stderr || ''}`,
        exitCode: a.exitCode ?? -1,
        failed: a.failed,
      };
      runnerBResult = {
        stdout: `${b.stdout || ''}\n${b.stderr || ''}`,
        exitCode: b.exitCode ?? -1,
        failed: b.failed,
      };
    });

    it('both runners should complete `bit ci pr` successfully', () => {
      expect(runnerAResult.exitCode, `runner A output:\n${runnerAResult.stdout}`).to.equal(0);
      expect(runnerAResult.stdout).to.include('PR command executed successfully');
      expect(runnerBResult.exitCode, `runner B output:\n${runnerBResult.stdout}`).to.equal(0);
      expect(runnerBResult.stdout).to.include('PR command executed successfully');
    });

    it('should handle the concurrent push via rebase recovery or lane reuse (no fatal conflict)', () => {
      // Depending on scheduling, the loser either (a) hit the lane-hash mismatch and recovered
      // through the adopt-and-rebase path, or (b) was slow enough that the winner's lane already
      // existed on the remote by the time it queried, so it took the reuse path. Both are correct
      // outcomes; asserting specifically on the rebase path would be timing-flaky. The real
      // invariants — exactly one lane and both snaps preserved — are asserted by the tests below.
      const rebasedA = runnerAResult.stdout.includes('Adopting the remote lane and rebasing local snaps');
      const rebasedB = runnerBResult.stdout.includes('Adopting the remote lane and rebasing local snaps');
      const reused =
        runnerAResult.stdout.includes('exists on remote, reusing it') ||
        runnerBResult.stdout.includes('exists on remote, reusing it');
      expect(
        rebasedA || rebasedB || reused,
        `expected the concurrent push to be handled via rebase or lane-reuse.\nrunner A:\n${runnerAResult.stdout}\nrunner B:\n${runnerBResult.stdout}`
      ).to.be.true;
    });

    it('should leave exactly one final-named lane on the remote', () => {
      const remoteLanes = helper.command.listRemoteLanesParsed();
      const matching = remoteLanes.lanes.filter((l: any) => l.name === 'feature-concurrent-ci-pr');
      expect(matching).to.have.lengthOf(1);
    });

    it('should preserve snaps from BOTH runners chained on the lane', () => {
      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.command.importLane('feature-concurrent-ci-pr', '-x');

      const comp1Log = helper.command.logParsed(`${helper.scopes.remote}/comp1`);
      const comp2Log = helper.command.logParsed(`${helper.scopes.remote}/comp2`);

      const comp1HasA = comp1Log.some((entry: any) => entry.message?.includes('commit-A'));
      const comp1HasB = comp1Log.some((entry: any) => entry.message?.includes('commit-B'));
      const comp2HasB = comp2Log.some((entry: any) => entry.message?.includes('commit-B'));
      expect(comp1HasA, `expected commit-A snap on comp1, got: ${JSON.stringify(comp1Log, null, 2)}`).to.be.true;
      expect(comp1HasB, `expected commit-B snap on comp1, got: ${JSON.stringify(comp1Log, null, 2)}`).to.be.true;
      expect(comp2HasB, `expected commit-B snap on comp2, got: ${JSON.stringify(comp2Log, null, 2)}`).to.be.true;
    });
  });
});
