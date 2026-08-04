import type { Helper } from '@teambit/legacy.e2e-helper';
import * as fs from 'fs-extra';
import * as path from 'path';
import { removeChalkCharacters } from '@teambit/legacy.utils';
import execa from 'execa';

/**
 * Fixture drivers shared by the `bit ci sync` e2e suites. The filename has no `.e2e` in it on purpose:
 * the runner's spec glob matches any name containing `.e2e`, and this is support code, not a suite.
 * Drivers read the `Helper` through a getter because the spec files construct theirs in `before()`.
 */

/** env keys that would flip a run out of the PR-less path these suites assert on */
export const GIT_HOST_ENV_KEYS = ['GITHUB_TOKEN', 'BIT_GITHUB_TOKEN', 'GITHUB_REPOSITORY', 'GITHUB_HEAD_REF'];

/** Asserting on this warning proves a run really took the PR-less path. */
export const NO_GIT_HOST_WARNING = 'no git host provider is configured';

/**
 * Two components with NO dependency between them — a comp1 -> comp2 chain would auto-tag comp2 into
 * every snap of comp1 and make "which side moved which component" ambiguous.
 */
export const comp1Src = (marker: string) => `module.exports = () => 'comp1: ${marker}';\n`;
export const comp2Src = (marker: string) => `module.exports = () => 'comp2: ${marker}';\n`;

/**
 * Save/restore the git-host env for one suite. Each suite gets its own closure — the two files' hooks
 * interleave, and a shared map would let one suite's `after` restore values the other already changed.
 */
export function createGitHostEnvGuard() {
  const saved: Record<string, string | undefined> = {};
  return {
    save() {
      GIT_HOST_ENV_KEYS.forEach((key) => {
        saved[key] = process.env[key];
        delete process.env[key];
      });
    },
    restore() {
      GIT_HOST_ENV_KEYS.forEach((key) => {
        if (saved[key] === undefined) delete process.env[key];
        else process.env[key] = saved[key];
      });
    },
  };
}

