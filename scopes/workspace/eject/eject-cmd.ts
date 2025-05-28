import { Command, CommandOptions } from '@teambit/cli';
import { Workspace } from '@teambit/workspace';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy.constants';
import { ejectTemplate } from './eject-template';
import { EjectMain } from './eject.main.runtime';

export class EjectCmd implements Command {
  name = 'eject <component-pattern>';
  description = 'remove component from the workspace and install it instead as a regular npm package.';
  extendedDescription = 'By default the component files will be removed from the workspace';
  helpUrl = 'reference/components/exporting-components#ejecting-components';
  arguments = [
    {
      name: 'component-pattern',
      description: COMPONENT_PATTERN_HELP,
    },
  ];
  alias = 'E';
  options = [
    [
      'f',
      'force',
      'ignore local changes/versions. eject component/s even when they are staged or modified. Note: unexported tags/snaps will be lost',
    ],
    ['x', 'skip-dependency-installation', 'do not auto-install dependencies'],
    ['j', 'json', 'print the results in JSON format'],
    ['', 'keep-files', 'keep the component files in the workspace intact'],
  ] as CommandOptions;
  loader = true;
  group = 'component-config';

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
