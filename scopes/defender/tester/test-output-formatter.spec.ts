import { expect } from 'chai';
import { ComponentID } from '@teambit/component';
import { TestsResult, TestsFiles } from '@teambit/tests-results';
import type { Component } from '@teambit/component';
import { aggregateTestResults, formatTestReport } from './test-output-formatter';
import { Tests } from './tester';
import type { TestResults } from './tester.main.runtime';

function mkId(name: string): ComponentID {
  return ComponentID.fromString(`my-scope/${name}`);
}

function mkComponent(name: string): Component {
  return { id: mkId(name) } as unknown as Component;
}

function mkFile(pass: number, failed: number, pending = 0, error?: Error): TestsFiles {
  return new TestsFiles('file.spec.ts', [], pass, failed, pending, 0, false, error);
}

type CompFixture = { name: string; files: TestsFiles[]; errors?: Error[] };

function mkResults(envId: string, components: CompFixture[]): TestResults {
  const compResults = components.map(({ name, files, errors }) => ({
    componentId: mkId(name),
    results: new TestsResult(
      files,
      files.every((f) => f.failed === 0 && !f.error),
      0
    ),
    errors,
  }));
  const hasFailure = compResults.some(
    (c) => (c.errors?.length || 0) > 0 || c.results.testFiles.some((f) => f.failed > 0 || f.error)
  );
  const envComponents = components.map((c) => mkComponent(c.name));
  return {
    results: [{ env: { id: envId, components: envComponents } as any, data: new Tests(compResults) }],
    hasErrors: () => hasFailure,
    errors: [],
  } as unknown as TestResults;
}

describe('aggregateTestResults()', () => {
  it('counts passed/failed/pending across components', () => {
    const results = mkResults('teambit.react/react', [
      { name: 'comp-a', files: [mkFile(5, 0, 1)] },
      { name: 'comp-b', files: [mkFile(2, 1, 0)] },
    ]);
    const summary = aggregateTestResults(results, [mkComponent('comp-a'), mkComponent('comp-b')]);
    expect(summary.totals.testsPassed).to.equal(7);
    expect(summary.totals.testsFailed).to.equal(1);
    expect(summary.totals.testsPending).to.equal(1);
    expect(summary.totals.tested).to.equal(2);
    expect(summary.totals.withoutTests).to.equal(0);
  });

  it('identifies components without tests', () => {
    const results = mkResults('teambit.react/react', [{ name: 'comp-a', files: [mkFile(3, 0)] }]);
    const summary = aggregateTestResults(results, [
      mkComponent('comp-a'),
      mkComponent('comp-b'),
      mkComponent('comp-c'),
    ]);
    expect(summary.totals.withoutTests).to.equal(2);
    expect(summary.componentsWithoutTests.map((id) => id.toString())).to.include('my-scope/comp-b');
    expect(summary.componentsWithoutTests.map((id) => id.toString())).to.include('my-scope/comp-c');
  });

  it('surfaces env-level errors and keeps affected components out of the no-tests bucket', () => {
    const err = new Error('tester crashed');
    const compA = mkComponent('comp-a');
    const results = {
      results: [{ env: { id: 'teambit.react/react', components: [compA] } as any, data: undefined, error: err }],
    } as unknown as TestResults;
    const summary = aggregateTestResults(results, [compA]);
    expect(summary.envErrors).to.have.lengthOf(1);
    expect(summary.envErrors[0].error.message).to.equal('tester crashed');
    expect(summary.totals.withoutTests).to.equal(0);
    expect(summary.totals.affectedByEnvError).to.equal(1);
    expect(summary.componentsAffectedByEnvError.map((id) => id.toString())).to.include('my-scope/comp-a');
  });

  it('flags components with tester errors on test files', () => {
    const err = new Error('parse error');
    const results = mkResults('teambit.react/react', [{ name: 'comp-a', files: [mkFile(0, 0, 0, err)] }]);
    const summary = aggregateTestResults(results, [mkComponent('comp-a')]);
    expect(summary.componentsWithTests[0].hasError).to.equal(true);
  });
});

