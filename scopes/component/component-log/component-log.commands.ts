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

export const logCommand: CommandDescriptor = {
  name: 'log <id>',
  alias: '',
  description: 'display component version history',
  extendedDescription: `shows chronological history of component versions including tags and snaps with metadata.
  displays commit messages, authors, dates, and version information. supports both local and remote component logs.
  use various format options for compact or detailed views of version history.`,
  helpUrl: 'reference/components/navigating-history',
  group: 'version-control',
  arguments: [{ name: 'id', description: 'component-id or component-name' }],
  remoteOp: true,
  skipWorkspace: true,
  options: [
      ['r', 'remote', 'show log of a remote component'],
      ['', 'parents', 'show parents and lanes data'],
      ['o', 'one-line', 'show each log entry in one line'],
      ['f', 'full-hash', 'show full hash of the snap (default to the first 9 characters for --one-line/--parents flags)'],
      ['m', 'full-message', 'show full message of the snap (default to the first line for --one-line/--parents flags)'],
      [
        '',
        'show-hidden',
        'show hidden snaps (snaps are marked as hidden typically when the following tag has the same files/config)',
      ],
      ['j', 'json', 'json format'],
    ] as CommandOptions,
};

export const logFileCommand: CommandDescriptor = {
  name: 'log-file <filepath>',
  alias: '',
  description: 'EXPERIMENTAL. display history of changes to a specific file',
  extendedDescription: `shows version history for a specific file within component versions.
  tracks file-level changes across component snaps and tags.
  displays file modifications, hashes, and associated commit information.`,
  group: 'version-control',
  arguments: [{ name: 'filepath', description: 'file path relative to the workspace' }],
  options: [['o', 'one-line', 'show each log entry in one line']] as CommandOptions,
};

export const blameCommand: CommandDescriptor = {
  name: 'blame <filepath>',
  alias: '',
  description: 'EXPERIMENTAL. show line-by-line authorship and modification history',
  extendedDescription: `displays who last modified each line of a file and when the change was made.
  tracks line-level changes across component versions.
  shows author, date, version hash, and optionally commit messages for each line.`,
  group: 'version-control',
  arguments: [{ name: 'filepath', description: 'file path relative to the workspace' }],
  options: [['m', 'include-message', 'show the commit message']] as CommandOptions,
};
