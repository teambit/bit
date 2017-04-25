// @flow
import { type Command } from './types';
import { watchAction } from '../../actions';

const watchCommand: Command = {
  name: 'watch',
  description: 'listen to changes of bit.json and the inline_components and perform bind for every change',
  action: () => watchAction(),
  report: () => 'done',
};

export default watchCommand;