describe('formatTestReport()', () => {
  it('renders a green success summary when all pass', () => {
    const results = mkResults('teambit.react/react', [{ name: 'comp-a', files: [mkFile(5, 0)] }]);
    const summary = aggregateTestResults(results, [mkComponent('comp-a')]);
    const out = formatTestReport(summary, { verbose: false, duration: '1.2s' });
    expect(out).to.include('test results');
    expect(out).to.include('my-scope/comp-a');
    expect(out).to.include('5 passed');
    expect(out).to.include('5/5 tests passed');
    expect(out).to.include('Finished. (1.2s)');
  });

  it('renders warning summary with failure count when any fail', () => {
    const results = mkResults('teambit.react/react', [
      { name: 'comp-a', files: [mkFile(5, 0)] },
      { name: 'comp-b', files: [mkFile(2, 3)] },
    ]);
    const summary = aggregateTestResults(results, [mkComponent('comp-a'), mkComponent('comp-b')]);
    const out = formatTestReport(summary, { verbose: false, duration: '2.5s' });
    expect(out).to.include('3 tests failed across 1 of 2 components');
  });

  it('collapses no-test components into a single hint line by default', () => {
    const results = mkResults('teambit.react/react', [{ name: 'comp-a', files: [mkFile(1, 0)] }]);
    const summary = aggregateTestResults(results, [
      mkComponent('comp-a'),
      mkComponent('comp-b'),
      mkComponent('comp-c'),
    ]);
    const out = formatTestReport(summary, { verbose: false, duration: '1s' });
    expect(out).to.include('2 components have no tests (run with --verbose to list)');
    expect(out).to.not.include('my-scope/comp-b');
  });

  it('lists no-test component ids when verbose', () => {
    const results = mkResults('teambit.react/react', [{ name: 'comp-a', files: [mkFile(1, 0)] }]);
    const summary = aggregateTestResults(results, [
      mkComponent('comp-a'),
      mkComponent('comp-b'),
      mkComponent('comp-c'),
    ]);
    const out = formatTestReport(summary, { verbose: true, duration: '1s' });
    expect(out).to.include('2 components have no tests');
    expect(out).to.include('my-scope/comp-b');
    expect(out).to.include('my-scope/comp-c');
  });

  it('handles empty component list', () => {
    const results = { results: [] } as unknown as TestResults;
    const summary = aggregateTestResults(results, []);
    const out = formatTestReport(summary, { verbose: false, duration: '0s' });
    expect(out).to.include('no components to test');
  });

  it('emits only the final headline when summaryOnly is set', () => {
    const results = mkResults('teambit.react/react', [
      { name: 'comp-a', files: [mkFile(5, 0)] },
      { name: 'comp-b', files: [mkFile(0, 2)] },
    ]);
    const summary = aggregateTestResults(results, [mkComponent('comp-a'), mkComponent('comp-b')]);
    const out = formatTestReport(summary, { verbose: false, duration: '1s', summaryOnly: true });
    expect(out).to.not.include('test results');
    expect(out).to.not.include('my-scope/comp-a');
    expect(out).to.include('2 tests failed across 1 of 2 components');
    expect(out).to.include('Finished. (1s)');
  });

  it('surfaces env errors in a dedicated section', () => {
    const err = new Error('tester crashed');
    const compA = mkComponent('comp-a');
    const results = {
      results: [{ env: { id: 'teambit.react/react', components: [compA] } as any, data: undefined, error: err }],
    } as unknown as TestResults;
    const summary = aggregateTestResults(results, [compA]);
    const out = formatTestReport(summary, { verbose: false, duration: '0.3s' });
    expect(out).to.include('tester errors');
    expect(out).to.include('teambit.react/react');
    expect(out).to.include('tester crashed');
    expect(out).to.include('1 components targeted');
  });

  it('separates failed-tests component count from tester-error component count in failure headline', () => {
    const err = new Error('parse error');
    const results = mkResults('teambit.react/react', [
      { name: 'comp-a', files: [mkFile(2, 3)] },
      { name: 'comp-b', files: [mkFile(5, 0)] },
      { name: 'comp-c', files: [mkFile(0, 0, 0, err)] },
    ]);
    const summary = aggregateTestResults(results, [
      mkComponent('comp-a'),
      mkComponent('comp-b'),
      mkComponent('comp-c'),
    ]);
    const out = formatTestReport(summary, { verbose: false, duration: '1s' });
    expect(out).to.include('3 tests failed across 1 of 3 components');
    expect(out).to.include('(+1 components had tester errors)');
  });

  it('surfaces passed counts alongside tester errors when no tests failed', () => {
    const err = new Error('parse error');
    const results = mkResults('teambit.react/react', [
      { name: 'comp-a', files: [mkFile(10, 0)] },
      { name: 'comp-b', files: [mkFile(5, 0)] },
      { name: 'comp-c', files: [mkFile(0, 0, 0, err)] },
    ]);
    const summary = aggregateTestResults(results, [
      mkComponent('comp-a'),
      mkComponent('comp-b'),
      mkComponent('comp-c'),
    ]);
    const out = formatTestReport(summary, { verbose: false, duration: '1s' });
    expect(out).to.include('15/15 tests passed across 2 components');
    expect(out).to.include('1 components had tester errors');
    expect(out).to.not.include('tester errors encountered (');
  });

  it('downgrades to a warning when all tests pass but tester exited non-zero (e.g. coverage threshold)', () => {
    const results = mkResults('teambit.react/react', [{ name: 'comp-a', files: [mkFile(5, 0)] }]);
    const summary = aggregateTestResults(results, [mkComponent('comp-a')]);
    const out = formatTestReport(summary, { verbose: false, duration: '1s', failedDueToExitCode: true });
    expect(out).to.include('5/5 tests passed');
    expect(out).to.include('non-zero code');
    expect(out).to.not.include('tests failed across');
  });

  it('includes pending tests in the headline when present', () => {
    const results = mkResults('teambit.react/react', [{ name: 'comp-a', files: [mkFile(3, 0, 2)] }]);
    const summary = aggregateTestResults(results, [mkComponent('comp-a')]);
    const out = formatTestReport(summary, { verbose: false, duration: '1s' });
    expect(out).to.include('2 pending');
    expect(out).to.include('3/5 tests passed');
  });
});
