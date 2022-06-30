import { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import { GeneratorMain } from './generator.main.runtime';

export type NewOptions = {
  aspect?: string;
  defaultScope?: string;
  skipGit?: boolean;
  loadFrom?: string;
  empty?: boolean;
};

export class NewCmd implements Command {
  name = 'new <template-name> <workspace-name>';
  description = 'create a new workspace from a template';
  arguments = [
    {
      name: 'template-name',
      description:
        "the name of the workspace template (run 'bit templates', outside of a workspace, to get a list of available templates)",
    },
    { name: 'workspace-name', description: 'the name for the new workspace and workspace directory' },
  ];
  alias = '';
  loader = true;
  group = 'start';
  options = [
    [
      'a',
      'aspect <aspect-id>',
      'aspect-id of the template. mandatory for non-core aspects. helpful for core aspects in case of a name collision',
    ],
    ['d', 'default-scope <scope-name>', `set defaultScope in the new workspace.jsonc`],
    ['', 'standalone', 'DEPRECATED. use --skip-git instead'],
    ['s', 'skip-git', 'skip generation of Git repository'],
    ['e', 'empty', 'empty workspace with no components (relevant for templates that add components by default)'],
    [
      '',
      'load-from <path-to-template>',
      'path to the workspace containing the template. helpful during a development of a workspace-template',
    ],
  ] as CommandOptions;

  constructor(private generator: GeneratorMain) {}

  async report([templateName, workspaceName]: [string, string], options: NewOptions & { standalone: boolean }) {
    options.skipGit = options.skipGit ?? options.standalone;
    const results = await this.generator.generateWorkspaceTemplate(workspaceName, templateName, options);
    return chalk.white(
      `${chalk.green(`

Congrats! A new workspace has been created successfully at '${results}'`)}

Inside the directory '${workspaceName}' you can run various commands including:

      ${chalk.yellow('bit start')}
        Starts the workspace in development mode

      ${chalk.yellow('bit install')}
        Installs any missing dependencies

      ${chalk.yellow('bit status')}
        Shows the status of the components

      ${chalk.yellow('bit compile')}
        Compiles the components

      ${chalk.yellow('bit test')}
        Runs the tests on all your components

      ${chalk.yellow('bit templates')}
        Shows all available component templates

      ${chalk.yellow('bit help')}
        Shows all available commands


${chalk.green.bold("Let's get started!")}

      ${chalk.yellow(`cd ${workspaceName}`)}
      ${chalk.yellow(`bit start`)}

      `
    );
  }
}
