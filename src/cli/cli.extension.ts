import { Extension } from '../harmony';
import cliProvider from './cli.provider';

export default Extension.instantiate({
  name: 'BitCli',
  dependencies: [],
  config: {},
  provider: cliProvider
});
