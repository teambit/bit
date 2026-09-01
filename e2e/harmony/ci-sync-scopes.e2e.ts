import chai, { expect } from 'chai';
import * as fs from 'fs-extra';
import * as path from 'path';
import { Helper } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';
import { comp1Src, comp2Src, createGitHostEnvGuard, syncE2eHelpers } from './ci-sync-support';
chai.use(chaiFs);

/**
 * lanes whose scopes differ from this repository. Part of the `bit ci sync` e2e suite, which is split across several files so the CI
 * splitter can spread them over parallel nodes (see scripts/split-e2e-tests.js) - one file is
 * assigned whole, so a single large one sets the floor for the entire job.
 *
 * Every scenario runs against a local bare git repo as `origin` and a file:// remote scope, with the
 * git-host env unset for the file's duration. ONE cell per reconcile run: the run is the expensive
 * part, so every facet of the same run is an expect inside that cell.
 */
describe('bit ci sync: lanes whose scopes differ from this repository', function () {
  this.timeout(0);

  let helper: Helper;
  const envGuard = createGitHostEnvGuard();
  const {
    setupGitRemote,
    setupComponentsAndInitialCommit,
    setSyncConfig,
    createLaneWithSnap,
    gitFetch,
    syncRun,
    remoteBranchExists,
    remoteRefs,
    branchTipSha,
    branchTipMessage,
    laneHeadTrailer,
    fileOnBranch,
    branchPathsMatching,
    laneTipFile,
    laneSideEdit,
    branchSideCommit,
  } = syncE2eHelpers(() => helper);

  before(() => {
    envGuard.save();
    helper = new Helper();
  });

  after(() => {
    envGuard.restore();
    helper.scopeHelper.destroy();
  });

  // The cross-scope split: foreign CONTENT is refused outright; a foreign HOST is fine as long as the
  // content is this repo's, addressed by its scope-qualified id.
  describe('a lane whose components span two scopes is mirrored over its own-scope slice', () => {
    const LANE = 'cross-scope';
    const FOREIGN_ONLY_LANE = 'foreign-only';
    let otherScope: string;
    let devPath: string;
    let defaultBranch: string;

    /** the remote lane's `<id> -> head` map, for asserting what an export did and did not move */
    function remoteLaneHeads(laneName: string): Record<string, string> {
      const parsed = helper.command.listRemoteLanesParsed();
      const lane = parsed.lanes.find((l: any) => (l.id?.name ?? l.name) === laneName);
      const heads: Record<string, string> = {};
      (lane?.components ?? []).forEach((c: any) => {
        heads[typeof c.id === 'string' ? c.id : c.id.toString()] = c.head;
      });
      return heads;
    }

    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      // A second remote scope, mutually reachable, so one lane can carry components of both.
      const { scopeName, scopePath } = helper.scopeHelper.getNewBareScope('-other-scope');
      otherScope = scopeName;
      helper.scopeHelper.addRemoteScope(scopePath);
      helper.scopeHelper.addRemoteScope(scopePath, helper.scopes.remotePath);
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, scopePath);
      setupGitRemote();
      setSyncConfig({ lanes: ['*'] });

      // The CI repository tracks ONLY comp1 — comp2 belongs to the other scope, and its source never
      // lived in this repository (the real cross-scope shape: another repo's component on the lane).
      helper.fs.outputFile('comp1/index.js', comp1Src('initial'));
      helper.command.addComponent('comp1');
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      helper.fs.outputFile('.gitignore', 'node_modules/\n.bit/\n');
      helper.command.runCmd('git add .');
      helper.command.runCmd('git commit -m "initial commit"');
      defaultBranch = helper.command.runCmd('git branch --show-current').trim();
      helper.command.runCmd(`git push -u origin ${defaultBranch}`);

      // The "developer on bit.cloud" snaps BOTH components on one lane hosted by this scope: comp1
      // (this repository's) and comp2, added under the OTHER scope.
      devPath = helper.scopeHelper.cloneWorkspace();
      helper.command.runCmd(`bit lane create ${LANE}`, devPath);
      fs.outputFileSync(path.join(devPath, 'comp1', 'index.js'), comp1Src('cross-scope-snap'));
      fs.outputFileSync(path.join(devPath, 'comp2', 'index.js'), comp2Src('cross-scope-snap'));
      helper.command.runCmd('bit add comp2', devPath);
      helper.command.runCmd(`bit scope set ${otherScope} comp2`, devPath);
      helper.command.runCmd('bit snap --message "cross-scope lane snap"', devPath);
      helper.command.runCmd('bit export', devPath);
    });

    it('targeted explicitly: mirrors the own-scope slice onto a branch and leaves the foreign component out', () => {
      // setup sanity: the lane really does span two scopes
      const ids = Object.keys(remoteLaneHeads(LANE));
      expect(ids.join(' ')).to.include(`${otherScope}/comp2`);
      expect(ids.join(' ')).to.include(`${helper.scopes.remote}/comp1`);

      const { output, exitCode } = syncRun(LANE);
      expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
      expect(output).to.include(`${LANE} -> import-lane`);
      expect(remoteBranchExists(LANE)).to.be.true;
      // comp1's lane content landed on the branch…
      expect(fileOnBranch(LANE, 'comp1/index.js')).to.include('cross-scope-snap');
      // …and comp2 never entered this repository: no file on the tree, no `.bitmap` entry.
      expect(branchPathsMatching(LANE, 'comp2')).to.deep.equal([]);
      expect(fileOnBranch(LANE, '.bitmap')).to.not.include(otherScope);
      expect(laneHeadTrailer(LANE)).to.match(/^[0-9a-f]{40}$/);
    });

    it('a lane change that touches only the foreign component leaves the mirror untouched, converged and green', () => {
      const shaBefore = branchTipSha(LANE);
      laneSideEdit(devPath, 'comp2/index.js', comp2Src('foreign-only-move'), 'foreign-only snap');
      const { output, exitCode } = syncRun(LANE);
      expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
      expect(output).to.include(`${LANE} -> noop (converged)`);
      expect(branchTipSha(LANE)).to.equal(shaBefore);
    });

    it('a lane change to an own component moves the mirror, still leaving the foreign component out', () => {
      laneSideEdit(devPath, 'comp1/index.js', comp1Src('own-move'), 'own snap');
      const { output, exitCode } = syncRun(LANE);
      expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
      // The action may be import-lane or (when the previous sync commit bundled sources, which reads
      // as suspected work) merge-diverged — what matters is the outcome: the own edit landed and the
      // foreign component still never entered the repository.
      expect(output).to.not.include('skipped');
      expect(output).to.not.include('HALTED');
      expect(fileOnBranch(LANE, 'comp1/index.js')).to.include('own-move');
      expect(branchPathsMatching(LANE, 'comp2')).to.deep.equal([]);
      expect(fileOnBranch(LANE, '.bitmap')).to.not.include(otherScope);
    });

    it('a dev commit on the branch exports only own components; the foreign lane entry keeps its head', () => {
      const headsBefore = remoteLaneHeads(LANE);
      branchSideCommit(LANE, defaultBranch, 'comp1/index.js', comp1Src('branch-edit'), 'feat: branch edit');
      const { output, exitCode } = syncRun(LANE);
      expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
      expect(output).to.include(`${LANE} -> export-branch`);
      const headsAfter = remoteLaneHeads(LANE);
      expect(headsAfter[`${helper.scopes.remote}/comp1`]).to.not.equal(headsBefore[`${helper.scopes.remote}/comp1`]);
      expect(headsAfter[`${otherScope}/comp2`]).to.equal(headsBefore[`${otherScope}/comp2`]);
      // the lane's comp1 content really is the branch's edit (not just a head that moved)
      expect(laneTipFile(devPath, 'comp1/index.js')).to.include('branch-edit');
    });

    it('a lane with NO own-scope components, targeted explicitly: refused, nothing written', () => {
      // A fresh dev clone: comp1 untouched (so it never joins the lane), comp3 under the other scope.
      const foreignDevPath = helper.scopeHelper.cloneWorkspace();
      helper.command.runCmd(`bit lane create ${FOREIGN_ONLY_LANE}`, foreignDevPath);
      fs.outputFileSync(path.join(foreignDevPath, 'comp3', 'index.js'), `module.exports = () => 'comp3';\n`);
      helper.command.runCmd('bit add comp3', foreignDevPath);
      helper.command.runCmd(`bit scope set ${otherScope} comp3`, foreignDevPath);
      helper.command.runCmd('bit snap --message "foreign-only lane snap"', foreignDevPath);
      helper.command.runCmd('bit export', foreignDevPath);

      const refsBefore = remoteRefs();
      const { output, exitCode } = syncRun(FOREIGN_ONLY_LANE);
      expect(exitCode, `bit ci sync output:\n${output}`).to.not.equal(0);
      expect(output).to.include('nothing to mirror');
      expect(output).to.include(`this repo maps scope ${helper.scopes.remote}`);
      expect(output).to.include(`${otherScope}/comp3`);
      expect(output).to.include('No branch was created and nothing was written');
      // not a halt: no bit-sync-conflict machinery is involved
      expect(output).to.not.include('HALTED');
      expect(output).to.not.include('bit-sync-conflict');
      expect(remoteBranchExists(FOREIGN_ONLY_LANE)).to.be.false;
      expect(remoteRefs()).to.equal(refsBefore);
    });

    it('an --all run: the mirrored lane converges, the foreign-only one is skipped, and the run stays green', () => {
      const { output, exitCode } = syncRun('--all');
      expect(exitCode, `bit ci sync --all output:\n${output}`).to.equal(0);
      expect(output).to.include(`${LANE} -> noop (converged)`);
      expect(output).to.include(`${FOREIGN_ONLY_LANE} -> skipped (nothing to mirror:`);
      expect(output).to.not.include('HALTED');
      expect(remoteBranchExists(FOREIGN_ONLY_LANE)).to.be.false;
      expect(output).to.include('main ->');
    });

    // `--all` reaches the per-lane reconciler without the command layer's name checks, so the
    // reserved-branch guard has to live in the reconciler itself; this proves it does.
    it('a lane whose configured branch is the default branch: should be skipped before it is even read', () => {
      gitFetch();
      const shaBefore = branchTipSha(defaultBranch);
      setSyncConfig({ lanes: ['*'], branches: { [LANE]: defaultBranch } });
      const { output, exitCode } = syncRun('--all');
      expect(output).to.include(`${LANE} -> skipped`);
      expect(output).to.include(`maps to ${defaultBranch}`);
      expect(output).to.include('the main scope is reconciled by "bit ci sync --main"');
      // refused before even reading the lane, so the empty-slice check never gets a say
      expect(output).to.not.include(`${LANE} -> skipped (nothing to mirror:`);
      expect(branchTipSha(defaultBranch)).to.equal(shaBefore);
      expect(exitCode, `bit ci sync --all output:\n${output}`).to.equal(0);
      setSyncConfig({ lanes: ['*'] });
    });
  });

  describe('a lane hosted on another scope, with content in this repo scope, syncs when targeted by its id', () => {
    const LANE = 'hosted-elsewhere';
    let hostScope: string;
    let defaultBranch: string;

    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      const { scopeName, scopePath } = helper.scopeHelper.getNewBareScope('-lane-host');
      hostScope = scopeName;
      helper.scopeHelper.addRemoteScope(scopePath);
      helper.scopeHelper.addRemoteScope(scopePath, helper.scopes.remotePath);
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, scopePath);
      setupGitRemote();
      setSyncConfig({ lanes: ['*'] });
      defaultBranch = setupComponentsAndInitialCommit();

      // `--scope` puts the lane OBJECT on another scope; the components on it are still this
      // workspace's, so the lane's content is entirely this repository's business.
      createLaneWithSnap(
        LANE,
        { 'comp1/index.js': comp1Src('hosted-elsewhere-snap') },
        'snap on a foreign-hosted lane',
        `--scope ${hostScope}`
      );
    });

    it('targeted by its scope-qualified id: should mirror onto the branch its NAME maps to, id and all', () => {
      const { output, exitCode } = syncRun(`${hostScope}/${LANE}`);
      expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
      expect(output).to.include(`${LANE} -> import-lane`);
      expect(remoteBranchExists(LANE)).to.be.true;
      expect(remoteBranchExists(`${hostScope}/${LANE}`)).to.be.false;
      // A pointer at `<defaultScope>/<name>` would name a lane that does not exist.
      const bitmap = fileOnBranch(LANE, '.bitmap');
      expect(bitmap).to.include('_bit_lane');
      expect(bitmap).to.include(hostScope);
      const message = branchTipMessage(LANE);
      expect(message).to.include(`sync lane ${hostScope}/${LANE}`);
      expect(message).to.include('[bit-sync]');
      expect(laneHeadTrailer(LANE)).to.be.a('string').with.lengthOf(40);
      const onBranch = fileOnBranch(LANE, 'comp1/index.js');
      expect(onBranch, `comp1/index.js on origin/${LANE}:\n${onBranch}`).to.include('hosted-elsewhere-snap');
      expect(fileOnBranch(defaultBranch, 'comp1/index.js')).to.include('comp1: initial');
      // the real lane id has to round-trip through the commit subject for this to re-read as converged
      const tip = branchTipSha(LANE);
      const rerun = syncRun(`${hostScope}/${LANE}`);
      expect(rerun.exitCode, `bit ci sync output:\n${rerun.output}`).to.equal(0);
      expect(rerun.output).to.include(`${LANE} -> noop (converged)`);
      expect(branchTipSha(LANE)).to.equal(tip);
    });

    // A branch name carries no scope, so this resolves against `defaultScope`, mismatches the pointer,
    // and reads `inherited-or-none` — the safe direction of the Stage-0 trade.
    it('the same branch reached by NAME: should leave it alone rather than retire it', () => {
      const shaBefore = branchTipSha(LANE);
      const { output, exitCode } = syncRun(`--branch ${LANE}`);
      expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
      expect(output).to.include(`${LANE} -> noop`);
      expect(output).to.not.include('close-pr');
      expect(remoteBranchExists(LANE)).to.be.true;
      expect(branchTipSha(LANE)).to.equal(shaBefore);
    });

    it('a same-named lane in THIS scope: should halt under --dry-run and for real, leaving the owner’s branch', () => {
      const shaBefore = branchTipSha(LANE);
      // Same lane NAME, this repository's own scope; `--alias` because the workspace already tracks
      // the foreign-hosted lane under that name locally.
      createLaneWithSnap(LANE, { 'comp2/index.js': comp2Src('rival-lane-snap') }, 'rival lane snap', '--alias rival');

      // The dry run goes FIRST: run after the real halt, the label would already be there and the
      // no-write claim would prove nothing.
      const refsBeforeDryRun = remoteRefs();
      const dry = syncRun(`${LANE} --dry-run`);
      expect(dry.exitCode, `bit ci sync --dry-run output:\n${dry.output}`).to.not.equal(0);
      expect(dry.output).to.include(`HALTED ${LANE} -> branch ${LANE} mirrors lane ${hostScope}/${LANE}`);
      // Proof the PR-writing branch was skipped rather than merely having had no PR to write to.
      expect(dry.output).to.include('Dry-run: the PR is not labelled or commented on');
      expect(remoteRefs()).to.equal(refsBeforeDryRun);

      // Bare name => this workspace's defaultScope, i.e. the rival lane.
      const { output, exitCode } = syncRun(LANE);
      expect(exitCode, `bit ci sync output:\n${output}`).to.not.equal(0);
      expect(output).to.include(`HALTED ${LANE} -> branch ${LANE} mirrors lane ${hostScope}/${LANE}`);
      expect(output).to.include(`refusing to plan for ${helper.scopes.remote}/${LANE}`);
      expect(branchTipSha(LANE)).to.equal(shaBefore);
      expect(fileOnBranch(LANE, 'comp1/index.js')).to.include('hosted-elsewhere-snap');
      // The rival lane's content never reached the branch.
      expect(fileOnBranch(LANE, 'comp2/index.js')).to.not.include('rival-lane-snap');
    });
  });

  // D2 proves the default (halt); these two prove the automatic policies on the same shape. The
  // load-bearing assertions are on file bytes — a policy that "succeeded" while dropping either half
  // would pass any summary-line check.
});
