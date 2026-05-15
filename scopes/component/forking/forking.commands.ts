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

export const forkCommand: CommandDescriptor = {
  name: 'fork <pattern> [target-component-name]',
  alias: '',
  description: 'create a new component by copying from an existing one',
  extendedDescription: `duplicates an existing component's source files and configuration to create a new independent component.
  useful for creating variations or starting development from a similar component.
  automatically handles import/require statement updates and provides refactoring options.
  
  when using a pattern, all matching components are forked with the same name to a target scope.
  the target-component-name argument is not allowed when using patterns.`,
  helpUrl: 'docs/getting-started/collaborate/importing-components#fork-a-component',
  group: 'collaborate',
  arguments: [
      {
        name: 'pattern',
        description: COMPONENT_PATTERN_HELP,
      },
      {
        name: 'target-component-name',
        description:
          "the name for the new component (component name without scope, e.g. name/spaces/my-button). to set a different scope, use the '--scope' flag. not allowed when using patterns",
      },
    ],
  remoteOp: true,
  skipWorkspace: true,
  loader: true,
  options: [
      ['s', 'scope <string>', 'default scope for the new component'],
      [
        'p',
        'path <string>',
        'relative path in the workspace for the new component. by default the path is `<scope>/<namespace>/<name>`',
      ],
      ['r', 'refactor', 'update the import/require statements in all dependent components (in the same workspace)'],
      ['x', 'skip-dependency-installation', 'do not install packages of the imported components'],
      ['e', 'env <string>', 'set the environment for the new component'],
      [
        '',
        'skip-config',
        'do not copy the config (aspects-config, env, etc) to the new component. helpful when it fails during aspect loading',
      ],
      ['', 'preserve', 'avoid refactoring file and variable/class names according to the new component name'],
      ['', 'no-link', 'avoid saving a reference to the original component'],
      ['', 'ast', 'use ast to transform files instead of regex'],
    ] as CommandOptions,
};
