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

export const completionCommand: CommandDescriptor = {
  name: 'completion',
  alias: '',
  description: 'enable bash/zsh-completion shortcuts for commands and options',
  group: 'system',
  private: true,
  options: [] as CommandOptions,
};

export const versionCommand: CommandDescriptor = {
  name: 'version',
  alias: '',
  description: 'display the installed Bit version',
  group: 'system',
  loader: false,
  options: [['j', 'json', 'return the version in json format']] as CommandOptions,
};

export const detailsCommand: CommandDescriptor = {
  name: 'details',
  alias: '',
  description: 'show expanded details from the last command that provided them (e.g. tag, snap)',
  group: 'general',
  skipWorkspace: true,
  loadAspects: false,
  loader: false,
  options: [] as CommandOptions,
};
