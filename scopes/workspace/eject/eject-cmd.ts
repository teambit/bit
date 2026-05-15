import type { Command, CommandOptions } from '@teambit/cli';
import type { Workspace } from '@teambit/workspace';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy.constants';
import { ejectTemplate } from './eject-template';
import type { EjectMain } from './eject.main.runtime';
import { ejectCommand } from './eject.commands';

export class EjectCmd implements Command {
  name = ejectCommand.name;
  description = ejectCommand.description;
  extendedDescription = ejectCommand.extendedDescription;
  helpUrl = ejectCommand.helpUrl;
  arguments = ejectCommand.arguments;
  alias = ejectCommand.alias;
  options = ejectCommand.options;
  loader = ejectCommand.loader;
  group = ejectCommand.group;

  constructor(
    private ejectMain: EjectMain,
    private workspace: Workspace
  ) {}

  async report(
    [pattern]: [string],
    {
      force = false,
      json = false,
      keepFiles = false,
      skipDependencyInstallation,
    }: {
      force: boolean;
      json: boolean;
      keepFiles: boolean;
      skipDependencyInstallation?: boolean;
    }
  ): Promise<string> {
    const componentIds = await this.workspace.idsByPattern(pattern);
    const ejectResults = await this.ejectMain.eject(componentIds, { force, keepFiles, skipDependencyInstallation });
    if (json) return JSON.stringify(ejectResults, null, 2);
    return ejectTemplate(ejectResults);
  }
}
