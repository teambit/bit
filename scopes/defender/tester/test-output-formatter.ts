import { sumBy } from 'lodash';
import type { Component, ComponentID } from '@teambit/component';
import {
  formatTitle,
  formatHint,
  formatItem,
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
  /** components that belong to an env whose tester errored before producing results */
  componentsAffectedByEnvError: ComponentID[];
  envErrors: EnvTestError[];
  totals: {
    totalComponents: number;
    tested: number;
    withoutTests: number;
    affectedByEnvError: number;
    testsPassed: number;
    testsFailed: number;
    testsPending: number;
  };
};

export function aggregateTestResults(results: TestResults, allComponents: Component[]): TestOutputSummary {
  const componentsWithTests: ComponentTestSummary[] = [];
  const envErrors: EnvTestError[] = [];
  const testedIds = new Set<string>();
  const affectedByEnvErrorIds = new Set<string>();
  // normalize on both sides so a version-mismatch between the tester's ComponentsResults and the
  // workspace `allComponents` list can't leak a tested component into `componentsWithoutTests`.
  const idKey = (id: ComponentID) => id.toString({ ignoreVersion: true });

  for (const envResult of results.results) {
    const envId = envResult.env?.id;
    const envComponents: Component[] = envResult.env?.components ?? [];
    if (envResult.error) {
      envErrors.push({ envId, error: envResult.error });
      envComponents.forEach((c) => affectedByEnvErrorIds.add(idKey(c.id)));
    }
    const tests = envResult.data;
    if (!tests) continue;
    for (const comp of tests.components) {
      const summary = summarizeComponent(comp);
      if (!summary) continue;
      testedIds.add(idKey(comp.componentId));
      componentsWithTests.push(summary);
    }
  }

  const componentsAffectedByEnvError: ComponentID[] = [];
  const componentsWithoutTests: ComponentID[] = [];
  for (const c of allComponents) {
    const key = idKey(c.id);
    if (testedIds.has(key)) continue;
    if (affectedByEnvErrorIds.has(key)) componentsAffectedByEnvError.push(c.id);
    else componentsWithoutTests.push(c.id);
  }

  const totals = {
    totalComponents: allComponents.length,
    tested: componentsWithTests.length,
    withoutTests: componentsWithoutTests.length,
    affectedByEnvError: componentsAffectedByEnvError.length,
    testsPassed: sumBy(componentsWithTests, (c) => c.passed),
    testsFailed: sumBy(componentsWithTests, (c) => c.failed),
    testsPending: sumBy(componentsWithTests, (c) => c.pending),
  };

  return { componentsWithTests, componentsWithoutTests, componentsAffectedByEnvError, envErrors, totals };
}

function summarizeComponent(comp: {
  componentId: ComponentID;
  results?: { testFiles: Array<{ pass: number; failed: number; pending: number; error?: Error }> };
  errors?: Error[];
}): ComponentTestSummary | undefined {
  const testFiles = comp.results?.testFiles ?? [];
  if (!testFiles.length && !comp.errors?.length) return undefined;
  const passed = sumBy(testFiles, (f) => f.pass || 0);
  const failed = sumBy(testFiles, (f) => f.failed || 0);
  const pending = sumBy(testFiles, (f) => f.pending || 0);
  const hasError = Boolean(comp.errors?.length) || testFiles.some((f) => f.error);
  return { id: comp.componentId, passed, failed, pending, hasError };
}

export function formatTestReport(
  summary: TestOutputSummary,
  opts: { verbose: boolean; duration: string; summaryOnly?: boolean; failedDueToExitCode?: boolean }
): string {
  const { componentsWithTests, componentsWithoutTests, envErrors, totals } = summary;
  const componentsWithFailedTests = componentsWithTests.filter((c) => c.failed > 0).length;
  const componentsWithOnlyTesterErrors = componentsWithTests.filter((c) => c.failed === 0 && c.hasError).length;
  const finalSummary = formatFinalSummary(
    totals,
    componentsWithFailedTests,
    componentsWithOnlyTesterErrors,
    envErrors.length > 0,
    opts.duration,
    opts.failedDueToExitCode ?? false
  );

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
  const text = `${id} — ${stats}`;

  if (c.failed > 0) return formatItem(text, errorSymbol);
  if (c.hasError) return formatItem(`${text} (tester reported errors)`, warnSymbol);
  return formatItem(text, successSymbol());
}

