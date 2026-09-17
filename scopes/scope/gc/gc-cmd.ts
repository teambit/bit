import chalk from 'chalk';
import type { Command, CommandOptions } from '@teambit/cli';
import { formatHint, formatItem, formatSuccessSummary, formatTitle, joinSections } from '@teambit/cli';
import { BitError } from '@teambit/bit-error';
import type { GcResult } from '@teambit/legacy.scope';
import type { GcMain } from './gc.main.runtime';

export type GcCmdOpts = {
  dryRun?: boolean;
  keepVersions?: string;
  backup?: boolean;
  restore?: boolean;
  restoreOverwrite?: boolean;
  verbose?: boolean;
  json?: boolean;
};

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export class GcCmd implements Command {
  name = 'gc';
  description = 'remove objects from the local scope that are no longer needed';
  extendedDescription: string;
  group = 'system';
  alias = '';
  options = [
    ['d', 'dry-run', 'show what would be removed without removing anything'],
    [
      '',
      'keep-versions <number>',
      'keep the last <number> versions of each workspace component, so their recent history stays available offline',
    ],
    ['', 'backup', 'move the objects into a "deleted-objects" directory instead of deleting them. frees no disk space'],
    ['', 'restore', 'restore the objects of a previous run that used --backup'],
    ['', 'restore-overwrite', 'same as --restore, but overwrite objects that already exist'],
    ['v', 'verbose', 'log every object being removed'],
    ['j', 'json', 'return the results in json format'],
  ] as CommandOptions;
  loader = true;
  skipWorkspace = true;

  constructor(private gc: GcMain) {
    this.extendedDescription = `a workspace keeps every version of every component it has ever imported. each new version brings
the source files of that version with it, and nothing removes the ones it superseded, so the local
scope keeps growing - often to several gigabytes.

this command removes the versions nothing points at anymore. it keeps the version each component is
checked out at, every head (of the workspace, of its lanes and of the remotes it tracks), anything
snapped locally and not exported yet, and the dependencies of all of those. everything it removes
can be fetched again from the remote on demand, which bit already does whenever a version it needs
is not in the local scope.

the trade-off is that history is no longer local: "bit log", "bit blame" and diffing against an old
version will fetch from the remote instead of answering offline. use --keep-versions to keep the
last few versions of each workspace component if that matters to you.

run with --dry-run first to see how much there is to gain.

in a bare scope (a scope that is not backed by a workspace) this instead runs the collector that
keeps all history, since there the scope is the source of truth rather than a cache.`;
  }

  async report(args: [], opts: GcCmdOpts) {
    if (opts.restore || opts.restoreOverwrite) {
      await this.gc.restore(Boolean(opts.restoreOverwrite));
      return formatSuccessSummary('restored the objects of the previous run');
    }
    const result = await this.runGc(opts);
    if (!result) return formatSuccessSummary('garbage collection completed');
    return this.formatResult(result);
  }

  async json(args: [], opts: GcCmdOpts) {
    if (opts.restore || opts.restoreOverwrite) {
      await this.gc.restore(Boolean(opts.restoreOverwrite));
      return { restored: true };
    }
    return (await this.runGc(opts)) || { completed: true };
  }

  private async runGc(opts: GcCmdOpts) {
    return this.gc.garbageCollect({
      dryRun: opts.dryRun,
      verbose: opts.verbose,
      backup: opts.backup,
      keepVersions: parseKeepVersions(opts.keepVersions),
    });
  }

  private formatResult(result: GcResult): string {
    const sizeAfter = result.totalSize - result.deletedSize;
    const header = result.dryRun
      ? formatTitle(`[dry-run] ${result.deletedObjects} of ${result.totalObjects} objects can be removed`)
      : formatSuccessSummary(`removed ${result.deletedObjects} objects, freed ${formatBytes(result.deletedSize)}`);

    const sizeLine = formatItem(
      `scope: ${formatBytes(result.totalSize)} ${chalk.dim('→')} ${chalk.bold(formatBytes(sizeAfter))}` +
        (result.dryRun ? ` ${chalk.dim(`(would free ${formatBytes(result.deletedSize)})`)}` : '')
    );
    const byType = Object.entries(result.deletedByType).map(([type, stats]) =>
      formatItem(`${type}: ${stats.count} objects ${chalk.dim(`(${formatBytes(stats.size)})`)}`)
    );
    const keptLine = formatItem(`keeping ${result.keptVersions} versions and everything they point at`);
    const strayLine = result.strayFiles
      ? formatItem(
          `${result.strayFiles} leftover temp ${result.strayFiles === 1 ? 'file' : 'files'} of interrupted writes`
        )
      : '';

    const hints: string[] = [];
    if (result.dryRun && result.deletedObjects) hints.push(formatHint('re-run without --dry-run to remove them'));
    if (result.backupDir) {
      hints.push(
        formatHint(`objects were moved to ${result.backupDir}. no disk space was freed until it is removed.`),
        formatHint('run "bit gc --restore" to bring them back')
      );
    }
    if (!result.dryRun && result.deletedObjects) {
      hints.push(formatHint('anything removed will be fetched from the remote again when it is needed'));
    }

    const summary = [sizeLine, ...byType, keptLine, strayLine].filter(Boolean).join('\n');
    return joinSections([`${header}\n${summary}`, hints.join('\n')]);
  }
}

function parseKeepVersions(value?: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new BitError(`--keep-versions expects a non-negative integer, got "${value}"`);
  }
  return parsed;
}
