// @flow
import { type Command } from './types';
import { importAction } from '../../actions';
import { report as fetchReport } from './fetch-cmd';
import { report as bindReport } from './bind-cmd';

const importCommand: Command = {
  name: 'import',
  description: 'runs fetch and then bind',
  arguments: [
    {
      name: '[ids...]',
      description: 'a list of component ids separated by spaces',
    },
  ],
  action: args => importAction((args && args.ids) || []),
  report: ({ fetchResults, bindResults }) => `${fetchReport(fetchResults)}\n\n${bindReport(bindResults)}`,
  loader: true,
};

export default importCommand;
