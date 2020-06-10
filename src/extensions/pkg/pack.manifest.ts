import { ExtensionManifest } from '@teambit/harmony';
import packProvider from './pack.provider';
import { ScopeExtension } from '../scope';
import { PaperExtension } from '../paper';

export default {
  name: 'pack',
  dependencies: [PaperExtension, ScopeExtension],
  config: {},
  provider: packProvider
} as ExtensionManifest;
