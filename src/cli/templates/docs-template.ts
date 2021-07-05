import c from 'chalk';
import R from 'ramda';
import Table from 'cli-table';

import { Doclet } from '../../jsdoc/types';
import { paintHeader } from '../chalk-box';

const paintExample = (example) => {
  return example.raw;
};

const paintExamples = (examples) => {
  if (R.isEmpty(examples) || R.isNil(examples)) {
    return '';
  }

  return `\n${paintHeader('Examples')}\n${examples.map(paintExample).join('\n')}`;
};

export const paintDoc = (doc: Doclet) => {
  const { name, description, args, returns, properties } = doc;

  const table = new Table({ head: ['name', `${name}`], style: { head: ['cyan'] } });

  const paintArg = (arg) => {
    if (!arg && !arg.type && !arg.name) {
      return '';
    }
    if (!arg.type) {
      return `${arg.name}`;
    }
    return `${arg.name}: ${arg.type}`;
  };

  const paintArgs = () => {
    if (!args || !args.length) return '';
    return `(${args.map(paintArg).join(', ')})`;
  };

  const paintDescription = (arg) => {
    if (!arg) return '';
    if (!arg.type) {
      return '';
    }
    if (arg && arg.type && !arg.description) {
      return arg.type;
    }
    return `${arg.type} -> ${arg.description}`;
  };

  const paintProperties = () => {
    if (!properties || !properties.length) return '';
    return `(${properties.map(paintArg).join(', ')})`;
  };

  const rows = [
    [c.cyan('Description'), description],
    [c.cyan('Args'), paintArgs()],
    [c.cyan('Returns'), paintDescription(returns)],
    [c.cyan('Properties'), paintProperties()],
  ].filter(([, x]) => x);

  table.push(...rows);
  return table.toString() + paintExamples(doc.examples);
};

export default (docs: Doclet[] | null | undefined) => {
  if (R.isEmpty(docs) || R.isNil(docs)) {
    return '\nNo documentation found';
  }
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  return `\n${paintHeader('Documentation')}${docs.map(paintDoc).join('')}`;
};
