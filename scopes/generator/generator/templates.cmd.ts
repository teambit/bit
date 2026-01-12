import type { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import { groupBy, countBy } from 'lodash';
import type { GeneratorMain, TemplateDescriptor } from './generator.main.runtime';

/**
 * Extracts a friendly display name from an aspect ID.
 * e.g., "teambit.react/react" → "React", "teambit.harmony/node" → "Node"
 */
function getFriendlyName(aspectId: string): string {
  const lastSegment = aspectId.split('/').pop() || aspectId;
  // Handle special cases
  if (lastSegment.toLowerCase() === 'mdx') return 'MDX';
  // Capitalize first letter
  return lastSegment.charAt(0).toUpperCase() + lastSegment.slice(1);
}

/**
 * Gets unique envs from templates, sorted by frequency (most common first).
 */
function getUniqueEnvs(templates: TemplateDescriptor[]): string[] {
  const envs = templates.map((t) => t.env).filter(Boolean) as string[];
  if (envs.length === 0) return [];
  const counts = countBy(envs);
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([env]) => env);
}

export type TemplatesOptions = {
  showAll?: boolean;
  aspect?: string;
  json?: boolean;
};

export class TemplatesCmd implements Command {
  name = 'templates';
  description = 'list available templates for "bit create" and "bit new"';
  extendedDescription =
    'list components templates when inside bit-workspace (for bit-create), otherwise, list workspace templates (for bit-new)';
  alias = '';
  loader = true;
  group = 'component-development';
  options = [
    ['s', 'show-all', 'show hidden templates'],
    ['a', 'aspect <aspect-id>', 'show templates provided by the aspect-id'],
    ['j', 'json', 'return templates in json format'],
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
        const templates = grouped[aspectId];
        const names = templates.map(templateOutput).join('\n');
        // Get unique envs from templates in this group
        const uniqueEnvs = getUniqueEnvs(templates);
        const envSuffix = uniqueEnvs.length > 0 ? chalk.dim(` (env: ${uniqueEnvs.join(', ')})`) : '';
        // Use titlePrefix if available, otherwise generate friendly name from aspectId
        const friendlyName = templates[0].titlePrefix || getFriendlyName(aspectId);
        const groupTitle = `${friendlyName}${envSuffix}`;
        return `${chalk.blue.bold(groupTitle)}\n${names}\n`;
      })
      .join('\n');

    const learnMore = `\nfind and add templates in https://bit.dev/reference/generator/use-component-generator`;
    return title + output + learnMore;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async json(args: [], templatesOptions: TemplatesOptions) {
    let results = await this.generator.listTemplates(templatesOptions);

    // Make sure that we don't list hidden templates
    if (!templatesOptions.showAll) {
      results = results.filter((template) => !template.hidden);
    }

    return results;
  }
}
