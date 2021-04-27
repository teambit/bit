import { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import { groupBy } from 'lodash';
import { GeneratorMain, TemplateDescriptor } from './generator.main.runtime';

export type TemplatesOptions = {
  showAll?: boolean;
};

export class TemplatesCmd implements Command {
  name = 'templates';
  description =
    'list components templates when inside bit-workspace (for bit-create), otherwise, list workspace templates (for bit-new)';
  shortDescription = 'list templates';
  alias = '';
  loader = true;
  group = 'development';
  options = [['s', 'show-all', 'show hidden templates']] as CommandOptions;

  constructor(private generator: GeneratorMain) {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async report(args: [], templatesOptions: TemplatesOptions) {
    let results = await this.generator.listComponentTemplates();

    // Make sure that we don't list hidden templates
    if (!templatesOptions.showAll) {
      results = results.filter((template) => !template.hidden);
    }

    const grouped = groupBy(results, 'aspectId');
    const title = chalk.green(`the following template(s) are available\n`);
    const templateOutput = (template: TemplateDescriptor) => {
      const desc = template.description ? ` (${template.description})` : '';
      return `    ${template.name}${chalk.dim(desc)}`;
    };
    const output = Object.keys(grouped)
      .map((aspectId) => {
        const names = grouped[aspectId].map(templateOutput).join('\n');
        return `${chalk.bold(aspectId)}\n${names}`;
      })
      .join('\n');
    return title + output;
  }
}
