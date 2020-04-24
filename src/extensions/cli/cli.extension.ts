// eslint-disable-next-line import/prefer-default-export
import { CLIProvider } from './cli.provider';
import { ReporterExt } from '../reporter';
import { Core } from '../core';

export default {
  name: 'BitCli',
  dependencies: [ReporterExt, Core],
  provider: CLIProvider
};
