import type { CommandDescriptor, CommandOptions } from '@teambit/cli';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy.constants';

/**
 * Declarative command descriptors for this aspect.
 *
 * Part of the ESM Migration with Lazy-Loaded Aspects RFC
 * (docs/rfc-esm-lazy-aspects.md §6.2). Each descriptor is the single
 * source of truth for its command's static fields; the matching handler
 * class reads these fields rather than redeclaring them, and
 * `cli.register(descriptor, factory)` consumes the pair.
 */

export const removeCommand: CommandDescriptor = {
  name: 'remove <component-pattern>',
  alias: 'rm',
  description: 'untrack components from the workspace',
  extendedDescription: `removes components from the local workspace only - stops tracking them in .bitmap and deletes their files by default.
  does not affect remote scopes - to delete components from remotes, use "bit delete" instead.
  use --keep-files to preserve component files while only removing the tracking.`,
  helpUrl: 'reference/components/removing-components',
  group: 'component-development',
  arguments: [
      {
        name: 'component-pattern',
        description: COMPONENT_PATTERN_HELP,
      },
    ],
  remoteOp: true,
  skipWorkspace: true,
  loader: true,
  options: [
      ['t', 'track', 'keep tracking component in .bitmap (default = false), helps transform a tagged-component to new'],
      ['', 'keep-files', 'keep component files (just untrack the component)'],
      [
        'f',
        'force',
        'removes the component from the scope, even if used as a dependency. WARNING: you will need to fix the components that depend on this component',
      ],
      ['s', 'silent', 'skip confirmation'],
    ] as CommandOptions,
  examples: [
      {
        cmd: 'remove "$deprecated"',
        description: 'remove all components that are deprecated',
      },
    ],
};

export const deleteCommand: CommandDescriptor = {
  name: 'delete <component-pattern>',
  alias: '',
  description: 'soft-delete components from remote scopes',
  extendedDescription: `marks components as deleted so they won't be visible on remote scopes after export.
  components remain recoverable using "bit recover" unless --hard is used (permanent deletion, not recommended).
  to remove components from your local workspace only, use "bit remove" instead.`,
  helpUrl: 'reference/components/removing-components',
  group: 'collaborate',
  arguments: [
      {
        name: 'component-pattern',
        description: COMPONENT_PATTERN_HELP,
      },
    ],
  remoteOp: true,
  skipWorkspace: true,
  loader: true,
  options: [
      [
        '',
        'lane',
        'when on a lane, delete the component from this lane only. this removal will not affect main when the lane is merged',
      ],
      ['', 'update-main', 'delete component/s on the main lane after merging this lane into main'],
      [
        '',
        'range <string>',
        'EXPERIMENTAL. enter a Semver range to delete specific tags (cannot be used for snaps). see https://www.npmjs.com/package/semver#ranges for the range syntax',
      ],
      ['s', 'silent', 'skip confirmation'],
      [
        '',
        'hard',
        'NOT-RECOMMENDED. delete a component completely from a remote scope. careful! this is a permanent change that could corrupt dependents.',
      ],
      [
        'f',
        'force',
        'relevant for --hard. allow the deletion even if used as a dependency. WARNING: components that depend on this component will corrupt',
      ],
      ['', 'snaps <string>', 'comma-separated list of snap hashes to mark as deleted (e.g. --snaps "hash1,hash2,hash3")'],
    ] as CommandOptions,
};

export const recoverCommand: CommandDescriptor = {
  name: 'recover <component-pattern>',
  description: 'restore soft-deleted components',
  extendedDescription: 'reverses the soft-deletion of components marked with "bit delete", restoring them to their previous state. works for both local and remote soft-deleted components. supports patterns like "comp1", "org.scope/*", etc.',
  group: 'collaborate',
  arguments: [
      {
        name: 'component-pattern',
        description: COMPONENT_PATTERN_HELP,
      },
    ],
  loader: true,
  options: [
      ['x', 'skip-dependency-installation', 'do not install packages in case of importing components'],
      ['', 'skip-write-config-files', 'do not write config files (such as eslint, tsconfig, prettier, etc...)'],
    ] as CommandOptions,
};
