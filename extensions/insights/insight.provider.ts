import { CLIMain } from '@teambit/cli';
import { GraphBuilder } from '@teambit/graph';

import getCoreInsights from './core-insights-getter';
import { Insight } from './insight';
import { InsightManager } from './insight-manager';
import InsightsCmd from './insights.cmd';

export type InsightDeps = [GraphBuilder, CLIMain];

export async function provide([graphBuilder, cli]: InsightDeps) {
  // get all insights from registry
  const initialInsights: Insight[] = getCoreInsights(graphBuilder);
  // register all insights in cli
  // TODO - get user-defined insights as well, and use them when instantiating InsightManager and InsightsCmd
  const insightManager = new InsightManager(initialInsights);
  const insightsCmd = new InsightsCmd(insightManager);
  cli.register(insightsCmd);
}
