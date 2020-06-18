import { ExtensionManifest } from '@teambit/harmony';
import { provide } from './insight.provider';
import { ComponentGraphExt } from '../graph';
import { CLIExtension } from '../cli';

export default {
  name: 'insights',
  dependencies: [ComponentGraphExt, CLIExtension],
  config: {
    silence: false
  },
  provider: provide
} as ExtensionManifest;
