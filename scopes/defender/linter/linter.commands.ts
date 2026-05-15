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

export const lintCommand: CommandDescriptor = {
  name: 'lint [component-pattern]',
  description: 'analyze component code for issues and style violations',
  extendedDescription: `runs linters configured by each component's environment (ESLint, etc.) to check for code quality issues.
  by default lints all components. use --changed to lint only new and modified components.
  supports automatic fixing of certain issues with --fix flag.`,
  helpUrl: 'reference/linting/linter-overview',
  group: 'testing',
  arguments: [{ name: 'component-pattern', description: COMPONENT_PATTERN_HELP }],
  options: [
      ['c', 'changed', 'lint only new and modified components'],
      ['f', 'fix', 'automatically fix problems'],
      ['', 'fix-type <fixType>', 'specify the types of fixes to apply (problem, suggestion, layout)'],
      ['j', 'json', 'return the lint results in json format'],
    ] as CommandOptions,
};
