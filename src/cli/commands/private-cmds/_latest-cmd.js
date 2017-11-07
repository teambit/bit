/** @flow */
import Command from '../../command';
import { fromBase64, unpackCommand, packCommand, buildCommandMessage } from '../../../utils';
import { latestVersions } from '../../../api/scope';
import { migrate } from '../../../api/consumer';
import logger from '../../../logger/logger';

export default class Latest extends Command {
  name = '_latest <path> <args>';
  private = true;
  description = 'latest version numbers of given components';
  alias = '';
  opts = [];

  action([path, args]: [string, string]): Promise<any> {
    const { payload } = unpackCommand(args);
    logger.info('Checking if a migration is needed');
    const scopePath = fromBase64(path);
    return migrate(scopePath, false).then(() => {
      return latestVersions(scopePath, payload);
    });
  }

  report(str: string): string {
    return packCommand(buildCommandMessage(str));
  }
}
