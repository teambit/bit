import { BASE_DOCS_DOMAIN, WILDCARD_HELP } from '../../../constants';
import { Group } from '../../command-groups';
import { CommandOptions, LegacyCommand } from '../../legacy-command';

export default class Untag implements LegacyCommand {
  name = 'untag [component-name] [component-version]';
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
  group: Group = 'development';
  extendedDescription = `https://${BASE_DOCS_DOMAIN}/components/tags#undoing-a-tag
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
  private = true;

  action(): any {
    // eslint-disable-next-line no-console
    throw new Error(`"bit untag" has been removed, please use "bit reset" instead`);
  }

  report(): string {
    throw new Error(`"bit untag" has been removed, please use "bit reset" instead`);
  }
}
