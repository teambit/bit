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

export const listCommand: CommandDescriptor = {
  name: 'list [remote-scope]',
  alias: 'ls',
  description: 'display components in workspace or remote scope',
  extendedDescription: `shows components in the current workspace by default, or from a specified remote scope.
  supports filtering by scope, namespace, and various display options.
  use --outdated to highlight components that have newer versions available.`,
  helpUrl: 'reference/reference/cli-reference#list',
  group: 'info-analysis',
  remoteOp: true,
  skipWorkspace: true,
  loader: true,
  // `list` only reads bitmap + scope cache; it doesn't need workspace
  // aspects resolved per component. Skipping `loadAspects` lets the
  // `workspace.cli.registerOnStart` hook exit early, which saves a
  // significant chunk on workspaces with many configured extensions.
  loadAspects: false,
  options: [
      ['i', 'ids', 'show only component ids, unformatted'],
      ['l', 'local-scope', 'show only components stored in the local scope, including indirect dependencies'],
      ['s', 'scope <string>', 'filter components by their scope name (e.g., teambit.workspace)'],
      ['o', 'outdated', 'highlight outdated components, in comparison with their latest remote version (if one exists)'],
      ['d', 'include-deleted', 'EXPERIMENTAL. show also deleted components'],
      ['j', 'json', 'show the output in JSON format'],
      [
        'n',
        'namespace <string>',
        "filter components by their namespace (a logical grouping within a scope, e.g., 'ui', '*/ui')",
      ],
    ] as CommandOptions,
};

export const searchCommand: CommandDescriptor = {
  name: 'search <query...>',
  description: 'search for components by keyword in the local workspace and remote bit cloud',
  extendedDescription: `runs the provided query terms in parallel against bit cloud and against the local workspace.
  multiple queries are unioned (deduplicated) in the output. by default, remote results are filtered by the
  owner extracted from the workspace's defaultScope; use --owners or --skip-auto-owner to change this.`,
  group: 'info-analysis',
  remoteOp: true,
  skipWorkspace: true,
  loader: true,
  options: [
      ['o', 'owners <list>', 'comma-separated list of owners/orgs to filter remote results by'],
      ['', 'skip-auto-owner', 'do not auto-extract owner from workspace defaultScope'],
      ['r', 'remote-only', 'only search remote bit cloud, skip local workspace'],
      ['l', 'local-only', 'only search the local workspace, skip remote bit cloud'],
      ['j', 'json', 'show the output in JSON format'],
    ] as CommandOptions,
};
