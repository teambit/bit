import { CLIProvider } from './cli.provider';
import { PaperExt } from '../extensions/paper';
import { BitExt } from '../extensions/bit';
import { Extension } from '../harmony';

export default Extension.instantiate({
  name: 'BitCli',
  dependencies: [PaperExt, BitExt],
  config: {},
  provider: CLIProvider
});
