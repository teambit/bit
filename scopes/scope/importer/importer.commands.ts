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

export const importCommand: CommandDescriptor = {
  name: 'import [component-patterns...]',
  alias: '',
  description: 'bring components from remote scopes into your workspace',
  extendedDescription: `brings component source files from remote scopes into your workspace and installs their dependencies as packages.
  supports pattern matching for bulk imports, merge strategies for handling conflicts, and various optimization options.
  without arguments, fetches all workspace components' latest versions from their remote scopes.`,
  helpUrl: 'reference/components/importing-components',
  group: 'collaborate',
  arguments: [
      {
        name: 'component-patterns...',
        description:
          'component IDs or component patterns (separated by space). Use patterns to import groups of components using a common scope or namespace. E.g., "utils/*" (wrap with double quotes)',
      },
    ],
  remoteOp: true,
  loader: true,
  options: [
      ['p', 'path <path>', 'import components into a specific directory (a relative path in the workspace)'],
      [
        'o',
        'objects',
        'import components objects to the local scope without checkout (without writing them to the file system). This is the default behavior for import with no id argument',
      ],
      ['O', 'override', 'override local changes'],
      ['v', 'verbose', 'show verbose output for inspection'],
      ['j', 'json', 'return the output as JSON'],
      // ['', 'conf', 'write the configuration file (component.json) of the component'], // not working. need to fix once ComponentWriter is moved to Harmony
      ['x', 'skip-dependency-installation', 'do not auto-install dependencies of the imported components'],
      ['', 'skip-write-config-files', 'do not write config files (such as eslint, tsconfig, prettier, etc...)'],
      [
        'm',
        'merge [strategy]',
        'merge local changes with the imported version. strategy should be "theirs", "ours" or "manual"',
      ],
      [
        '',
        'dependencies',
        'import all dependencies (bit components only) of imported components and write them to the workspace',
      ],
      ['', 'dependencies-head', 'same as --dependencies, except it imports the dependencies with their head version'],
      [
        '',
        'dependents',
        'import components found while traversing from the imported components upwards to the workspace components',
      ],
      [
        '',
        'dependents-via <string>',
        'same as --dependents except the traversal must go through the specified component. to specify multiple components, wrap with quotes and separate by a comma',
      ],
      [
        '',
        'dependents-all',
        'same as --dependents except not prompting for selecting paths but rather selecting all paths and showing final confirmation before importing',
      ],
      [
        '',
        'dependents-dry-run',
        'DEPRECATED. (this is the default now). same as --dependents, except it prints the found dependents and wait for confirmation before importing them',
      ],
      ['', 'silent', 'no prompt for --dependents/--dependents-via flags'],
      [
        '',
        'filter-envs <envs>',
        'only import components that have the specified environment (e.g., "teambit.react/react-env")',
      ],
      [
        '',
        'save-in-lane',
        'when checked out to a lane and the component is not on the remote-lane, save it in the lane (defaults to save on main)',
      ],
      [
        '',
        'all-history',
        'relevant for fetching all components objects. avoid optimizations, fetch all history versions, always',
      ],
      [
        '',
        'fetch-deps',
        'fetch dependencies (bit components) objects to the local scope, but dont add to the workspace. Useful to resolve errors about missing dependency data',
      ],
      [
        '',
        'write-deps <target>',
        'write all workspace component dependencies to the specified target ("package.json" or "workspace.jsonc"), resolving conflicts by picking the ranges that match the highest versions',
      ],
      [
        '',
        'track-only',
        'do not write any component files, just create .bitmap entries of the imported components. Useful when the files already exist and just want to re-add the component to the bitmap',
      ],
      ['', 'include-deprecated', 'when importing with patterns, include deprecated components (default to exclude them)'],
      [
        '',
        'lane-only',
        'when using wildcards on a lane, only import components that exist on the lane (never from main)',
      ],
      ['', 'owner', 'treat the argument as an owner name and import all components from all scopes of that owner'],
    ] as CommandOptions,
};

export const fetchCommand: CommandDescriptor = {
  name: 'fetch [ids...]',
  alias: '',
  description: `fetch remote objects and store locally`,
  extendedDescription: `for lanes, use "/" as a separator between the remote and the lane name, e.g. teambit.ui/fix-button`,
  group: 'collaborate',
  private: true,
  loader: true,
  options: [
      [
        'l',
        'lanes',
        'fetch component objects from lanes. note, it does not save the remote lanes objects locally, only the refs',
      ],
      ['c', 'components', 'fetch components'],
      ['', 'all-history', 'for each component, fetch all its versions. by default, only the latest version is fetched'],
      ['j', 'json', 'return the output as JSON'],
      [
        '',
        'from-original-scopes',
        'fetch indirect dependencies from their original scope as opposed to from their dependents',
      ],
    ] as CommandOptions,
};
