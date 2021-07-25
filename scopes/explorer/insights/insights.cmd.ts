import chalk from 'chalk';
import { Command, CommandOptions } from '@teambit/cli';
import { InsightResult } from './insight';
import { InsightManager, RunInsightOptions } from './insight-manager';

export default class InsightsCmd implements Command {
  name = 'insights [...names]';
  description = 'Insights on component graph';
  group = 'development';
  private = true;
  options = [
    ['l', 'list', 'list all insights'],
    ['j', 'json', 'return the insights in json format'],
  ] as CommandOptions;
  insightManager: InsightManager;
  constructor(insightManager: InsightManager) {
    this.insightManager = insightManager;
  }

  async report(names: [string[]], options: { list: boolean }): Promise<string> {
    if (options.list) {
      const results = await this.json(names, options);
      return JSON.stringify(results, null, 2);
    }
    const results = await this.runInsights(names, { renderData: true });
    return template(results);
  }

  async json(names: [string[]], { list }: { list: boolean }) {
    if (list) {
      const results = this.insightManager.listInsights();
      return results;
    }
    return this.runInsights(names, { renderData: false });
  }

  private async runInsights([names]: [string[]], opts: RunInsightOptions) {
    if (names) {
      let results: InsightResult[] = [];
      const namesArr = typeof names === 'string' ? [names] : names;
      results = await this.insightManager.run(namesArr, opts);
      return results;
    }
    const results = await this.insightManager.runAll(opts);
    return results;
  }
}

function template(results: InsightResult[]): string {
  const elements = results
    .map((result) => {
      return `\n${chalk.cyan.bold(result.message)}
  ${result.renderedData}`;
    })
    .join('\n');
  return elements;
}
