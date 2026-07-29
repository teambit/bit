import { expect } from 'chai';
import { planLaneSync } from './sync-planner';

const base = { laneHead: 'L1', branchExists: true, lastSyncedHead: 'L1', hasDevCommits: false, conflictLabelPresent: false };

describe('planLaneSync', () => {
  it('converged -> noop', () => {
    expect(planLaneSync({ ...base }).type).to.equal('noop');
  });
  it('conflict label present -> noop until resolved', () => {
    expect(planLaneSync({ ...base, laneHead: 'L2', conflictLabelPresent: true }).type).to.equal('noop');
  });
  it('lane gone + branch exists -> close-pr', () => {
    expect(planLaneSync({ ...base, laneHead: undefined }).type).to.equal('close-pr');
  });
  it('lane gone + no branch -> noop', () => {
    expect(planLaneSync({ ...base, laneHead: undefined, branchExists: false }).type).to.equal('noop');
  });
  it('no branch yet -> import-lane', () => {
    expect(planLaneSync({ ...base, branchExists: false, lastSyncedHead: undefined }).type).to.equal('import-lane');
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
  it('existing branch, never synced, no dev commits -> import-lane (adopt branch)', () => {
    expect(planLaneSync({ ...base, lastSyncedHead: undefined }).type).to.equal('import-lane');
  });
  it('existing branch, never synced, has dev commits -> halt (ambiguous)', () => {
    const action = planLaneSync({ ...base, lastSyncedHead: undefined, hasDevCommits: true });
    expect(action.type).to.equal('halt');
  });
});
