/** @flow */
import c from 'chalk';
import SpecsResults from '../consumer/specs-results/specs-results';

export const formatNewBit = ({ box, name }: any): string =>
c.white('     > ') + c.cyan(`${box}/${name}`);

export const formatBit = ({ scope, box, name, version }: any): string =>
c.white('     > ') + c.cyan(`${scope || '@this'}/${box}/${name} - ${version ? version.toString() : 'latest'}`);

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

const paintTest = (test) => {
  return test.pass ? successTest(test) : failureTest(test);
};

const paintStats = (results) => {
  const statsHeader = results.pass ? c.underline.green('\ntests passed') : c.underline.red('\ntests failed');
  const totalDuration = results.stats && results.stats.duration ?
    `file: ${results.specFile}\ntotal duration - ${c.cyan(`${results.stats.duration}ms\n`)}` : '';
  return `${statsHeader}\n${totalDuration}\n`;
};

export const paintSpecsResults = (results: SpecsResults[]): string => {
  return results.map(speResult => (speResult.tests)? paintStats(speResult) + speResult.tests.map(paintTest).join('\n') :'');
}


export const paintAllSpecsResults = (results: Array<*>): string => {
  if (results.length === 0) return c.red('There are no inline components to test');
  return results.map((result) => {
    const componentId = c.bold(`${result.component.box}/${result.component.name}: `);
    if (result.specs) return componentId + paintSpecsResults(result.specs);
    return c.bold.red(`${componentId}couldn't get test results...`);
  }).join('\n');
};
