import { Command, CommandOptions } from '@teambit/cli';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy/dist/constants';
import { ComponentID } from '@teambit/component-id';
import chalk from 'chalk';
import { StatusMain } from './status.main.runtime';

export default class MiniStatusCmd implements Command {
  name = 'mini-status [component-pattern]';
  description = 'EXPERIMENTAL. basic status for fast execution';
  extendedDescription = `shows only modified/new components. for the full status, use "bit status".
the modified are components that their source code have changed, it doesn't check for config/aspect changes`;
  arguments = [
    {
      name: 'component-pattern',
      description: COMPONENT_PATTERN_HELP,
    },
  ];
  group = 'development';
  alias = 'ms';
  options = [] as CommandOptions;
  loader = true;

  constructor(private status: StatusMain) {}

  async report([pattern]: [string]) {
    const { modified, newComps } = await this.status.statusMini(pattern);
    const outputSection = (title: string, ids: ComponentID[]) => {
      const titleStr = chalk.bold(title);
      const idsStr = ids.length ? ids.map((id) => id.toStringWithoutVersion()).join('\n') : '<none>';
      return `${titleStr}:\n${idsStr}`;
    };
    const modifiedOutput = outputSection('modified components (files only)', modified);
    const newOutput = outputSection('new components', newComps);
    return `${modifiedOutput}\n\n${newOutput}`;
  }
}
