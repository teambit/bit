import chalk from 'chalk';
import { prompt } from 'enquirer';
import type { Command, CommandOptions } from '@teambit/cli';
import {
  canPromptUser,
  errorSymbol,
  formatHint,
  formatItem,
  formatSection,
  formatSuccessSummary,
  formatWarningSummary,
  joinSections,
  warnSymbol,
} from '@teambit/cli';
import { BitError } from '@teambit/bit-error';
import type { Logger } from '@teambit/logger';
import type { ScopeMain } from '@teambit/scope';
import type { DeletePendingExportResult, ProbePendingExportResult } from './export-scope-components';
import { deletePendingExport, probePendingExport, resumeExport } from './export-scope-components';

export type ResumeExportOptions = { delete?: boolean; force?: boolean };

export class ResumeExportCmd implements Command {
  name = 'resume-export <export-id> <remotes...>';
  description = 'EXPERIMENTAL. resume failed export';
  extendedDescription = `resume failed export to persist the pending objects on the given remotes.
the export-id is the id the client received in the error message during the failure.
alternatively, exporting to any one of the failed scopes, throws server-is-busy error with the export-id.

"--delete" discards the pending objects instead of persisting them, which frees the export-queue of these
scopes. it is only the right move when no scope has persisted this export yet, e.g. when it failed during
the validation step, or when the export was abandoned and is now blocking others. if the export failed
during the persist step, some scopes are already updated - deleting the rest would leave them with
dependencies that were never exported, so run without "--delete" to persist the remaining scopes instead.
the command checks which scopes still hold the pending objects and asks for confirmation before deleting.
pass all the scopes that were used for the export, the export error lists them`;
  alias = '';
  options = [
    ['', 'delete', 'discard the pending objects of this export-id instead of persisting them'],
    ['', 'force', 'for --delete, skip the confirmation prompt. needed when running non-interactively'],
  ] as CommandOptions;
  loader = true;
  group = 'advanced';
  private = true;
  remoteOp = true;

  constructor(
    private scope: ScopeMain,
    private logger: Logger
  ) {}

  async report([exportId, remotes]: [string, string[]], options: ResumeExportOptions): Promise<string> {
    if (options.delete) return this.deletePendingObjects(exportId, remotes, Boolean(options.force));
    const exportedIds = await resumeExport(this.scope.legacyScope, exportId, remotes);
    if (!exportedIds.length) return chalk.yellow('no components were left to persist for this export-id');
    return `the following components were persisted successfully:
${exportedIds.join('\n')}`;
  }

  private async deletePendingObjects(exportId: string, remotes: string[], force: boolean): Promise<string> {
    const probe = await probePendingExport(this.scope.legacyScope, exportId, remotes);
    const probeFailed = Object.keys(probe.failed);
    if (probeFailed.length === remotes.length) {
      throw new BitError(`failed reaching all the given scopes:
${probeFailed.map((scopeName) => `${scopeName} - ${probe.failed[scopeName]}`).join('\n')}`);
    }
    // a scope that reports "absent" has nothing for us to delete, so leave it out of the request entirely.
    const scopesToClear = [...probe.present, ...probe.unknown];
    if (!scopesToClear.length) {
      const nothingFound = `no pending objects of "${exportId}" were found, nothing to delete`;
      return joinSections([
        this.formatFailedSection(probe.failed),
        // don't call it a success when some scopes never answered - they may well be holding the objects
        probeFailed.length
          ? formatWarningSummary(`${nothingFound} on the scopes that answered`)
          : formatSuccessSummary(nothingFound),
      ]);
    }
    // print what the probe found in both modes. "--force" skips the prompt, not the findings
    this.logger.console(this.formatProbeResult(exportId, probe, scopesToClear));
    if (!force) await this.confirmDeletion(exportId, scopesToClear);
    const result = await deletePendingExport(this.scope.legacyScope, exportId, scopesToClear);
    return this.formatDeleteResult(exportId, result, probe);
  }

