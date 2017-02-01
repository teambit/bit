/** @flow */
import c from 'chalk';
import R from 'ramda';
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
    head: [c.cyan('ID'), c.cyan('Version')],
    colWidths: [46, 9],
  });

  function tablizeComponent(component) {
    return [`${component.box}/${component.name}`, component.version]; // Add date, author 
  }

  table.push(...components.map(tablizeComponent));
  return table.toString();
};

export const paintDocumentation = (docs) => {
  if (R.isEmpty(docs) || R.isNil(docs)) {
    return 'No documentation found';
  }
  
  const paintExample = (example) => {
    return example.raw;
  };

  const paintExamples = (examples) => {
    if (R.isEmpty(examples) || R.isNil(examples)) { return ''; }

    return '\n' + paintHeader('Examples') + '\n' + examples.map(paintExample).join('\n');
  };

  const tabeDoc = (doc) => {
    const docsTable = new Table({
      colWidths: [20, 50]    
    });
    const { name, description, args, returns } = doc;

    const painArg = (arg) => {
      if (!arg.type && !arg.name) { return ''; }
      if (!arg.type) { return `${arg.name}`; }
      return `${arg.name}: ${arg.type}`;
    };

    const painDescription = (arg) => {
      if (!arg.type) { return ''; }
      if (arg.type && !arg.description) { return arg.type; }
      return `${arg.type} -> ${arg.description}`;
    };

    const rows = [
      name ? { [c.cyan('Name')]: name } : null,
      { [c.cyan('Description')]: description },
      { [c.cyan('Args')]: `(${args.map(painArg).join(', ')})` },
      { [c.cyan('Returns')]: painDescription(returns) }
    ].filter(x => x);

    docsTable.push(...rows);

    return docsTable + paintExamples(doc.examples);
  };
  
  return `\n${paintHeader('Documentation')}${docs.map(tabeDoc).join('')}`;
};

export const tablizeComponent = (component: ConsumerComponent) => {
  const table = new Table({
    colWidths: [20, 50]    
  });

  const { name, box, compilerId, testerId, dependencies, packageDependencies, docs } = component;

  const rows = [
    { [c.cyan('ID')]: `${box}/${name}` },
    compilerId ? { [c.cyan('Compiler')]: compilerId }: null,
    testerId ? { [c.cyan('Tester')]: testerId }: null,
    !R.isEmpty(dependencies) ? { [c.cyan('Dependencies')]: dependencies.map(id => id.toString()).join(', ') } : null,
    !R.isEmpty(packageDependencies) ? { [c.cyan('Packages')]: Object.keys(packageDependencies).join(', ') } : null
  ].filter(x => x);

  table.push(...rows);

  return table.toString() + paintDocumentation(docs);
};