export function syncE2eHelpers(getHelper: () => Helper) {
  const h = () => getHelper();

  // shared setup idioms (same as e2e/harmony/ci-commands.e2e.ts)
  function setupGitRemote() {
    const { scopePath } = h().scopeHelper.getNewBareScope();
    const bareRepoPath = scopePath.replace('.bit', '.git');
    h().command.runCmd(`git init --bare ${bareRepoPath}`);

    h().git.initNewGitRepo(true);
    h().command.runCmd(`git remote add origin ${bareRepoPath}`);

    return bareRepoPath;
  }

  function setupComponentsAndInitialCommit() {
    h().fs.outputFile('comp1/index.js', comp1Src('initial'));
    h().fs.outputFile('comp2/index.js', comp2Src('initial'));
    h().command.addComponent('comp1');
    h().command.addComponent('comp2');
    h().command.tagAllWithoutBuild();
    h().command.export();

    h().fs.outputFile('.gitignore', 'node_modules/\n.bit/\n');
    h().command.runCmd('git add .');
    h().command.runCmd('git commit -m "initial commit"');
    const currentBranch = h().command.runCmd('git branch --show-current').trim();
    h().command.runCmd(`git push -u origin ${currentBranch}`);
    return currentBranch;
  }

  /** the reconciler's config lives on the ci aspect in workspace.jsonc */
  function setSyncConfig(sync: Record<string, any> = {}) {
    h().workspaceJsonc.addKeyVal('teambit.git/ci', { sync });
  }

  /**
   * The environment every suite block starts from. `sync` omitted => no config block at all (what the
   * `--init` block needs). `bareRepoPath` is only interesting to the single-branch-clone block.
   */
  function setupSyncWorkspace(sync?: Record<string, any>): { defaultBranch: string; bareRepoPath: string } {
    h().scopeHelper.setWorkspaceWithRemoteScope();
    const bareRepoPath = setupGitRemote();
    if (sync) setSyncConfig(sync);
    return { defaultBranch: setupComponentsAndInitialCommit(), bareRepoPath };
  }

  /**
   * A "developer on bit.cloud": a workspace clone that creates `lane`, snaps `files` onto it and
   * exports. Returns the clone's path — the handle `laneSideEdit` / `laneTipFile` take.
   */
  function createLaneWithSnap(lane: string, files: Record<string, string>, message: string, laneArgs = ''): string {
    const devPath = h().scopeHelper.cloneWorkspace();
    h().command.runCmd(`bit lane create ${lane} ${laneArgs}`.trim(), devPath);
    Object.entries(files).forEach(([filePath, content]) => fs.outputFileSync(path.join(devPath, filePath), content));
    h().command.runCmd(`bit snap --message "${message}"`, devPath);
    h().command.runCmd('bit export', devPath);
    return devPath;
  }

  /**
   * Run a bit command capturing stdout, stderr AND the exit code — `bit ci sync` reports halts by
   * exiting non-zero with the summary on stderr, and `runCmd` throws on non-zero.
   */
  function runBit(cmd: string, cwd: string = h().scopes.localPath): { output: string; exitCode: number } {
    const full = cmd.startsWith('bit ') ? `${h().command.bitBin} ${cmd.slice(4)}` : cmd;
    const res = execa.sync(full, { cwd, shell: true, reject: false });
    const combined = `${res.stdout || ''}\n${res.stderr || ''}`;
    return { output: (removeChalkCharacters(combined) as string) || '', exitCode: res.exitCode ?? -1 };
  }

  function gitFetch() {
    h().command.runCmd('git fetch origin --prune');
  }

  /** `bit ci sync <args>`, then the fetch every branch assertion needs to see the pushed refs. */
  function syncRun(args: string): { output: string; exitCode: number } {
    const res = runBit(`bit ci sync ${args}`);
    gitFetch();
    return res;
  }

  /** A sync run that is fixture setup rather than an assertion target: it must succeed. */
  function seedSync(args: string) {
    const res = syncRun(args);
    if (res.exitCode !== 0) throw new Error(`setup run "bit ci sync ${args}" failed:\n${res.output}`);
  }

  function remoteBranchExists(branch: string): boolean {
    return h().command.runCmd(`git ls-remote --heads origin ${branch}`).trim().length > 0;
  }

  function remoteRefs(): string {
    return h().command.runCmd('git ls-remote origin').trim();
  }

  function branchTipSha(branch: string): string {
    return h().command.runCmd(`git rev-parse origin/${branch}`).trim();
  }

  function branchTipMessage(branch: string): string {
    return h().command.runCmd(`git log origin/${branch} -1 --format=%B`);
  }

  function laneHeadTrailer(branch: string): string | undefined {
    return branchTipMessage(branch).match(/^Bit-Lane-Head:\s*(\S+)/m)?.[1];
  }

  /** file content as committed on the remote branch (not as it happens to sit in the working tree) */
  function fileOnBranch(branch: string, filePath: string): string {
    return h().command.runCmd(`git show origin/${branch}:${filePath}`);
  }

  /**
   * The paths on the remote branch's tree whose name contains `needle`. Path-agnostic: bit picks the
   * directory for a materialized component from `defaultDirectory`, so no hard-coded path can ask
   * "is this component on the branch?".
   */
  function branchPathsMatching(branch: string, needle: string): string[] {
    return h()
      .command.runCmd(`git ls-tree -r --name-only origin/${branch}`)
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && line.includes(needle));
  }

  /** Content fingerprint of the remote lane (per-component heads), independent of the lane's random hash. */
  function remoteLaneFingerprint(laneName: string): string {
    const parsed = h().command.listRemoteLanesParsed();
    const lane = parsed.lanes.find((l: any) => (l.id?.name ?? l.name) === laneName);
    return lane ? JSON.stringify(lane.components) : 'LANE-MISSING';
  }

  /** Read the lane's own content (as opposed to the branch's mirror of it) via a developer workspace. */
  function laneTipFile(devPath: string, filePath: string): string {
    h().command.runCmd('bit fetch --lanes', devPath);
    h().command.runCmd('bit checkout head -x', devPath);
    return fs.readFileSync(path.join(devPath, filePath)).toString();
  }

  /** Move the lane forward from a "developer" workspace: edit a file, snap, export. */
  function laneSideEdit(devPath: string, filePath: string, content: string, message: string) {
    h().command.runCmd('bit fetch --lanes', devPath);
    h().command.runCmd('bit checkout head -x', devPath);
    fs.outputFileSync(path.join(devPath, filePath), content);
    h().command.runCmd(`bit snap --message "${message}"`, devPath);
    h().command.runCmd('bit export', devPath);
  }

  /**
   * Commit onto the branch and push, then return the checkout to the default branch so the next run
   * starts where a fresh CI clone would. Returns the pushed sha.
   */
  function branchSideCommit(
    branch: string,
    defaultBranch: string,
    filePath: string,
    content: string,
    message: string
  ): string {
    gitFetch();
    h().command.runCmd(`git checkout -f -B ${branch} origin/${branch}`);
    h().fs.outputFile(filePath, content);
    h().command.runCmd('git add -A');
    h().command.runCmd(`git commit -m "${message}"`);
    h().command.runCmd(`git push origin ${branch}`);
    const sha = h().command.runCmd('git rev-parse HEAD').trim();
    h().command.runCmd(`git checkout -f ${defaultBranch}`);
    return sha;
  }

  /**
   * Make the local bit scope cold — the state every real (ephemeral-runner) run is in, and the one the
   * suite's long-lived workspace otherwise never reaches. Both scope locations are removed (which one
   * bit picks depends on setup order); the remote is re-registered because that lives in the scope.
   */
  function makeLocalScopeCold() {
    const workspace = h().scopes.localPath;
    fs.removeSync(path.join(workspace, '.bit'));
    fs.removeSync(path.join(workspace, '.git', 'bit'));
    h().command.runCmd('bit init');
    h().scopeHelper.addRemoteScope();
  }

  /**
   * How many objects the local scope holds — the measurable form of "cold". A CLI probe cannot ask
   * this: a genuinely cold scope exits non-zero on `bit lane list`.
   */
  function scopeObjectCount(): number {
    const candidates = [
      path.join(h().scopes.localPath, '.bit', 'objects'),
      path.join(h().scopes.localPath, '.git', 'bit', 'objects'),
    ];
    const root = candidates.find((dir) => fs.existsSync(dir));
    if (!root) return 0;
    let count = 0;
    const walk = (dir: string) => {
      fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else count += 1;
      });
    };
    walk(root);
    return count;
  }

  return {
    setupGitRemote,
    setupComponentsAndInitialCommit,
    setSyncConfig,
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
    laneHeadTrailer,
    fileOnBranch,
    branchPathsMatching,
    remoteLaneFingerprint,
    laneTipFile,
    laneSideEdit,
    branchSideCommit,
    makeLocalScopeCold,
    scopeObjectCount,
  };
}
