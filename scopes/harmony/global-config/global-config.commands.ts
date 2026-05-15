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

export const globalsCommand: CommandDescriptor = {
  name: 'globals',
  alias: '',
  description: 'display global directories and paths used by Bit',
  extendedDescription: `shows all global directories including cache, logs, and config locations used by Bit across your system.
  useful for debugging and understanding where Bit stores data.`,
  helpUrl: 'reference/config/config-files',
  group: 'system',
  options: [['j', 'json', 'json format']] as CommandOptions,
};

export const remoteCommand: CommandDescriptor = {
  name: 'remote',
  alias: '',
  description: 'manage remote scopes for self-hosted environments',
  extendedDescription: `configure connections to self-hosted remote scopes via HTTP or file protocol.
  note: this command is only needed for self-hosted scopes. when using bit.cloud, remote scopes are automatically configured.
  remotes are bare scopes that store exported components and enable collaboration across teams.`,
  helpUrl: 'reference/scope/remote-scopes',
  group: 'collaborate',
  loadAspects: false,
  options: [['g', 'global', 'see globally configured remotes']] as CommandOptions,
  commands: [new RemoteAdd(), new RemoteRm(), new RemoteList()],
};
