import { CLIAspect, MainRuntime, CLIMain } from '@teambit/cli';
import { GraphAspect, GraphBuilder } from '@teambit/graph';
import { InsightsAspect } from './insights.aspect';
import getCoreInsights from './core-insights-getter';
import { Insight, InsightResult } from './insight';
import { InsightManager, RunInsightOptions } from './insight-manager';
import InsightsCmd from './insights.cmd';

export type InsightDeps = [GraphBuilder, CLIMain];

export class InsightsMain {
  constructor(private insightManager: InsightManager) {}

  async runInsights(names: string[], opts: RunInsightOptions) {
    if (names) {
      let results: InsightResult[] = [];
      const namesArr = typeof names === 'string' ? [names] : names;
      results = await this.insightManager.run(namesArr, opts);
      return results;
    }
    const results = await this.insightManager.runAll(opts);
    return results;
  }

  async listInsights() {
    return this.insightManager.listInsights();
  }

  static slots = [];
  static dependencies = [GraphAspect, CLIAspect];
  static runtime = MainRuntime;
  static config = {
    silence: false,
  };
  static async provider([graphBuilder, cli]: InsightDeps) {
    // get all insights from registry
    const initialInsights: Insight[] = getCoreInsights(graphBuilder);
    // register all insights in cli
    // TODO - get user-defined insights as well, and use them when instantiating InsightManager and InsightsCmd
    const insightManager = new InsightManager(initialInsights);
    const insightsMain = new InsightsMain(insightManager);
    const insightsCmd = new InsightsCmd(insightsMain);
    cli.register(insightsCmd);
    return insightsMain;
  }
}

InsightsAspect.addRuntime(InsightsMain);