function formatNoTestsSection(ids: ComponentID[], verbose: boolean): string {
  if (!ids.length) return '';
  if (!verbose) {
    return formatHint(`${ids.length} components have no tests (run with --verbose to list)`);
  }
  const lines = ids
    .map((id) => id.toString({ ignoreVersion: true }))
    .sort()
    .map((s) => formatItem(s));
  return [formatHint(`${ids.length} components have no tests`), ...lines].join('\n');
}

function formatFinalSummary(
  totals: TestOutputSummary['totals'],
  componentsWithFailedTests: number,
  componentsWithOnlyTesterErrors: number,
  hasEnvError: boolean,
  duration: string,
  failedDueToExitCode: boolean
): string {
  const totalTests = totals.testsPassed + totals.testsFailed + totals.testsPending;
  const suffixParts: string[] = [];
  if (totals.withoutTests > 0) suffixParts.push(`${totals.withoutTests} without tests`);
  if (totals.affectedByEnvError > 0) suffixParts.push(`${totals.affectedByEnvError} not tested due to tester errors`);
  const extraSuffix = suffixParts.length ? `, ${suffixParts.join(', ')}` : '';
  const pendingSuffix = totals.testsPending > 0 ? `, ${totals.testsPending} pending` : '';
  const timing = formatHint(`Finished. (${duration})`);
  const anyFailing = componentsWithFailedTests + componentsWithOnlyTesterErrors;

  if (hasEnvError || totals.testsFailed > 0 || anyFailing > 0) {
    const attempted = totals.tested + totals.affectedByEnvError;
    let headline: string;
    if (totals.testsFailed > 0) {
      const testerErrorSuffix =
        componentsWithOnlyTesterErrors > 0 ? ` (+${componentsWithOnlyTesterErrors} components had tester errors)` : '';
      headline = `${totals.testsFailed} tests failed across ${componentsWithFailedTests} of ${totals.tested} components${testerErrorSuffix}${pendingSuffix}${extraSuffix}`;
    } else if (totals.testsPassed > 0) {
      // tests passed but some components had tester-level errors — surface both
      const passedComponents = totals.tested - componentsWithOnlyTesterErrors;
      headline = `${totals.testsPassed}/${totalTests || totals.testsPassed} tests passed across ${passedComponents} components, but ${componentsWithOnlyTesterErrors} components had tester errors${pendingSuffix}${extraSuffix}`;
    } else {
      headline = `tester errors encountered (${attempted || totals.totalComponents} components targeted${extraSuffix})`;
    }
    return `${formatWarningSummary(headline)}\n${timing}`;
  }

  if (failedDueToExitCode) {
    const passedPart =
      totals.tested > 0
        ? `${totals.testsPassed}/${totalTests || totals.testsPassed} tests passed across ${totals.tested} components${pendingSuffix}${extraSuffix}`
        : `no test failures reported${extraSuffix}`;
    const headline = `${passedPart}, but tester exited with a non-zero code (e.g. coverage threshold not met)`;
    return `${formatWarningSummary(headline)}\n${timing}`;
  }

  if (totals.tested === 0) {
    const none =
      totals.totalComponents === 0
        ? 'no components to test'
        : `no tests found (${totals.totalComponents} components, none with tests)`;
    return `${formatHint(none)}\n${timing}`;
  }

  const headline = `${totals.testsPassed}/${totalTests || totals.testsPassed} tests passed across ${totals.tested} components${pendingSuffix}${extraSuffix}`;
  return `${formatSuccessSummary(headline)}\n${timing}`;
}
