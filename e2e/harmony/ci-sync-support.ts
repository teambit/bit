import type { Helper } from '@teambit/legacy.e2e-helper';
import * as fs from 'fs-extra';
import * as path from 'path';
import { removeChalkCharacters } from '@teambit/legacy.utils';
import execa from 'execa';

/**
 * Fixture drivers shared by the `bit ci sync` e2e suites.
 *
 * They live here rather than in one spec file because the suite outgrew the repo's max-lines rule and had
 * to be split — and duplicating the drivers across the halves would be the worst of both worlds, since a
 * scenario in one file and a scenario in the other must mean the same thing by "a dev commit" or "the file
 * on the branch". The filename deliberately has no `.e2e` in it: the runner's spec glob matches any file
 * whose name contains `.e2e`, and this module is support code, not a suite.
 *
 * Every driver reads the `Helper` through a getter rather than taking it as a value, because the spec files
 * construct theirs in `before()` — so the bindings can be destructured at module scope and still resolve to
 * the instance the hook created.
 */

/** env keys that would flip a run out of the PR-less path these suites assert on */
export const GIT_HOST_ENV_KEYS = ['GITHUB_TOKEN', 'BIT_GITHUB_TOKEN', 'GITHUB_REPOSITORY', 'GITHUB_HEAD_REF'];

/**
 * The console warning `selectGitHostProvider` produces when the built-in github provider is registered but
 * has no credentials and doesn't claim the (local, bare) remote. Asserting on it is what proves these runs
 * really took the PR-less path rather than quietly finding a token.
 */
export const NO_GIT_HOST_WARNING = 'no git host provider is configured';

/**
 * Two components with NO dependency between them. `populateComponents` chains comp1 -> comp2, which would
 * drag comp2 into every snap of comp1 (auto-tag) and make "which side moved which component" — the whole
 * subject of these tests — ambiguous.
 */
export const comp1Src = (marker: string) => `module.exports = () => 'comp1: ${marker}';\n`;
export const comp2Src = (marker: string) => `module.exports = () => 'comp2: ${marker}';\n`;

/**
 * Save/restore the git-host env for one suite, so a developer's shell environment can't silently turn these
 * runs into PR-creating ones. Each suite gets its own closure: the two files' hooks interleave, and a shared
 * map would let one suite's `after` restore values the other had already changed.
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

  // ---------------------------------------------------------------------------------------------
  // shared setup idioms (same as e2e/harmony/ci-commands.e2e.ts)
  // ---------------------------------------------------------------------------------------------

  function setupGitRemote() {
    // Create a bare git repository to serve as remote
    const { scopePath } = h().scopeHelper.getNewBareScope();
    const bareRepoPath = scopePath.replace('.bit', '.git');
    h().command.runCmd(`git init --bare ${bareRepoPath}`);

    // Initialize git in workspace and set up remote
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

  // ---------------------------------------------------------------------------------------------
  // runners / readers
  // ---------------------------------------------------------------------------------------------

  /**
   * Run a bit command capturing stdout, stderr AND the exit code. `h().command.runCmd` throws on a
   * non-zero exit and only returns stdout, but `bit ci sync` reports halts by exiting non-zero with the
   * summary on stderr — both halves are load-bearing assertions here.
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
   * The paths on the remote branch's tree whose *name* contains `needle`.
   *
   * Path-agnostic on purpose: when the reconciler materializes a lane component this workspace never
   * had, bit picks the directory for it from the workspace's `defaultDirectory` — not from wherever the
   * lane author happened to put it. So "is this component on the branch?" cannot be asked with a hard
   * coded path, only by looking at the tree. Matching on the path (not the content) keeps `.bitmap`,
   * which names every component, out of the answer.
   */
  function branchPathsMatching(branch: string, needle: string): string[] {
    return h()
      .command.runCmd(`git ls-tree -r --name-only origin/${branch}`)
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && line.includes(needle));
  }

  /**
   * A content fingerprint of the remote lane: the per-component heads. Used to assert "the lane moved"
   * / "the lane did NOT move" without depending on the lane object's (randomly minted) hash.
   */
  function remoteLaneFingerprint(laneName: string): string {
    const parsed = h().command.listRemoteLanesParsed();
    const lane = parsed.lanes.find((l: any) => (l.id?.name ?? l.name) === laneName);
    return lane ? JSON.stringify(lane.components) : 'LANE-MISSING';
  }

  /**
   * Bring a "developer" workspace up to the lane tip and return one of its files — i.e. read the
   * lane's own content, as opposed to the branch's mirror of it.
   */
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
   * Move the branch forward the way a developer would: commit onto the *branch* in the CI workspace
   * and push, then put the checkout back on the default branch so the next `bit ci sync` starts from
   * the same place a fresh CI clone would. Returns the pushed sha.
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
   * Make the workspace's local bit scope **cold** — the state a production run is always in, and the one
   * this whole suite otherwise never reaches.
   *
   * `bit ci sync` runs on an ephemeral CI runner: a fresh `git clone`, `bit init`, and a local scope that
   * has never imported anything. Every other scenario here reuses one long-lived workspace whose scope is
   * warm by the time it is asserted on, so any code that silently depends on a cached lane object passes
   * all of them and fails on every real run. Wiping the scope directory and re-initializing reproduces the
   * runner exactly: `.bitmap` and `workspace.jsonc` are workspace files and survive (as they would in a
   * fresh clone), while every object — lane objects above all — is gone.
   *
   * Both scope locations are removed because which one bit picks depends on whether `.git` existed when
   * `bit init` ran, and this suite's setup order (bit init, then git init) is not the only one a user has.
   * The remote has to be re-registered because that registration lives *in* the scope we just deleted.
   */
  function makeLocalScopeCold() {
    const workspace = h().scopes.localPath;
    fs.removeSync(path.join(workspace, '.bit'));
    fs.removeSync(path.join(workspace, '.git', 'bit'));
    h().command.runCmd('bit init');
    h().scopeHelper.addRemoteScope();
  }

  /**
   * How many objects the workspace's local scope holds — the measurable form of "cold".
   *
   * Used instead of a `bit lane list` probe because a genuinely cold scope cannot answer that: `.bitmap`
   * names components whose objects are not there yet, and the command exits non-zero with
   * `<comp> is missing, please run "bit import"`. That is not a symptom of anything wrong — it is what a
   * fresh clone looks like before its first sync — but it makes the CLI the wrong instrument. Counting
   * files under the scope's object store asks the question directly, and asking it twice (before and after)
   * proves both halves: the run started with nothing and had to fetch what it needed.
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
    runBit,
    gitFetch,
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
