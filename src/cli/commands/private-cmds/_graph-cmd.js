/** @flow */
import Command from '../../command';
import { fromBase64, unpackCommand, packCommand, buildCommandMessage } from '../../../utils';
import { graph } from '../../../api/scope';
import { migrate } from '../../../api/consumer';
import logger from '../../../logger/logger';
import { checkVersionCompatibilityOnTheServer } from '../../../scope/network/check-version-compatibility';

export default class _Graph extends Command {
  name = '_graph <path> <args>';
  private = true;
  description = 'returns scope graph or sub-graph when component id is given';
  alias = '';
  opts = [];

  action([path, args]: [string, string]): Promise<any> {
    const { payload, headers } = unpackCommand(args);
    checkVersionCompatibilityOnTheServer(headers.version);
    logger.info('Checking if a migration is needed');
    const scopePath = fromBase64(path);
    return migrate(scopePath, false).then(() => {
      return graph(scopePath, payload);
    });
  }

  report(str: string): string {
    return packCommand(buildCommandMessage(str));
  }
}
