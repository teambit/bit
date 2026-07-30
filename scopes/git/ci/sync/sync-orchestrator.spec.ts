import { expect } from 'chai';
import { SyncOrchestrator } from './sync-orchestrator';

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
