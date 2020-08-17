import { ExtensionManifest } from '@teambit/harmony';
import { provide } from './insight.provider';
import { ComponentGraphExt } from '@teambit/graph';
import { CLIExtension } from '@teambit/cli';

export default {
  name: 'insights',
  dependencies: [ComponentGraphExt, CLIExtension],
  config: {
    silence: false,
  },
  provider: provide,
} as ExtensionManifest;
