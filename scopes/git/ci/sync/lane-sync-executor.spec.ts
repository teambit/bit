import { expect } from 'chai';
import {
  branchMirrorsOtherLaneNote,
  branchMirrorsOtherLaneReason,
  crossScopeDescription,
  crossScopeMidFlightHaltReason,
  crossScopeRefusal,
  crossScopeSkipSummary,
  dryRunSummaryLine,
  foreignLaneComponents,
  haltCommentBody,
  isProtectedBranch,
  laneHeadFingerprint,
  LaneSyncExecutor,
  laneSyncPrBody,
} from './lane-sync-executor';
import { resolveSyncConfig } from './sync-config';

type LaneComponents = Parameters<typeof laneHeadFingerprint>[0];

/** A stand-in for `LaneData`'s component entry; the helpers only read the id string, scope and head. */
function comp(id: string, head: string): LaneComponents[number] {
  return {
    id: { toStringWithoutVersion: () => id, scope: id.split('/', 1)[0] },
    head,
  } as unknown as LaneComponents[number];
}

describe('laneHeadFingerprint', () => {
  const a = comp('acme.shop/comp1', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1');
  const b = comp('acme.shop/comp2', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb2');

  it('is a single 40-hex token, so it survives being written into a commit trailer as an annotation', () => {
    const fingerprint = laneHeadFingerprint([a, b]);
    expect(fingerprint).to.match(/^[0-9a-f]{40}$/);
  });

  it('is stable under reordering: the remote listing order must not look like the lane moved', () => {
    expect(laneHeadFingerprint([a, b])).to.equal(laneHeadFingerprint([b, a]));
  });

  it('changes when a component head changes', () => {
    const moved = comp('acme.shop/comp2', 'cccccccccccccccccccccccccccccccccccccc33');
    expect(laneHeadFingerprint([a, moved])).to.not.equal(laneHeadFingerprint([a, b]));
  });

  it('changes when a component is added or removed', () => {
    expect(laneHeadFingerprint([a])).to.not.equal(laneHeadFingerprint([a, b]));
    expect(laneHeadFingerprint([])).to.not.equal(laneHeadFingerprint([a]));
  });

  it('does not depend on the lane object, only on its content', () => {
    expect(laneHeadFingerprint([a, b])).to.equal(laneHeadFingerprint([comp('acme.shop/comp1', a.head), b]));
  });
});

describe('foreignLaneComponents', () => {
  const DEFAULT_SCOPE = 'acme.shop';
  const ours = comp('acme.shop/comp1', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1');
  const theirs = comp('other.scope/comp2', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb2');

  it('is empty for a lane whose components are all in the repository scope', () => {
    expect(foreignLaneComponents([ours], DEFAULT_SCOPE)).to.deep.equal([]);
    expect(foreignLaneComponents([], DEFAULT_SCOPE)).to.deep.equal([]);
  });

  it('names every component outside the repository scope', () => {
    expect(foreignLaneComponents([ours, theirs], DEFAULT_SCOPE)).to.deep.equal(['other.scope/comp2']);
  });

  it('compares the scope, not the id prefix: a namespaced component of our scope is ours', () => {
    // `acme.shop/ui/button` must not read as scope `acme.shop/ui`.
    const namespaced = comp('acme.shop/ui/button', 'ccccccccccccccccccccccccccccccccccccc333');
    expect(foreignLaneComponents([namespaced], DEFAULT_SCOPE)).to.deep.equal([]);
  });

  it('treats a lane hosted elsewhere but filled with our components as ours (hosting != content)', () => {
    expect(foreignLaneComponents([ours], DEFAULT_SCOPE)).to.deep.equal([]);
  });
});

describe('crossScopeDescription', () => {
  const DEFAULT_SCOPE = 'acme.shop';

  it('names the foreign scopes and this repository scope', () => {
    const description = crossScopeDescription(['other.scope/comp2', 'third.scope/comp3'], DEFAULT_SCOPE);
    expect(description).to.include('components from scope(s) other.scope, third.scope');
    expect(description).to.include(`(this repo maps scope ${DEFAULT_SCOPE})`);
    expect(description).to.include('foreign components: other.scope/comp2, third.scope/comp3');
  });

  it('lists at most five foreign components and summarizes the rest', () => {
    const ids = Array.from({ length: 8 }, (_, index) => `other.scope/comp${index}`);
    const description = crossScopeDescription(ids, DEFAULT_SCOPE);
    expect(description).to.include('other.scope/comp4');
    expect(description).to.not.include('other.scope/comp5');
    expect(description).to.include('…and 3 more');
  });

  it('does not append a count when everything is listed', () => {
    expect(crossScopeDescription(['other.scope/comp1'], DEFAULT_SCOPE)).to.not.include('more');
  });
});

// GitHub rejects a PR whose body exceeds 65,536 characters, whole-request; a lane has no size limit.
describe('laneSyncPrBody', () => {
  const LANE_HEAD = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1';

  function body(componentCount: number) {
    return laneSyncPrBody({
      laneIdStr: 'acme.shop/my-lane',
      laneUrl: 'https://bit.cloud/acme/shop/~lane/my-lane',
      branch: 'my-lane',
      laneHead: LANE_HEAD,
      components: Array.from({ length: componentCount }, (_, index) =>
        comp(`acme.shop/namespace/component-with-a-realistic-name-${index}`, `${'0'.repeat(39)}${index % 10}`)
      ),
    });
  }

  it('lists at most twenty components and summarizes the rest, keeping the exact total', () => {
    const rendered = body(100);
    expect(rendered).to.include('component-with-a-realistic-name-19');
    expect(rendered).to.not.include('component-with-a-realistic-name-20');
    expect(rendered).to.include('and 80 more');
    expect(rendered).to.include('Components on the lane (100):');
    expect(rendered).to.include(`lane head: \`${LANE_HEAD}\``);
  });

  it('stays far inside a git host body limit for a lane of any size', () => {
    expect(body(100).length).to.be.below(60000);
    expect(body(5000).length).to.be.below(60000);
  });

  it('lists a small lane in full, with no summary line', () => {
    const rendered = body(3);
    expect(rendered).to.include('component-with-a-realistic-name-2');
    expect(rendered).to.not.include('more');
    expect(rendered).to.include('Components on the lane (3):');
  });

  it('says so explicitly when the lane has no components', () => {
    expect(body(0)).to.include('_none_');
  });
});

describe('cross-scope outcome messages', () => {
  const DEFAULT_SCOPE = 'acme.shop';
  const FOREIGN = ['other.scope/comp2'];

  it('an enumerated lane is SKIPPED, in the vocabulary of a healthy run', () => {
    const summary = crossScopeSkipSummary('my-lane', FOREIGN, DEFAULT_SCOPE);
    expect(summary).to.match(/^my-lane -> skipped \(cross-scope lane: /);
    expect(summary).to.include('no branch created');
    // A HALTED/REFUSED marker in this line would flip the exit code of a healthy repository.
    expect(summary).to.not.include('HALTED');
    expect(summary).to.not.include('REFUSED');
  });

  it('an explicitly requested lane is REFUSED, with the reason and the "nothing was written" promise', () => {
    const refusal = crossScopeRefusal(FOREIGN, DEFAULT_SCOPE);
    expect(refusal).to.include('cross-scope lane: components from scope(s) other.scope');
    expect(refusal).to.include("not supported yet — see the docs' Cross-scope lanes section");
    expect(refusal).to.include('No branch was created and nothing was written');
  });

  it('the refusal does not claim it created no branch when a branch already exists', () => {
    const refusal = crossScopeRefusal(FOREIGN, DEFAULT_SCOPE, 'my-lane');
    expect(refusal).to.include('Nothing was written; the existing branch my-lane was left untouched');
    expect(refusal).to.not.include('No branch was created');
  });

  it('a lane that became cross-scope mid-flight names the branch it can no longer converge with', () => {
    const reason = crossScopeMidFlightHaltReason('my-lane', FOREIGN, DEFAULT_SCOPE);
    expect(reason).to.include('lane became cross-scope after it was mirrored onto my-lane');
    expect(reason).to.include('can no longer be reconciled automatically');
  });
});

describe('branchMirrorsOtherLaneReason', () => {
  it('names the branch, the lane that owns it, and the lane that was refused', () => {
    const reason = branchMirrorsOtherLaneReason('release', 'other.scope/release', 'acme.shop/release');
    expect(reason).to.include('branch release mirrors lane other.scope/release');
    expect(reason).to.include('refusing to plan for acme.shop/release');
    expect(reason).to.include("overwrite the other lane's mirror");
  });

  it('the PR comment tells the branch owner their lane is fine, and not to run the usual steps', () => {
    const note = branchMirrorsOtherLaneNote('other.scope/release', 'acme.shop/release');
    expect(note).to.include('belongs to lane `other.scope/release`');
    expect(note).to.include('nothing is wrong with it');
    expect(note).to.include('acme.shop/release');
    expect(note).to.match(/Do NOT run the usual "bit lane import" resolution steps/);
    expect(note).to.include('rename one of the two lanes');
    expect(note).to.include('`branches`');
  });
});

// The executor is real; `getDefaultBranchName` throwing is the seam — the first dependency
// `reconcileLane` awaits after the fetch, so the throw reaches the outer catch with no git/network work.
describe('syncLane outer catch under --dry-run', () => {
  function throwingExecutor(gitHostCalls: string[]): LaneSyncExecutor {
    const noopLogger = { console: () => {}, consoleWarning: () => {}, error: () => {}, debug: () => {} };
    const executor = new LaneSyncExecutor({
      lanes: {} as any,
      ci: {
        getDefaultBranchName: async () => {
          throw new Error('boom');
        },
      } as any,
      logger: noopLogger as any,
      gitHost: {
        name: 'stub',
        findPrByBranch: async () => {
          gitHostCalls.push('findPrByBranch');
          return { number: 7, htmlUrl: 'https://example.test/pr/7', labels: [] };
        },
        addLabel: async () => {
          gitHostCalls.push('addLabel');
        },
        comment: async () => {
          gitHostCalls.push('comment');
        },
      } as any,
      cfg: resolveSyncConfig({}),
      defaultScope: 'acme.shop',
    });
    // Mark the fetch done so the spec never touches a repository or the network.
    (executor as any).fetched = true;
    return executor;
  }

  it('reports the halt without reading, labelling or commenting on the PR', async () => {
    const gitHostCalls: string[] = [];
    const summary = await throwingExecutor(gitHostCalls).syncLane(
      { hostScope: 'acme.shop', name: 'my-lane' },
      { dryRun: true }
    );
    expect(summary).to.equal('HALTED my-lane -> unexpected error: boom');
    expect(gitHostCalls).to.deep.equal([]);
  });

  it('is non-vacuous: without --dry-run the same failure does read, label and comment the PR', async () => {
    const gitHostCalls: string[] = [];
    const summary = await throwingExecutor(gitHostCalls).syncLane({ hostScope: 'acme.shop', name: 'my-lane' });
    expect(summary).to.equal('HALTED my-lane -> unexpected error: boom');
    expect(gitHostCalls).to.deep.equal(['findPrByBranch', 'addLabel', 'comment']);
  });

  // '-hostile' is a legal bit lane name (the charset allows a leading '-') that can never be a branch.
  it('a lane whose name cannot map to a branch halts report-only instead of throwing', async () => {
    const gitHostCalls: string[] = [];
    const summary = await throwingExecutor(gitHostCalls).syncLane({ hostScope: 'acme.shop', name: '-hostile' });
    expect(summary).to.match(/^HALTED -hostile -> unexpected error: .*not a valid git branch name/);
    expect(gitHostCalls).to.deep.equal([]);
  });
});

// bit's lane-name charset admits `$`, `-`, `_` and `!`, so an unquoted runbook shell-expands when pasted.
describe('haltCommentBody', () => {
  const LANE_NAME = 'fix-$home-and-!bang';

  it('single-quotes every value it interpolates into a command', () => {
    const body = haltCommentBody({
      reason: 'merge conflicts in: acme.shop/comp1',
      branch: LANE_NAME,
      laneId: `acme.shop/${LANE_NAME}`,
    });
    expect(body).to.include(`git fetch origin && git checkout '${LANE_NAME}'`);
    expect(body).to.include(`bit lane import 'acme.shop/${LANE_NAME}'`);
    expect(body).to.include(`git push origin '${LANE_NAME}'`);
    // the reason is prose, not a command, and the runbook still reads as one
    expect(body).to.include('merge conflicts in: acme.shop/comp1');
    expect(body).to.include('Remove the `bit-sync-conflict` label to resume syncing.');
  });

  // A configured `branches` override only has to be a valid git ref, and git accepts a quote in one.
  it('escapes a value that itself contains a quote, rather than ending the quoting early', () => {
    const body = haltCommentBody({ reason: 'x', branch: "it's-a-branch", laneId: 'acme.shop/lane' });
    expect(body).to.include(`git checkout 'it'\\''s-a-branch'`);
  });

  it('leaves an overriding note alone: it carries no commands to quote', () => {
    const body = haltCommentBody({ reason: 'x', branch: LANE_NAME, laneId: 'acme.shop/lane', note: 'nothing to do' });
    expect(body).to.include('nothing to do');
    expect(body).to.not.include('git checkout');
  });
});

// `summarizeSync` decides the exit code by scanning for the prefix and nothing else, so a prefix-less
// line makes a dry run report success on a plan the real run would have halted on.
describe('dryRunSummaryLine', () => {
  it('carries the HALTED prefix and the reason for a planned halt, so the run exits non-zero', () => {
    const line = dryRunSummaryLine('my-lane', { type: 'halt', reason: 'cannot tell which side is newer' });
    expect(line).to.equal('HALTED my-lane -> cannot tell which side is newer');
  });

  it('leaves every other planned action unprefixed — those runs are healthy', () => {
    (['import-lane', 'export-branch', 'merge-diverged'] as const).forEach((type) => {
      const line = dryRunSummaryLine('my-lane', { type });
      expect(line, type).to.equal(`my-lane -> ${type}`);
      expect(line, type).to.not.contain('HALTED');
      expect(line, type).to.not.contain('REFUSED');
    });
    expect(dryRunSummaryLine('my-lane', { type: 'noop', reason: 'converged' })).to.equal('my-lane -> noop');
    expect(dryRunSummaryLine('my-lane', { type: 'close-pr', deleteBranch: true })).to.equal('my-lane -> close-pr');
  });
});

// The deletion decision is computed from refs fetched once per run; on an `--all` run the branch can
// advance while earlier lanes are reconciled. Both seams are stubbed, so no repository is touched.
describe('close-pr re-verifies the tip before retiring a branch', () => {
  const EVIDENCE_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1';
  const MOVED_SHA = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb2';

  function retirer(currentTip: string | undefined, pushError?: Error) {
    const warnings: string[] = [];
    const pushes: string[][] = [];
    const executor = new LaneSyncExecutor({
      lanes: {} as any,
      ci: {} as any,
      logger: { console: () => {}, consoleWarning: (msg: string) => warnings.push(msg), error: () => {} } as any,
      gitHost: undefined,
      cfg: resolveSyncConfig({}),
      defaultScope: 'acme.shop',
    });
    (executor as any).currentBranchTip = async () => currentTip;
    (executor as any).pushBranchDeletion = async (branch: string, sha: string) => {
      pushes.push([branch, sha]);
      if (pushError) throw pushError;
    };
    const closePr = () =>
      (executor as any).executeClosePr({
        laneName: 'my-lane',
        laneIdStr: 'acme.shop/my-lane',
        branch: 'my-lane',
        defaultBranch: 'main',
        deleteBranch: true,
        expectedTipSha: EVIDENCE_SHA,
      }) as Promise<string>;
    return { closePr, warnings, pushes };
  }

  it('deletes at the evidence sha while the branch is still there', async () => {
    const { closePr, pushes } = retirer(EVIDENCE_SHA);
    expect(await closePr()).to.equal('my-lane -> close-pr (no open PR, branch my-lane deleted)');
    expect(pushes).to.deep.equal([['my-lane', EVIDENCE_SHA]]);
  });

  it('KEEPS the branch when the tip moved during the run, pushing nothing at all', async () => {
    const { closePr, warnings, pushes } = retirer(MOVED_SHA);
    const summary = await closePr();
    expect(summary).to.contain('branch my-lane kept: its tip advanced after the ownership evidence was read');
    expect(pushes).to.deep.equal([]);
    expect(warnings.join('\n')).to.contain(`its tip is now ${MOVED_SHA} rather than the ${EVIDENCE_SHA}`);
  });

  it('keeps the branch when the tip cannot be re-read at all, rather than trusting the stale answer', async () => {
    const { closePr, pushes } = retirer(undefined);
    expect(await closePr()).to.contain('branch my-lane kept: its tip advanced');
    expect(pushes).to.deep.equal([]);
  });

  // The re-read and the push are not atomic; the server gets the last word, and it is not a crash.
  it('reports a lease refusal as the same kept outcome', async () => {
    const { closePr, warnings } = retirer(
      EVIDENCE_SHA,
      new Error('! [rejected] (delete) -> my-lane (stale info)\nerror: failed to push some refs')
    );
    expect(await closePr()).to.contain('branch my-lane kept: its tip advanced');
    expect(warnings.join('\n')).to.contain('the remote refused the lease');
  });

  it('an unrelated push failure still reads as "left in place", not as a race', async () => {
    const { closePr } = retirer(EVIDENCE_SHA, new Error('remote: GH006: Protected branch update failed'));
    expect(await closePr()).to.equal('my-lane -> close-pr (no open PR, branch my-lane left in place)');
  });
});

describe('isProtectedBranch', () => {
  it('refuses the default branch and the main sync branch', () => {
    expect(isProtectedBranch('develop', 'develop', 'bit-sync/main')).to.equal(true);
    expect(isProtectedBranch('bit-sync/main', 'develop', 'bit-sync/main')).to.equal(true);
  });

  it('permits an ordinary lane branch', () => {
    expect(isProtectedBranch('my-lane', 'develop', 'bit-sync/main')).to.equal(false);
  });
});
