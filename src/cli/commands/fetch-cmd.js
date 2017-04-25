// @flow

import { type Command } from './types';
import { fetchAction } from '../../actions';

const fetchCommand: Command = {
  name: 'fetch',
  description: 'fetch components and put them in components directory',
  arguments: [
    {
      name: '[ids...]',
      description: 'a list of component ids seperated by spaces',
    },
  ],
  action: args => fetchAction((args && args.ids) || []),
  report: () => 'done',
  loader: true,
};

export default fetchCommand;
