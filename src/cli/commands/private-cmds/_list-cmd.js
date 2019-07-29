/** @flow */
import Command from '../../command';
import { fromBase64, packCommand, unpackCommand, buildCommandMessage } from '../../../utils';
import { scopeList } from '../../../api/scope';
import { migrate } from '../../../api/consumer';
import logger from '../../../logger/logger';
import type { ListScopeResult } from '../../../consumer/component/components-list';
import { checkVersionCompatibilityOnTheServer } from '../../../scope/network/check-version-compatibility';

export default class List extends Command {
  name = '_list <path> <args>';
  private = true;
  description = 'list scope components';
  alias = '';
  opts = [];

  action([path, args]: [string, string]): Promise<ListScopeResult[]> {
    const { payload, headers } = unpackCommand(args);
    checkVersionCompatibilityOnTheServer(headers.version);
    logger.info('Checking if a migration is needed');
    const scopePath = fromBase64(path);
    return migrate(scopePath, false).then(() => {
      return scopeList(scopePath, payload);
    });
  }

  report(str: string): string {
    return packCommand(buildCommandMessage(str));
  }
}
