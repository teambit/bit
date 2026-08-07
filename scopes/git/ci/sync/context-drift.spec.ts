import { expect } from 'chai';
import {
  classifyDiffFields,
  convergenceMessage,
  blockerNamesUnion,
  driftReportCommentBody,
  driftClearedCommentBody,
  DRIFT_COMMENT_MARKER,
} from './context-drift';

describe('classifyDiffFields', () => {
  const unchanged = { filesChanged: false, pathSetsEqual: true };
  const changed = { filesChanged: true, pathSetsEqual: true };

  it('classifies a change confined to dependency-ish fields as drift', () => {
    const res = classifyDiffFields(['packageDependencies', 'dependencies'], unchanged);
    expect(res.drift).to.equal(true);
    expect(res.changedKeys).to.deep.equal(['packageDependencies', 'dependencies']);
  });

  it('classifies overridesDevDependencies alone as drift', () => {
    expect(classifyDiffFields(['overridesDevDependencies'], unchanged).drift).to.equal(true);
  });

  it('rejects overridesPackageJsonProps as a non-dependency field', () => {
    expect(classifyDiffFields(['overridesPackageJsonProps'], unchanged).drift).to.equal(false);
  });

  it('rejects an aspect configuration field name', () => {
    const res = classifyDiffFields(['teambit.envs/envs configuration'], unchanged);
    expect(res.drift).to.equal(false);
    expect(res.changedKeys).to.deep.equal(['teambit.envs/envs configuration']);
  });

  it('rejects any field set once file content changed, regardless of which fields fired', () => {
    const res = classifyDiffFields(['packageDependencies'], changed);
    expect(res.drift).to.equal(false);
    expect(res.changedKeys).to.deep.equal(['packageDependencies']);
  });

  it('classifies files+specs only, with unchanged content and equal path sets, as drift from deprecated file props', () => {
    const res = classifyDiffFields(['files', 'specs'], unchanged);
    expect(res.drift).to.equal(true);
    expect(res.changedKeys).to.deep.equal(['deprecated-file-props']);
  });

  it('refuses the deprecated-file-props default when the path sets are not provably equal', () => {
    const res = classifyDiffFields(['files', 'specs'], { filesChanged: false, pathSetsEqual: false });
    expect(res.drift).to.equal(false);
    expect(res.changedKeys).to.deep.equal(['files', 'specs']);
  });

  it('flags an empty field list with unchanged content as an anomaly, not drift', () => {
    const res = classifyDiffFields([], unchanged);
    expect(res.drift).to.equal(false);
    expect(res.changedKeys).to.deep.equal([]);
    expect(res.anomaly).to.equal('modified without a visible diff');
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
  const issue = (name: string, isTagBlocker: boolean) => ({ isTagBlocker, constructor: { name } });
  const entry = (idStr: string, issues: { isTagBlocker: boolean; constructor: { name: string } }[]) => ({
    id: { toStringWithoutVersion: () => idStr },
    issues: {
      getAllIssues: () => issues,
      hasTagBlockerIssues: () => issues.some((i) => i.isTagBlocker),
    },
  });

  it('unions blocker issue names of in-set components only', () => {
    const res = blockerNamesUnion(
      [entry('s/a', [issue('CircularDependencies', true)]), entry('s/b', [issue('MissingDists', true)])],
      new Set(['s/a'])
    );
    expect(res).to.equal('CircularDependencies');
  });
  it('returns undefined when no in-set component has blockers', () => {
    expect(blockerNamesUnion([entry('s/a', [issue('X', false)])], new Set(['s/a']))).to.equal(undefined);
  });
  it('carries only the blocker issue name, not a non-blocker issue on the same component', () => {
    const res = blockerNamesUnion(
      [entry('s/a', [issue('CircularDependencies', true), issue('MissingDists', false)])],
      new Set(['s/a'])
    );
    expect(res).to.equal('CircularDependencies');
  });
});

describe('driftReportCommentBody', () => {
  const drift = [
    {
      id: { toStringWithoutVersion: () => 'scope/comp2' },
      recordedBitVersion: '1.12.61',
      changedKeys: ['packageDependencies'],
    },
  ];
  const anchors = {
    branch: 'drift-lane',
    branchTipSha: 'abcdef0123456789',
    laneIdStr: 'scope/drift-lane',
    laneHead: '0123456789abcdef',
  };

  it('carries the marker, the cause, the synced pair, and the drifted component', () => {
    const body = driftReportCommentBody(drift, '2.0.69', anchors);
    expect(body).to.include(DRIFT_COMMENT_MARKER);
    expect(body).to.include('recorded with bit 1.12.61, running bit 2.0.69');
    // the anchors: which push, which lane snap
    expect(body).to.include('drift-lane');
    expect(body).to.include('abcdef012');
    expect(body).to.include('scope/drift-lane');
    expect(body).to.include('0123456789ab'.slice(0, 9));
    expect(body).to.include('scope/comp2');
    expect(body).to.include('packageDependencies');
  });
});

describe('driftClearedCommentBody', () => {
  it('carries the marker, so the upsert can find and update this exact comment', () => {
    expect(driftClearedCommentBody()).to.include(DRIFT_COMMENT_MARKER);
  });
});
