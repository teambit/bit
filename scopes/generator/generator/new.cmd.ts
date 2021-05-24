import { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import { GeneratorMain } from './generator.main.runtime';

export type NewOptions = {
  aspect?: string;
  owner?: string;
  standalone?: boolean;
};

export class NewCmd implements Command {
  name = 'new <templateName> <workspaceName>';
  description = 'EXPERIMENTAL. create a new workspace from a template';
  shortDescription = '';
  alias = '';
  loader = true;
  group = 'start';
  options = [
    ['a', 'aspect <string>', 'aspect-id of the template. helpful when multiple aspects use the same template name'],
    ['o', 'owner <string>', `Append the owner to any of the defaultScope in the workspace.jsonc template`],
    ['s', 'standalone <string>', 'skip generation of Git repository'],
  ] as CommandOptions;

  constructor(private generator: GeneratorMain) {}

  async report([templateName, workspaceName]: [string, string], options: NewOptions) {
    const results = await this.generator.generateWorkspaceTemplate(workspaceName, templateName, options);
    return chalk.green(`a new workspace has been created successfully at ${results}`);
  }
}
