import packProvider from './pack.provider';
import { ScopeExt } from '@bit/bit.core.scope';
import { BitCliExt } from '@bit/bit.core.cli';

export default {
  name: 'pack',
  dependencies: [BitCliExt, ScopeExt],
  config: {},
  provider: packProvider
};
