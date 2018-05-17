// @flow
import type { Command } from './types';
import { getDependenciesAction } from '../../actions';
import { DEFAULT_BINDINGS_PREFIX } from '../../constants';

const report = (data) => { console.log('dependencies', JSON.stringify(data, null, '  ')); };

const resolveConfig = undefined; // @todo: figure out how to get the data from the command line, maybe as a file
const getDependenciesCommand: Command = {
  name: 'get-dependencies',
  description: 'get dependencies list of a file',
  arguments: [
    { name: 'baseDir', description: 'base directory' },
    { name: 'file', description: 'filename' },
  ],
  action: ({ baseDir, file }) => getDependenciesAction(baseDir, file, DEFAULT_BINDINGS_PREFIX, resolveConfig),
  report,
  loaderText: 'Finding dependencies',
  loader: true,
};

export default getDependenciesCommand;
