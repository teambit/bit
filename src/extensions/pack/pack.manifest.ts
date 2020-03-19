import packProvider from './pack.provider';
import { ScopeExt } from '../scope';
import { BitCliExt } from '../cli';

export default {
  name: 'pack',
  dependencies: [BitCliExt, ScopeExt],
  config: {},
  provider: packProvider
};
