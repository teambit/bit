import { Command, CommandOptions } from '@teambit/cli';
import { Workspace } from '@teambit/workspace';
import ejectTemplate from '@teambit/legacy/dist/cli/templates/eject-template';
import { Logger } from '@teambit/logger';
import { compact } from 'lodash';
import { ComponentsEjector } from './components-ejector';

export class EjectCmd implements Command {
  name = 'eject <id...>';
  description = 'replaces the components from the local scope with the corresponding packages';
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
    [ids]: [string[]],
    { force = false, json = false, keepFiles = false }: { force: boolean; json: boolean; keepFiles: boolean }
  ): Promise<string> {
    const bitIds = ids.map((id) => this.workspace.consumer.bitMap.getExistingBitId(id)); // this also assure that the ID is in .bitmap
    const componentEjector = new ComponentsEjector(this.workspace, this.logger, compact(bitIds), { force, keepFiles });
    const ejectResults = await componentEjector.eject();
    if (json) return JSON.stringify(ejectResults, null, 2);
    return ejectTemplate(ejectResults);
  }
}
