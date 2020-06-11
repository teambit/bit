import { GraphBuilder } from '../graph';
import getCoreInsights from './core-insights-getter';
import { InsightManager } from './insight-manager';
import { Insight } from './insight';
import InsightsCmd from './insights.cmd';
import { CLIExtension } from '../cli';

export type InsightDeps = [GraphBuilder, CLIExtension];

export async function provide([graphBuilder, cli]: InsightDeps) {
  // get all insights from registry
  const initialInsights: Insight[] = getCoreInsights(graphBuilder);
  // register all insights in cli
  // TODO - get user-defined insights as well, and use them when instantiating InsightManager and InsightsCmd
  const insightManager = new InsightManager(initialInsights);
  const insightsCmd = new InsightsCmd(insightManager);
  cli.register(insightsCmd);
}
