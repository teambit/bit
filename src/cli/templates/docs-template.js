// @flow
import R from 'ramda';
import c from 'chalk';
import Table from 'tty-table';
import { paintHeader } from '../chalk-box';
import type { Doclet } from '../../jsdoc/parser';

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
  const { name, description, args, returns } = doc;

  const header = [
    { value: 'Name', width: 20, headerColor: 'cyan', headerAlign: 'left' },
    { value: `${name}`, width: 50, headerColor: 'white', color: 'white', headerAlign: 'left' }
  ];
  const opts = {
    align: 'left'
  };

  const table = new Table(header, [], opts);

  const painArg = (arg) => {
    if (!arg.type && !arg.name) {
      return '';
    }
    if (!arg.type) {
      return `${arg.name}`;
    }
    return `${arg.name}: ${arg.type}`;
  };

  const painDescription = (arg) => {
    if (!arg.type) {
      return '';
    }
    if (arg.type && !arg.description) {
      return arg.type;
    }
    return `${arg.type} -> ${arg.description}`;
  };

  const rows = [
    [c.cyan('Description'), description],
    [c.cyan('Args'), `(${args.map(painArg).join(', ')})`],
    [c.cyan('Returns'), painDescription(returns)]
  ].filter(x => x);

  // console.log('rows', rows);

  table.push(...rows);
  return table.render() + paintExamples(doc.examples);
};

export default (docs: ?(Doclet[])) => {
  if (R.isEmpty(docs) || R.isNil(docs)) {
    return '\nNo documentation found';
  }
  // $FlowFixMe
  return `\n${paintHeader('Documentation')}${docs.map(paintDoc).join('')}`;
};
