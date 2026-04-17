import chalk from 'chalk';
import { BitError } from '@teambit/bit-error';
import type { Command, CommandOptions } from '@teambit/cli';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy.constants';
import type { DiffOutputOptions, DiffResults, FileDiff } from '@teambit/legacy.component-diff';
import { countDiffLines, filterDiffResults, outputDiffResultsFormatted } from '@teambit/legacy.component-diff';
import type { ComponentCompareMain } from './component-compare.main.runtime';

type DiffFlags = {
  verbose?: boolean;
  table?: boolean;
  parent?: boolean;
  file?: string;
  filesOnly?: boolean;
  configsOnly?: boolean;
  nameOnly?: boolean;
  stat?: boolean;
  json?: boolean;
};

export class DiffCmd implements Command {
  name = 'diff [component-pattern] [version] [to-version]';
  group = 'info-analysis';
  description = 'compare component changes between versions or against the current workspace';
  extendedDescription = `shows a detailed diff of component files, dependencies, and configuration changes.
by default, compares workspace changes against the latest version. specify versions to compare historical changes.
supports pattern matching to filter components and various output formats for better readability.
for ai-agent workflows, use --name-only to list what changed, --file to drill into a specific file,
--files-only / --configs-only to focus on one diff category, or --json for machine-readable output.`;
  helpUrl = 'docs/components/merging-changes#compare-component-snaps';
  arguments = [
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
  ];
  alias = '';
  options = [
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
  ] as CommandOptions;
  examples = [
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
  ];
  loader = true;

  constructor(private componentCompareMain: ComponentCompareMain) {}

  async report([pattern, version, toVersion]: [string, string, string], flags: DiffFlags) {
    const outputOpts = this.parseOutputOpts(flags);
    const diffResults = await this.runDiff([pattern, version, toVersion], flags);
    if (!diffResults.length) {
      return chalk.yellow('there are no modified components to diff');
    }
    return outputDiffResultsFormatted(diffResults, outputOpts);
  }

  async json([pattern, version, toVersion]: [string, string, string], flags: DiffFlags) {
    const outputOpts = this.parseOutputOpts(flags);
    const diffResults = await this.runDiff([pattern, version, toVersion], flags);
    const filtered = filterDiffResults(diffResults, outputOpts);
    return filtered.map((result) => ({
      id: result.id.toStringWithoutVersion(),
      hasDiff: result.hasDiff,
      filesDiff: result.filesDiff
        ?.filter((fd) => fd.status !== 'UNCHANGED' && fd.diffOutput)
        .map((fd) => this.projectFileDiffForJson(fd, outputOpts)),
      fieldsDiff: result.fieldsDiff,
    }));
  }

  private projectFileDiffForJson(fd: FileDiff, opts: DiffOutputOptions) {
    const { filePath, status } = fd;
    if (opts.stat) {
      return { filePath, status, ...countDiffLines(fd.diffOutput) };
    }
    if (opts.nameOnly) {
      return { filePath, status };
    }
    return { filePath, status, diffOutput: fd.diffOutput };
  }

  private async runDiff(
    [pattern, version, toVersion]: [string, string, string],
    { verbose = false, table = false, parent }: DiffFlags
  ): Promise<DiffResults[]> {
    return this.componentCompareMain.diffByCLIValues(pattern, version, toVersion, {
      verbose,
      table,
      parent,
    });
  }

  private parseOutputOpts(flags: DiffFlags): DiffOutputOptions {
    const { file, filesOnly, configsOnly, nameOnly, stat } = flags;
    const files = file
      ? file
          .split(',')
          .map((f) => f.trim())
          .filter(Boolean)
      : undefined;

    if (filesOnly && configsOnly) {
      throw new BitError('--files-only and --configs-only are mutually exclusive');
    }
    if (configsOnly && files && files.length) {
      throw new BitError('--file and --configs-only are mutually exclusive');
    }
    if (nameOnly && stat) {
      throw new BitError('--name-only and --stat are mutually exclusive');
    }

    return {
      filesOnly: filesOnly || Boolean(files && files.length),
      configsOnly,
      files,
      nameOnly,
      stat,
    };
  }
}
