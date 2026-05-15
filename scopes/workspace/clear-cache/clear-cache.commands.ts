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

export const clearCacheCommand: CommandDescriptor = {
  name: 'clear-cache',
  alias: 'cc',
  description: 'remove cached data to resolve stale data issues',
  helpUrl: 'reference/workspace/clearing-cache',
  group: 'system',
  skipWorkspace: true,
  loader: false,
  options: [['r', 'remote <remote-name>', 'clear memory cache from a remote scope']] as CommandOptions,
};
