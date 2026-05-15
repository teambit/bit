import type { CommandDescriptor, CommandOptions } from '@teambit/cli';
import { BASE_DOCS_DOMAIN } from '@teambit/legacy.constants';

/**
 * Declarative command descriptors for this aspect.
 *
 * Part of the ESM Migration with Lazy-Loaded Aspects RFC
 * (docs/rfc-esm-lazy-aspects.md §6.2). Each descriptor is the single
 * source of truth for its command's static fields; the matching handler
 * class reads these fields rather than redeclaring them, and
 * `cli.register(descriptor, factory)` consumes the pair.
 */

export const configCommand: CommandDescriptor = {
  name: 'config',
  alias: '',
  description: 'manage Bit configuration settings',
  extendedDescription: `view and modify Bit configuration at different levels: global, workspace, or scope.
  configurations control various aspects of Bit including user settings, registries, and feature flags.
  use environment variables prefixed with BIT_CONFIG_ for temporary overrides.
  ${BASE_DOCS_DOMAIN}reference/config/bit-config`,
  group: 'system',
  loadAspects: false,
  options: [] as CommandOptions,
  commands: [],
};
