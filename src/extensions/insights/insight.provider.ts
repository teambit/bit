import { ComponentGraph } from '../graph/component-graph';
import getCoreInsights from './core-insights-getter';
import { BitCli } from '../cli';
import { InsightManager } from './insight-manager';
import { Insight } from './insight';
import InsightsCmd from './insights.cmd';

export type InsightConfig = {
  silence: boolean;
};

export type InsightDeps = [ComponentGraph, BitCli];

export async function provide([componentGraph, cli]: InsightDeps) {
  // get all insights from registry
  const initialInsights: Insight[] = getCoreInsights(componentGraph);
  // register all insights in cli
  // TODO - get user-defined insights as well, and use them when instantiating InsightManager and InsightsCmd
  const insightManager = new InsightManager(initialInsights);
  const insightsCmd = new InsightsCmd(insightManager);
  cli.register(insightsCmd);
}
