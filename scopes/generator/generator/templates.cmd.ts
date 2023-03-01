import { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import { groupBy } from 'lodash';
import { GeneratorMain, TemplateDescriptor } from './generator.main.runtime';

export type TemplatesOptions = {
  showAll?: boolean;
  aspect?: string;
};

export class TemplatesCmd implements Command {
  name = 'templates';
  description = 'list templates for "bit create" and "bit new"';
  extendedDescription =
    'list components templates when inside bit-workspace (for bit-create), otherwise, list workspace templates (for bit-new)';
  alias = '';
  loader = true;
  group = 'development';
  options = [
    ['s', 'show-all', 'show hidden templates'],
    ['a', 'aspect <aspect-id>', 'show templates provided by the aspect-id'],
  ] as CommandOptions;

  constructor(private generator: GeneratorMain) {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async report(args: [], templatesOptions: TemplatesOptions) {
    let results = await this.generator.listTemplates(templatesOptions);

    // Make sure that we don't list hidden templates
    if (!templatesOptions.showAll) {
      results = results.filter((template) => !template.hidden);
    }

    const grouped = groupBy(results, 'aspectId');
    const titleStr = this.generator.isRunningInsideWorkspace()
      ? `The following template(s) are available with the command bit create:  \nExample - bit create <template-name> <component-name>`
      : `The following template(s) are available with the command bit new: \nExample - bit new <template-name> <workspace-name>`;
    const title = chalk.green(`\n${titleStr}\n`);
    const templateOutput = (template: TemplateDescriptor) => {
      const desc = template.description ? ` (${template.description})` : '';
      return `    ${template.name}${chalk.dim(desc)}`;
    };
    const output = Object.keys(grouped)
      .map((aspectId) => {
        const names = grouped[aspectId].map(templateOutput).join('\n');
        const groupTitle = grouped[aspectId][0].titlePrefix
          ? `${grouped[aspectId][0].titlePrefix} (${aspectId})`
          : aspectId;
        return `${chalk.blue.bold(groupTitle)}\n${names}\n`;
      })
      .join('\n');
    return title + output;
  }
}
