import { Extension } from '../harmony';
import { PaperExt } from '../paper';
import { BitExt } from '../bit';
import cliProvider from './cli.provider';

export default Extension.instantiate({
  name: 'BitCli',
  dependencies: [PaperExt, BitExt],
  config: {},
  provider: cliProvider
});
