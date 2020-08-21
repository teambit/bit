import { InsightsAspect } from './insights.aspect';
import { MainRuntime, CLIAspect } from '../cli';
import { provide } from './insight.provider';
import { GraphAspect } from '../graph';

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
