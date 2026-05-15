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

export const checkoutCommand: CommandDescriptor = {
  name: 'checkout <to> [component-pattern]',
  alias: 'U',
  description: 'switch between component versions or remove local changes',
  extendedDescription: `checkout components to specified versions or remove local changes. most commonly used as 'bit checkout head' to get latest versions.
  the \`<to>\` argument accepts these values:
  - head: checkout to last snap/tag (most common usage)
  - specific version: checkout to exact version (e.g. 'bit checkout 1.0.5 component-name')
  - head~x: go back x generations from head (e.g. 'head~2' for two versions back)
  - latest: checkout to latest semver tag
  - reset: remove local modifications and restore original files (also restores deleted component directories)
  when on lanes, 'checkout head' only affects lane components. to update main components, run 'bit lane merge main'.`,
  helpUrl: 'reference/components/merging-changes#checkout-snaps-to-the-working-directory',
  group: 'version-control',
  arguments: [
      {
        name: 'to',
        description:
          "permitted values: `[head, latest, reset, {specific-version}, {head~x}]`. 'head' - last snap/tag. 'latest' - semver latest tag. 'reset' - removes local changes",
      },
      {
        name: 'component-pattern',
        description: COMPONENT_PATTERN_HELP,
      },
    ],
  loader: true,
  options: [
      [
        'i',
        'interactive-merge',
        'when a component is modified and the merge process found conflicts, display options to resolve them',
      ],
      [
        'r',
        'auto-merge-resolve <merge-strategy>',
        'in case of merge conflict, resolve according to the provided strategy: [ours, theirs, manual]',
      ],
      [
        '',
        'manual',
        'same as "--auto-merge-resolve manual". in case of merge conflict, write the files with the conflict markers',
      ],
      ['a', 'all', 'all components'],
      [
        'e',
        'workspace-only',
        "only relevant for 'bit checkout head' when on a lane. don't import components from the remote lane that are not already in the workspace",
      ],
      ['v', 'verbose', 'showing verbose output for inspection'],
      ['x', 'skip-dependency-installation', 'do not auto-install dependencies of the imported components'],
      ['', 'force-ours', 'do not merge, preserve local files as is'],
      ['', 'force-theirs', 'do not merge, just overwrite with incoming files'],
      [
        '',
        'include-new-from-scope',
        "relevant for 'bit checkout head'. import components from the defaultScope that don't exist in the workspace",
      ],
    ] as CommandOptions,
};

export const revertCommand: CommandDescriptor = {
  name: 'revert <component-pattern> <to>',
  alias: '',
  description: 'replace component files with specified version while preserving current version',
  extendedDescription: `replaces component source files with files from the specified version but keeps the current component version.
  useful for reverting file changes without changing the component's version history. different from checkout which changes the version.`,
  group: 'version-control',
  arguments: [
      {
        name: 'component-pattern',
        description: COMPONENT_PATTERN_HELP,
      },
      {
        name: 'to',
        description: "permitted values: [main, specific-version]. 'main' - head version on main.",
      },
    ],
  loader: true,
  options: [
      ['v', 'verbose', 'showing verbose output for inspection'],
      ['x', 'skip-dependency-installation', 'do not install packages of the imported components'],
    ] as CommandOptions,
};
