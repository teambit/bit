import { ejectAction } from '../../../api/consumer';
import { EjectResults } from '../../../consumer/component-ops/eject-components';
import { Group } from '../../command-groups';
import { CommandOptions, LegacyCommand } from '../../legacy-command';
import ejectTemplate from '../../templates/eject-template';

export default class Eject implements LegacyCommand {
  name = 'eject <id...>';
  description = 'replaces the components from the local scope with the corresponding packages';
  group: Group = 'collaborate';
  alias = 'E';
  opts = [
    ['f', 'force', 'ignore local version. remove the components even when they are staged or modified'],
    ['j', 'json', 'print the results in JSON format'],
  ] as CommandOptions;
  loader = true;
  migration = true;

  action([ids]: [string[]], { force, json }: { force: boolean; json: boolean }): Promise<EjectResults> {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return ejectAction(ids, force).then((ejectResults) => ({ ejectResults, json }));
  }

  report({ ejectResults, json }: { ejectResults: EjectResults; json: boolean }): string {
    if (json) return JSON.stringify(ejectResults, null, 2);
    return ejectTemplate(ejectResults);
  }
}
