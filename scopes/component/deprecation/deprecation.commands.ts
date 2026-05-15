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

export const deprecateCommand: CommandDescriptor = {
  name: 'deprecate <component-name>',
  alias: 'd',
  description: 'mark a component as deprecated to discourage its use',
  extendedDescription: `marks a component as deprecated locally, then after snap/tag and export it becomes deprecated in the remote scope.
  optionally specify a replacement component or deprecate only specific version ranges.
  deprecated components remain available but display warnings when installed or imported.`,
  helpUrl: 'reference/components/removing-components',
  group: 'collaborate',
  arguments: [{ name: 'component-name', description: 'component name or component id' }],
  remoteOp: true,
  skipWorkspace: true,
  loader: true,
  options: [
      [
        '',
        'new-id <string>',
        'if replaced by another component, enter the new component id. alternatively use "bit rename --deprecate" to do this automatically',
      ],
      [
        '',
        'range <string>',
        'enter a Semver range to deprecate specific versions. see https://www.npmjs.com/package/semver#ranges for the range syntax',
      ],
    ] as CommandOptions,
};

export const undeprecateCommand: CommandDescriptor = {
  name: 'undeprecate <id>',
  alias: '',
  description: 'remove the deprecation status from a component',
  extendedDescription: 'reverses the deprecation of a component, removing warnings and allowing normal use again.',
  group: 'collaborate',
  remoteOp: true,
  skipWorkspace: true,
  loader: true,
  options: [] as CommandOptions,
};
