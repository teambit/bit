import { expect } from 'chai';
import {
  branchMirrorsOtherLaneNote,
  branchMirrorsOtherLaneReason,
  changedLaneComponents,
  laneSummaryComponents,
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
  ownLaneComponents,
  racedLedgerPushSummary,
  RUN_SUMMARY_MARKER,
  runSummaryCommentBody,
} from './lane-sync-executor';
import type { LaneOwnershipEvidence } from './sync-planner';
import { resolveSyncConfig } from './sync-config';

/**
 * One stub executor for every seam-based test: real executor code over stubbed deps, no repository.
 * `warnings` collects `consoleWarning` lines for tests that assert on them.
 */
function stubExecutor(): { executor: LaneSyncExecutor; warnings: string[] } {
  const warnings: string[] = [];
  const executor = new LaneSyncExecutor({
    lanes: {} as any,
    ci: {} as any,
    logger: { console: () => {}, consoleWarning: (msg: string) => warnings.push(msg), error: () => {} } as any,
    gitHost: undefined,
    cfg: resolveSyncConfig({}),
    defaultScope: 'acme.shop',
  });
  return { executor, warnings };
}

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

describe('ownLaneComponents', () => {
  const DEFAULT_SCOPE = 'acme.shop';
  const ours = comp('acme.shop/comp1', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1');
  const theirs = comp('other.scope/comp2', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb2');

  it('is the exact complement of foreignLaneComponents: together they cover the lane', () => {
    const own = ownLaneComponents([ours, theirs], DEFAULT_SCOPE);
    expect(own.map((c) => c.id.toStringWithoutVersion())).to.deep.equal(['acme.shop/comp1']);
    expect(foreignLaneComponents([ours, theirs], DEFAULT_SCOPE)).to.deep.equal(['other.scope/comp2']);
  });

  it('fingerprints only the own slice, so a foreign head moving does not read as the lane moving', () => {
    const theirsMoved = comp('other.scope/comp2', 'cccccccccccccccccccccccccccccccccccccc33');
    expect(laneHeadFingerprint(ownLaneComponents([ours, theirs], DEFAULT_SCOPE))).to.equal(
      laneHeadFingerprint(ownLaneComponents([ours, theirsMoved], DEFAULT_SCOPE))
    );
  });

  it('an own head moving still reads as the lane moving', () => {
    const oursMoved = comp('acme.shop/comp1', 'dddddddddddddddddddddddddddddddddddddd44');
    expect(laneHeadFingerprint(ownLaneComponents([ours, theirs], DEFAULT_SCOPE))).to.not.equal(
      laneHeadFingerprint(ownLaneComponents([oursMoved, theirs], DEFAULT_SCOPE))
    );
  });
});

describe('crossScopeDescription', () => {
  const DEFAULT_SCOPE = 'acme.shop';

  it('names the foreign scopes and this repository scope', () => {
    const description = crossScopeDescription(['other.scope/comp2', 'third.scope/comp3'], DEFAULT_SCOPE);
    expect(description).to.include('every component is from scope(s) other.scope, third.scope');
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

  function body(componentCount: number, foreignCount = 0) {
    return laneSyncPrBody({
      laneIdStr: 'acme.shop/my-lane',
      laneUrl: 'https://bit.cloud/acme/shop/~lane/my-lane',
      branch: 'my-lane',
      laneHead: LANE_HEAD,
      components: [
        ...Array.from({ length: componentCount }, (_, index) =>
          comp(`acme.shop/namespace/component-with-a-realistic-name-${index}`, `${'0'.repeat(39)}${index % 10}`)
        ),
        ...Array.from({ length: foreignCount }, (_, index) =>
          comp(`other.scope/namespace/foreign-component-${index}`, `${'1'.repeat(39)}${index % 10}`)
        ),
      ],
      defaultScope: 'acme.shop',
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

  it('a single-scope lane gets no foreign section and no "N of M" phrasing', () => {
    const rendered = body(3);
    expect(rendered).to.include('Components on the lane (3):');
    expect(rendered).to.not.include('other scopes');
    expect(rendered).to.not.include(' of ');
  });

  it('a cross-scope lane lists the mirrored slice and the foreign components separately', () => {
    const rendered = body(2, 3);
    expect(rendered).to.include('Components mirrored from the lane (2 of 5):');
    expect(rendered).to.include('component-with-a-realistic-name-1');
    expect(rendered).to.include('Also on this lane, from other scopes (3)');
    expect(rendered).to.include('package dependencies');
    expect(rendered).to.include('`other.scope/namespace/foreign-component-2`');
    // The foreign entries must not appear in the mirrored list's id/head format.
    expect(rendered).to.not.include('`other.scope/namespace/foreign-component-0` @');
  });

  it('the foreign section is capped like the mirrored list, so the body stays inside the host limit', () => {
    const rendered = body(2, 100);
    expect(rendered).to.include('foreign-component-19');
    expect(rendered).to.not.include('foreign-component-20`');
    expect(rendered).to.include('and 80 more');
    expect(body(2000, 3000).length).to.be.below(60000);
  });
});

// These outcomes apply ONLY to a lane with no own-scope components at all — a lane that merely
// includes foreign components is reconciled over its own-scope slice and never reaches them.
describe('cross-scope outcome messages', () => {
  const DEFAULT_SCOPE = 'acme.shop';
  const FOREIGN = ['other.scope/comp2'];

  it('an enumerated lane is SKIPPED, in the vocabulary of a healthy run', () => {
    const summary = crossScopeSkipSummary('my-lane', FOREIGN, DEFAULT_SCOPE);
    expect(summary).to.match(/^my-lane -> skipped \(nothing to mirror: /);
    expect(summary).to.include('no branch created');
    // A HALTED/REFUSED marker in this line would flip the exit code of a healthy repository.
    expect(summary).to.not.include('HALTED');
    expect(summary).to.not.include('REFUSED');
  });

  it('an explicitly requested lane is REFUSED, with the reason and the "nothing was written" promise', () => {
    const refusal = crossScopeRefusal(FOREIGN, DEFAULT_SCOPE);
    expect(refusal).to.include('nothing to mirror: every component is from scope(s) other.scope');
    expect(refusal).to.include("See the docs' Cross-scope lanes section");
    expect(refusal).to.include('No branch was created and nothing was written');
  });

  it('the refusal does not claim it created no branch when a branch already exists', () => {
    const refusal = crossScopeRefusal(FOREIGN, DEFAULT_SCOPE, 'my-lane');
    expect(refusal).to.include('Nothing was written; the existing branch my-lane was left untouched');
    expect(refusal).to.not.include('No branch was created');
  });

  it('a mirrored lane whose own slice emptied names the branch it can no longer converge with', () => {
    const reason = crossScopeMidFlightHaltReason('my-lane', FOREIGN, DEFAULT_SCOPE);
    expect(reason).to.include('every acme.shop component left the lane after it was mirrored onto my-lane');
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
    const { executor, warnings } = stubExecutor();
    const pushes: string[][] = [];
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

describe('differentLaneStillClaims uses .bitmap blob equality, not commit reachability', () => {
  function executorWithInheritance(inherited: boolean) {
    const executor = new LaneSyncExecutor({
      lanes: {} as any,
      ci: {} as any,
      logger: { console: () => {}, consoleWarning: () => {}, error: () => {} } as any,
      gitHost: undefined,
      cfg: resolveSyncConfig({}),
      defaultScope: 'acme.shop',
    });
    (executor as any).branchInheritsBitmapFromDefault = async () => inherited;
    return (mirroredLane: string | undefined, laneIdStr: string) =>
      (executor as any).differentLaneStillClaims(mirroredLane, laneIdStr, 'my-branch', 'main') as Promise<boolean>;
  }

  it('does not claim when there is no mirrored lane pointer at all — never even checks the blob', async () => {
    const differentLaneStillClaims = executorWithInheritance(true);
    expect(await differentLaneStillClaims(undefined, 'acme.shop/my-lane')).to.equal(false);
  });

  it("does not claim for this lane's own pointer — never even checks the blob", async () => {
    const differentLaneStillClaims = executorWithInheritance(true);
    expect(await differentLaneStillClaims('acme.shop/my-lane', 'acme.shop/my-lane')).to.equal(false);
  });

  it("does not claim when the different-lane .bitmap is byte-identical to the default branch's — inherited", async () => {
    const differentLaneStillClaims = executorWithInheritance(true);
    expect(await differentLaneStillClaims('acme.shop/other-lane', 'acme.shop/my-lane')).to.equal(false);
  });

  it("STILL claims when the different-lane .bitmap has diverged from the default branch's — halt, not adopt", async () => {
    const differentLaneStillClaims = executorWithInheritance(false);
    expect(await differentLaneStillClaims('acme.shop/other-lane', 'acme.shop/my-lane')).to.equal(true);
  });
});

describe('computeHasIndependentHistory gates the ancestry check to own-live claims with a state commit', () => {
  function executorWithAncestryResult(result: boolean) {
    const calls: Array<[string, string]> = [];
    const executor = new LaneSyncExecutor({
      lanes: {} as any,
      ci: {} as any,
      logger: { console: () => {}, consoleWarning: () => {}, error: () => {} } as any,
      gitHost: undefined,
      cfg: resolveSyncConfig({}),
      defaultScope: 'acme.shop',
    });
    (executor as any).hasIndependentHistoryBelowStateCommit = async (stateCommit: string, defaultBranch: string) => {
      calls.push([stateCommit, defaultBranch]);
      return result;
    };
    const compute = (ownership: LaneOwnershipEvidence, stateCommit: string | undefined, defaultBranch: string) =>
      (executor as any).computeHasIndependentHistory(ownership, stateCommit, defaultBranch) as Promise<boolean>;
    return { compute, calls };
  }

  it('skips the ancestry check entirely for a reachable claim (own-merged)', async () => {
    const { compute, calls } = executorWithAncestryResult(true);
    expect(await compute('own-merged', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1', 'main')).to.equal(false);
    expect(calls).to.deep.equal([]);
  });

  it('skips the ancestry check entirely for own-superseded too', async () => {
    const { compute, calls } = executorWithAncestryResult(true);
    expect(await compute('own-superseded', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1', 'main')).to.equal(false);
    expect(calls).to.deep.equal([]);
  });

  it('skips the check when there is no state commit to inspect, even for an own-live claim', async () => {
    const { compute, calls } = executorWithAncestryResult(true);
    expect(await compute('own-live', undefined, 'main')).to.equal(false);
    expect(calls).to.deep.equal([]);
  });

  it('defers to the ancestry check for an own-live claim with a state commit', async () => {
    const { compute, calls } = executorWithAncestryResult(true);
    expect(await compute('own-live', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1', 'main')).to.equal(true);
    expect(calls).to.deep.equal([['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1', 'main']]);
  });
});

describe('classifyPushRejection confirms a race before calling it one', () => {
  const BASE_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1';
  const MOVED_SHA = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb2';
  const REJECTION = new Error('! [rejected]        HEAD -> feature (fetch first)\nerror: failed to push some refs');

  function classifier(currentTip: string | undefined) {
    const { executor } = stubExecutor();
    (executor as any).currentBranchTip = async () => currentTip;
    return (baseSha: string | undefined, e: Error) =>
      (executor as any).classifyPushRejection('my-branch', baseSha, e) as Promise<'confirmed-race' | 'not-a-race'>;
  }

  it('confirms the race when the branch actually moved off the base we pushed against', async () => {
    const classify = classifier(MOVED_SHA);
    expect(await classify(BASE_SHA, REJECTION)).to.equal('confirmed-race');
  });

  it('confirms the race for a brand-new branch that now exists on the remote', async () => {
    const classify = classifier(MOVED_SHA);
    expect(await classify(undefined, REJECTION)).to.equal('confirmed-race');
  });

  // Message-text matching alone is not proof: a persistent, unrelated rejection could repeat the same
  // wording forever. Without this re-fetch-and-compare, that would go permanently green.
  it('answers not-a-race when the branch did NOT move — the wording matched but nothing raced', async () => {
    const classify = classifier(BASE_SHA);
    expect(await classify(BASE_SHA, REJECTION)).to.equal('not-a-race');
  });

  it('answers not-a-race when a brand-new branch still does not exist on the remote', async () => {
    const classify = classifier(undefined);
    expect(await classify(undefined, REJECTION)).to.equal('not-a-race');
  });

  // The polarity bug this guards: `currentTip === undefined` here means the re-fetch FAILED (network
  // blip, auth hiccup) — unknown, not evidence the branch moved. `undefined !== baseSha` reads as
  // truthy if compared naively, which would misreport an unanswerable check as a confirmed race and
  // paper over a real, persistent failure. Withhold like every other unknown-answer path in this file.
  it('answers not-a-race when the re-fetch itself fails, even though a base sha is known', async () => {
    const classify = classifier(undefined);
    expect(await classify(BASE_SHA, REJECTION)).to.equal('not-a-race');
  });

  it('answers not-a-race for a rejection whose wording is not a non-fast-forward race at all', async () => {
    const classify = classifier(MOVED_SHA);
    const unrelated = new Error('remote: GH006: Protected branch update failed');
    expect(await classify(BASE_SHA, unrelated)).to.equal('not-a-race');
  });
});

// The live incident's actual shape: the snap/export onto the lane already succeeded — the lane truly
// moved — and only the branch's OWN ledger-commit push (recordLaneHeadOnBranch) lost the race. Nothing
// exercised `racedLedgerPushSummary` before this; a wording regression there would have gone unnoticed.
describe('executeExportBranch reports the ledger-race wording when only the ledger push races', () => {
  it('surfaces "lane updated; branch ledger commit lost the push race" without halting', async () => {
    const { executor } = stubExecutor();
    (executor as any).lastNonSyncCommitMessage = async () => 'feat: some change';
    (executor as any).checkoutFromRemote = async () => {};
    (executor as any).restoreWorkspace = async () => {};
    (executor as any).materializeLane = async () => undefined;
    (executor as any).deps.ci = { hasUnsyncedWorkChanges: async () => true };
    // The export half already succeeded; only the ledger commit that follows raced.
    (executor as any).snapAndExportOntoLane = async () => ({ status: 'exported' });
    (executor as any).recordLaneHeadOnBranch = async () => ({ status: 'raced' });

    const summary = await (executor as any).executeExportBranch({
      target: { hostScope: 'acme.shop', name: 'my-lane' },
      laneIdStr: 'acme.shop/my-lane',
      branch: 'my-lane',
      defaultBranch: 'main',
    });

    expect(summary).to.equal(
      'my-lane -> raced (lane updated; branch ledger commit lost the push race — next run re-plans)'
    );
    expect(summary).to.not.include('HALTED');
  });
});

// The probe's "clean" answer means converged only against the lane the PLAN read. A lane that moved
// in between must re-plan — comparing the branch's files with the newer lane would misread the
// lane's own advance as branch work and export a revert over a concurrent developer's export.
describe('executeExportBranch bails when the lane moved since planning', () => {
  function stubExport(currentLaneComponents: LaneComponents, plannedLaneComponents: LaneComponents) {
    const { executor } = stubExecutor();
    const touched: string[] = [];
    (executor as any).checkoutFromRemote = async () => {};
    (executor as any).restoreWorkspace = async () => {};
    (executor as any).materializeLane = async () => undefined;
    (executor as any).lastNonSyncCommitMessage = async () => 'feat: some change';
    (executor as any).getRemoteLane = async () => ({ components: currentLaneComponents });
    (executor as any).deps.ci = {
      hasUnsyncedWorkChanges: async () => {
        touched.push('status');
        return false;
      },
    };
    (executor as any).snapAndExportOntoLane = async () => {
      touched.push('snap');
      return { status: 'exported' };
    };
    const run = () =>
      (executor as any).executeExportBranch({
        target: { hostScope: 'acme.shop', name: 'my-lane' },
        laneIdStr: 'acme.shop/my-lane',
        branch: 'my-lane',
        defaultBranch: 'main',
        preExportLane: { components: plannedLaneComponents },
      }) as Promise<string>;
    return { run, touched };
  }

  const L1 = [comp('acme.shop/comp1', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1')];
  const L2 = [comp('acme.shop/comp1', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb2')];

  it('a moved lane returns a re-plan noop before the status read or any snap', async () => {
    const { run, touched } = stubExport(L2, L1);
    const summary = await run();
    expect(summary).to.include('my-lane -> noop');
    expect(summary).to.include('moved');
    expect(touched).to.deep.equal([]);
  });

  it('an unmoved lane proceeds to the probe', async () => {
    const { run, touched } = stubExport(L1, L1);
    const summary = await run();
    expect(summary).to.include('my-lane -> noop (converged)');
    expect(touched).to.deep.equal(['status']);
  });

  it('a lane whose only movement is a foreign head proceeds — foreign heads are not this mirror to diverge', async () => {
    const planned = [...L1, comp('other.scope/comp2', 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee5')];
    const current = [...L1, comp('other.scope/comp2', 'fffffffffffffffffffffffffffffffffffffff6')];
    const { run, touched } = stubExport(current, planned);
    const summary = await run();
    expect(summary).to.include('my-lane -> noop (converged)');
    expect(touched).to.deep.equal(['status']);
  });
});

// The merge path snaps whatever the merge produced — which can be nothing new, now routinely: a
// source-bundling tip plus a moved lane plans merge-diverged, and a branch with nothing of its own
// merges clean and leaves the snap a noop. The summary must say so, and the run-summary comment
// belongs only to runs that actually exported.
describe('executeMergeDiverged distinguishes an exporting merge from a nothing-new merge', () => {
  function stubMerge(snapStatus: 'noop' | 'exported', currentLaneComponents: LaneComponents = []) {
    const { executor } = stubExecutor();
    const summaryCalls: any[] = [];
    (executor as any).checkoutFromRemote = async () => {};
    (executor as any).restoreWorkspace = async () => {};
    (executor as any).getRemoteLane = async () => ({ components: currentLaneComponents });
    (executor as any).mergeLaneIntoBranchWorkingTree = async () => ({ conflicts: [], conflictedFileCount: 0 });
    (executor as any).snapAndExportOntoLane = async () => ({ status: snapStatus });
    (executor as any).recordLaneHeadOnBranch = async () => ({
      status: 'ok',
      laneHead: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1',
      remoteLane: { components: [] },
    });
    (executor as any).postRunSummaryComment = async (args: any) => summaryCalls.push(args);
    const run = () =>
      (executor as any).executeMergeDiverged({
        target: { hostScope: 'acme.shop', name: 'my-lane' },
        laneIdStr: 'acme.shop/my-lane',
        branch: 'my-lane',
        defaultBranch: 'main',
        preExportLane: { components: [] },
      }) as Promise<string>;
    return { run, summaryCalls };
  }

  it('a nothing-new merge says so, and posts no run summary', async () => {
    const { run, summaryCalls } = stubMerge('noop');
    const summary = await run();
    expect(summary).to.include('my-lane -> merge-diverged');
    expect(summary).to.include('nothing new to export');
    expect(summary).to.not.include('then exported');
    expect(summaryCalls).to.have.lengthOf(0);
  });

  it('an exporting merge keeps the exported wording and posts the run summary', async () => {
    const { run, summaryCalls } = stubMerge('exported');
    const summary = await run();
    expect(summary).to.include('then exported');
    expect(summaryCalls).to.have.lengthOf(1);
    expect(summaryCalls[0].laneHead).to.equal('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1');
  });

  // Same freshness rule as the export probe: the plan's inputs must still describe the world.
  it('a lane that moved since planning bails to a re-plan before merging anything', async () => {
    const moved = [comp('acme.shop/comp1', 'ccccccccccccccccccccccccccccccccccccccc3')];
    const { run, summaryCalls } = stubMerge('exported', moved);
    const summary = await run();
    expect(summary).to.include('my-lane -> noop');
    expect(summary).to.include('moved');
    expect(summaryCalls).to.have.lengthOf(0);
  });
});

// Adoption never snaps or exports, so its raced line must NOT claim the lane was updated — the lane
// is untouched and only the branch's pointer commit lost the race.
describe('executeAdoptBranch reports a lane-untouched race when its ledger push races', () => {
  it('surfaces "lane untouched; adoption ledger commit lost the push race" without halting', async () => {
    const { executor } = stubExecutor();
    (executor as any).deps.ci = { hasUnsyncedWorkChanges: async () => false };
    (executor as any).checkoutFromRemote = async () => {};
    (executor as any).restoreWorkspace = async () => {};
    (executor as any).materializeLane = async () => undefined;
    (executor as any).recordLaneHeadOnBranch = async () => ({ status: 'raced' });

    const summary = await (executor as any).executeAdoptBranch({
      target: { hostScope: 'acme.shop', name: 'my-lane' },
      laneIdStr: 'acme.shop/my-lane',
      branch: 'my-lane',
      defaultBranch: 'main',
    });

    expect(summary).to.equal(
      'my-lane -> raced (lane untouched; adoption ledger commit lost the push race — next run re-plans)'
    );
    expect(summary).to.not.include('lane updated');
    expect(summary).to.not.include('HALTED');
  });
});

// A destructive auto-resolution (onConflict git-wins/lane-wins) that already exported must not vanish
// from the summary just because the ledger push raced.
describe('racedLedgerPushSummary keeps the conflict-policy clause', () => {
  it('carries the merge path’s policyClause through the raced ledger line', () => {
    expect(racedLedgerPushSummary('my-lane', 'conflicts auto-resolved: git-wins on 3 file(s); ')).to.equal(
      'my-lane -> raced (conflicts auto-resolved: git-wins on 3 file(s); lane updated; branch ledger commit ' +
        'lost the push race — next run re-plans)'
    );
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

describe('laneSummaryComponents', () => {
  it('includes hidden updateDependents — a cascade export must not read as "nothing changed"', () => {
    const lane = {
      components: [comp('acme.shop/comp1', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1')],
      updateDependents: [comp('acme.shop/dep1', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb2')],
    } as any;
    expect(laneSummaryComponents(lane).map((c) => c.id.toStringWithoutVersion())).to.deep.equal([
      'acme.shop/comp1',
      'acme.shop/dep1',
    ]);
  });

  it('an absent lane lists nothing', () => {
    expect(laneSummaryComponents(undefined)).to.deep.equal([]);
  });
});

describe('changedLaneComponents', () => {
  it('includes a component new to the lane, and one whose head moved', () => {
    const before = [comp('acme.shop/comp1', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1')];
    const after = [
      comp('acme.shop/comp1', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb2'),
      comp('acme.shop/comp2', 'ccccccccccccccccccccccccccccccccccccccc3'),
    ];
    const changed = changedLaneComponents(before, after);
    expect(changed.map((c) => c.id.toStringWithoutVersion())).to.deep.equal(['acme.shop/comp1', 'acme.shop/comp2']);
  });

  it('excludes a component whose head did not move', () => {
    const stable = comp('acme.shop/comp1', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1');
    expect(changedLaneComponents([stable], [stable])).to.deep.equal([]);
  });

  it('treats an undefined "before" (never seen this lane) as everything being new', () => {
    const after = [comp('acme.shop/comp1', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1')];
    expect(changedLaneComponents(undefined, after)).to.deep.equal(after);
  });
});

describe('runSummaryCommentBody', () => {
  it('carries the marker, the changed components, and the branch/lane anchors', () => {
    const body = runSummaryCommentBody({
      laneIdStr: 'acme.shop/my-lane',
      laneUrl: 'https://bit.cloud/acme/shop/~lane/my-lane',
      branch: 'my-lane',
      branchTipSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1',
      laneHead: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb2',
      changed: [comp('acme.shop/comp1', 'ccccccccccccccccccccccccccccccccccccccc3')],
    });
    expect(body).to.include(RUN_SUMMARY_MARKER);
    expect(body).to.include('acme.shop/comp1` @ `ccccccccc');
    expect(body).to.include('branch: `my-lane` @ `aaaaaaaaa`');
    // the lane anchor is a LINK — the reader lands on the lane, not on a name to copy-paste
    expect(body).to.include('lane: [`acme.shop/my-lane`](https://bit.cloud/acme/shop/~lane/my-lane) @ `bbbbbbbbb`');
  });

  it('says plainly that nothing changed, rather than an empty list', () => {
    const body = runSummaryCommentBody({
      laneIdStr: 'acme.shop/my-lane',
      laneUrl: 'https://bit.cloud/acme/shop/~lane/my-lane',
      branch: 'my-lane',
      branchTipSha: undefined,
      laneHead: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb2',
      changed: [],
    });
    expect(body).to.include('none — nothing on the lane changed this run');
    expect(body).to.not.include('@ `undefined');
  });
});

// The comment is a pure surface effect: it must never gate the run's own outcome, and must degrade
// silently through every "nothing to comment on" state a real host, PR or branch can be in.
describe('postRunSummaryComment', () => {
  const BEFORE = [comp('acme.shop/comp1', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1')];
  const AFTER = [comp('acme.shop/comp1', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb2')];

  function executorWith(gitHost: any, warnings: string[] = []) {
    const executor = new LaneSyncExecutor({
      lanes: {} as any,
      ci: {} as any,
      logger: { console: () => {}, consoleWarning: (msg: string) => warnings.push(msg), error: () => {} } as any,
      gitHost,
      cfg: resolveSyncConfig({}),
      defaultScope: 'acme.shop',
    });
    (executor as any).currentBranchTip = async () => 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1';
    return executor;
  }

  const call = (executor: LaneSyncExecutor) =>
    (executor as any).postRunSummaryComment({
      target: { hostScope: 'acme.shop', name: 'my-lane' },
      laneIdStr: 'acme.shop/my-lane',
      branch: 'my-lane',
      laneHead: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb2',
      branchTipSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1',
      preComponents: BEFORE,
      postComponents: AFTER,
    }) as Promise<void>;

  // The anchor is the ledger sha THIS run pushed — passed in, never refetched: a concurrent developer
  // push must not be presented as the synced tip, and no remote read exists to fail the path.
  it('anchors the body on the given pushed sha without any branch refetch', async () => {
    const upserts: string[] = [];
    const gitHost = {
      findPrByBranch: async () => ({ number: 7, htmlUrl: 'https://example.test/pr/7', labels: [] }),
      upsertComment: async (_n: number, _m: string, body: string) => upserts.push(body),
    };
    const executor = executorWith(gitHost);
    (executor as any).currentBranchTip = async () => {
      throw new Error('must not be called');
    };
    await call(executor);
    expect(upserts).to.have.lengthOf(1);
    expect(upserts[0]).to.include('branch: `my-lane` @ `aaaaaaaaa`');
  });

  it('upserts the marked comment on the open PR when the host supports it', async () => {
    const calls: any[] = [];
    const gitHost = {
      findPrByBranch: async () => ({ number: 7, htmlUrl: 'https://example.test/pr/7', labels: [] }),
      upsertComment: async (prNumber: number, marker: string, body: string) => {
        calls.push({ prNumber, marker, body });
      },
    };
    await call(executorWith(gitHost));
    expect(calls).to.have.lengthOf(1);
    expect(calls[0].prNumber).to.equal(7);
    expect(calls[0].marker).to.equal(RUN_SUMMARY_MARKER);
    expect(calls[0].body).to.include('acme.shop/comp1` @ `bbbbbbbbb');
  });

  it('is a no-op with no configured git host', async () => {
    await call(executorWith(undefined)); // would throw on any host call; nothing to assert but "did not throw"
  });

  it('is a no-op when the host does not implement upsertComment', async () => {
    const calls: any[] = [];
    const gitHost = {
      findPrByBranch: async () => {
        calls.push('findPrByBranch');
        return { number: 7, htmlUrl: 'https://example.test/pr/7', labels: [] };
      },
    };
    await call(executorWith(gitHost));
    // upsertComment is feature-tested BEFORE the PR lookup — an unsupported host must not even look up the PR.
    expect(calls).to.deep.equal([]);
  });

  it('is a no-op when the branch has no open PR yet', async () => {
    const calls: any[] = [];
    const gitHost = {
      findPrByBranch: async () => undefined,
      upsertComment: async () => {
        calls.push('upsertComment');
      },
    };
    await call(executorWith(gitHost));
    expect(calls).to.deep.equal([]);
  });

  it('warns and does not throw when the comment API call fails', async () => {
    const warnings: string[] = [];
    const gitHost = {
      findPrByBranch: async () => ({ number: 7, htmlUrl: 'https://example.test/pr/7', labels: [] }),
      upsertComment: async () => {
        throw new Error('rate limited');
      },
    };
    await call(executorWith(gitHost, warnings));
    expect(warnings.join('\n')).to.contain('Could not post the run-summary comment');
    expect(warnings.join('\n')).to.contain('rate limited');
  });
});
