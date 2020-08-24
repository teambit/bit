import { CLIAspect, MainRuntime } from '@teambit/cli';
import { GraphAspect } from '@teambit/graph';

import { provide } from './insight.provider';
import { InsightsAspect } from './insights.aspect';

export const InsightsMain = {
  runtime: MainRuntime,
  name: 'insights',
  dependencies: [GraphAspect, CLIAspect],
  config: {
    silence: false,
  },
  provider: provide,
};

InsightsAspect.addRuntime(InsightsMain);
