import { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import { GeneratorMain } from './generator.main.runtime';

export type GeneratorOptions = {
  namespace?: string;
  aspect?: string;
  scope?: string;
  path?: string;
};

export class CreateCmd implements Command {
  name = 'create <templateName> <componentNames...>';
  description = 'create a new component from a template';
  shortDescription = '';
  alias = '';
  loader = true;
  group = 'development';
  options = [
    ['n', 'namespace <string>', `sets the component's namespace and nested dirs inside the scope`],
    ['s', 'scope <string>', `sets the component's scope-name. if not entered, the default-scope will be used`],
    ['a', 'aspect <string>', 'aspect-id of the template. helpful when multiple aspects use the same template name'],
    ['p', 'path <string>', 'relative path in the workspace. by default the path is <scope>/<namespace>/<name>'],
  ] as CommandOptions;

  constructor(private generator: GeneratorMain) {}

  async report([templateName, componentNames]: [string, string[]], options: GeneratorOptions) {
    const results = await this.generator.generateComponentTemplate(componentNames, templateName, options);
    const title = `the following ${results.length} component(s) were created`;

    const componentsData = results
      .map((result) => {
        const compTitle = `${chalk.bold(result.id.toString())} at ${result.dir}`;
        const compFiles = result.files.map((file) => `    ${file}`).join('\n');
        return `${compTitle}\n${compFiles}`;
      })
      .join('\n');
    return `${chalk.green(title)}\n\n${componentsData}`;
  }
}
