import type { Command } from '@teambit/cli';
import { formatItem, formatSuccessSummary, formatHint, joinSections } from '@teambit/cli';
import { PATTERN_HELP, COMPONENT_PATTERN_HELP } from '@teambit/legacy.constants';
import type { Workspace } from '../workspace';
import { installAfterEnvChangesMsg } from './envs-set.cmd';

export class EnvsUnsetCmd implements Command {
  name = 'unset <component-pattern>';
  description = 'un-sets an env from components that were previously set by "bit env set" or by a component template';
  arguments = [
    {
      name: 'component-pattern',
      description: COMPONENT_PATTERN_HELP,
    },
  ];
  options = [];
  group = 'component-config';
  extendedDescription = `keep in mind that this doesn't remove envs that are set via variants.
in only removes envs that appear in the .bitmap file, which were previously configured via "bit env set".
the purpose of this command is to reset previously assigned envs to either allow variants configure the env or use the base node env.
${PATTERN_HELP('env unset')}`;

  constructor(private workspace: Workspace) {}

  async report([pattern]: [string]) {
    const componentIds = await this.workspace.idsByPattern(pattern);
    const { changed } = await this.workspace.unsetEnvFromComponents(componentIds);
    if (!changed.length) {
      return formatHint(`unable to find components matching the pattern with env configured in the .bitmap file`);
    }
    const items = changed.map((id) => formatItem(id.toString()));
    return joinSections([
      formatSuccessSummary('removed .bitmap env configuration from the following component(s)'),
      items.join('\n'),
      installAfterEnvChangesMsg,
    ]);
  }
}
