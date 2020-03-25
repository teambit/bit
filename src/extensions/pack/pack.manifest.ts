import packProvider from './pack.provider';
import { IsolatorExt } from '../isolator';
import { ScopeExt } from '../scope';
import { BitCliExt } from '../cli';

export default {
  name: 'pack',
  dependencies: [BitCliExt, ScopeExt, IsolatorExt],
  config: {},
  provider: packProvider
};
