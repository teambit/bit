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
        "the name of the workspace template (run 'bit templates' outside of a workspace to get a list of available workspace templates)",
    },
    {
      name: 'workspace-name',
      description: 'the name for the new workspace and workspace directory that will be created',
    },
  ];
  alias = '';
  loader = true;
  group = 'start';
  options = [
    [
      'a',
      'aspect <aspect-id>',
      'id of the aspect that registered the template, mandatory for non-core aspects. helpful for core aspects in case of a name collision',
    ],
    ['t', 'template <env-id>', "env-id of the template's owner. Alias for --env."],
    ['', 'env <env-id>', 'env-id of the template. Alias -t'],
    ['d', 'default-scope <scope-name>', `set defaultScope in the new workspace's workspace.jsonc`],
    ['', 'standalone', 'DEPRECATED. use --skip-git instead'],
    ['s', 'skip-git', 'skip generation of Git repository in the new workspace'],
    [
      'e',
      'empty',
      "skip template's default component creation (relevant for templates that add components by default)",
    ],
    [
      '',
      'load-from <path-to-template>',
      'local path to the workspace containing the template. Helpful during a development of a workspace-template',
    ],
  ] as CommandOptions;

  constructor(private generator: GeneratorMain) {}

  async report(
    [templateName, workspaceName]: [string, string],
    options: NewOptions & {
      standalone: boolean;
      env?: string;
      template?: string;
    }
  ) {
    options.skipGit = options.skipGit ?? options.standalone;
    options.aspect = options.aspect ?? options.env ?? options.template;
    const { workspacePath, appName } = await this.generator.generateWorkspaceTemplate(
      workspaceName,
      templateName,
      options
    );
    return chalk.white(
      `${chalk.green(`

Congrats! A new workspace has been created successfully at '${workspacePath}'`)}

Inside the directory '${workspaceName}' you can run various commands including:

      ${chalk.yellow('bit start')}
        Starts the local dev server

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

      ${getBottomSection(workspaceName, appName)}
      `
    );
  }
}

function getBottomSection(workspaceName: string, appName: string | undefined) {
  const cdLine = chalk.yellow(`cd ${workspaceName}`);
  const parts = [cdLine];
  if (appName) {
    parts.push(chalk.yellow(`      bit run ${appName}`));
  }
  parts.push(chalk.yellow(`      bit start`));
  return parts.join('\n');
}
