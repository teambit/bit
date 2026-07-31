import { expect } from 'chai';
import { SyncOrchestrator } from './sync-orchestrator';
import { branchToLaneName, resolveSyncConfig, syncableLaneNameForBranch } from './sync-config';

// The deps are never reached: every case here throws before the first `this.deps` access.
function orchestrator(): SyncOrchestrator {
  return new SyncOrchestrator({} as any);
}

describe('SyncOrchestrator target guards', () => {
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

describe('branch -> lane enumeration filter', () => {
  it('is testing something: the default mapping really is the identity', () => {
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
    expect(syncableLaneNameForBranch('feature/foo', cfg)).to.equal(undefined);
  });

  it('still honours an explicit branches override whose lane name is valid', () => {
    const cfg = resolveSyncConfig({ branches: { 'my-lane': 'custom/branch' } });
    expect(syncableLaneNameForBranch('custom/branch', cfg)).to.equal('my-lane');
  });
});
