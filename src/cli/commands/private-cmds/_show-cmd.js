/** @flow */
import Command from '../../command';
import { fromBase64, unpackCommand, packCommand, buildCommandMessage } from '../../../utils';
import { scopeShow } from '../../../api/scope';
import { migrate } from '../../../api/consumer';
import logger from '../../../logger/logger';

export default class _Show extends Command {
  name = '_show <path> <args>';
  private = true;
  description = 'show a specific component on scope';
  alias = '';
  opts = [];

  action([path, args]: [string, string]): Promise<any> {
    const { payload } = unpackCommand(args);
    // validateVersion(headers)
    logger.info('Checking if a migration is needed');
    const scopePath = fromBase64(path);
    return migrate(scopePath, false).then(() => {
      return scopeShow(scopePath, payload);
    });
  }

  report(str: string): string {
    return packCommand(buildCommandMessage(str));
  }
}
