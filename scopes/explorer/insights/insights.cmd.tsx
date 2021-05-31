import chalk from 'chalk';
import { Command, CommandOptions } from '@teambit/cli';
import { InsightResult } from './insight';
import { InsightManager } from './insight-manager';

export default class InsightsCmd implements Command {
  name = 'insights [...names]';
  description = 'Insights on component graph';
  group = 'development';
  private = true;
  options = [['l', 'list', 'list all insights']] as CommandOptions;
  insightManager: InsightManager;
  constructor(insightManager: InsightManager) {
    this.insightManager = insightManager;
  }

  async report([names]: [string[]], { list }: { list: boolean }): Promise<string> {
    if (list) {
      const results = this.insightManager.listInsights();
      const listItems = results.map((insight) => (insight += '\n'));
      return JSON.stringify(listItems);
    }
    if (names) {
      let results: InsightResult[] = [];
      const namesArr = typeof names === 'string' ? [names] : names;
      results = await this.insightManager.run(namesArr);
      return JSON.stringify(results);
    }
    const results = await this.insightManager.runAll();
    return template(results);
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
