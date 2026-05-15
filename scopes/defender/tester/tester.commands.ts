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

export const testCommand: CommandDescriptor = {
  name: 'test [component-pattern]',
  alias: 'at',
  description: 'run component tests',
  extendedDescription: `executes tests using the testing framework configured by each component's environment (Jest, Mocha, etc.).
  by default only runs tests for new and modified components. use --unmodified to test all components.
  supports watch mode, coverage reporting, and debug mode for development workflows.`,
  helpUrl: 'reference/testing/tester-overview',
  group: 'testing',
  arguments: [
      {
        name: 'component-pattern',
        description: COMPONENT_PATTERN_HELP,
      },
    ],
  options: [
      ['w', 'watch', 'start the tester in watch mode.'],
      ['d', 'debug', 'start the tester in debug mode.'],
      ['a', 'all', 'DEPRECATED. (use --unmodified)'],
      ['u', 'unmodified', 'test all components, not only new and modified'],
      ['', 'junit <filepath>', 'write tests results as JUnit XML format into the specified file path'],
      ['', 'coverage', 'show code coverage data'],
      ['e', 'env <id>', 'test only components assigned the given env'],
      ['', 'update-snapshot', 'if supported by the tester, re-record every snapshot that fails during the test run'],
      [
        's',
        'scope <scope-name>',
        'DEPRECATED. (use the pattern instead, e.g. "scopeName/**"). name of the scope to test',
      ],
      ['j', 'json', 'return the results in json format'],
      ['', 'verbose', 'list the component ids that have no tests (default collapses them into a count)'],
      ['', 'summary', 'suppress tester output, print only the final pass/fail headline (or summary object with --json)'],
      // TODO: we need to reduce this redundant casting every time.
    ] as CommandOptions,
};
