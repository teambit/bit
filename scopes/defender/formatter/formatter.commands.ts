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

export const formatCommand: CommandDescriptor = {
  name: 'format [component-pattern]',
  description: 'auto-format component source code',
  extendedDescription: `formats component files using the formatter configured by each component's environment (Prettier, etc.).
  by default formats all components. use --changed to format only new and modified components.
  supports check mode to verify formatting without making changes.`,
  helpUrl: 'reference/formatting/formatter-overview',
  group: 'testing',
  arguments: [{ name: 'component-pattern', description: COMPONENT_PATTERN_HELP }],
  options: [
      ['c', 'changed', 'format only new and modified components'],
      ['', 'check', 'will output a human-friendly message and a list of unformatted files, if any'],
      ['j', 'json', 'return the format results in json format'],
    ] as CommandOptions,
};
