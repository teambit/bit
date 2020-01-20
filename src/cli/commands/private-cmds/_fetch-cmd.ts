import Command from '../../command';
import { fromBase64, unpackCommand, buildCommandMessage } from '../../../utils';
import { fetch } from '../../../api/scope';
import ComponentObjects from '../../../scope/component-objects';
import { migrate } from '../../../api/consumer';
import logger from '../../../logger/logger';
import { checkVersionCompatibilityOnTheServer } from '../../../scope/network/check-version-compatibility';
import clientSupportCompressedCommand from '../../../utils/ssh/client-support-compressed-command';
import CompsAndLanesObjects from '../../../scope/comps-and-lanes-objects';

let compressResponse;
export default class Fetch extends Command {
  name = '_fetch <path> <args>';
  private = true;
  description = 'fetch components(s) from a scope';
  alias = '';
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  opts = [['n', 'no-dependencies', 'do not include component dependencies'], ['', 'lanes', 'provided ids are lanes']];

  action([path, args]: [string, string], { noDependencies, lanes }: any): Promise<any> {
    const { payload, headers } = unpackCommand(args);
    compressResponse = clientSupportCompressedCommand(headers.version);
    checkVersionCompatibilityOnTheServer(headers.version);
    logger.info('Checking if a migration is needed');
    const scopePath = fromBase64(path);
    return migrate(scopePath, false).then(() => {
      return fetch(scopePath, payload, noDependencies, lanes, headers);
    });
  }

  report(compsAndLanesObjects: CompsAndLanesObjects): string {
    const components = compsAndLanesObjects.toString();
    // No need to use packCommand because we handle all the base64 stuff in a better way inside the ComponentObjects.manyToString
    return JSON.stringify(buildCommandMessage(components, undefined, compressResponse));
  }
}
