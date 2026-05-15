import type { CommandDescriptor, CommandOptions } from '@teambit/cli';

/**
 * Declarative command descriptors for this aspect.
 *
 * Part of the ESM Migration with Lazy-Loaded Aspects RFC
 * (docs/rfc-esm-lazy-aspects.md §6.2). Each descriptor is the single
 * source of truth for its command's static fields; the matching handler
 * class reads these fields rather than redeclaring them, and
 * `cli.register(descriptor, factory)` consumes the pair.
 */

export const addCommand: CommandDescriptor = {
  name: 'add [path...]',
  alias: 'a',
  description: 'track existing directory contents as new components in the workspace',
  extendedDescription: 'Registers one or more directories as Bit components without changing your files. Each provided path becomes a component root tracked by Bit.',
  helpUrl: 'reference/workspace/component-directory',
  group: 'component-development',
  loader: true,
  options: [
      ['i', 'id <name>', 'manually set component id'],
      ['m', 'main <file>', 'define component entry point'],
      ['n', 'namespace <namespace>', 'organize component in a namespace'],
      ['o', 'override <boolean>', 'override existing component if exists (default = false)'],
      [
        's',
        'scope <string>',
        `sets the component's scope. if not entered, the default-scope from workspace.jsonc will be used`,
      ],
      ['e', 'env <string>', "set the component's environment. (overrides the env from variants if exists)"],
      ['j', 'json', 'output as json format'],
    ] as CommandOptions,
};
