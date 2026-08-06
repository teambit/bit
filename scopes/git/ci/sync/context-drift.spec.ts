import { expect } from 'chai';
import { classifyPayloadDiff, convergenceMessage, blockerNamesUnion } from './context-drift';

describe('classifyPayloadDiff', () => {
  const base = {
    files: [{ file: 'aaa', relativePath: 'index.js' }],
    mainFile: 'index.js',
    packageDependencies: { 'is-odd': '1.0.0' },
    devPackageDependencies: {},
    peerPackageDependencies: {},
    log: { date: '1', username: 'a' },
  };

  it('classifies a package-range-only change as depOnly', () => {
    const fromFs = { ...base, packageDependencies: { 'is-odd': '3.0.1' }, log: { date: '2', username: 'b' } };
    const res = classifyPayloadDiff(base, fromFs);
    expect(res.depOnly).to.equal(true);
    expect(res.changedKeys).to.deep.equal(['packageDependencies']);
  });

  it('classifies a dev/peer reclassification as depOnly', () => {
    const recorded = { ...base, peerDependencies: [{ id: 'scope/link' }], dependencies: [] };
    const fromFs = { ...base, peerDependencies: [], dependencies: [{ id: 'scope/link' }] };
    expect(classifyPayloadDiff(recorded, fromFs).depOnly).to.equal(true);
  });

  it('rejects a file change even when deps also changed', () => {
    const fromFs = {
      ...base,
      files: [{ file: 'bbb', relativePath: 'index.js' }],
      packageDependencies: { 'is-odd': '3.0.1' },
    };
    const res = classifyPayloadDiff(base, fromFs);
    expect(res.depOnly).to.equal(false);
    expect(res.changedKeys).to.include('files');
  });

  it('rejects an extensions (config) change', () => {
    const fromFs = { ...base, extensions: [{ name: 'teambit.envs/envs', config: { env: 'x' } }] };
    expect(classifyPayloadDiff(base, fromFs).depOnly).to.equal(false);
  });
});

describe('convergenceMessage', () => {
  it('names the recorded and running bit versions', () => {
    const msg = convergenceMessage(['1.12.61', '1.12.61', undefined], '2.0.69');
    expect(msg).to.equal('chore: align dependency context (recorded with bit 1.12.61, workspace runs bit 2.0.69)');
  });
  it('lists distinct recorded versions', () => {
    const msg = convergenceMessage(['1.12.61', '2.0.10'], '2.0.69');
    expect(msg).to.include('1.12.61, 2.0.10');
  });
  it('handles no recorded versions', () => {
    expect(convergenceMessage([undefined], '2.0.69')).to.equal(
      'chore: align dependency context (workspace runs bit 2.0.69)'
    );
  });
});

describe('blockerNamesUnion', () => {
  const entry = (idStr: string, names: string[], blocker: boolean) => ({
    id: { toStringWithoutVersion: () => idStr },
    issues: { getAllIssueNames: () => names, hasTagBlockerIssues: () => blocker },
  });

  it('unions blocker issue names of in-set components only', () => {
    const res = blockerNamesUnion(
      [entry('s/a', ['CircularDependencies'], true), entry('s/b', ['MissingDists'], true)],
      new Set(['s/a'])
    );
    expect(res).to.equal('CircularDependencies');
  });
  it('returns undefined when no in-set component has blockers', () => {
    expect(blockerNamesUnion([entry('s/a', ['X'], false)], new Set(['s/a']))).to.equal(undefined);
  });
});
