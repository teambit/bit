import { Command, CommandOptions } from '@teambit/cli';
import { OutsideWorkspaceError, Workspace } from '@teambit/workspace';
import ejectTemplate from '@teambit/legacy/dist/cli/templates/eject-template';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy/dist/constants';
import { Logger } from '@teambit/logger';
import { InstallMain } from '@teambit/install';
import { ComponentsEjector } from './components-ejector';

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
    ['j', 'json', 'print the results in JSON format'],
    ['', 'keep-files', 'keep the component files in the workspace intact'],
  ] as CommandOptions;
  loader = true;
  migration = true;
  group = 'development';

  constructor(private workspace: Workspace, private logger: Logger, private install: InstallMain) {}

  async report(
    [pattern]: [string],
    { force = false, json = false, keepFiles = false }: { force: boolean; json: boolean; keepFiles: boolean }
  ): Promise<string> {
    if (!this.workspace) throw new OutsideWorkspaceError();
    const componentIds = await this.workspace.idsByPattern(pattern);
    const componentEjector = new ComponentsEjector(this.workspace, this.install, this.logger, componentIds, {
      force,
      keepFiles,
    });
    const ejectResults = await componentEjector.eject();
    if (json) return JSON.stringify(ejectResults, null, 2);
    return ejectTemplate(ejectResults);
  }
}
