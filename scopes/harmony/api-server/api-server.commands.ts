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

export const serverCommand: CommandDescriptor = {
  name: 'server',
  alias: '',
  description: 'communicate with bit cli program via http requests',
  group: 'workspace-setup',
  private: true,
  options: [
      ['p', 'port [port]', 'port to run the server on'],
      ['c', 'compile', 'compile components during the watch process'],
    ] as CommandOptions,
  commands: [],
};
