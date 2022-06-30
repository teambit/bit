import chalk from 'chalk';
import { Command, CommandOptions } from '@teambit/cli';
import { InsightResult } from './insight';
import { InsightsMain } from './insights.main.runtime';

export default class InsightsCmd implements Command {
  name = 'insights [names...]';
  description = 'Insights on component graph';
  group = 'development';
  private = true;
  options = [
    ['l', 'list', 'list all insights'],
    ['j', 'json', 'return the insights in json format'],
  ] as CommandOptions;
  constructor(private insights: InsightsMain) {}

  async report([names]: [string[]], options: { list: boolean }): Promise<string> {
    if (options.list) {
      const results = await this.json([names], options);
      return JSON.stringify(results, null, 2);
    }
    const results = await this.insights.runInsights(names, { renderData: true });
    return template(results);
  }

  async json([names]: [string[]], { list }: { list: boolean }) {
    if (list) {
      const results = this.insights.listInsights();
      return results;
    }
    return this.insights.runInsights(names, { renderData: false });
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
