import { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import { GeneratorMain } from './generator.main.runtime';

export type NewOptions = {
  aspect?: string;
  owner?: string;
  standalone?: string;
};

export class NewCmd implements Command {
  name = 'new <templateName> <workspaceName>';
  description = 'create a new workspace from a template';
  shortDescription = '';
  alias = '';
  loader = true;
  group = 'development';
  options = [
    ['a', 'aspect <string>', 'aspect-id of the template. helpful when multiple aspects use the same template name'],
    ['o', 'owner <string>', `Append the owner to any of the defaultScope in the workspace.jsonc template`],
    ['s', 'standalone <string>', 'skip generation of Git repository'],
  ] as CommandOptions;

  constructor(private generator: GeneratorMain) {}

  async report([templateName, workspaceName]: [string, string], options: NewOptions) {
    const results = await this.generator.generateWorkspaceTemplate(workspaceName, templateName, options);
    const title = `the following ${results.length} component(s) were created`;

    const componentsData = results
      .map((result) => {
        return `${chalk.bold(result.id.toString())}
    location: ${result.dir}
    env:      ${result.envId}
`;
      })
      .join('\n');
    const footer = `env configuration is according to workspace variants. learn more at https://harmony-docs.bit.dev/building-with-bit/environments/#configure-environment-for-components`;

    return `${chalk.green(title)}\n\n${componentsData}\n\n${footer}`;
  }
}
