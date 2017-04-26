// @flow
import chalk from 'chalk';
import { type Command } from './types';
import { fetchAction } from '../../actions';
import { VERSION_DELIMITER } from '../../constants';

const printComponents = components => components.map((component) => {
  const [name, version] = component.split(VERSION_DELIMITER);
  return chalk.cyan(`\t> ${name} - ${version || 'latest'}`);
}).join('\n');

const reportTitle = chalk.underline('successfully fetched the following Bit components\n');

export const report = components => reportTitle + printComponents(components);

const fetchCommand: Command = {
  name: 'fetch',
  description: 'fetch components and put them in components directory',
  arguments: [
    {
      name: '[ids...]',
      description: 'a list of component ids separated by spaces',
    },
  ],
  action: args => fetchAction((args && args.ids) || []),
  report,
  loaderText: 'Fetching components',
  loader: true,
};

export default fetchCommand;
