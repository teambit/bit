import { CLIAspect, MainRuntime, CLIMain } from '@teambit/cli';
import { GraphAspect, GraphMain } from '@teambit/graph';
import { IssuesClasses } from '@teambit/component-issues';
import IssuesAspect, { IssuesMain } from '@teambit/issues';
import pMapSeries from 'p-map-series';
import { Component } from '@teambit/component';
import { InsightsAspect } from './insights.aspect';
import getCoreInsights from './core-insights-getter';
import { Insight, InsightResult } from './insight';
import { InsightManager, RunInsightOptions } from './insight-manager';
import InsightsCmd from './insights.cmd';

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

  listInsights() {
    return this.insightManager.listInsights();
  }

  async addInsightsAsComponentIssues(components: Component[], issuesToIgnore: string[]) {
    const insightNames: string[] = this.listInsights();
    const insights = insightNames.map((name) => this.insightManager.getByName(name));
    if (!issuesToIgnore.includes(IssuesClasses.CircularDependencies.name)) {
      await pMapSeries(insights, async (insight) => {
        if (insight && insight.addAsComponentIssue) {
          await insight.addAsComponentIssue(components);
        }
      });
    }
  }

  static slots = [];
  static dependencies = [GraphAspect, CLIAspect, IssuesAspect];
  static runtime = MainRuntime;
  static config = {
    silence: false,
  };
  static async provider([graphMain, cli, issues]: [GraphMain, CLIMain, IssuesMain]) {
    // get all insights from registry
    const initialInsights: Insight[] = getCoreInsights(graphMain);
    // register all insights in cli
    // TODO - get user-defined insights as well, and use them when instantiating InsightManager and InsightsCmd
    const insightManager = new InsightManager(initialInsights);
    const insightsMain = new InsightsMain(insightManager);
    issues.registerAddComponentsIssues(insightsMain.addInsightsAsComponentIssues.bind(insightsMain));
    const insightsCmd = new InsightsCmd(insightsMain);
    cli.register(insightsCmd);
    return insightsMain;
  }
}

InsightsAspect.addRuntime(InsightsMain);
