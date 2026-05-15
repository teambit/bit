import chalk from 'chalk';
import { BitError } from '@teambit/bit-error';
import type { Command, CommandOptions } from '@teambit/cli';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy.constants';
import type { DiffOutputOptions, DiffResults, FileDiff } from '@teambit/legacy.component-diff';
import { countDiffLines, filterDiffResults, outputDiffResultsFormatted } from '@teambit/legacy.component-diff';
import type { ComponentCompareMain } from './component-compare.main.runtime';
import { diffCommand } from './component-compare.commands';

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
  name = diffCommand.name;
  group = diffCommand.group;
  description = diffCommand.description;
  extendedDescription = diffCommand.extendedDescription;
  helpUrl = diffCommand.helpUrl;
  arguments = diffCommand.arguments;
  alias = diffCommand.alias;
  options = diffCommand.options;
  examples = diffCommand.examples;
  loader = diffCommand.loader;

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
