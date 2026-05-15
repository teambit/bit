import { BitError } from '@teambit/bit-error';
import type { Command, CommandOptions } from '@teambit/cli';
import { formatItem, formatSuccessSummary } from '@teambit/cli';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy.constants';
import type { RemoveMain } from './remove.main.runtime';
import { recoverCommand } from './remove.commands';

export type RecoverOptions = {
  skipDependencyInstallation?: boolean;
  skipWriteConfigFiles?: boolean;
};

export class RecoverCmd implements Command {
  name = recoverCommand.name;
  description = recoverCommand.description;
  extendedDescription =
    recoverCommand.extendedDescription;
  arguments = recoverCommand.arguments;
  group = recoverCommand.group;
  options = recoverCommand.options;
  loader = recoverCommand.loader;

  constructor(private remove: RemoveMain) {}

  async report([componentPattern]: [string], options: RecoverOptions) {
    const recovered = await this.remove.recover(componentPattern, options);
    if (recovered.length === 0) {
      throw new BitError(`no soft-deleted components found matching pattern "${componentPattern}"`);
    }
    const items = recovered.map((id) => formatItem(id.toString()));
    return `${formatSuccessSummary('successfully recovered the following component(s)')}\n${items.join('\n')}`;
  }
}
