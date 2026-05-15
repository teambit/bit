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

export const ejectCommand: CommandDescriptor = {
  name: 'eject <component-pattern>',
  alias: 'E',
  description: 'remove component from workspace and install it as npm package',
  extendedDescription: `converts workspace components to external npm packages by removing them from .bitmap and installing via package manager.
  by default removes component files from workspace. use --keep-files to preserve source code while converting to package dependency.
  useful for components that no longer need active development in current workspace.`,
  helpUrl: 'reference/components/exporting-components#ejecting-components',
  group: 'dependencies',
  arguments: [
      {
        name: 'component-pattern',
        description: COMPONENT_PATTERN_HELP,
      },
    ],
  loader: true,
  options: [
      [
        'f',
        'force',
        'ignore local changes/versions. eject component/s even when they are staged or modified. Note: unexported tags/snaps will be lost',
      ],
      ['x', 'skip-dependency-installation', 'do not auto-install dependencies'],
      ['j', 'json', 'print the results in JSON format'],
      ['', 'keep-files', 'keep the component files in the workspace intact'],
    ] as CommandOptions,
};
