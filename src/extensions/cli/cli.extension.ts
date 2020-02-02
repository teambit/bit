import { CLIProvider } from './cli.provider';
import { PaperExt } from '../paper';
import { Extension } from '../../harmony';

export const BitCliExt = Extension.instantiate({
  name: 'BitCli',
  dependencies: [PaperExt],
  config: {},
  provider: CLIProvider
});
