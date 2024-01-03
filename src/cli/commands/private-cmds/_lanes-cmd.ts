import lanesList from '../../../api/scope/lib/scope-lanes-list';
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
    const scopePath = fromBase64(path);
    return lanesList(scopePath, payload, mergeData);
  }

  report(str: string): string {
    return packCommand(buildCommandMessage(str, undefined, compressResponse), true, compressResponse);
  }
}
