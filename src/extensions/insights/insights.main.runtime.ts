import { InsightsAspect } from './insights.aspect';
import { MainRuntime } from '../cli/cli.aspect';
import { ExtensionManifest } from '@teambit/harmony';
import { provide } from './insight.provider';
import { ComponentGraphExt } from '../graph';
import { CLIMain } from '../cli';

export default {
  name: 'insights',
  dependencies: [ComponentGraphExt, CLIMain],
  config: {
    silence: false,
  },
  provider: provide,
} as ExtensionManifest;

InsightsAspect.addRuntime(InsightsMain);
