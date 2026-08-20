import chai, { expect } from 'chai';
import * as fs from 'fs-extra';
import * as path from 'path';
import { Helper } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';
import { NO_GIT_HOST_WARNING, comp1Src, comp2Src, createGitHostEnvGuard, syncE2eHelpers } from './ci-sync-support';
chai.use(chaiFs);

/**
 * main-scope reconciliation. Part of the `bit ci sync` e2e suite, which is split across several files so the CI
 * splitter can spread them over parallel nodes (see scripts/split-e2e-tests.js) - one file is
 * assigned whole, so a single large one sets the floor for the entire job.
 *
 * Every scenario runs against a local bare git repo as `origin` and a file:// remote scope, with the
 * git-host env unset for the file's duration. ONE cell per reconcile run: the run is the expensive
 * part, so every facet of the same run is an expect inside that cell.
 */
describe('bit ci sync: main-scope reconciliation', function () {
  this.timeout(0);

  const SYNC_BRANCH_MAIN = 'bit-sync/main';

  let helper: Helper;
  const envGuard = createGitHostEnvGuard();
  const {
    setupSyncWorkspace,
    createLaneWithSnap,
    runBit,
    gitFetch,
    syncRun,
    seedSync,
    remoteBranchExists,
    remoteRefs,
    branchTipSha,
    branchTipMessage,
    fileOnBranch,
    branchPathsMatching,
  } = syncE2eHelpers(() => helper);

  before(() => {
    envGuard.save();
    helper = new Helper();
  });

  after(() => {
    envGuard.restore();
    helper.scopeHelper.destroy();
  });

  // F must observe pristine remote refs WHILE drift exists — exactly the state E needs before it
  // runs — so F comes first and E right after it.
  describe('main-scope sync and --dry-run (scenarios E, F)', () => {
    const LANE = 'dry-lane';
    const SYNC_BRANCH = 'bit-sync/main';
    let defaultBranch: string;

    before(() => {
      ({ defaultBranch } = setupSyncWorkspace({ lanes: ['*'] }));
      // one clone drives a lane (so `--all` has a lane target to plan), a second moves the main scope
      createLaneWithSnap(LANE, { 'comp2/index.js': comp2Src('dry-lane-snap') }, 'dry lane snap');
      const devMainPath = helper.scopeHelper.cloneWorkspace();

      // The main scope moves ahead of the repository: comp1 and comp2 are tagged 0.0.2 and exported,
      // but nothing is committed to git. That is the drift `bit ci sync --main` proposes as a PR.
      fs.outputFileSync(path.join(devMainPath, 'comp1', 'index.js'), comp1Src('main-scope-v2'));
      fs.outputFileSync(path.join(devMainPath, 'comp2', 'index.js'), comp2Src('main-scope-v2'));
      helper.command.runCmd('bit tag --message "bump both components on main"', devMainPath);
      helper.command.runCmd('bit export', devMainPath);

      // AND unexported source drift on the default branch: comp1 is modified relative to `.bitmap`
      // AND its head moved in the scope — the state that forces a real three-way merge.
      helper.fs.outputFile('comp1/index.js', comp1Src('unexported-git-drift'));
      helper.command.runCmd('git add -A');
      helper.command.runCmd('git commit -m "chore: source drift that was never exported"');
      helper.command.runCmd(`git push origin ${defaultBranch}`);
      gitFetch();
    });

    it('F: --all --dry-run plans an action per target and leaves every ref on the git remote untouched', () => {
      const refsBefore = remoteRefs();
      const { output, exitCode } = syncRun('--all --dry-run');
      expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
      expect(output).to.include('Dry-run');
      expect(output).to.include(`${LANE} -> import-lane`);
      expect(output).to.include('would open sync PR');
      // the no-write claim is not vacuous only if the drift it would act on was really detected
      expect(output).to.include('main -> drift in');
      expect(remoteRefs()).to.equal(refsBefore);
      expect(remoteBranchExists(LANE)).to.be.false;
      expect(remoteBranchExists(SYNC_BRANCH)).to.be.false;
    });

    // The shape that used to PLAN a halt here ("cannot tell which side is newer") now plans
    // adopt-branch: first contact, not a conflict. The dry run reports the plan, exits 0, and writes
    // nothing. Dry-run HALT coverage (non-zero exit, HALTED prefix) lives in the cross-scope suite.
    it('F2: a --dry-run that plans a first-contact adoption reports it and exits 0', () => {
      const refsBefore = remoteRefs();
      helper.command.runCmd(`git checkout -f -b ${LANE} origin/${defaultBranch}`);
      helper.fs.outputFile('docs/plan.md', 'dev work this repository never gave bit any state for\n');
      helper.command.runCmd('git add -A');
      helper.command.runCmd('git commit -m "docs: dev work on a lane-mapped branch"');
      helper.command.runCmd(`git push origin ${LANE}`);
      helper.command.runCmd(`git checkout -f ${defaultBranch}`);
      try {
        const { output, exitCode } = syncRun(`${LANE} --dry-run`);
        expect(exitCode, `bit ci sync --dry-run output:\n${output}`).to.equal(0);
        expect(output).to.include(`Dry-run: ${LANE} -> adopt-branch`);
        expect(output).to.not.include('HALTED');
      } finally {
        // leave the block's refs as F found them — the local branch too, or the next run refuses to reset it
        helper.command.runCmd(`git push origin :refs/heads/${LANE}`);
        helper.command.runCmd(`git branch -D ${LANE}`);
        gitFetch();
      }
      expect(remoteRefs()).to.equal(refsBefore);
    });

    it('E: --main pushes the scope-resolved drift onto the sync branch, never the default branch, then converges', () => {
      const { output, exitCode } = syncRun('--main');
      // unexported source drift on the default branch must not halt the run
      expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
      expect(output).to.not.include('HALTED');
      expect(output).to.not.include('auto-merge-resolve');
      expect(output).to.include(`main -> pushed sync commit to ${SYNC_BRANCH}`);
      expect(output).to.include(NO_GIT_HOST_WARNING);
      expect(output).to.include('pushed sync branch, skipping PR operations');
      expect(remoteBranchExists(SYNC_BRANCH)).to.be.true;
      const message = branchTipMessage(SYNC_BRANCH);
      expect(message).to.include('[bit-sync]');
      expect(message).to.include('chore(bit-sync): sync git to latest main scope versions');
      expect(fileOnBranch(SYNC_BRANCH, 'comp2/index.js')).to.include('main-scope-v2');
      // the conflicted file is resolved in favour of the SCOPE, not the git drift
      const onBranch = fileOnBranch(SYNC_BRANCH, 'comp1/index.js');
      expect(onBranch, `comp1/index.js on origin/${SYNC_BRANCH}:\n${onBranch}`).to.include('main-scope-v2');
      expect(onBranch).to.not.include('unexported-git-drift');
      // non-vacuous: the default branch still holds the drift, and never gained the scope's version.
      expect(fileOnBranch(defaultBranch, 'comp1/index.js')).to.include('unexported-git-drift');
      expect(fileOnBranch(defaultBranch, 'comp2/index.js')).to.include('comp2: initial');
      expect(helper.command.runCmd('git branch --show-current').trim()).to.equal(defaultBranch);
      const tip = branchTipSha(SYNC_BRANCH);
      const rerun = syncRun('--main');
      expect(rerun.exitCode, `bit ci sync output:\n${rerun.output}`).to.equal(0);
      expect(rerun.output).to.include('main -> converged');
      expect(branchTipSha(SYNC_BRANCH)).to.equal(tip);
    });

    it('--all reconciles the lane and the main scope in one run', () => {
      const { output, exitCode } = syncRun('--all');
      expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
      expect(output).to.include(`${LANE} -> import-lane`);
      expect(output).to.include('main ->');
      expect(remoteBranchExists(LANE)).to.be.true;
      expect(fileOnBranch(LANE, 'comp2/index.js')).to.include('dry-lane-snap');
      expect(branchTipMessage(LANE)).to.include('Bit-Lane-Head:');
    });

    // The main-sync path force-checkouts the sync branch to compute the drift by diff, BEFORE the
    // dry-run return — so before this guard a dry run exited 0 with the developer's edit destroyed.
    it('--main --dry-run over uncommitted work refuses, and leaves that work exactly as it was', () => {
      const edit = comp1Src('uncommitted-local-edit-that-must-survive');
      const untrackedDir = 'scratch';
      helper.fs.outputFile('comp1/index.js', edit);
      helper.fs.outputFile(`${untrackedDir}/notes.txt`, 'untracked scratch\n');

      const { output, exitCode } = runBit('bit ci sync --main --dry-run');
      expect(exitCode, `bit ci sync output:\n${output}`).to.not.equal(0);
      expect(output).to.include('--dry-run refuses to run');
      expect(output).to.include('comp1/index.js');
      expect(output).to.include('Commit or stash them first');
      expect(fs.readFileSync(path.join(helper.scopes.localPath, 'comp1', 'index.js')).toString()).to.equal(edit);
      expect(path.join(helper.scopes.localPath, untrackedDir, 'notes.txt')).to.be.a.path();

      // leave the block's workspace as the other cells found it
      helper.command.runCmd('git checkout -- comp1/index.js');
      fs.removeSync(path.join(helper.scopes.localPath, untrackedDir));
    });
  });

  // The load-bearing half is the negative: `bit-sync/main` is never created or touched, checked both
  // on the run that pushes and on the converged rerun.
  // A component's main file can legitimately move (an env stops emitting `dist/`, so main goes back
  // to source) and the old path is deleted in git. The repository's `.bitmap` still names the old
  // path, so the component cannot be loaded at all - and one such entry used to fail the whole
  // main-scope checkout, turning every scheduled run red. Healed inside the reconciler.

  // The load-bearing half is the negative: `bit-sync/main` is never created or touched, checked both
  // on the run that pushes and on the converged rerun.
  // A component's main file can legitimately move (an env stops emitting `dist/`, so main goes back
  // to source) and the old path is deleted in git. The repository's `.bitmap` still names the old
  // path, so the component cannot be loaded at all - and one such entry used to fail the whole
  // main-scope checkout, turning every scheduled run red. Healed inside the reconciler.
  describe('main sync recovers from a .bitmap entry whose main file no longer exists', () => {
    let defaultBranch: string;

    before(() => {
      ({ defaultBranch } = setupSyncWorkspace({ lanes: [] }));
      const devMainPath = helper.scopeHelper.cloneWorkspace();

      // comp1: the realistic shape - the new version's main file (main.js) IS in this repository,
      // only the `.bitmap` pointer is stale. comp2: nothing usable is left here at all.
      fs.outputFileSync(path.join(devMainPath, 'comp1', 'main.js'), comp1Src('main-file-moved'));
      fs.removeSync(path.join(devMainPath, 'comp1', 'index.js'));
      helper.command.runCmd('bit add comp1 --main main.js --id comp1', devMainPath);
      fs.outputFileSync(path.join(devMainPath, 'comp2', 'renamed.js'), comp2Src('main-file-moved'));
      fs.removeSync(path.join(devMainPath, 'comp2', 'index.js'));
      helper.command.runCmd('bit add comp2 --main renamed.js --id comp2', devMainPath);
      helper.command.runCmd('bit tag --message "move both main files"', devMainPath);
      helper.command.runCmd('bit export', devMainPath);

      // This repository: comp1 has the new main file on disk but `.bitmap` still says index.js;
      // comp2 has neither file.
      helper.fs.outputFile('comp1/main.js', comp1Src('main-file-moved'));
      helper.fs.deletePath('comp1/index.js');
      helper.fs.deletePath('comp2/index.js');
      helper.command.runCmd('git add -A');
      helper.command.runCmd('git commit -m "chore: main files moved; .bitmap still names the old ones"');
      helper.command.runCmd(`git push origin ${defaultBranch}`);
      gitFetch();
    });

    it('should repair both entries instead of failing, and open the sync PR', () => {
      const { output, exitCode } = syncRun('--main');
      expect(exitCode, `bit ci sync --main output:\n${output}`).to.equal(0);
      // the old behaviour: "main file index.js was removed from ..." and a HALTED line
      expect(output).to.not.include('was removed from');
      expect(output).to.not.include('HALTED');
      // comp1 keeps its directory - only the pointer moved
      expect(output).to.include('Repointed 1 .bitmap entr');
      expect(output).to.include('main.js');
      // comp2 had nothing usable left, so it is re-imported from the scope
      expect(output).to.include('Untracked 1 component(s)');
      expect(remoteBranchExists(SYNC_BRANCH_MAIN)).to.be.true;
    });

    it('should leave a loadable workspace on the sync branch: comp1 in place, comp2 re-imported', () => {
      const bitmap = fileOnBranch(SYNC_BRANCH_MAIN, '.bitmap');
      // comp1: same rootDir, repaired mainFile
      expect(bitmap).to.include('"mainFile": "main.js"');
      expect(bitmap).to.include('"rootDir": "comp1"');
      // comp2: re-imported from the scope with its current main file
      expect(bitmap).to.include('"mainFile": "renamed.js"');
      expect(branchPathsMatching(SYNC_BRANCH_MAIN, 'renamed.js')).to.not.deep.equal([]);
    });

    it('a second run is converged - the heal is not re-applied every run', () => {
      const { output, exitCode } = syncRun('--main');
      expect(exitCode, `bit ci sync --main output:\n${output}`).to.equal(0);
      expect(output).to.not.include('Repointed');
      expect(output).to.not.include('Untracked');
    });
  });

  describe('main-scope direct push (mainSync: direct-push)', () => {
    const SYNC_BRANCH = 'bit-sync/main';
    let defaultBranch: string;

    before(() => {
      ({ defaultBranch } = setupSyncWorkspace({ lanes: ['*'], mainSync: 'direct-push' }));
      // The same drift recipe as scenario E.
      const devMainPath = helper.scopeHelper.cloneWorkspace();
      fs.outputFileSync(path.join(devMainPath, 'comp1', 'index.js'), comp1Src('direct-push-v2'));
      helper.command.runCmd('bit tag --message "bump comp1 on main"', devMainPath);
      helper.command.runCmd('bit export', devMainPath);
    });

    it('should push the drift onto the default branch itself, never creating the sync branch, then converge', () => {
      const { output, exitCode } = syncRun('--main');
      expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
      const summary = output.match(/main -> direct-push \(pushed (\S+) @ ([0-9a-f]{7,40})\)/);
      expect(summary, `expected a direct-push summary in:\n${output}`).to.not.be.null;
      expect(summary![1]).to.equal(defaultBranch);
      // the sha in the summary is the tip that was actually pushed
      expect(branchTipSha(defaultBranch).startsWith(summary![2])).to.be.true;
      const message = branchTipMessage(defaultBranch);
      expect(message).to.include('[bit-sync]');
      expect(message).to.include('chore(bit-sync): sync git to latest main scope versions');
      expect(fileOnBranch(defaultBranch, 'comp1/index.js')).to.include('direct-push-v2');
      expect(remoteBranchExists(SYNC_BRANCH)).to.be.false;
      expect(output).to.not.include('skipping PR operations');
      expect(output).to.not.include('sync PR');
      expect(helper.command.runCmd('git branch --show-current').trim()).to.equal(defaultBranch);
      expect(helper.command.listLanesParsed().currentLane).to.equal('main');
      const tip = branchTipSha(defaultBranch);
      const rerun = syncRun('--main');
      expect(rerun.exitCode, `bit ci sync output:\n${rerun.output}`).to.equal(0);
      expect(rerun.output).to.include('main -> converged');
      expect(branchTipSha(defaultBranch)).to.equal(tip);
      expect(remoteBranchExists(SYNC_BRANCH)).to.be.false;
    });
  });

  // Properties that live only at the loop level: a deleted lane is still visited (via the branch half
  // of the enumeration), one halted lane must not abort the rest, lanes must not contaminate each
  // other (comp3 exists on lane A only), and an ordinary branch must survive the run.

  describe('a stale bit-sync/main that conflicts with the default branch', () => {
    const SYNC_BRANCH = 'bit-sync/main';
    let defaultBranch: string;
    let devPath: string;

    before(() => {
      ({ defaultBranch } = setupSyncWorkspace({}));
      devPath = helper.scopeHelper.cloneWorkspace();
      // the scope moves ahead: both components tag 0.0.2; the sync branch proposes that drift
      fs.outputFileSync(path.join(devPath, 'comp1', 'index.js'), comp1Src('main-scope-v2'));
      fs.outputFileSync(path.join(devPath, 'comp2', 'index.js'), comp2Src('main-scope-v2'));
      helper.command.runCmd('bit tag --message "bump to 0.0.2"', devPath);
      helper.command.runCmd('bit export', devPath);
      seedSync('--main');
      // the default branch adopts comp1@0.0.3 while the sync branch recorded 0.0.2 — the same
      // `.bitmap` line on both sides, so the catch-up merge conflicts
      fs.outputFileSync(path.join(devPath, 'comp1', 'index.js'), comp1Src('main-scope-v3'));
      helper.command.runCmd('bit tag comp1 --message "bump comp1 to 0.0.3" --unmodified', devPath);
      helper.command.runCmd('bit export', devPath);
      helper.command.runCmd('bit checkout head comp1 -x');
      helper.command.runCmd('git add -A');
      helper.command.runCmd('git commit -m "chore: adopt comp1 0.0.3"');
      helper.command.runCmd(`git push origin ${defaultBranch}`);
      gitFetch();
    });

    it('re-forks the machine-owned branch from the default branch and pushes the remaining drift', () => {
      const tipBefore = branchTipSha(SYNC_BRANCH);
      const { output, exitCode } = syncRun('--main');
      expect(exitCode, `bit ci sync output:\n${output}`).to.equal(0);
      expect(output).to.not.include('HALTED');
      expect(output).to.include('re-forking');
      expect(output).to.include(`main -> pushed sync commit to ${SYNC_BRANCH}`);
      expect(branchTipSha(SYNC_BRANCH)).to.not.equal(tipBefore);
      // the re-forked branch carries the default branch's comp1 and the scope's comp2 drift
      expect(fileOnBranch(SYNC_BRANCH, 'comp1/index.js')).to.include('main-scope-v3');
      expect(fileOnBranch(SYNC_BRANCH, 'comp2/index.js')).to.include('main-scope-v2');
      expect(fileOnBranch(SYNC_BRANCH, '.bitmap')).to.include('0.0.3');
      // non-vacuous: the default branch never gained the scope's comp2
      expect(fileOnBranch(defaultBranch, 'comp2/index.js')).to.include('comp2: initial');
      // the re-run is a converged no-op
      const rerun = syncRun('--main');
      expect(rerun.exitCode, `bit ci sync output:\n${rerun.output}`).to.equal(0);
      expect(rerun.output).to.include('main -> converged');
    });

    it('keeps the halt when a human commit sits on the sync branch', () => {
      // a human pushes straight to the sync branch, and the default branch conflicts with the edit
      helper.command.runCmd(`git fetch origin ${SYNC_BRANCH}`);
      helper.command.runCmd(`git checkout -B ${SYNC_BRANCH} origin/${SYNC_BRANCH}`);
      helper.fs.outputFile('comp1/index.js', comp1Src('human-edit-on-sync-branch'));
      helper.command.runCmd('git add -A');
      helper.command.runCmd('git commit -m "fix: a human edit on the sync branch"');
      helper.command.runCmd(`git push origin ${SYNC_BRANCH}`);
      helper.command.runCmd(`git checkout ${defaultBranch}`);
      fs.outputFileSync(path.join(devPath, 'comp1', 'index.js'), comp1Src('main-scope-v4'));
      helper.command.runCmd('bit tag comp1 --message "bump comp1 to 0.0.4" --unmodified', devPath);
      helper.command.runCmd('bit export', devPath);
      helper.command.runCmd('bit checkout head comp1 -x');
      helper.command.runCmd('git add -A');
      helper.command.runCmd('git commit -m "chore: adopt comp1 0.0.4"');
      helper.command.runCmd(`git push origin ${defaultBranch}`);
      gitFetch();

      const tipBefore = branchTipSha(SYNC_BRANCH);
      const { output, exitCode } = syncRun('--main');
      expect(exitCode, `bit ci sync output:\n${output}`).to.not.equal(0);
      expect(output).to.include('could not bring the sync branch');
      expect(output).to.not.include('re-forking');
      // the human commit survives
      expect(branchTipSha(SYNC_BRANCH)).to.equal(tipBefore);
      expect(fileOnBranch(SYNC_BRANCH, 'comp1/index.js')).to.include('human-edit-on-sync-branch');
    });
  });

  describe('bit ci sync --init (onboarding scaffolding)', () => {
    let defaultBranch: string;

    before(() => {
      ({ defaultBranch } = setupSyncWorkspace());
    });

    function workflowPath(name: string): string {
      return path.join(helper.scopes.localPath, '.github', 'workflows', name);
    }

    it('scaffolds both workflow files with the real default branch substituted, adds the sync config block, prints the checklist, and exits 0', () => {
      const { output, exitCode } = runBit('bit ci sync --init');
      expect(exitCode, `bit ci sync --init output:\n${output}`).to.equal(0);
      expect(fs.existsSync(workflowPath('bit-sync.yml')), 'bit-sync.yml should have been written').to.be.true;
      expect(fs.existsSync(workflowPath('bit-release.yml')), 'bit-release.yml should have been written').to.be.true;

      const syncYml = fs.readFileSync(workflowPath('bit-sync.yml'), 'utf8');
      const releaseYml = fs.readFileSync(workflowPath('bit-release.yml'), 'utf8');
      // single-quoted: see `yamlSingleQuoted` in init-scaffold.ts.
      expect(syncYml).to.include(`branches-ignore: ['${defaultBranch}', 'bit-sync/**']`);
      expect(releaseYml).to.include(`branches: ['${defaultBranch}']`);
      // the mainSyncBranch default must survive the substitution untouched
      expect(syncYml).to.include('main-sync-branch: bit-sync/main');
      expect(releaseYml).to.include("github.event.pull_request.head.ref != 'bit-sync/main'");

      expect(output).to.include('wrote .github/workflows/bit-sync.yml');
      expect(output).to.include('wrote .github/workflows/bit-release.yml');
      expect(output).to.include('added "teambit.git/ci": { "sync": {} } to workspace.jsonc');
      expect(helper.workspaceJsonc.read()['teambit.git/ci'].sync).to.deep.equal({});

      // the manual-steps checklist
      expect(output).to.include('BIT_CONFIG_ACCESS_TOKEN');
      expect(output).to.include('BIT_SYNC_GH_TOKEN');
      expect(output).to.include('Components > Export');
      expect(output).to.include('drops its custom headers');
      expect(output).to.include('fetch-depth: 0');
    });

    it('is idempotent: a second run skips both files and the config block, and still exits 0', () => {
      const syncYmlBefore = fs.readFileSync(workflowPath('bit-sync.yml'), 'utf8');
      const releaseYmlBefore = fs.readFileSync(workflowPath('bit-release.yml'), 'utf8');
      const { output, exitCode } = runBit('bit ci sync --init');
      expect(exitCode, `bit ci sync --init output:\n${output}`).to.equal(0);
      expect(output).to.include('skipped .github/workflows/bit-sync.yml');
      expect(output).to.include('skipped .github/workflows/bit-release.yml');
      expect(output).to.include('workspace.jsonc already configures "teambit.git/ci".sync');
      expect(fs.readFileSync(workflowPath('bit-sync.yml'), 'utf8')).to.equal(syncYmlBefore);
      expect(fs.readFileSync(workflowPath('bit-release.yml'), 'utf8')).to.equal(releaseYmlBefore);
    });

    // Built by hand because bit refuses to `init` a workspace inside another workspace — the repo root
    // must be a plain git repo that is NOT itself a workspace, exactly how a monorepo looks.
    it('should write the workflows at the REPOSITORY root when the workspace is in a subdirectory', () => {
      const repoRoot = path.join(path.dirname(helper.scopes.localPath), `subdir-repo-${Date.now()}`);
      const wsDir = path.join(repoRoot, 'packages', 'app');
      fs.mkdirpSync(wsDir);
      helper.command.runCmd('git init', repoRoot);
      helper.command.runCmd('bit init', wsDir);
      const { output, exitCode } = runBit('bit ci sync --init', wsDir);

      // non-vacuous: the run really used the SUBDIRECTORY workspace
      expect(exitCode, `bit ci sync --init output:\n${output}`).to.equal(0);
      expect(fs.existsSync(path.join(wsDir, 'workspace.jsonc')), 'the subdir must be its own workspace').to.be.true;
      expect(output).to.include('added "teambit.git/ci": { "sync": {} } to workspace.jsonc');
      expect(fs.readFileSync(path.join(wsDir, 'workspace.jsonc'), 'utf8')).to.include('teambit.git/ci');
      expect(fs.existsSync(path.join(repoRoot, 'workspace.jsonc'))).to.be.false;

      expect(
        fs.existsSync(path.join(repoRoot, '.github', 'workflows', 'bit-sync.yml')),
        'bit-sync.yml belongs at the repo root, where GitHub looks for it'
      ).to.be.true;
      expect(fs.existsSync(path.join(repoRoot, '.github', 'workflows', 'bit-release.yml'))).to.be.true;
      expect(
        fs.existsSync(path.join(wsDir, '.github')),
        'no .github may be created under the subdirectory workspace — GitHub would never discover it'
      ).to.be.false;
      // the reported path resolves from where the user is standing
      expect(output).to.match(/wrote .*\.github[/\\]workflows[/\\]bit-sync\.yml/);
      expect(output).to.not.match(/wrote \.github[/\\]workflows[/\\]bit-sync\.yml/);
    });
  });

  // `bit add` + a committed versionless `.bitmap` entry + the component's first export on a lane —
  // the onboarding quickstart's state, and the one the adoption retry exists for.
});
