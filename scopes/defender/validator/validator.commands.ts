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

export const validateCommand: CommandDescriptor = {
  name: 'validate [component-pattern]',
  alias: '',
  description: 'run type-checking, linting, and testing in sequence',
  extendedDescription: `validates components by running check-types, lint, and test commands in sequence.
  by default runs all checks even when errors are found.
  use --fail-fast to stop at the first failure.
  by default validates only new and modified components. use --all to validate all components.`,
  group: 'testing',
  arguments: [{ name: 'component-pattern', description: COMPONENT_PATTERN_HELP }],
  options: [
      ['a', 'all', 'validate all components, not only modified and new'],
      ['', 'fail-fast', 'stop at the first failure instead of running all checks'],
      ['c', 'continue-on-error', 'DEPRECATED: this is now the default behavior'],
      [
        '',
        'skip-tasks <string>',
        'skip the given tasks. for multiple tasks, separate by a comma and wrap with quotes. available tasks: "check-types", "lint", "test"',
      ],
    ] as CommandOptions,
};
