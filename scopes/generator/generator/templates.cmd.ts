import { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
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

    const title = chalk.green(`the following template(s) are available\n`);
    const output = Object.keys(results)
      .map((aspectId) => {
        const names = results[aspectId].map((template) => `    ${template.name}`).join('\n');
        return `${chalk.bold(aspectId)}\n${names}`;
      })
      .join('\n');
    return title + output;
  }
}
