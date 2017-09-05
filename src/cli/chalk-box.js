/** @flow */
import c from 'chalk';
import SpecsResults from '../consumer/specs-results/specs-results';

export const formatNewBit = ({ box, name }: any): string =>
c.white('     > ') + c.cyan(`${box}/${name}`);

export const formatBit = ({ scope, box, name, version }: any): string =>
c.white('     > ') + c.cyan(`${scope ? scope + '/' : ''}${box}/${name} - ${version ? version.toString() : 'latest'}`);

export const formatPlainComponentItem = ({ scope, box, name, version }: any): string =>
  c.cyan(`- ${scope ? scope + '/' : ''}${box}/${name}@${version ? version.toString() : 'latest'}`);

export const formatBitString = (bit: string): string =>
c.white('     > ') + c.cyan(`${bit}`);

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
    return c.white(`Author: ${username} <${email}>\n`);
  } else if (email && !username) {
    return c.white(`Author: <${email}>\n`);
  } else if (!email && username) {
    return c.white(`Author: ${username}\n`);
  }

  return '';
};

export const paintLog = ({ message, date, hash, username, email }:
  { message: string, hash: string, date: string, username: ?string, email: ?string }): string => {
  return c.yellow(`commit ${hash}\n`) +
    paintAuthor(email, username) +
    c.white(`Date: ${date}\n`) +
    c.white(`\n      ${message}\n`);
};

const successTest = (test) => {
  return `✔   ${c.white(test.title)} - ${c.cyan(`${test.duration}ms`)}`;
};

const failureTest = (test) => {
  return `❌   ${c.white(test.title)} - ${c.cyan(`${test.duration}ms`)}
    ${c.red(test.err.message)}`;
};

const paintMissingTester = (component): string => {
  const componentId = c.bold(`${component.box}/${component.name}`);
  return c.bold.red(`tester for component: ${componentId} is not defined`);
};

const paintTest = (test) => {
  return test.pass ? successTest(test) : failureTest(test);
};

// Failures which are not on tests, for example on before blocks
const paintGeneralFailure = (failure) => {
  return `❌   ${c.white(failure.title)} - ${c.cyan(`${failure.duration}ms`)}
    ${c.red(failure.err.message)}`;
};

const paintStats = (results) => {
  const statsHeader = results.pass ? c.underline.green('\ntests passed') : c.underline.red('\ntests failed');
  const totalDuration = results.stats && results.stats.duration !== undefined ?
    `file: ${results.specFile}\ntotal duration - ${c.cyan(`${results.stats.duration}ms\n`)}` : '';
  return `${statsHeader}\n${totalDuration}\n`;
};

export const paintSpecsResults = (results: SpecsResults[]): string => {
  if (!results) return '';
  return results.map((specResult) => {
    const stats = paintStats(specResult);
    const tests = (specResult.tests) ? `${specResult.tests.map(paintTest).join('\n')}\n` : '';
    const failures = (specResult.failures) ? `${specResult.failures.map(paintGeneralFailure).join('\n')}\n` : '';
    const final = tests || failures ? (stats + tests + failures) : '';
    return final;
  });
};

export const paintAllSpecsResults = (results: Array<*>): string => {
  if (results.length === 0) return c.red('There are no components to test');
  return results.map((result) => {
    if (result.missingTester) return paintMissingTester(result.component);
    const componentId = c.bold(`${result.component.box}/${result.component.name}`);
    if (result.specs) return componentId + paintSpecsResults(result.specs);
    return c.yellow(`tests are not defined for component: ${componentId}`);
  }).join('\n');
};
export const paintBuildResults = (buildResults: []): string => {
  if (buildResults) {
    const statsHeader = c.underline.green('\nbuilded Files:\n')
    return statsHeader + buildResults.map(file => `${c.cyan(`${file.path}`)}`).join('\n');
  }
  return '';
};
export const paintCiResults = ({ buildResults, specsResults }): string => {
  return paintBuildResults(buildResults) + paintSpecsResults(specsResults);
};
