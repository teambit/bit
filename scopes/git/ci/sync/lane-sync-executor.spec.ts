import { expect } from 'chai';
import {
  branchMirrorsOtherLaneNote,
  branchMirrorsOtherLaneReason,
  crossScopeDescription,
  crossScopeMidFlightHaltReason,
  crossScopeRefusal,
  crossScopeSkipSummary,
  foreignLaneComponents,
  isProtectedBranch,
  laneHeadFingerprint,
} from './lane-sync-executor';

type LaneComponents = Parameters<typeof laneHeadFingerprint>[0];

/**
 * A stand-in for `LaneData`'s component entry. The helpers under test only ever read
 * `id.toStringWithoutVersion()`, `id.scope` and `head`, so the test doesn't need a real `ComponentID` —
 * and not building one keeps this spec independent of the workspace/scope machinery.
 */
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
    // Two different lanes holding the same component heads fingerprint identically. That is the point:
    // `LaneData.hash` is minted randomly at creation time and never moves when the lane advances, so it
    // cannot answer "did this lane change since the last sync?".
    expect(laneHeadFingerprint([a, b])).to.equal(laneHeadFingerprint([comp('acme.shop/comp1', a.head), b]));
  });
});

/**
 * The Stage-0 relevance/purity check: a lane may be *hosted* anywhere, but its content must live in the
 * one scope this repository maps, because the reconciler has no notion of a partial lane yet.
 */
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
    // This is the case Stage 0 explicitly supports: `bit ci sync other.scope/my-lane` syncs normally as
    // long as the content is single-scope and that scope is this repository's.
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

/**
 * The three ways a cross-scope lane can reach this repository. They report the same facts and mean three
 * different things, so the wording — and, downstream, the exit code — differs on purpose.
 */
describe('cross-scope outcome messages', () => {
  const DEFAULT_SCOPE = 'acme.shop';
  const FOREIGN = ['other.scope/comp2'];

  it('an enumerated lane is SKIPPED, in the vocabulary of a healthy run', () => {
    const summary = crossScopeSkipSummary('my-lane', FOREIGN, DEFAULT_SCOPE);
    expect(summary).to.match(/^my-lane -> skipped \(cross-scope lane: /);
    expect(summary).to.include('no branch created');
    // It must not read as a failure: this line is returned as-is on a green run, so a HALTED/REFUSED
    // marker in it would flip the exit code of a repository that has nothing wrong with it.
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
    // The closing promise has to describe what actually happened. "No branch was created" would be a
    // different — and false — statement about a branch that was sitting there before the run.
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

/**
 * Two lanes with the same name in different scopes map to the same branch, because the branch mapping is
 * keyed on the name. The halt has to name both ids, or the human cannot tell which lane owns the branch.
 */
describe('branchMirrorsOtherLaneReason', () => {
  it('names the branch, the lane that owns it, and the lane that was refused', () => {
    const reason = branchMirrorsOtherLaneReason('release', 'other.scope/release', 'acme.shop/release');
    expect(reason).to.include('branch release mirrors lane other.scope/release');
    expect(reason).to.include('refusing to plan for acme.shop/release');
    expect(reason).to.include("overwrite the other lane's mirror");
  });

  /**
   * This is the one halt whose PR belongs to a *different* lane than the one that failed, so the comment
   * has to tell that PR's reviewers their own lane is fine — and must not carry the default
   * "bit lane import <lane>" steps, which name the refused lane and would perform the very overwrite the
   * halt prevented.
   */
  it('the PR comment tells the branch owner their lane is fine, and not to run the usual steps', () => {
    const note = branchMirrorsOtherLaneNote('other.scope/release', 'acme.shop/release');
    expect(note).to.include('belongs to lane `other.scope/release`');
    expect(note).to.include('nothing is wrong with it');
    expect(note).to.include('acme.shop/release');
    expect(note).to.match(/Do NOT run the usual "bit lane import" resolution steps/);
    // the way out, so the comment is actionable rather than only a warning
    expect(note).to.include('rename one of the two lanes');
    expect(note).to.include('`branches`');
  });
});

/**
 * The last-resort guard at `executeClosePr`'s `git push origin --delete` site. The planner can never
 * route the default branch or the main sync branch to `close-pr` (neither is treated as lane-mapped), so
 * these rows lock the belt-and-braces refusal that must hold even when everything upstream is wrong.
 */
describe('isProtectedBranch', () => {
  it('refuses the default branch and the main sync branch', () => {
    expect(isProtectedBranch('develop', 'develop', 'bit-sync/main')).to.equal(true);
    expect(isProtectedBranch('bit-sync/main', 'develop', 'bit-sync/main')).to.equal(true);
  });

  it('permits an ordinary lane branch', () => {
    expect(isProtectedBranch('my-lane', 'develop', 'bit-sync/main')).to.equal(false);
  });
});
