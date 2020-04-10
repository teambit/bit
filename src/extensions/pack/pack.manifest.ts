import packProvider from './pack.provider';
import { Scope } from '../scope';
import { BitCli } from '../cli';

export default {
  name: 'pack',
  dependencies: [BitCli, Scope],
  config: {},
  provider: packProvider
};
