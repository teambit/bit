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

export const diffCommand: CommandDescriptor = {
  name: 'diff [component-pattern] [version] [to-version]',
  alias: '',
  description: 'compare component changes between versions or against the current workspace',
  extendedDescription: `shows a detailed diff of component files, dependencies, and configuration changes.
  by default, compares workspace changes against the latest version. specify versions to compare historical changes.
  supports pattern matching to filter components and various output formats for better readability.
  for ai-agent workflows, use --name-only to list what changed, --file to drill into a specific file,
  --files-only / --configs-only to focus on one diff category, or --json for machine-readable output.`,
  helpUrl: 'docs/components/merging-changes#compare-component-snaps',
  group: 'info-analysis',
  arguments: [
      {
        name: 'component-pattern',
        description: COMPONENT_PATTERN_HELP,
      },
      {
        name: 'version',
        description: `the base version to compare from. if omitted, compares the workspace's current files to the component's latest version.`,
      },
      {
        name: 'to-version',
        description: `the target version to compare against "version".
  if both "version" and "to-version" are provided, compare those two versions directly (ignoring the workspace).`,
      },
    ],
  loader: true,
  options: [
      ['p', 'parent', 'compare the specified "version" to its immediate parent instead of comparing to the current one'],
      ['v', 'verbose', 'show a more verbose output where possible'],
      ['t', 'table', 'show tables instead of plain text for dependencies diff'],
      [
        '',
        'file <paths>',
        'show only file diffs for the given component-relative path(s). comma-separated. implies --files-only',
      ],
      ['', 'files-only', 'show only file-content diffs; omit dependency, env, and aspect-config changes'],
      ['', 'configs-only', 'show only dependency, env, and aspect-config changes; omit file-content diffs'],
      ['', 'name-only', 'summary: list changed files with status (M/A/D) and changed field categories; no diff bodies'],
      ['', 'stat', 'summary: like --name-only but includes +N -M line counts per file'],
      ['j', 'json', 'return the diff result as json'],
    ] as CommandOptions,
  examples: [
      { cmd: 'diff', description: 'show diff for all modified components' },
      { cmd: 'diff foo', description: 'show diff for a component "foo"' },
      { cmd: 'diff foo 0.0.1', description: 'show diff for a component "foo" from the current state to version 0.0.1' },
      { cmd: 'diff foo 0.0.1 0.0.2', description: 'show diff for a component "foo" from version 0.0.1 to version 0.0.2' },
      {
        cmd: "diff '$codeModified' ",
        description: 'show diff only for components with modified files. ignore config changes',
      },
      {
        cmd: 'diff foo 0.0.2 --parent',
        description: 'compare "foo@0.0.2" to its parent version. showing what changed in 0.0.2',
      },
      { cmd: 'diff foo --name-only', description: 'list changed files and field categories without diff bodies' },
      { cmd: 'diff foo --file src/index.ts', description: 'show the diff of a single file in a component' },
      { cmd: 'diff foo --files-only', description: 'show only source-code diffs, skip dependency/config changes' },
      { cmd: 'diff foo --json', description: 'return the diff result as json for programmatic consumption' },
    ],
};
