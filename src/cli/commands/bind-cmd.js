// @flow
import chalk from 'chalk';
import { type Command } from './types';
import { bindAction } from '../../actions';

const reportComponents = components => Object.keys(components)
  .map(component => chalk.cyan(`\t${component} => ${components[component]}`)).join('\n');
const reportTitle = components => chalk.underline(`Bound ${chalk.bold(Object.keys(components).length)} components\n`);
export const report = components => reportTitle(components) + reportComponents(components);

const bindCommand: Command = {
  name: 'bind',
  description: 'create the bit module inside of node_modules and generate relevant links',
  action: () => bindAction(),
  report,
  loaderText: 'Binding node_modules/bit directory structure to bit.json',
  loader: true,
};

export default bindCommand;
