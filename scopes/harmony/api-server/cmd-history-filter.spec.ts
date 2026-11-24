import { expect } from 'chai';
import { isReadOnlyCmdHistoryOp } from './cmd-history-filter';

describe('isReadOnlyCmdHistoryOp', () => {
  it('should skip read-only IDE api methods', () => {
    expect(isReadOnlyCmdHistoryOp('828 getCurrentLaneObject()')).to.be.true;
    expect(isReadOnlyCmdHistoryOp('7690 getModifiedByConfig()')).to.be.true;
    expect(isReadOnlyCmdHistoryOp('12 listIdsWithPaths()')).to.be.true;
    expect(isReadOnlyCmdHistoryOp('12 catObject(abc)')).to.be.true;
  });
  it('should keep IDE api methods that change the workspace', () => {
    expect(isReadOnlyCmdHistoryOp('12 tagOrSnap(my-msg)')).to.be.false;
    expect(isReadOnlyCmdHistoryOp('12 switchLane(dev)')).to.be.false;
    expect(isReadOnlyCmdHistoryOp('12 install()')).to.be.false;
    // "getting" a name that doesn't follow the get<Upper> convention is not assumed to be read-only
    expect(isReadOnlyCmdHistoryOp('12 getaway()')).to.be.false;
  });
  it('should skip read-only commands', () => {
    expect(isReadOnlyCmdHistoryOp('3889 show my-scope/comp')).to.be.true;
    expect(isReadOnlyCmdHistoryOp('1 mini-status --json')).to.be.true;
    expect(isReadOnlyCmdHistoryOp('1 status')).to.be.true;
    expect(isReadOnlyCmdHistoryOp('1 version')).to.be.true;
    expect(isReadOnlyCmdHistoryOp('1 s --json')).to.be.true;
  });
  it('should skip read-only subcommands and bare listing commands', () => {
    expect(isReadOnlyCmdHistoryOp('1 lane')).to.be.true;
    expect(isReadOnlyCmdHistoryOp('1 lane --json')).to.be.true;
    expect(isReadOnlyCmdHistoryOp('1 lane show dev')).to.be.true;
    expect(isReadOnlyCmdHistoryOp('1 envs get my-scope/comp')).to.be.true;
  });
  it('should keep commands that change the workspace', () => {
    expect(isReadOnlyCmdHistoryOp('1 snap -m msg')).to.be.false;
    expect(isReadOnlyCmdHistoryOp('1 lane merge main')).to.be.false;
    expect(isReadOnlyCmdHistoryOp('1 envs set my-scope/comp teambit.react/react')).to.be.false;
    expect(isReadOnlyCmdHistoryOp('1 deps set my-scope/comp lodash@4')).to.be.false;
    expect(isReadOnlyCmdHistoryOp('1 import my-scope/comp')).to.be.false;
  });
  it('should keep anything it cannot parse', () => {
    expect(isReadOnlyCmdHistoryOp('')).to.be.false;
    expect(isReadOnlyCmdHistoryOp('1')).to.be.false;
  });
});
