// eslint-disable-next-line import/prefer-default-export
import { CLIProvider } from './cli.provider';
import { ReporterExt } from '../reporter';

export default {
  name: 'BitCli',
  dependencies: [ReporterExt],
  provider: CLIProvider
};
