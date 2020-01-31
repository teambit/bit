import { CLIProvider } from './cli.provider';
import { PaperExt } from '../extensions/paper';
import { BitExt } from '../extensions/bit';

export default {
  name: 'BitCli',
  dependencies: [PaperExt, BitExt],
  provider: CLIProvider
};
