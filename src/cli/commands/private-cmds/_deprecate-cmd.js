/** @flow */
import Command from '../../command';
import { deprecate } from '../../../api/scope';
import { fromBase64, unpackCommand, packCommand, buildCommandMessage } from '../../../utils';
import { migrate } from '../../../api/consumer';
import logger from '../../../logger/logger';

export default class Deprecate extends Command {
  name = '_deprecate <path> <args>';
  private = true;
  description = 'deprecate a component from a scope';
  alias = '';
  opts = [];

  action([path, args]: [string, string]): Promise<any> {
    const { payload, headers } = unpackCommand(args);
    logger.info('Checking if a migration is needed');
    const scopePath = fromBase64(path);
    return migrate(scopePath, false).then(() => {
      return deprecate({ path: scopePath, bitIds: payload.bitIds }, headers);
    });
  }

  report(str): string {
    return packCommand(buildCommandMessage(str));
  }
}
