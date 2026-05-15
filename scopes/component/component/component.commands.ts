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

export const showCommand: CommandDescriptor = {
  name: 'show <component-name>',
  alias: '',
  description: 'display component metadata, dependencies, and configuration',
  extendedDescription: `shows detailed information about a component including its version, dependencies, environment, and other metadata.
  note: to see file changes made in a specific version, use \`bit diff <component> <version> --parent\`.`,
  group: 'info-analysis',
  arguments: [{ name: 'component-name', description: 'component name or component id' }],
  options: [
      ['j', 'json', 'return the component data in json format'],
      ['l', 'legacy', 'use the legacy bit show.'],
      ['r', 'remote', 'show data for a remote component'],
      ['b', 'browser', 'open the component page in the browser'],
      [
        'c',
        'compare',
        'legacy-only. compare current file system component to its latest tagged version [default=latest]',
      ],
    ] as CommandOptions,
};

export const catCommand: CommandDescriptor = {
  name: 'cat <component-id>',
  alias: '',
  description: 'print source files or config of a component at a specific version',
  group: 'info-analysis',
  arguments: [
      {
        name: 'component-id',
        description: 'component ID, optionally with @version (e.g. scope/name@1.0.0)',
      },
    ],
  skipWorkspace: true,
  options: [
      ['f', 'file <path>', 'show only the specified file (relative to component root)'],
      ['c', 'config', 'show component configuration (env, dependencies) instead of source files'],
      ['a', 'all', 'show both source files and configuration'],
      ['j', 'json', 'output as JSON'],
    ] as CommandOptions,
};
