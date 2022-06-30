import { BitError } from '@teambit/bit-error';
import chalk from 'chalk';
import { Command, CommandOptions } from '@teambit/cli';
import { unTagAction } from '@teambit/legacy/dist/api/consumer';
import { BASE_DOCS_DOMAIN, WILDCARD_HELP } from '@teambit/legacy/dist/constants';
import { untagResult } from '@teambit/legacy/dist/scope/component-ops/untag-component';

export default class ResetCmd implements Command {
  name = 'reset [component-name] [component-version]';
  description = 'revert tagged or snapped versions for component(s)';
  arguments = [
    {
      name: 'component-name',
      description: 'the component name or component id',
    },
    {
      name: 'component-version',
      description: 'the version to untag (semver for tags. hash for snaps)',
    },
  ];
  group = 'development';
  extendedDescription = `https://${BASE_DOCS_DOMAIN}/components/tags#undoing-a-tag
${WILDCARD_HELP('reset')}`;
  alias = '';
  options = [
    ['a', 'all', 'revert tag/snap for all tagged/snapped components'],
    ['', 'soft', 'revert only soft-tags (components tagged with --soft flag)'],
    [
      'f',
      'force',
      'revert the tag even if used as a dependency. WARNING: components that depend on this tag will corrupt',
    ],
  ] as CommandOptions;
  loader = true;
  migration = true;

  async report(
    [id, version]: [string, string],
    { all = false, force = false, soft = false }: { all?: boolean; force?: boolean; soft?: boolean }
  ) {
    if (!id && !all) {
      throw new BitError('please specify a component ID or use --all flag');
    }
    const getResults = () => {
      if (all && version) {
        version = id;
        return unTagAction(version, force, soft);
      }
      return unTagAction(version, force, soft, id);
    };

    const { results, isSoftUntag }: { results: untagResult[]; isSoftUntag: boolean } = await getResults();
    const titleSuffix = isSoftUntag ? 'soft-untagged (are not candidate for tagging anymore)' : 'untagged';
    const title = chalk.green(`${results.length} component(s) were ${titleSuffix}:\n`);
    const components = results.map((result) => {
      return `${chalk.cyan(result.id.toStringWithoutVersion())}. version(s): ${result.versions.join(', ')}`;
    });
    return title + components.join('\n');
  }
}
