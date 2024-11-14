import { BitError } from '@teambit/bit-error';
import chalk from 'chalk';
import { Command, CommandOptions } from '@teambit/cli';
import { BASE_DOCS_DOMAIN, COMPONENT_PATTERN_HELP } from '@teambit/legacy/dist/constants';
import { SnappingMain } from './snapping.main.runtime';

export default class ResetCmd implements Command {
  name = 'reset [component-pattern]';
  description = 'revert tagged or snapped versions for component(s)';
  arguments = [
    {
      name: 'component-pattern',
      description: COMPONENT_PATTERN_HELP,
    },
    {
      name: 'component-version',
      description: 'the version to untag (semver for tags. hash for snaps)',
    },
  ];
  group = 'development';
  extendedDescription = `${BASE_DOCS_DOMAIN}components/tags#undoing-a-tag`;
  alias = '';
  options = [
    ['a', 'all', 'revert all unexported tags/snaps for all components'],
    ['', 'head', 'revert the head tag/snap only (by default, all local tags/snaps are reverted)'],
    ['', 'soft', 'revert only soft-tags (components tagged with --soft flag)'],
    [
      'f',
      'force',
      "revert the tag even if it's used as a dependency. WARNING: components that depend on this tag will be corrupted",
    ],
    ['', 'never-exported', 'reset only components that were never exported'],
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
      neverExported = false,
    }: { all?: boolean; head?: boolean; force?: boolean; soft?: boolean; neverExported?: boolean }
  ) {
    if (neverExported) {
      const compIds = await this.snapping.resetNeverExported();
      return chalk.green(`successfully reset the following never-exported components:\n${compIds.join('\n')}`);
    }
    if (!pattern && !all) {
      throw new BitError('please specify a component-pattern or use --all flag');
    }
    if (pattern && all) {
      throw new BitError('please specify either a component-pattern or --all flag, not both');
    }
    if (soft && head) {
      throw new BitError('please specify either --soft or --head flag, not both');
    }
    const { results, isSoftUntag } = await this.snapping.reset(pattern, head, force, soft);
    const titleSuffix = isSoftUntag ? 'soft-untagged (are not candidates for tagging any more)' : 'reset';
    const title = chalk.green(`${results.length} component(s) were ${titleSuffix}:\n`);
    const components = results.map((result) => {
      return `${chalk.cyan(result.id.toStringWithoutVersion())}. version(s): ${result.versions.join(', ')}`;
    });
    return title + components.join('\n');
  }
}
