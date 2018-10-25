/** @flow */
import Command from '../../command';
import { fromBase64, packCommand, buildCommandMessage } from '../../../utils';
import { scopeList } from '../../../api/scope';
import { migrate } from '../../../api/consumer';
import logger from '../../../logger/logger';
import type { ListScopeResult } from '../../../consumer/component/components-list';

export default class List extends Command {
  name = '_list <path> <args>';
  private = true;
  description = 'list scope components';
  alias = '';
  opts = [];

  action([path]: [string, string]): Promise<ListScopeResult[]> {
    logger.info('Checking if a migration is needed');
    const scopePath = fromBase64(path);
    return migrate(scopePath, false).then(() => {
      return scopeList(scopePath);
    });
  }

  report(str: string): string {
    return packCommand(buildCommandMessage(str));
  }
}
