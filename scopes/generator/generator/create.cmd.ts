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
  name = 'create <templateName> <componentNames...>';
  description = 'create a new component from a template';
  alias = '';
  loader = true;
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
`;
      })
      .join('\n');
    const footer = `env configuration is according to workspace variants, template config or --env flag. learn more at https://${this.docsDomain}/envs/using-envs`;

    return `${chalk.green(title)}\n\n${componentsData}\n\n${footer}`;
  }
}
