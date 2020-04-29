import { ExtensionManifest } from '@teambit/harmony';
import { provide } from './insight.provider';
import { ComponentGraphExt } from '@bit/bit.core.graph';
import { BitCliExt } from '@bit/bit.core.cli';

export default {
  name: 'insights',
  dependencies: [ComponentGraphExt, BitCliExt],
  config: {
    silence: false
  },
  provider: provide
} as ExtensionManifest;
