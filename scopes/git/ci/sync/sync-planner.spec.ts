import { expect } from 'chai';
import { planLaneSync } from './sync-planner';

const base = {
  laneHead: 'L1',
  branchExists: true,
  lastSyncedHead: 'L1',
  hasDevCommits: false,
  conflictLabelPresent: false,
  wasLaneManaged: true,
};

describe('planLaneSync', () => {
  it('converged -> noop', () => {
    expect(planLaneSync({ ...base }).type).to.equal('noop');
  });
  it('conflict label present -> noop until resolved', () => {
    expect(planLaneSync({ ...base, laneHead: 'L2', conflictLabelPresent: true }).type).to.equal('noop');
  });
  it('lane gone + branch exists + branch was lane-managed -> close-pr', () => {
    expect(planLaneSync({ ...base, laneHead: undefined }).type).to.equal('close-pr');
  });
  it('lane gone + no branch -> noop', () => {
    expect(planLaneSync({ ...base, laneHead: undefined, branchExists: false }).type).to.equal('noop');
  });

  /**
   * THE branch-destruction guard. Under the documented defaults (`branchPrefix: ''`, `lanes: ['*']`) every
   * branch on `origin` maps to a same-named lane, so an ordinary developer branch reaches the planner with
   * exactly the shape of a lane branch whose lane was deleted — and `close-pr` deletes the branch. Only a
   * `Bit-Lane-Head` trailer in the branch's own history licenses that.
   */
  it('no lane + branch exists + branch NEVER had a sync commit -> noop, never close-pr', () => {
    const action = planLaneSync({ ...base, laneHead: undefined, lastSyncedHead: undefined, wasLaneManaged: false });
    expect(action.type).to.equal('noop');
    expect(action.type === 'noop' && action.reason).to.contain('maps to no lane and has no sync history');
  });
  it('no lane + unrelated branch with its own dev commits -> still noop', () => {
    // The dev commits are the developer's unmerged work. This is the exact shape the reviewer reproduced
    // as a silent `git push origin --delete` of `origin/feature-x`.
    const action = planLaneSync({
      ...base,
      laneHead: undefined,
      lastSyncedHead: undefined,
      hasDevCommits: true,
      wasLaneManaged: false,
    });
    expect(action.type).to.equal('noop');
  });

  it('no branch yet -> import-lane', () => {
    expect(
      planLaneSync({ ...base, branchExists: false, lastSyncedHead: undefined, wasLaneManaged: false }).type
    ).to.equal('import-lane');
  });
  it('lane moved, branch untouched -> import-lane', () => {
    expect(planLaneSync({ ...base, laneHead: 'L2' }).type).to.equal('import-lane');
  });
  it('dev commits, lane unchanged -> export-branch', () => {
    expect(planLaneSync({ ...base, hasDevCommits: true }).type).to.equal('export-branch');
  });
  it('both moved -> merge-diverged', () => {
    expect(planLaneSync({ ...base, laneHead: 'L2', hasDevCommits: true }).type).to.equal('merge-diverged');
  });

  /**
   * The adopt case is unaffected by `wasLaneManaged`: it requires `laneHead` to be defined, so the lane
   * exists and the pairing is established by the mapping rather than by history.
   */
  it('existing branch, never synced, no dev commits, lane EXISTS -> import-lane (adopt branch)', () => {
    expect(planLaneSync({ ...base, lastSyncedHead: undefined, wasLaneManaged: false }).type).to.equal('import-lane');
  });
  it('existing branch, never synced, has dev commits, lane EXISTS -> halt (ambiguous)', () => {
    const action = planLaneSync({
      ...base,
      lastSyncedHead: undefined,
      wasLaneManaged: false,
      hasDevCommits: true,
    });
    expect(action.type).to.equal('halt');
  });
});
