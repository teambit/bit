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

export const catLaneHistoryCommand: CommandDescriptor = {
  name: 'cat-lane-history <lane-name>',
  alias: 'clh',
  description: 'cat lane-history object by lane-name',
  group: 'advanced',
  private: true,
  loader: true,
  options: [] as CommandOptions,
};
