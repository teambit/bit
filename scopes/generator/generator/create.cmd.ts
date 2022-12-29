import { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import { GeneratorMain } from './generator.main.runtime';

export type CreateOptions = {
  namespace?: string;
  aspect?: string;
  scope?: string;
  path?: string;
  env?: string;
};

export class CreateCmd implements Command {
  name = 'create <template-name> <component-names...>';
  description = 'create a new component (source files and config) using a template.';
  alias = '';
  loader = true;
  helpUrl = 'reference/starters/create-starter';
  arguments = [
    {
      name: 'template-name',
      description:
        "the template for generating the component \n(run 'bit templates' for a list of available templates)",
    },
    {
      name: 'component-names...',
      description: 'a list of component names to generate',
    },
  ];
  examples = [
    {
      cmd: 'bit create react ui/button',
      description: "creates a component named 'ui/button' using the 'react' template",
    },
    {
      cmd: 'bit create react ui/button pages/register',
      description: "creates two components, 'ui/button' and 'pages/register', using the 'react' template",
    },
    {
      cmd: 'bit create react ui/button --scope my-org.my-scope',
      description:
        "creates a component named 'ui/button' and sets it scope to 'my-org.my-scope'. \nby default, the scope is the `defaultScope` value, configured in your `workspace.jsonc`.",
    },
    {
      cmd: 'bit create react ui/button --env teambit.community/envs/community-react@1.95.13',
      description:
        "creates a component named 'ui/button' and sets it to use the 'community-react' env. \n(the template's default env is 'teambit.react/react').",
    },
  ];
  group = 'development';
  options = [
    ['n', 'namespace <string>', `sets the component's namespace and nested dirs inside the scope`],
    ['s', 'scope <string>', `sets the component's scope-name. if not entered, the default-scope will be used`],
    ['a', 'aspect <string>', 'aspect-id of the template. helpful when multiple aspects use the same template name'],
    ['p', 'path <string>', 'relative path in the workspace. by default the path is `<scope>/<namespace>/<name>`'],
    ['e', 'env <string>', "set the component's environment. (overrides the env from variants and the template)"],
  ] as CommandOptions;

  constructor(private generator: GeneratorMain, private docsDomain: string) {}

  async report([templateName, componentNames]: [string, string[]], options: CreateOptions) {
    const results = await this.generator.generateComponentTemplate(componentNames, templateName, options);
    const title = `${results.length} component(s) were created`;

    const componentsData = results
      .map((result) => {
        return `${chalk.bold(result.id.toString())}
    location: ${result.dir}
    env:      ${result.envId} (set by ${result.envSetBy})
    package:  ${result.packageName}
`;
      })
      .join('\n');
    const footer = `env configuration is according to workspace variants, template config or --env flag. learn more at https://${this.docsDomain}/envs/using-envs`;

    return `${chalk.green(title)}\n\n${componentsData}\n\n${footer}`;
  }
}
