import { CLIAspect, MainRuntime, CLIMain } from '@teambit/cli';
import { GraphAspect, GraphBuilder } from '@teambit/graph';
import { InsightsAspect } from './insights.aspect';
import getCoreInsights from './core-insights-getter';
import { Insight } from './insight';
import { InsightManager } from './insight-manager';
import InsightsCmd from './insights.cmd';

export type InsightDeps = [GraphBuilder, CLIMain];

export class InsightsMain {
  static slots = [];
  static dependencies = [GraphAspect, CLIAspect];
  static runtime = MainRuntime;
  static config = {
    silence: false,
  };
  static async provider([graphBuilder, cli]: InsightDeps) {
    const insightsMain = new InsightsMain();
    // get all insights from registry
    const initialInsights: Insight[] = getCoreInsights(graphBuilder);
    // register all insights in cli
    // TODO - get user-defined insights as well, and use them when instantiating InsightManager and InsightsCmd
    const insightManager = new InsightManager(initialInsights);
    const insightsCmd = new InsightsCmd(insightManager);
    cli.register(insightsCmd);
    return insightsMain;
  }
}

InsightsAspect.addRuntime(InsightsMain);
