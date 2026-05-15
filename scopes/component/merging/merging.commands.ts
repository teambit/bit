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

export const mergeCommand: CommandDescriptor = {
  name: 'merge [component-pattern]',
  alias: '',
  description: 'merge diverged component history when local and remote have different versions',
  extendedDescription: `resolves diverged component history when both local and remote have created different snaps/tags from the same base version.
  if no component pattern is specified, all pending-merge components will be merged (run 'bit status' to list them).
  'bit status' will show diverged components and suggest either merging or resetting local changes.
  preferred approach: use 'bit reset' to remove local versions, then 'bit checkout head' to get remote versions.
  for lane-to-lane merging, use 'bit lane merge' instead.`,
  helpUrl: 'reference/components/merging-changes',
  group: 'version-control',
  arguments: [{ name: 'component-pattern', description: COMPONENT_PATTERN_HELP }],
  loader: true,
  options: [
      ['', 'ours', 'DEPRECATED. use --auto-merge-resolve. in case of a conflict, keep the local modification'],
      [
        '',
        'theirs',
        'DEPRECATED. use --auto-merge-resolve. in case of a conflict, override the local modification with the specified version',
      ],
      [
        '',
        'manual',
        'same as "--auto-merge-resolve manual". in case of merge conflict, write the files with the conflict markers',
      ],
      [
        'r',
        'auto-merge-resolve <merge-strategy>',
        'in case of a conflict, resolve according to the strategy: [ours, theirs, manual]',
      ],
      ['', 'abort', 'in case of an unresolved merge, revert to pre-merge state'],
      ['', 'resolve', 'mark an unresolved merge as resolved and create a new snap with the changes'],
      ['', 'no-snap', 'do not auto snap even if the merge completed without conflicts'],
      ['', 'build', 'in case of snap during the merge, run the build-pipeline (similar to bit snap --build)'],
      ['', 'verbose', 'show details of components that were not merged successfully'],
      ['x', 'skip-dependency-installation', 'do not install new dependencies resulting from the merge'],
      ['m', 'message <message>', 'override the default message for the auto snap'],
    ] as CommandOptions,
};
