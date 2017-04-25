// @flow

import { type Command } from './types';
import { bindAction } from '../../actions';

const bindCommand: Command = {
  name: 'bind',
  description: 'create the bit module inside of node_modules and generate relevant links',
  action: () => bindAction(),
  report: () => 'done',
  loader: true,
};

export default bindCommand;
