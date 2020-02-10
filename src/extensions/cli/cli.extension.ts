import { CLIProvider } from './cli.provider';
import { PaperExt } from '../paper';

export const BitCliExt = {
  name: 'BitCli',
  dependencies: [PaperExt],
  config: {},
  provider: CLIProvider
};
