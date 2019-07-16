/** @flow */
import c from 'chalk';
import Table from 'tty-table';
import SpecsResults from '../consumer/specs-results/specs-results';
import type Component from '../consumer/component/consumer-component';
import type { ImportDetails, ImportStatus } from '../consumer/component-ops/import-components';
import { FileStatus } from '../consumer/versions-ops/merge-version/merge-version';
import type { SpecsResultsWithComponentId, SpecsResultsWithMetaData } from '../consumer/specs-results/specs-results';

export const formatNewBit = ({ name }: any): string => c.white('     > ') + c.cyan(name);

export const formatBit = ({ scope, name, version }: any): string =>
  c.white('     > ') + c.cyan(`${scope ? `${scope}/` : ''}${name} - ${version ? version.toString() : 'latest'}`);

export const formatPlainComponentItem = ({ scope, name, version, deprecated }: any): string =>
  c.cyan(
    `- ${scope ? `${scope}/` : ''}${name}@${version ? version.toString() : 'latest'}  ${
      deprecated ? c.yellow('[deprecated]') : ''
    }`
  );

export const formatPlainComponentItemWithVersions = (component: Component, importDetails: ImportDetails): string => {
  const status: ImportStatus = importDetails.status;
  const id = component.id.toStringWithoutVersion();
  const versions = importDetails.versions.length ? `new versions: ${importDetails.versions.join(', ')}` : '';
  // $FlowFixMe component.version should be set here
  const usedVersion = status === 'added' ? `, currently used version ${component.version}` : '';
  const getConflictMessage = () => {
    if (!importDetails.filesStatus) return '';
    const conflictedFiles = Object.keys(importDetails.filesStatus) // $FlowFixMe file is set
      .filter(file => importDetails.filesStatus[file] === FileStatus.manual);
    if (!conflictedFiles.length) return '';
    return `(the following files were saved with conflicts ${conflictedFiles.map(file => c.bold(file)).join(', ')}) `;
  };
  const deprecated = component.deprecated ? c.yellow('deprecated') : '';
  return `- ${c.green(status)} ${c.cyan(id)} ${versions}${usedVersion} ${getConflictMessage()}${deprecated}`;
};

export const formatBitString = (bit: string): string => c.white('     > ') + c.cyan(`${bit}`);

export const paintBitProp = (key: string, value: string): string => {
  if (!value) return '';
  return `${c.magenta(key)} -> ${value}\n`;
};

export const paintHeader = (value: string): string => {
  if (!value) return '';
  return `${c.underline(value)}\n`;
};

const paintAuthor = (email: ?string, username: ?string): string => {
  if (email && username) {
    return c.white(`author: ${username} <${email}>\n`);
  } else if (email && !username) {
    return c.white(`author: <${email}>\n`);
  } else if (!email && username) {
    return c.white(`author: ${username}\n`);
  }

  return '';
};

export const paintLog = ({
  message,
  date,
  tag,
  username,
  email
}: {
  message: string,
  tag: string,
  date: string,
  username: ?string,
  email: ?string
}): string => {
  return (
    c.yellow(`tag ${tag}\n`) +
    paintAuthor(email, username) +
    c.white(`date: ${date}\n`) +
    (message ? c.white(`\n      ${message}\n`) : '')
  );
};

const successTest = (test) => {
  return `✔   ${c.white(test.title)} - ${c.cyan(`${test.duration}ms`)}`;
};

const failureTest = (test) => {
  return `❌   ${c.white(test.title)} - ${c.cyan(`${test.duration}ms`)}
    ${c.red(test.err.message)}`;
};

const paintMissingTester = (componentId: string): string => {
  const componentIdBold = c.bold(componentId);
  return c.bold.red(`tester for component: ${componentIdBold} is not defined`);
};

const paintTest = (test) => {
  return test.pass ? successTest(test) : failureTest(test);
};

// Failures which are not on tests, for example on before blocks
const paintGeneralFailure = (failure, verbose) => {
  const duration = failure.duration ? ` - ${c.cyan(`${failure.duration}ms`)}` : '';
  let errStack = '';
  if (verbose && failure.err) {
    errStack = failure.err.stack;
  }
  return `❌   ${c.white(failure.title)} ${duration}
    ${c.red(failure.err.message)}
    ${c.red(errStack)}`;
};

const paintStats = (results) => {
  const statsHeader = results.pass ? c.underline.green('\ntests passed') : c.underline.red('\ntests failed');
  const fileName = results.specFile ? c.white(`\nfile: ${results.specFile}`) : '';
  const totalDuration =
    results.stats && results.stats.duration !== undefined
      ? `total duration - ${c.cyan(`${results.stats.duration}ms\n`)}`
      : '';
  return `${statsHeader}${fileName}\n${totalDuration}\n`;
};

export const paintSpecsResults = (results?: SpecsResults[], verbose: boolean = false): string[] => {
  if (!results) return [];
  return results.map((specResult) => {
    const stats = paintStats(specResult);
    const tests = specResult.tests ? `${specResult.tests.map(paintTest).join('\n')}\n` : '';
    const failures = specResult.failures
      ? `${specResult.failures.map(failure => paintGeneralFailure(failure, verbose)).join('\n')}\n`
      : '';
    const final = tests || failures ? stats + tests + failures : '';
    return final;
  });
};

export const paintAllSpecsResults = (results: SpecsResultsWithMetaData, verbose: boolean = false): string => {
  const childOutput = results.childOutput ? `${results.childOutput}\n` : '';
  if (results.results && results.results.length === 0) return `${childOutput}${c.yellow('nothing to test')}`;
  const resultsOutput = results.results
    .map((result) => {
      const idStr = result.componentId.toString();
      if (result.missingTester) return paintMissingTester(idStr);
      const componentId = c.bold(idStr);
      if (result.specs) return componentId + paintSpecsResults(result.specs, verbose);
      return c.yellow(`tests are not defined for component: ${componentId}`);
    })
    .join('\n');
  return `${childOutput}\n${resultsOutput}`;
};

export const paintSummarySpecsResults = (results: SpecsResultsWithComponentId): string => {
  if (results.length <= 1) return ''; // it there are no results or only one result, no need for summary
  const summaryHeader = [];
  summaryHeader.push({ value: 'Component ID', width: 80, headerColor: 'cyan' });
  summaryHeader.push({ value: 'Specs Results', width: 50, headerColor: 'cyan' });
  const specsSummary = (specResults) => {
    const specsPassed = specResults.map(specResult => specResult.pass);
    const areAllPassed = specsPassed.every(isPassed => isPassed);
    return areAllPassed ? c.green('passed') : c.red('failed');
  };
  const summaryRows = results.map((result) => {
    const componentId = c.bold(result.componentId.toString());
    if (result.missingTester) return [componentId, c.bold.red('tester is not defined')];
    if (result.specs) return [componentId, specsSummary(result.specs)];
    return [componentId, c.yellow('tests are not defined')];
  });

  const summaryTable = new Table(summaryHeader, summaryRows);
  return summaryTable.render();
};

export const paintBuildResults = (buildResults: []): string => {
  if (buildResults) {
    const statsHeader = c.underline.green('\nbuilt Files:\n');
    return statsHeader + buildResults.map(file => `${c.cyan(`${file.path}`)}`).join('\n');
  }
  return '';
};
export const paintCiResults = ({ dists, specsResults }): string => {
  return paintBuildResults(dists) + paintSpecsResults(specsResults);
};
