import { Command, CommandOptions } from '@teambit/cli';
import { Workspace } from '@teambit/workspace';
import ejectTemplate from '@teambit/legacy/dist/cli/templates/eject-template';
import { Logger } from '@teambit/logger';
import { ComponentsEjector } from './components-ejector';

export class EjectCmd implements Command {
  name = 'eject <component-pattern>';
  description = 'replace components maintained in the workspace with their corresponding packages';
  arguments = [
    {
      name: 'component-pattern',
      description:
        'component name, component id, or component pattern.\nuse component pattern to select multiple components. use comma to separate patterns and "!" to exclude. e.g. "ui/**, !ui/button"\nwrap the pattern with quotes',
    },
  ];
  alias = 'E';
  options = [
    ['f', 'force', 'ignore local version. remove the components even when they are staged or modified'],
    ['j', 'json', 'print the results in JSON format'],
    ['', 'keep-files', 'keep the component files in the workspace intact'],
  ] as CommandOptions;
  loader = true;
  migration = true;
  group = 'development';

  constructor(private workspace: Workspace, private logger: Logger) {}

  async report(
    [pattern]: [string],
    { force = false, json = false, keepFiles = false }: { force: boolean; json: boolean; keepFiles: boolean }
  ): Promise<string> {
    const componentIds = await this.workspace.idsByPattern(pattern);
    const componentEjector = new ComponentsEjector(this.workspace, this.logger, componentIds, { force, keepFiles });
    const ejectResults = await componentEjector.eject();
    if (json) return JSON.stringify(ejectResults, null, 2);
    return ejectTemplate(ejectResults);
  }
}
