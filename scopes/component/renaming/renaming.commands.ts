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

export const renameCommand: CommandDescriptor = {
  name: 'rename <current-name> <new-name>',
  alias: '',
  description: 'change a component name',
  extendedDescription: `renames a component and optionally refactors dependent code to use the new name.
  for exported components: creates a new component with the new name and marks the original as deleted.
  for local components: simply renames the existing component in place.`,
  helpUrl: 'reference/components/renaming-components',
  group: 'component-development',
  arguments: [
      {
        name: 'current-name',
        description: 'the current component name (without its scope name)',
      },
      {
        name: 'new-name',
        description: "the new component name (without its scope name. use --scope to define the new component's scope)",
      },
    ],
  remoteOp: true,
  skipWorkspace: true,
  loader: true,
  options: [
      ['s', 'scope <scope-name>', 'define the scope for the new component'],
      ['r', 'refactor', 'update the import/require statements in all dependent components (in the same workspace)'],
      ['', 'preserve', 'avoid renaming files and variables/classes according to the new component name'],
      ['', 'ast', 'use ast to transform files instead of regex'],
      ['', 'delete', 'DEPRECATED. this is now the default'],
      ['', 'deprecate', 'instead of deleting the original component, deprecating it'],
      [
        'p',
        'path <relative-path>',
        'relative path in the workspace to place new component in. by default, the directory of the new component is from your workspace\'s "defaultScope" value',
      ],
    ] as CommandOptions,
};
