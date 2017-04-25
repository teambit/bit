// @flow

import { type Command } from './types';
import { importAction } from '../../actions';

const importCommand: Command = {
  name: 'import',
  description: 'runs fetch and then bind',
  arguments: [
    {
      name: '[ids...]',
      description: 'a list of component ids seperated by spaces',
    },
  ],
  action: args => importAction((args && args.ids) || []),
  report: () => 'done',
  loader: true,
};

export default importCommand;
