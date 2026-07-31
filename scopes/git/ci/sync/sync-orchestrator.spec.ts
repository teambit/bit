import { expect } from 'chai';
import { SyncOrchestrator, assertCleanForDryRun } from './sync-orchestrator';
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

// A dry run computes the main-scope plan by force-checking-out the sync branch, so a dirty tree would be
// discarded by a run that promised to write nothing.
describe('assertCleanForDryRun', () => {
  it('refuses a dirty tree, naming the paths at stake and how to keep them', () => {
    let message = '';
    try {
      assertCleanForDryRun(['comp1/index.js', 'notes.txt']);
    } catch (e: any) {
      message = e.message;
    }
    expect(message).to.contain('--dry-run refuses to run');
    expect(message).to.contain('2 uncommitted change(s)');
    expect(message).to.contain('comp1/index.js, notes.txt');
    expect(message).to.contain('Commit or stash them first');
  });

  it('caps the named paths so a large diff cannot produce an unreadable error', () => {
    const paths = Array.from({ length: 12 }, (_, index) => `file-${index}.js`);
    let message = '';
    try {
      assertCleanForDryRun(paths);
    } catch (e: any) {
      message = e.message;
    }
    expect(message).to.contain('12 uncommitted change(s)');
    expect(message).to.contain('file-9.js');
    expect(message).to.not.contain('file-10.js');
    expect(message).to.contain('…');
  });

  it('permits a clean tree: the write-then-restore is only acceptable when nothing can be lost', () => {
    expect(() => assertCleanForDryRun([])).to.not.throw();
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
