import { BitError } from '@teambit/bit-error';
import chalk from 'chalk';
import yesno from 'yesno';
import type { Command, CommandOptions } from '@teambit/cli';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy.constants';
import type { SnappingMain } from './snapping.main.runtime';

export default class ResetCmd implements Command {
  name = 'reset [component-pattern]';
  description = 'revert local tags and snaps to previous versions';
  arguments = [
    {
      name: 'component-pattern',
      description: COMPONENT_PATTERN_HELP,
    },
  ];
  group = 'version-control';
  extendedDescription = `removes local component versions (tags/snaps) that haven't been exported yet.
if no component-pattern is provided, resets all components (with confirmation prompt).
by default reverts all local versions of each component. use --head to revert only the latest version.
useful for undoing mistakes before exporting. exported versions cannot be reset.`;
  alias = '';
  options = [
    ['a', 'all', 'DEPRECATED. this is now the default behavior when no component-pattern is provided'],
    ['', 'head', 'revert the head tag/snap only (by default, all local tags/snaps are reverted)'],
    ['', 'soft', 'revert only soft-tags (components tagged with --soft flag)'],
    [
      'f',
      'force',
      "revert the tag even if it's used as a dependency. WARNING: components that depend on this tag will be corrupted",
    ],
    ['', 'never-exported', 'reset only components that were never exported'],
    ['s', 'silent', 'skip confirmation when resetting all components'],
  ] as CommandOptions;
  loader = true;

  constructor(private snapping: SnappingMain) {}

  async report(
    [pattern]: [string],
    {
      all = false,
      head = false,
      force = false,
      soft = false,
      silent = false,
      neverExported = false,
    }: { all?: boolean; head?: boolean; force?: boolean; soft?: boolean; silent?: boolean; neverExported?: boolean }
  ) {
    if (neverExported) {
      const compIds = await this.snapping.resetNeverExported();
      return chalk.green(`successfully reset the following never-exported components:\n${compIds.join('\n')}`);
    }
    if (soft && head) {
      throw new BitError('please specify either --soft or --head flag, not both');
    }
    // if no pattern provided, reset all components (with confirmation unless --silent or --all)
    if (!pattern && !silent && !all) {
      await this.promptForResetAll();
    }
    const { results, isSoftUntag } = await this.snapping.reset(pattern, head, force, soft);
    const titleSuffix = isSoftUntag ? 'soft-untagged (are not candidates for tagging any more)' : 'reset';
    const title = chalk.green(`${results.length} component(s) were ${titleSuffix}:\n`);
    const components = results.map((result) => {
      return `${chalk.cyan(result.id.toStringWithoutVersion())}. version(s): ${result.versions.join(', ')}`;
    });
    return title + components.join('\n');
  }

  private async promptForResetAll() {
    this.snapping.logger.clearStatusLine();
    const ok = await yesno({
      question: `${chalk.bold('This will reset all local tags/snaps for all components. Would you like to proceed? [yes(y)/no(n)]')}`,
    });
    if (!ok) {
      throw new BitError('the operation has been canceled');
    }
  }
}
