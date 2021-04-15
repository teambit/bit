import { migrate } from '../../../api/consumer';
import lanesList from '../../../api/scope/lib/scope-lanes-list';
import logger from '../../../logger/logger';
import { LaneData } from '../../../scope/lanes/lanes';
import { checkVersionCompatibilityOnTheServer } from '../../../scope/network/check-version-compatibility';
import { buildCommandMessage, fromBase64, packCommand, unpackCommand } from '../../../utils';
import clientSupportCompressedCommand from '../../../utils/ssh/client-support-compressed-command';
import { CommandOptions, LegacyCommand } from '../../legacy-command';

let compressResponse;

export default class ListLanes implements LegacyCommand {
  name = '_lanes <path> <args>';
  private = true;
  internal = true;
  description = 'list lanes';
  alias = '';
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  opts = [['', 'merge-data', 'collect merge data']] as CommandOptions;

  action([path, args]: [string, string], { mergeData }: { mergeData?: boolean }): Promise<LaneData[]> {
    const { payload, headers } = unpackCommand(args);
    compressResponse = clientSupportCompressedCommand(headers.version);
    checkVersionCompatibilityOnTheServer(headers.version);
    logger.info('Checking if a migration is needed');
    const scopePath = fromBase64(path);
    return migrate(scopePath, false).then(() => {
      return lanesList(scopePath, payload, mergeData);
    });
  }

  report(str: string): string {
    return packCommand(buildCommandMessage(str, undefined, compressResponse), true, compressResponse);
  }
}
