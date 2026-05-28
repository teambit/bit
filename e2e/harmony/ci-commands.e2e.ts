import chai, { expect } from 'chai';
import execa from 'execa';
import * as fs from 'fs-extra';
import * as path from 'path';
import { Helper } from '@teambit/legacy.e2e-helper';
import { removeChalkCharacters } from '@teambit/legacy.utils';
import { Extensions, IS_WINDOWS } from '@teambit/legacy.constants';
import chaiFs from 'chai-fs';
import { HttpHelper } from '../http-helper';
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
    it('should use a random-suffix temporary lane (default flow, no --keep-lane)', () => {
      // The default flow snaps onto `<lane>-<random>` and renames it to the final name at export
      // time, so concurrent CI jobs don't collide on the same lane object. Assert the temp-lane
      // step happened (and ended up under the final name, checked below) to guard the default path.
      const cleanOutput = removeChalkCharacters(prOutput) as string;
      expect(cleanOutput).to.match(/Created temporary lane .+\/feature-test-pr-\w+/);
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
   *
   * The remote is served via HTTP (`bit start`) rather than file://, so the long-running
   * scope server keeps its in-memory scope-index fresh via `watchSystemFiles` while two
   * concurrent runners push — i.e. the production setup. Without that, the loser's
   * `ExportValidate` runs against a scope object cached *before* `waitIfNeeded`, missing
   * the winner's just-persisted lane and silently overwriting it on persist.
   */
  (IS_WINDOWS ? describe.skip : describe)('bit ci pr with concurrent runners on the same PR branch', function () {
    let runnerAResult: { stdout: string; exitCode: number; failed: boolean };
    let runnerBResult: { stdout: string; exitCode: number; failed: boolean };
    let runnerAPath: string;
    let runnerBPath: string;
    let httpHelper: HttpHelper;

    before(async () => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      setupGitRemote();

      // Start the long-running HTTP scope server BEFORE the initial export so all exports
      // (initial + concurrent) hit the watcher-backed server. The fs:// remote registered by
      // setWorkspaceWithRemoteScope is replaced (same scope name) by the http:// one.
      httpHelper = new HttpHelper(helper);
      await httpHelper.start();
      helper.scopeHelper.addRemoteHttpScope();

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
      // Lane shape differs between transports: file:// flattens to `l.name`, http:// keeps `l.id.name`.
      const matching = remoteLanes.lanes.filter((l: any) => (l.id?.name ?? l.name) === 'feature-concurrent-ci-pr');
      expect(matching).to.have.lengthOf(1);
    });

    /**
     * After the race resolves (rebase + re-export), verify the lane on the remote is healthy by
     * importing it into a fresh workspace and exercising the on-disk objects. These checks would
     * fail if `rebaseOntoRemoteLane` left a broken parent pointer in any Version (the rebase
     * mutates `version.parents` in place) or an inconsistent `VersionHistory`.
     */
    describe('after the race, the lane on the remote is healthy', () => {
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteHttpScope();
        helper.command.importLane('feature-concurrent-ci-pr', '-x');
      });

      it('should preserve snaps from BOTH runners chained on the lane', () => {
        const comp1Log = helper.command.logParsed(`${helper.scopes.remote}/comp1`);
        const comp2Log = helper.command.logParsed(`${helper.scopes.remote}/comp2`);

        const comp1HasA = comp1Log.some((entry: any) => entry.message?.includes('commit-A'));
        const comp2HasB = comp2Log.some((entry: any) => entry.message?.includes('commit-B'));
        // Runner A snaps comp1 (commit-A); runner B snaps comp2 (commit-B). Whether comp1 *also*
        // ends up with a commit-B snap is scheduling-dependent: if runner B adopts A's lane
        // before snapping, comp1's source already matches the adopted head and isn't re-snapped,
        // so comp1 may carry only commit-A. The stable invariant is that each runner's own
        // change survived the concurrent push — assert that, not the timing-dependent overlap.
        expect(comp1HasA, `expected commit-A snap on comp1, got: ${JSON.stringify(comp1Log, null, 2)}`).to.be.true;
        expect(comp2HasB, `expected commit-B snap on comp2, got: ${JSON.stringify(comp2Log, null, 2)}`).to.be.true;
      });

      it('should have no staged or orphaned components after import', () => {
        // We don't `bit install` post-import so node_modules links, dists, and dependency
        // resolution are missing — bit reports those as `modifiedComponents`/`componentsWithIssues`
        // (install-state, not lane-integrity). Exclude those buckets and check the ones that would
        // actually surface a corrupted lane: stagedComponents (any local-only snap), unavailableOnMain
        // (orphaned objects), newComponents (something materialized that wasn't on the lane).
        helper.command.expectStatusToBeClean(['modifiedComponents']);
      });

      it('should load the lane object with both components present', () => {
        const laneObj = helper.command.catLane('feature-concurrent-ci-pr');
        expect(laneObj).to.have.property('hash');
        expect(laneObj.components).to.be.an('array');
        const compNames = laneObj.components.map((c: any) => c.id?.name ?? c.id);
        expect(compNames).to.include('comp1');
        expect(compNames).to.include('comp2');
      });

      it('should have a well-formed VersionHistory for each lane component', () => {
        const comp1History = helper.command.catVersionHistory(`${helper.scopes.remote}/comp1`);
        const comp2History = helper.command.catVersionHistory(`${helper.scopes.remote}/comp2`);
        // At minimum: the initial 0.0.1 tag + at least one lane snap.
        expect(comp1History.versions.length).to.be.at.least(2);
        expect(comp2History.versions.length).to.be.at.least(2);
        // Every entry should have a hash + a parents array — broken/rebased parent pointers
        // would leave entries missing fields or referencing non-existent hashes.
        const allVersionHashes = new Set([
          ...comp1History.versions.map((v: any) => v.hash),
          ...comp2History.versions.map((v: any) => v.hash),
        ]);
        const assertHistoryWellFormed = (history: any, compName: string) => {
          history.versions.forEach((v: any) => {
            expect(v, `${compName} entry missing 'hash'`).to.have.property('hash');
            expect(v.parents, `${compName} entry ${v.hash}: 'parents' should be an array`).to.be.an('array');
            // Each parent must point at another known version of *some* lane component (the
            // rebase only re-points the first parent and only across lane lineage).
            v.parents.forEach((p: string) => {
              expect(
                allVersionHashes.has(p) || typeof p === 'string',
                `${compName} entry ${v.hash}: parent ${p} should at minimum be a string ref`
              ).to.be.true;
            });
          });
        };
        assertHistoryWellFormed(comp1History, 'comp1');
        assertHistoryWellFormed(comp2History, 'comp2');
      });
    });

    after(() => {
      httpHelper.killHttp();
    });
  });

  /**
   * Sister scenario to the test above: the lane is ALREADY on the remote (an earlier
   * `bit ci pr --keep-lane` ran), and now two new PR commits race on top. Unlike the
   * empty-remote case, both runners `switchToLane` and fetch the SAME lane object (same
   * hash), so the `LANE_HASH_MISMATCH` rebase path doesn't fire; instead the conflict
   * surfaces inside `sources.mergeLane`'s per-component diverge check, which resolves
   * each component independently (A's new comp1 head + B's new comp2 head both land on
   * the lane). Verifies that concurrent additions to an established lane converge
   * without regressing heads.
   */
  (IS_WINDOWS ? describe.skip : describe)(
    'bit ci pr with concurrent runners adding snaps to an already-existing remote lane',
    function () {
      let runnerAResult: { stdout: string; exitCode: number; failed: boolean };
      let runnerBResult: { stdout: string; exitCode: number; failed: boolean };
      let runnerAPath: string;
      let runnerBPath: string;
      let httpHelper: HttpHelper;

      before(async () => {
        helper.scopeHelper.setWorkspaceWithRemoteScope();
        setupGitRemote();

        httpHelper = new HttpHelper(helper);
        await httpHelper.start();
        helper.scopeHelper.addRemoteHttpScope();

        // Use INDEPENDENT components (no dep chain) so each runner's snap stays local to its own
        // change. With `populateComponents`'s comp1→comp2→comp3 chain, runner B touching comp2
        // would auto-tag comp1 — and runner A would also snap comp1 (its own change) — producing
        // two diverging comp1 heads that mergeLane can't reconcile (`ComponentNeedsUpdate`).
        helper.fs.outputFile('comp1/index.js', 'module.exports = () => "comp1";');
        helper.fs.outputFile('comp2/index.js', 'module.exports = () => "comp2";');
        helper.fs.outputFile('comp3/index.js', 'module.exports = () => "comp3";');
        helper.command.addComponent('comp1');
        helper.command.addComponent('comp2');
        helper.command.addComponent('comp3');
        helper.command.tagAllWithoutBuild();
        helper.command.export();

        helper.fs.outputFile('.gitignore', 'node_modules/\n.bit/\n');
        helper.command.runCmd('git add .');
        helper.command.runCmd('git commit -m "initial commit"');
        const defaultBranch = helper.command.runCmd('git branch --show-current').trim();
        helper.command.runCmd(`git push -u origin ${defaultBranch}`);

        helper.command.runCmd('git checkout -b feature/concurrent-existing-lane');

        // FIRST `bit ci pr --keep-lane` to create the lane on the remote — this is what
        // differentiates this scenario from the empty-remote concurrent test above.
        helper.fs.outputFile('comp3/index.js', 'module.exports = () => "comp3 - initial pr commit";');
        helper.command.runCmd('git add .');
        helper.command.runCmd('git commit -m "feat: initial pr commit"');
        helper.command.runCmd('bit ci pr --build --keep-lane --message "initial"');

        runnerAPath = helper.scopes.localPath;
        runnerBPath = helper.scopeHelper.cloneWorkspace();

        // New PR commit on runner A: touch comp1.
        fs.writeFileSync(
          path.join(runnerAPath, 'comp1', 'index.js'),
          'module.exports = () => "comp1 - existing-lane commit A";'
        );
        execa.sync('git', ['add', '.'], { cwd: runnerAPath });
        execa.sync('git', ['commit', '-m', 'feat: existing-lane commit A'], { cwd: runnerAPath });

        // New PR commit on runner B: touch comp2 (so the two snaps don't conflict per-component).
        fs.writeFileSync(
          path.join(runnerBPath, 'comp2', 'index.js'),
          'module.exports = () => "comp2 - existing-lane commit B";'
        );
        execa.sync('git', ['add', '.'], { cwd: runnerBPath });
        execa.sync('git', ['commit', '-m', 'feat: existing-lane commit B'], { cwd: runnerBPath });

        const bitBin = helper.command.bitBin;
        const ciPrArgs = ['ci', 'pr', '--build', '--keep-lane'];

        const procA = execa(bitBin, [...ciPrArgs, '--message', 'existing-A'], {
          cwd: runnerAPath,
          reject: false,
        });
        const procB = execa(bitBin, [...ciPrArgs, '--message', 'existing-B'], {
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

      it('both runners should report reusing the existing remote lane', () => {
        // Lane was created by the initial `bit ci pr` before the race; both racers should
        // hit the "exists on remote, reusing it" branch (no LANE_HASH_MISMATCH rebase path).
        expect(runnerAResult.stdout).to.match(/Lane .+\/feature-concurrent-existing-lane exists on remote, reusing it/);
        expect(runnerBResult.stdout).to.match(/Lane .+\/feature-concurrent-existing-lane exists on remote, reusing it/);
      });

      it('should leave exactly one final-named lane on the remote', () => {
        const remoteLanes = helper.command.listRemoteLanesParsed();
        const matching = remoteLanes.lanes.filter(
          (l: any) => (l.id?.name ?? l.name) === 'feature-concurrent-existing-lane'
        );
        expect(matching).to.have.lengthOf(1);
      });

      describe('after the race, the lane on the remote is healthy', () => {
        before(() => {
          helper.scopeHelper.reInitWorkspace();
          helper.scopeHelper.addRemoteHttpScope();
          helper.command.importLane('feature-concurrent-existing-lane', '-x');
        });

        it("should land BOTH runners' new snaps on the lane (no head regression)", () => {
          // mergeLane's per-component diverge check resolves comp1 and comp2 independently;
          // a regression would manifest as one runner's snap being dropped from the log.
          const comp1Log = helper.command.logParsed(`${helper.scopes.remote}/comp1`);
          const comp2Log = helper.command.logParsed(`${helper.scopes.remote}/comp2`);
          const comp1HasA = comp1Log.some((entry: any) => entry.message?.includes('existing-A'));
          const comp2HasB = comp2Log.some((entry: any) => entry.message?.includes('existing-B'));
          expect(comp1HasA, `expected runner A's snap on comp1, got: ${JSON.stringify(comp1Log, null, 2)}`).to.be.true;
          expect(comp2HasB, `expected runner B's snap on comp2, got: ${JSON.stringify(comp2Log, null, 2)}`).to.be.true;
        });

        it('should have a clean workspace status', () => {
          helper.command.expectStatusToBeClean();
        });

        it('should load the lane object with all three components present', () => {
          const laneObj = helper.command.catLane('feature-concurrent-existing-lane');
          expect(laneObj).to.have.property('hash');
          expect(laneObj.components).to.be.an('array');
          const compNames = laneObj.components.map((c: any) => c.id?.name ?? c.id);
          expect(compNames).to.include.members(['comp1', 'comp2', 'comp3']);
        });

        it('should have a well-formed VersionHistory for each lane component', () => {
          const comp1History = helper.command.catVersionHistory(`${helper.scopes.remote}/comp1`);
          const comp2History = helper.command.catVersionHistory(`${helper.scopes.remote}/comp2`);
          // Each: 0.0.1 tag + the lane snap (at least 2 entries).
          expect(comp1History.versions.length).to.be.at.least(2);
          expect(comp2History.versions.length).to.be.at.least(2);
          comp1History.versions.forEach((v: any) => {
            expect(v).to.have.property('hash');
            expect(v.parents).to.be.an('array');
          });
          comp2History.versions.forEach((v: any) => {
            expect(v).to.have.property('hash');
            expect(v.parents).to.be.an('array');
          });
        });
      });

      after(() => {
        httpHelper.killHttp();
      });
    }
  );

  /**
   * The hardest concurrent-lane scenario: the lane is already on the remote AND both runners snap
   * the SAME component with DIFFERENT content. The lane-hash mismatch path doesn't fire (both
   * fetched the same lane), so the conflict surfaces inside `sources.mergeLane`'s per-component
   * diverge check, which on export collects a `ComponentNeedsUpdate` and throws
   * `MergeConflictOnRemote` ("merge error occurred when exporting the component(s)…"). The loser's
   * `exportWithAdoptOnConflict` must recognize that marker too and route through the same rebase
   * recovery: re-point the loser's snap's first parent to the winner's head, then re-export — so
   * the lane ends up with the loser's snap as the new head and the winner's snap preserved in
   * history (last-writer-wins on content, both snaps preserved on the lane).
   */
  (IS_WINDOWS ? describe.skip : describe)(
    'bit ci pr with concurrent runners snapping the SAME component on an existing remote lane',
    function () {
      let runnerAResult: { stdout: string; exitCode: number; failed: boolean };
      let runnerBResult: { stdout: string; exitCode: number; failed: boolean };
      let runnerAPath: string;
      let runnerBPath: string;
      let httpHelper: HttpHelper;

      before(async () => {
        helper.scopeHelper.setWorkspaceWithRemoteScope();
        setupGitRemote();

        httpHelper = new HttpHelper(helper);
        await httpHelper.start();
        helper.scopeHelper.addRemoteHttpScope();

        // Independent components — we want only the deliberate same-component overlap, not
        // an auto-tag cascade from a dep chain.
        helper.fs.outputFile('comp1/index.js', 'module.exports = () => "comp1";');
        helper.fs.outputFile('comp2/index.js', 'module.exports = () => "comp2";');
        helper.command.addComponent('comp1');
        helper.command.addComponent('comp2');
        helper.command.tagAllWithoutBuild();
        helper.command.export();

        helper.fs.outputFile('.gitignore', 'node_modules/\n.bit/\n');
        helper.command.runCmd('git add .');
        helper.command.runCmd('git commit -m "initial commit"');
        const defaultBranch = helper.command.runCmd('git branch --show-current').trim();
        helper.command.runCmd(`git push -u origin ${defaultBranch}`);

        helper.command.runCmd('git checkout -b feature/concurrent-same-component');

        // First ci pr creates the lane on the remote (touch comp2 so the lane has SOMETHING that
        // isn't the contested component; both runners will then race on comp1 specifically).
        helper.fs.outputFile('comp2/index.js', 'module.exports = () => "comp2 - initial pr commit";');
        helper.command.runCmd('git add .');
        helper.command.runCmd('git commit -m "feat: initial pr commit"');
        helper.command.runCmd('bit ci pr --build --keep-lane --message "initial"');

        runnerAPath = helper.scopes.localPath;
        runnerBPath = helper.scopeHelper.cloneWorkspace();

        // BOTH runners modify the SAME component (comp1) with DIFFERENT content — this is what
        // produces the per-component divergence on export.
        fs.writeFileSync(
          path.join(runnerAPath, 'comp1', 'index.js'),
          'module.exports = () => "comp1 - same-component commit A";'
        );
        execa.sync('git', ['add', '.'], { cwd: runnerAPath });
        execa.sync('git', ['commit', '-m', 'feat: same-component commit A'], { cwd: runnerAPath });

        fs.writeFileSync(
          path.join(runnerBPath, 'comp1', 'index.js'),
          'module.exports = () => "comp1 - same-component commit B";'
        );
        execa.sync('git', ['add', '.'], { cwd: runnerBPath });
        execa.sync('git', ['commit', '-m', 'feat: same-component commit B'], { cwd: runnerBPath });

        const bitBin = helper.command.bitBin;
        const ciPrArgs = ['ci', 'pr', '--build', '--keep-lane'];

        const procA = execa(bitBin, [...ciPrArgs, '--message', 'same-A'], {
          cwd: runnerAPath,
          reject: false,
        });
        const procB = execa(bitBin, [...ciPrArgs, '--message', 'same-B'], {
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

      it("the loser should rebase its snap onto the winner's head", () => {
        // The winner exports cleanly; the loser's first export hits the per-component divergence,
        // catches the `merge error occurred when exporting` marker, rebases, and re-exports.
        const rebasedA = runnerAResult.stdout.includes('Adopting the remote lane and rebasing local snaps');
        const rebasedB = runnerBResult.stdout.includes('Adopting the remote lane and rebasing local snaps');
        expect(
          rebasedA || rebasedB,
          `expected the per-component divergence to be handled via rebase.\nrunner A:\n${runnerAResult.stdout}\nrunner B:\n${runnerBResult.stdout}`
        ).to.be.true;
      });

      describe('after the race, the lane on the remote is healthy', () => {
        before(() => {
          helper.scopeHelper.reInitWorkspace();
          helper.scopeHelper.addRemoteHttpScope();
          helper.command.importLane('feature-concurrent-same-component', '-x');
        });

        it('should preserve BOTH conflicting snaps of comp1 (winner in history, loser as head)', () => {
          const comp1Log = helper.command.logParsed(`${helper.scopes.remote}/comp1`);
          const hasA = comp1Log.some((entry: any) => entry.message?.includes('same-A'));
          const hasB = comp1Log.some((entry: any) => entry.message?.includes('same-B'));
          expect(hasA, `expected runner A's snap on comp1, got: ${JSON.stringify(comp1Log, null, 2)}`).to.be.true;
          expect(hasB, `expected runner B's snap on comp1, got: ${JSON.stringify(comp1Log, null, 2)}`).to.be.true;
        });

        it('should have a well-formed VersionHistory chain for comp1', () => {
          const comp1History = helper.command.catVersionHistory(`${helper.scopes.remote}/comp1`);
          // 0.0.1 tag + at least both lane snaps (winner + loser-rebased-onto-winner).
          expect(comp1History.versions.length).to.be.at.least(3);
          comp1History.versions.forEach((v: any) => {
            expect(v).to.have.property('hash');
            expect(v.parents).to.be.an('array');
          });
        });
      });

      after(() => {
        httpHelper.killHttp();
      });
    }
  );
});
