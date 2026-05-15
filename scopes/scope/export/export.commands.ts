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

export const resumeExportCommand: CommandDescriptor = {
  name: 'resume-export <export-id> <remotes...>',
  alias: '',
  description: 'EXPERIMENTAL. resume failed export',
  extendedDescription: `resume failed export to persist the pending objects on the given remotes.
  the export-id is the id the client received in the error message during the failure.
  alternatively, exporting to any one of the failed scopes, throws server-is-busy error with the export-id`,
  group: 'advanced',
  private: true,
  remoteOp: true,
  loader: true,
  options: [] as CommandOptions,
};

export const exportCommand: CommandDescriptor = {
  name: 'export [component-patterns...]',
  alias: 'e',
  description: 'upload components to remote scopes',
  extendedDescription: `uploads staged versions (snaps/tags) to remote scopes, making them available for consumption by other workspaces.
  without arguments, exports all staged components. when on a lane, exports the lane as well.
  exporting is the final step after development and versioning to share components with your team.`,
  helpUrl: 'reference/components/exporting-components',
  group: 'collaborate',
  arguments: [
      {
        name: 'component-patterns...',
        description: `(not recommended) ${COMPONENT_PATTERN_HELP}`,
      },
    ],
  remoteOp: true,
  loader: true,
  options: [
      ['e', 'eject', 'after export, remove the components from the workspace and install them as packages'],
      [
        'a',
        'all',
        'export all components, including non-staged (useful when components in the remote scope are corrupted or missing)',
      ],
      [
        '',
        'all-versions',
        'export not only staged versions but all of them (useful when versions in the remote scope are corrupted or missing)',
      ],
      [
        '',
        'origin-directly',
        'avoid export to the central hub, instead, export directly to the original scopes. not recommended!',
      ],
      [
        '',
        'resume <string>',
        'in case the previous export failed and suggested to resume with an export-id, enter the id',
      ],
      [
        '',
        'head-only',
        'in case previous export failed and locally it shows exported and only one snap/tag was created, try using this flag',
      ],
      [
        '',
        'ignore-missing-artifacts',
        "don't throw an error when artifact files are missing. not recommended, unless you're sure the artifacts are in the remote",
      ],
      ['', 'fork-lane-new-scope', 'allow exporting a forked lane into a different scope than the original scope'],
      ['', 'open-browser', 'open a browser once the export is completed in the cloud job url'],
      ['', 'verbose', 'per exported component, show the versions being exported'],
      ['j', 'json', 'show output in json format'],
    ] as CommandOptions,
};
