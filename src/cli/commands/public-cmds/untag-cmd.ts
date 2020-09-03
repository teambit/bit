import chalk from 'chalk';

import { unTagAction } from '../../../api/consumer';
import { BASE_DOCS_DOMAIN, WILDCARD_HELP } from '../../../constants';
import GeneralError from '../../../error/general-error';
import { untagResult } from '../../../scope/component-ops/untag-component';
import { CommandOptions, LegacyCommand } from '../../legacy-command';

export default class Untag implements LegacyCommand {
  name = 'untag [id] [version]';
  description = `revert version(s) tagged for component(s)
  For Harmony, without "--persisted" flag, it removes only the soft-tags.
  https://${BASE_DOCS_DOMAIN}/docs/tag-component-version#untagging-components
  ${WILDCARD_HELP('untag')}`;
  alias = '';
  opts = [
    ['a', 'all', 'revert tag for all tagged components'],
    ['', 'persisted', 'harmony - revert not only the soft-tags but also the actual tags'],
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
    { all = false, force = false, persisted = false }: { all?: boolean; force?: boolean; persisted?: boolean }
  ): Promise<{ results: untagResult[]; isSoftUntag: boolean }> {
    if (!id && !all) {
      throw new GeneralError('please specify a component ID or use --all flag');
    }

    if (all) {
      version = id;
      return unTagAction(version, force, persisted);
    }
    return unTagAction(version, force, persisted, id);
  }

  report({ results, isSoftUntag }: { results: untagResult[]; isSoftUntag: boolean }): string {
    const titleSuffix = isSoftUntag ? 'soft-untagged (are not candidate for tagging anymore)' : 'untagged';
    const title = chalk.green(`${results.length} component(s) were ${titleSuffix}:\n`);
    const softTagSuggestion = isSoftUntag
      ? chalk.bold('\nto actually remove the local tags, use --persisted flag')
      : '';
    const components = results.map((result) => {
      return `${chalk.cyan(result.id.toStringWithoutVersion())}. version(s): ${result.versions.join(', ')}`;
    });
    return title + components.join('\n') + softTagSuggestion;
  }
}
