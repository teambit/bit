import packProvider from './pack.provider';
import { ScopeExt } from '../scope';
import { BitCli } from '../cli';

export default {
  name: 'pack',
  dependencies: [BitCli, ScopeExt],
  config: {},
  provider: packProvider
};
