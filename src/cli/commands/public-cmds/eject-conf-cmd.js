/** @flow */
import Command from '../../command';
import { ejectConf } from '../../../api/consumer';
import type { EjectConfResult } from '../../../consumer/component-ops/eject-conf';

export default class EjectConf extends Command {
  name = 'eject-conf [id]';
  description = 'ejecting components configuration';
  alias = '';
  opts = [['p', 'path <path>', 'ejecting configuration into a specific directory']];
  loader = true;
  migration = true;

  action([id]: [string], { path }: { path?: string }): Promise<EjectConfResult> {
    return ejectConf(id, { ejectPath: path });
  }

  report(ejectResults: EjectConfResult): string {
    return `Eject results :\n${JSON.stringify(ejectResults)}`;
  }
}
