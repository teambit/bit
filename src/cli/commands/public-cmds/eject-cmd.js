/** @flow */
import Command from '../../command';
import { ejectAction } from '../../../api/consumer';
import type { EjectResults } from '../../../consumer/component-ops/eject-components';
import ejectTemplate from '../../templates/eject-template';

export default class Eject extends Command {
  name = 'eject <id...>';
  description = 'remove components from the local scope and install them by the NPM client';
  alias = 'E';
  opts = [
    ['f', 'force', 'ignore local version. remove the components even when they are staged or modified'],
    ['j', 'json', 'print the results in JSON format']
  ];
  loader = true;
  migration = true;

  action([ids]: [string[]], { force, json }: { force: boolean, json: boolean }): Promise<EjectResults> {
    return ejectAction(ids, force).then(ejectResults => ({ ejectResults, json }));
  }

  report({ ejectResults, json }: { ejectResults: EjectResults, json: boolean }): string {
    if (json) return JSON.stringify(ejectResults, null, 2);
    return ejectTemplate(ejectResults);
  }
}
