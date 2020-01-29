import { CLIProvider } from './cli.provider';
import { PaperExt } from '../paper';
import { BitExt } from '../bit';
import { Extension } from '../../extensions/harmony';

export default Extension.instantiate({
  name: 'BitCli',
  dependencies: [PaperExt, BitExt],
  config: {},
  provider: CLIProvider
});
