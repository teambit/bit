/** @flow */
import Command from '../../command';
import { fromBase64, packCommand, buildCommandMessage } from '../../../utils';
import { scopeList } from '../../../api/scope';
import { migrate } from '../../../api/consumer';
import logger from '../../../logger/logger';

export default class List extends Command {
  name = '_list <path> <args>';
  private = true;
  description = 'list scope components';
  alias = '';
  opts = [];

  action([path]: [string, string]): Promise<any> {
    logger.info('Checking if a migration is needed');
    const scopePath = fromBase64(path);
    return migrate(scopePath, false).then(() => {
      return scopeList(scopePath).then(components => components.map(c => c.toString()));
    });
  }

  report(str: string): string {
    return packCommand(buildCommandMessage(str));
  }
}
