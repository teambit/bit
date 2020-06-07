import { ExtensionManifest } from '@teambit/harmony';
import packProvider from './pack.provider';
import { ScopeExtension } from '../scope';
import { BitCliExt } from '../cli';

export default {
  name: 'pack',
  dependencies: [BitCliExt, ScopeExtension],
  config: {},
  provider: packProvider
} as ExtensionManifest;
