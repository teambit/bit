/** @flow */
import Command from '../../command';
import { deprecate } from '../../../api/scope';
import { fromBase64, unpackCommand, packCommand, buildCommandMessage } from '../../../utils';
import { migrate } from '../../../api/consumer';
import logger from '../../../logger/logger';
import { checkVersionCompatibilityOnTheServer } from '../../../scope/network/check-version-compatibility';
import { DeprecationResult } from '../../../scope/component-ops/components-deprecation';

export default class Deprecate extends Command {
  name = '_deprecate <path> <args>';
  private = true;
  description = 'deprecate a component from a scope';
  alias = '';
  opts = [];

  action([path, args]: [string, string]): Promise<any> {
    const { payload, headers } = unpackCommand(args);
    checkVersionCompatibilityOnTheServer(headers.version);
    logger.info('Checking if a migration is needed');
    const scopePath = fromBase64(path);
    return migrate(scopePath, false).then(() => {
      return deprecate({ path: scopePath, ids: payload.ids }, headers);
    });
  }

  report(deprecationResult: DeprecationResult): string {
    return packCommand(buildCommandMessage(deprecationResult));
  }
}
