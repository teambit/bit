import { ExtensionManifest } from '@teambit/harmony';
import { provide } from './insight.provider';
import { ComponentGraphExt } from '../graph';
import { PaperExtension } from '../paper';

export default {
  name: 'insights',
  dependencies: [ComponentGraphExt, PaperExtension],
  config: {
    silence: false
  },
  provider: provide
} as ExtensionManifest;
