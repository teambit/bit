// @flow
import fetchCommand from './fetch-cmd';
import bindCommand from './bind-cmd';
import importCommand from './import-cmd';
import watchCommand from './watch-cmd';

const commands = [
  fetchCommand,
  bindCommand,
  importCommand,
  watchCommand,
];

export default commands;
