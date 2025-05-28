import { Command, CommandOptions } from '@teambit/cli';
import { ComponentID } from '@teambit/component';
import chalk from 'chalk';
import { GeneratorMain } from './generator.main.runtime';
import type { BaseComponentTemplateOptions } from './component-template';

/**
 * CreateOptions combines foundational properties with additional options for creating a component.
 */
export type CreateOptions = BaseComponentTemplateOptions & {
  env?: string;
  aspect?: string;
  force?: boolean;
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
      cmd: 'bit create react ui/button --aspect teambit.react/react-env',
      description: "creates a component named 'ui/button' using the 'react' template",
    },
    {
      cmd: 'bit create module utils/is-string utils/is-number --aspect teambit.node/node',
      description:
        "creates two components, 'utils/is-string' and 'utils/is-number' using the 'node' template from the 'node' aspect(env)",
    },
    {
      cmd: 'bit create mdx docs/create-components --aspect teambit.mdx/mdx-env --scope my-org.my-scope',
      description:
        "creates an mdx component named 'docs/create-components' and sets it scope to 'my-org.my-scope'. \nby default, the scope is the `defaultScope` value, configured in your `workspace.jsonc`.",
    },
    {
      cmd: 'bit create react ui/button --aspect teambit.react/react-env --env teambit.community/envs/community-react@3.0.3',
      description:
        "creates a component named 'ui/button' from the teambit.react/react-env env and sets it to use the 'community-react' env. \n(the template's default env is 'teambit.react/react-env').",
    },
  ];
  group = 'discover';
  options = [
    ['n', 'namespace <string>', `sets the component's namespace and nested dirs inside the scope`],
    ['s', 'scope <string>', `sets the component's scope-name. if not entered, the default-scope will be used`],
    ['a', 'aspect <string>', 'aspect-id of the template. helpful when multiple aspects use the same template name'],
    ['t', 'template <string>', 'env-id of the template. alias for --aspect.'],
    ['p', 'path <string>', 'relative path in the workspace. by default the path is `<scope>/<namespace>/<name>`'],
    ['e', 'env <string>', "set the component's environment. (overrides the env from variants and the template)"],
    ['f', 'force', 'replace existing files at the target location'],
  ] as CommandOptions;

  constructor(private generator: GeneratorMain) {}

  async report(
    [templateName, componentNames]: [string, string[]],
    options: Partial<CreateOptions> & {
      template?: string | ComponentID;
      force?: boolean;
    }
  ) {
    options.aspectId = options.aspectId ?? options.template;
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
    const footer = `env configuration is according to workspace variants, template config or --env flag.`;

    return `${chalk.green(title)}\n\n${componentsData}\n\n${footer}`;
  }
}