  /**
   * the whole point of the probe: show what was found before destroying it, loudest when a scope
   * reports "absent" and so this export may be partially persisted already.
   */
  private formatProbeResult(exportId: string, probe: ProbePendingExportResult, scopesToClear: string[]): string {
    const sections: string[] = [
      formatSection(
        'pending objects to delete',
        `(of the export-id "${exportId}")`,
        scopesToClear.map((scopeName) => formatItem(scopeName))
      ),
    ];
    // any "absent" scope is a possible partial persist, whether the rest answered "present" or are
    // unknown old servers. unknown scopes get deleted too, so the warning matters just as much there.
    if (probe.absent.length) {
      sections.push(
        formatSection(
          `${warnSymbol} scopes that no longer hold these objects`,
          `a scope drops the pending objects as soon as it persisted them, so this export may be
partially persisted already. if it is, deleting the rest leaves these scopes with
dependencies that were never exported. run without "--delete" to persist instead.`,
          probe.absent.map((scopeName) => formatItem(scopeName, warnSymbol))
        )
      );
    }
    if (probe.unknown.length) {
      sections.push(
        formatWarningSummary(
          `${probe.unknown.length} scope(s) run a server that can't report whether anything is pending, so the check above skipped them`
        )
      );
    }
    sections.push(this.formatFailedSection(probe.failed));
    return joinSections(sections);
  }

  private async confirmDeletion(exportId: string, scopesToClear: string[]): Promise<void> {
    if (!canPromptUser()) {
      throw new BitError(`unable to prompt for confirmation in a non-interactive terminal.
review the list above and re-run with "--force" to delete`);
    }
    let confirmed = false;
    try {
      ({ confirmed } = await prompt<{ confirmed: boolean }>({
        type: 'confirm',
        name: 'confirmed',
        initial: false,
        message: `delete the pending objects of "${exportId}" from ${scopesToClear.length} scope(s)? this cannot be undone`,
      }));
    } catch (err: any) {
      // enquirer throws an empty string when the prompt is canceled with Ctrl+C. see
      // https://github.com/enquirer/enquirer/issues/225
      if (err) throw err;
    }
    if (!confirmed) throw new BitError('aborted, nothing was deleted');
  }

  private formatDeleteResult(
    exportId: string,
    result: DeletePendingExportResult,
    probe: ProbePendingExportResult
  ): string {
    const { removed, notFound, unknown } = result;
    // a scope whose probe failed was never attempted, so it may still be holding the objects and
    // blocking the queue. it belongs in the final report just as much as a failed deletion does,
    // and with "--force" this is the only place the user gets to see it.
    const failed = { ...probe.failed, ...result.failed };
    const failedScopes = Object.keys(failed);
    if (!removed.length && !notFound.length && !unknown.length) {
      // every scope failed. "notFound" counts as an answer, so this list is never empty here
      throw new BitError(`failed removing the pending objects of "${exportId}" from all the given scopes:
${failedScopes.map((scopeName) => `${scopeName} - ${failed[scopeName]}`).join('\n')}`);
    }
    const cleared = removed.length + unknown.length;
    const clearedMsg = `deleted the pending objects of "${exportId}" from ${cleared} scope(s)`;
    let summary: string;
    if (failedScopes.length) summary = formatWarningSummary(`${clearedMsg}, ${failedScopes.length} failed`);
    // the scopes persisted between the probe and the deletion, so there was nothing left to delete
    else if (!cleared) summary = formatSuccessSummary(`nothing was pending anymore, no objects were deleted`);
    else summary = formatSuccessSummary(clearedMsg);
    const skipped = probe.absent.length + notFound.length;
    const hints = [
      unknown.length ? formatHint(`(${unknown.length} scope(s) don't report what they removed)`) : '',
      skipped ? formatHint(`(${skipped} scope(s) had nothing pending and were left untouched)`) : '',
    ];
    return joinSections([this.formatFailedSection(failed), summary, ...hints]);
  }

  private formatFailedSection(failed: { [scopeName: string]: string }): string {
    return formatSection(
      `${errorSymbol} failed scopes`,
      '(these scopes could not be reached, nothing was deleted from them)',
      Object.keys(failed).map((scopeName) => formatItem(`${scopeName} - ${failed[scopeName]}`, errorSymbol))
    );
  }
}
