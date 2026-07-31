import { expect } from 'chai';
import { SyncOrchestrator } from './sync-orchestrator';
import { branchToLaneName, resolveSyncConfig, syncableLaneNameForBranch } from './sync-config';

// The deps are never reached: every conflict case throws before the first `this.deps` access.
function orchestrator(): SyncOrchestrator {
  return new SyncOrchestrator({} as any);
}

/** Each row must name every selector it refused, and which one would otherwise have silently won. */
const conflicts: Array<[Record<string, unknown>, string[]]> = [
  [{ all: true, branch: 'my-branch' }, ['--all cannot be combined with', '--branch ("my-branch")']],
  [{ all: true, lane: 'my-lane' }, ['--all cannot be combined with', 'a lane argument ("my-lane")']],
  [{ all: true, main: true }, ['--all cannot be combined with', '--main']],
  [
    { lane: 'my-lane', branch: 'my-branch' },
    [
      'a lane argument ("my-lane") cannot be combined with --branch ("my-branch")',
      'only --branch ("my-branch") would have run',
    ],
  ],
  [
    { lane: 'my-lane', main: true },
    ['a lane argument ("my-lane") cannot be combined with --main', 'only --main would have run'],
  ],
  [
    { branch: 'my-branch', main: true },
    ['--branch ("my-branch") cannot be combined with --main', 'only --main would have run'],
  ],
  [
    { lane: 'my-lane', branch: 'my-branch', main: true },
    [
      'a lane argument ("my-lane") cannot be combined with --branch ("my-branch") or with --main',
      'only --main would have run',
    ],
  ],
  // --init only scaffolds, so pairing it with a target could not mean anything.
  [{ init: true, branch: 'x' }, ['--init cannot be combined']],
];

describe('SyncOrchestrator target guards', () => {
  it('refuses every combination of selectors, naming the ones it saw', async () => {
    for (const [options, expected] of conflicts) {
      const label = JSON.stringify(options);
      let message = '';
      await orchestrator()
        .sync(options as any)
        .catch((err) => {
          message = err.message;
        });
      expected.forEach((fragment) => expect(message, label).to.contain(fragment));
    }
  });

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
});

describe('branch -> lane enumeration filter', () => {
  it('queues only the branches whose mapped name could actually be a lane', () => {
    const cfg = resolveSyncConfig({});
    // non-vacuity: the default mapping really is the identity, so the filter is what excludes anything
    expect(branchToLaneName('feature/foo', cfg)).to.equal('feature/foo');
    expect(
      ['feature/foo', 'FEATURE', 'ok-lane'].map((b) => syncableLaneNameForBranch(b, cfg)).filter(Boolean)
    ).to.deep.equal(['ok-lane']);
  });

  it('honours the prefix (stripped before the name is checked) and an explicit branches override', () => {
    const prefixed = resolveSyncConfig({ branchPrefix: 'lane/' });
    expect(syncableLaneNameForBranch('lane/my-lane', prefixed)).to.equal('my-lane');
    expect(syncableLaneNameForBranch('feature/foo', prefixed)).to.equal(undefined);
    const overridden = resolveSyncConfig({ branches: { 'my-lane': 'custom/branch' } });
    expect(syncableLaneNameForBranch('custom/branch', overridden)).to.equal('my-lane');
  });
});
