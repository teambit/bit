import chalk from 'chalk';
import type { Component, ComponentID } from '@teambit/component';
import {
  formatTitle,
  formatHint,
  formatSuccessSummary,
  formatWarningSummary,
  joinSections,
  successSymbol,
  errorSymbol,
  warnSymbol,
} from '@teambit/cli';
import type { TestResults } from './tester.main.runtime';

export type ComponentTestSummary = {
  id: ComponentID;
  passed: number;
  failed: number;
  pending: number;
  hasError: boolean;
};

export type EnvTestError = {
  envId?: string;
  error: Error;
};

export type TestOutputSummary = {
  componentsWithTests: ComponentTestSummary[];
  componentsWithoutTests: ComponentID[];
  envErrors: EnvTestError[];
  totals: {
    totalComponents: number;
    tested: number;
    withoutTests: number;
    testsPassed: number;
    testsFailed: number;
    testsPending: number;
  };
};

export function aggregateTestResults(results: TestResults, allComponents: Component[]): TestOutputSummary {
  const componentsWithTests: ComponentTestSummary[] = [];
  const envErrors: EnvTestError[] = [];
  const testedIds = new Set<string>();

  for (const envResult of results.results) {
    const envId = envResult.env?.id;
    if (envResult.error) envErrors.push({ envId, error: envResult.error });
    const tests = envResult.data;
    if (!tests) continue;
    for (const comp of tests.components) {
      testedIds.add(comp.componentId.toString());
      const summary = summarizeComponent(comp);
      if (summary) componentsWithTests.push(summary);
    }
  }

  const componentsWithoutTests = allComponents.filter((c) => !testedIds.has(c.id.toString())).map((c) => c.id);

  const totals = {
    totalComponents: allComponents.length,
    tested: componentsWithTests.length,
    withoutTests: componentsWithoutTests.length,
    testsPassed: sum(componentsWithTests, (c) => c.passed),
    testsFailed: sum(componentsWithTests, (c) => c.failed),
    testsPending: sum(componentsWithTests, (c) => c.pending),
  };

  return { componentsWithTests, componentsWithoutTests, envErrors, totals };
}

function summarizeComponent(comp: {
  componentId: ComponentID;
  results?: { testFiles: Array<{ pass: number; failed: number; pending: number; error?: Error }> };
  errors?: Error[];
}): ComponentTestSummary | undefined {
  const testFiles = comp.results?.testFiles ?? [];
  if (!testFiles.length && !comp.errors?.length) return undefined;
  const passed = sum(testFiles, (f) => f.pass || 0);
  const failed = sum(testFiles, (f) => f.failed || 0);
  const pending = sum(testFiles, (f) => f.pending || 0);
  const hasError = Boolean(comp.errors?.length) || testFiles.some((f) => f.error);
  return { id: comp.componentId, passed, failed, pending, hasError };
}

export function formatTestReport(
  summary: TestOutputSummary,
  opts: { verbose: boolean; duration: string; summaryOnly?: boolean }
): string {
  const { componentsWithTests, componentsWithoutTests, envErrors, totals } = summary;
  const failingComponents = componentsWithTests.filter((c) => c.failed > 0 || c.hasError).length;
  const finalSummary = formatFinalSummary(totals, failingComponents, envErrors.length > 0, opts.duration);

  if (opts.summaryOnly) return finalSummary;

  const perComponentLines = componentsWithTests
    .sort((a, b) => a.id.toString().localeCompare(b.id.toString()))
    .map(formatComponentLine);

  const resultsSection = perComponentLines.length ? [formatTitle('test results'), ...perComponentLines].join('\n') : '';

  const envErrorsSection = envErrors.length
    ? [
        `${errorSymbol} ${formatTitle('tester errors')}`,
        ...envErrors.map((e) => `   ${errorSymbol} ${e.envId ?? 'unknown env'}: ${e.error.message}`),
      ].join('\n')
    : '';

  const noTestsSection = formatNoTestsSection(componentsWithoutTests, opts.verbose);

  return joinSections([resultsSection, envErrorsSection, noTestsSection, finalSummary]);
}

function formatComponentLine(c: ComponentTestSummary): string {
  const id = c.id.toString({ ignoreVersion: true });
  const parts: string[] = [];
  if (c.failed > 0) parts.push(`${c.failed} failed`);
  if (c.passed > 0) parts.push(`${c.passed} passed`);
  if (c.pending > 0) parts.push(`${c.pending} pending`);
  const stats = parts.length ? parts.join(', ') : 'no test counts reported';

  if (c.failed > 0) return `   ${errorSymbol} ${id} — ${stats}`;
  if (c.hasError) return `   ${warnSymbol} ${id} — ${stats} (tester reported errors)`;
  return `   ${successSymbol()} ${id} — ${stats}`;
}

function formatNoTestsSection(ids: ComponentID[], verbose: boolean): string {
  if (!ids.length) return '';
  if (!verbose) {
    return formatHint(`${ids.length} components have no tests (run with --verbose to list)`);
  }
  const lines = ids
    .map((id) => id.toString({ ignoreVersion: true }))
    .sort()
    .map((s) => `   ${chalk.dim('›')} ${s}`);
  return [formatHint(`${ids.length} components have no tests`), ...lines].join('\n');
}

function formatFinalSummary(
  totals: TestOutputSummary['totals'],
  failingComponents: number,
  hasEnvError: boolean,
  duration: string
): string {
  const totalTests = totals.testsPassed + totals.testsFailed;
  const withoutSuffix = totals.withoutTests > 0 ? `, ${totals.withoutTests} without tests` : '';
  const timing = formatHint(`Finished. (${duration})`);

  if (hasEnvError || totals.testsFailed > 0 || failingComponents > 0) {
    const headline =
      totals.testsFailed > 0
        ? `${totals.testsFailed} tests failed across ${failingComponents} of ${totals.tested} components${withoutSuffix}`
        : `tester errors encountered (${totals.tested} components tested${withoutSuffix})`;
    return `${formatWarningSummary(headline)}\n${timing}`;
  }

  if (totals.tested === 0) {
    const none =
      totals.totalComponents === 0
        ? 'no components to test'
        : `no tests found (${totals.totalComponents} components, none with tests)`;
    return `${formatHint(none)}\n${timing}`;
  }

  const headline = `${totals.testsPassed}/${totalTests || totals.testsPassed} tests passed across ${totals.tested} components${withoutSuffix}`;
  return `${formatSuccessSummary(headline)}\n${timing}`;
}

function sum<T>(items: T[], pick: (item: T) => number): number {
  return items.reduce((acc, item) => acc + pick(item), 0);
}
