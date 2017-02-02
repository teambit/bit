// @flow
import R from 'ramda';
import c from 'chalk';
import Table from 'cli-table2';
import { paintHeader } from '../chalk-box';
import type { Doclet } from '../../jsdoc/parser';

const paintExample = (example) => {
  return example.raw;
};

const paintExamples = (examples) => {
  if (R.isEmpty(examples) || R.isNil(examples)) { return ''; }

  return `\n${paintHeader('Examples')}\n${examples.map(paintExample).join('\n')}`;
};

export const paintDoc = (doc: Doclet) => {
  const docsTable = new Table({
    colWidths: [20, 50],
    wordWrap: true,
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


export default (docs: ?Doclet[]) => {
  if (R.isEmpty(docs) || R.isNil(docs)) {
    return 'No documentation found';
  }
  // $FlowFixMe
  return `\n${paintHeader('Documentation')}${docs.map(paintDoc).join('')}`;
};
