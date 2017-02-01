/** @flow */
import c from 'chalk';
import Table from 'cli-table';
import { formatter } from '../jsdoc';
import SpecsResults from '../consumer/specs-results/specs-results';
import ConsumerComponent from '../consumer/component/consumer-component';

export const formatInlineBit = ({ box, name }: any): string => 
c.white('     > ') + c.cyan(`${box}/${name}`);

export const formatBit = ({ scope = '@this', box, name, version }: any): string => 
c.white('     > ') + c.cyan(`${scope}/${box}/${name} - ${version}`);

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

export const paintDoc = (value: string): string => {
  if (!value) return '';
  return formatter(value);
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
  const statsHeader = results.pass ? c.underline.green('tests passed') : c.underline.red('tests failed');
  const totalDuration = `total duration - ${c.cyan(`${results.stats.duration}ms\n`)}`;
  return `${statsHeader}\n${totalDuration}\n`;
};

export const paintSpecsResults = (results: SpecsResults) => {
  return paintStats(results) + results.tests.map(paintTest).join('\n');
};

export const listToTable = (components: ConsumerComponent[]) => {
  const table = new Table({
    head: [c.cyan('Box'), c.cyan('Component'), c.cyan('Version')],
    colWidths: [16, 30, 9],
  });

  function tablizeComponent(component) {
    return [component.box, component.name, component.version]; // Add date, author 
  }

  table.push(...components.map(tablizeComponent));
  return table.toString();
};
