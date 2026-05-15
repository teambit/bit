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

export const moveCommand: CommandDescriptor = {
  name: 'move <current-component-dir> <new-component-dir>',
  alias: 'mv',
  description: 'relocate a component to a different directory',
  extendedDescription: `moves component files to a new location within the workspace and updates the .bitmap tracking.
  only changes the filesystem location - does not affect the component's name, scope, or ID.
  useful for reorganizing workspace structure or following new directory conventions.`,
  helpUrl: 'reference/workspace/moving-components',
  group: 'component-development',
  arguments: [
      {
        name: 'current-component-dir',
        description: "the component's current directory (relative to the workspace root)",
      },
      {
        name: 'new-component-dir',
        description: "the new directory (relative to the workspace root) to create and move the component's files to",
      },
    ],
  loader: true,
  options: [] as CommandOptions,
};
