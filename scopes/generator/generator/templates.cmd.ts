import { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import { groupBy } from 'lodash';
import { GeneratorMain } from './generator.main.runtime';

export type GeneratorOptions = {
  namespace?: string;
  aspect?: string;
  scope?: string;
};

export class TemplatesCmd implements Command {
  name = 'templates';
  description = 'list all templates available';
  shortDescription = '';
  alias = '';
  loader = true;
  group = 'development';
  options = [] as CommandOptions;

  constructor(private generator: GeneratorMain) {}

  async report() {
    const results = await this.generator.listComponentTemplates();
    const grouped = groupBy(results, 'aspectId');
    const title = chalk.green(`the following template(s) are available\n`);
    const output = Object.keys(grouped)
      .map((aspectId) => {
        const names = grouped[aspectId].map((template) => `    ${template.name}`).join('\n');
        return `${chalk.bold(aspectId)}\n${names}`;
      })
      .join('\n');
    return title + output;
  }
}
