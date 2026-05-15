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

export const catVersionHistoryCommand: CommandDescriptor = {
  name: 'cat-version-history <id>',
  alias: 'cvh',
  description: 'cat version-history object by component-id',
  group: 'advanced',
  private: true,
  loadAspects: false,
  options: [
      // json is also the default for this command. it's only needed to suppress the logger.console
      ['j', 'json', 'json format'],
    ] as CommandOptions,
};
