import chalk from 'chalk';

import { unTagAction } from '../../../api/consumer';
import { BASE_DOCS_DOMAIN, WILDCARD_HELP } from '../../../constants';
import GeneralError from '../../../error/general-error';
import { untagResult } from '../../../scope/component-ops/untag-component';
import { Group } from '../../command-groups';
import { CommandOptions, LegacyCommand } from '../../legacy-command';

export default class Untag implements LegacyCommand {
  name = 'untag [id] [version]';
  shortDescription = 'revert versions tagged for component(s)';
  group: Group = 'development';
  description = `revert version(s) tagged for component(s)
  https://${BASE_DOCS_DOMAIN}/docs/tag-component-version#untagging-components
  ${WILDCARD_HELP('untag')}`;
  alias = '';
  opts = [
    ['a', 'all', 'revert tag for all tagged components'],
    ['', 'soft', 'harmony - revert only soft-tags (components tagged with --soft flag)'],
    [
      'f',
      'force',
      'revert the tag even if used as a dependency. WARNING: components that depend on this tag will corrupt',
    ],
  ] as CommandOptions;
  loader = true;
  migration = true;

  action(
    [id, version]: [string, string],
    { all = false, force = false, soft = false }: { all?: boolean; force?: boolean; soft?: boolean }
  ): Promise<{ results: untagResult[]; isSoftUntag: boolean }> {
    if (!id && !all) {
      throw new GeneralError('please specify a component ID or use --all flag');
    }

    if (all) {
      version = id;
      return unTagAction(version, force, soft);
    }
    return unTagAction(version, force, soft, id);
  }

  report({ results, isSoftUntag }: { results: untagResult[]; isSoftUntag: boolean }): string {
    const titleSuffix = isSoftUntag ? 'soft-untagged (are not candidate for tagging anymore)' : 'untagged';
    const title = chalk.green(`${results.length} component(s) were ${titleSuffix}:\n`);
    const components = results.map((result) => {
      return `${chalk.cyan(result.id.toStringWithoutVersion())}. version(s): ${result.versions.join(', ')}`;
    });
    return title + components.join('\n');
  }
}
