import { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import { GeneratorMain } from './generator.main.runtime';

export type NewOptions = {
  aspect?: string;
  defaultScope?: string;
  standalone?: boolean;
  loadFrom?: string;
};

export class NewCmd implements Command {
  name = 'new <templateName> <workspaceName>';
  description = 'EXPERIMENTAL. create a new workspace from a template';
  shortDescription = '';
  alias = '';
  loader = true;
  group = 'start';
  options = [
    [
      'a',
      'aspect <string>',
      'aspect-id of the template. mandatory for non-core aspects. helpful for core aspects in case of a name collision',
    ],
    ['d', 'default-scope <string>', `set defaultScope in the new workspace.jsonc`],
    ['s', 'standalone <string>', 'skip generation of Git repository'],
    [
      '',
      'load-from <string>',
      'path to the workspace containing the template. helpful during a development of a workspace-template',
    ],
  ] as CommandOptions;

  constructor(private generator: GeneratorMain) {}

  async report([templateName, workspaceName]: [string, string], options: NewOptions) {
    const results = await this.generator.generateWorkspaceTemplate(workspaceName, templateName, options);
    return chalk.green(`a new workspace has been created successfully at ${results}`);
  }
}
