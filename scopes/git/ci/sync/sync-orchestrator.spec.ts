import { expect } from 'chai';
import { SyncOrchestrator } from './sync-orchestrator';
import { branchToLaneName, resolveSyncConfig, syncableLaneNameForBranch } from './sync-config';

/**
 * The target-selection guards, which are the only part of the orchestration that decides anything before
 * touching a workspace, a git repo or the network — so they are the part worth unit testing. Everything
 * after them is routing into the two executors, which have their own coverage plus the e2e suites.
 *
 * The deps are never reached: every case here throws before the first `this.deps` access.
 */
function orchestrator(): SyncOrchestrator {
  return new SyncOrchestrator({} as any);
}

describe('SyncOrchestrator target guards', () => {
  /**
   * `--branch` must apply the same mapped-AND-valid check `--all` enumeration does
   * (`syncableLaneNameForBranch`): with the default `branchPrefix: ''` a branch like `feature/foo`
   * maps to the string "feature/foo", which can never be a lane name (lane names carry no `/`).
   * The old `branchToLaneName`-only path passed it into `syncLane`, violating the `LaneTarget.name`
   * invariant — the run halted (and outside dry-run went looking for a PR to annotate) instead of
   * cleanly reporting the branch as not lane-mapped.
   */
  it('reports a branch whose mapped name is not a valid lane name, instead of syncing it', async () => {
    const deps = {
      config: { sync: {} },
      workspace: { defaultScope: 'org.scope' },
      ci: { getDefaultBranchName: async () => 'main', listGitHostProviders: () => [] },
      lanes: { getDefaultLaneId: () => ({ name: 'main' }) },
      logger: { console() {}, consoleWarning() {}, debug() {} },
    };
    const result = await new SyncOrchestrator(deps as any).sync({ branch: 'feature/foo' });
    expect(result).to.equal('branch feature/foo does not map to a valid lane name; nothing to do');
  });

  /**
   * `--all` is the default, so pairing it with a narrower target is always a mistake about what will run.
   * `--branch` was the gap: the branch path returns early, so `bit ci sync --all --branch x` silently
   * dropped `--all` and reconciled exactly one branch while the operator believed everything had been
   * visited — the failure mode is a lane that never syncs and no message saying so.
   */
  it('refuses --all with --branch, naming the branch', async () => {
    let message = '';
    await orchestrator()
      .sync({ all: true, branch: 'my-branch' })
      .catch((err) => {
        message = err.message;
      });
    expect(message).to.contain('--all cannot be combined with');
    expect(message).to.contain('--branch ("my-branch")');
  });

  it('refuses --all with a lane argument, naming the lane', async () => {
    let message = '';
    await orchestrator()
      .sync({ all: true, lane: 'my-lane' })
      .catch((err) => {
        message = err.message;
      });
    expect(message).to.contain('--all cannot be combined with');
    expect(message).to.contain('a lane argument ("my-lane")');
  });

  it('refuses --all with --main', async () => {
    let message = '';
    await orchestrator()
      .sync({ all: true, main: true })
      .catch((err) => {
        message = err.message;
      });
    expect(message).to.contain('--all cannot be combined with');
    expect(message).to.contain('--main');
  });

  /**
   * {lane argument, --branch, --main} are three spellings of "reconcile exactly this one target". Any
   * two used to be resolved by code order (--main, then --branch, then the lane argument): the winner
   * ran and the loser was silently dropped — same failure shape as the --all gap above, a target the
   * operator explicitly named that was never visited, with no message saying so.
   */
  it('refuses a lane argument with --branch, naming both and the selector that would have silently won', async () => {
    let message = '';
    await orchestrator()
      .sync({ lane: 'my-lane', branch: 'my-branch' })
      .catch((err) => {
        message = err.message;
      });
    expect(message).to.contain('a lane argument ("my-lane") cannot be combined with --branch ("my-branch")');
    expect(message).to.contain('only --branch ("my-branch") would have run');
  });

  it('refuses a lane argument with --main', async () => {
    let message = '';
    await orchestrator()
      .sync({ lane: 'my-lane', main: true })
      .catch((err) => {
        message = err.message;
      });
    expect(message).to.contain('a lane argument ("my-lane") cannot be combined with --main');
    expect(message).to.contain('only --main would have run');
  });

  it('refuses --branch with --main', async () => {
    let message = '';
    await orchestrator()
      .sync({ branch: 'my-branch', main: true })
      .catch((err) => {
        message = err.message;
      });
    expect(message).to.contain('--branch ("my-branch") cannot be combined with --main');
    expect(message).to.contain('only --main would have run');
  });

  it('refuses all three together, naming every selector', async () => {
    let message = '';
    await orchestrator()
      .sync({ lane: 'my-lane', branch: 'my-branch', main: true })
      .catch((err) => {
        message = err.message;
      });
    expect(message).to.contain(
      'a lane argument ("my-lane") cannot be combined with --branch ("my-branch") or with --main'
    );
    expect(message).to.contain('only --main would have run');
  });

  it('refuses --init combined with any other target, since it only scaffolds', async () => {
    let message = '';
    await orchestrator()
      .sync({ init: true, branch: 'x' })
      .catch((err) => {
        message = err.message;
      });
    expect(message).to.contain('--init cannot be combined');
  });
});

/**
 * The branch half of `--all` enumeration. Every branch on `origin` reaches it, and under the documented
 * default (`branchPrefix: ''`) the branch->lane mapping is an identity transform — so without a validity
 * filter an ordinary `feature/foo` is queued as a "lane" whose name contains a slash, which no lane can
 * have and which `parseLaneTarget` would later mis-split into the scope `feature`.
 *
 * `syncableLaneNameForBranch` is the exact function the enumeration calls, so these rows exercise the
 * shipped decision rather than a restatement of it.
 */
describe('branch -> lane enumeration filter', () => {
  it('is testing something: the default mapping really is the identity', () => {
    // If this stopped being an identity transform the rows below would be asserting nothing.
    expect(branchToLaneName('feature/foo', resolveSyncConfig({}))).to.equal('feature/foo');
  });

  it('queues only the branches whose mapped name could actually be a lane', () => {
    const cfg = resolveSyncConfig({});
    const queued = ['feature/foo', 'FEATURE', 'ok-lane']
      .map((branch) => syncableLaneNameForBranch(branch, cfg))
      .filter(Boolean);
    expect(queued).to.deep.equal(['ok-lane']);
  });

  it('keeps a prefixed mapping working — the prefix is stripped before the name is checked', () => {
    const cfg = resolveSyncConfig({ branchPrefix: 'lane/' });
    expect(syncableLaneNameForBranch('lane/my-lane', cfg)).to.equal('my-lane');
    // outside the prefix is not lane-mapped at all, which is a different reason for the same outcome
    expect(syncableLaneNameForBranch('feature/foo', cfg)).to.equal(undefined);
  });

  it('still honours an explicit branches override whose lane name is valid', () => {
    const cfg = resolveSyncConfig({ branches: { 'my-lane': 'custom/branch' } });
    expect(syncableLaneNameForBranch('custom/branch', cfg)).to.equal('my-lane');
  });
});
