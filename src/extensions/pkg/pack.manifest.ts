import { ExtensionManifest } from '@teambit/harmony';
import packProvider from './pack.provider';
import { ScopeExtension } from '../scope';
import { CLIExtension } from '../cli';

export default {
  name: 'pack',
  dependencies: [CLIExtension, ScopeExtension],
  config: {},
  provider: packProvider
} as ExtensionManifest;
