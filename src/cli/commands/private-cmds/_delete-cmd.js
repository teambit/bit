/** @flow */
import Command from '../../command';
import { remove } from '../../../api/scope';
import { fromBase64, unpackCommand, packCommand, buildCommandMessage } from '../../../utils';
import { migrate } from '../../../api/consumer';
import logger from '../../../logger/logger';

export default class Delete extends Command {
  name = '_delete <path> <args>';
  private = true;
  description = 'remove a component from a scope';
  alias = '';
  opts = [];

  action([path, args]: [string, string]): Promise<any> {
    const { payload } = unpackCommand(args);
    logger.info('Checking if a migration is needed');
    const scopePath = fromBase64(path);
    return migrate(scopePath, false).then(() => {
      return remove({ path: scopePath, bitIds: payload.bitIds, force: payload.force });
    });
  }

  report(str): string {
    return packCommand(buildCommandMessage(str));
  }
}
