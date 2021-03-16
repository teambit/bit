import { migrate } from '../../../api/consumer';
import { fetch } from '../../../api/scope';
import { FETCH_OPTIONS, FETCH_TYPE } from '../../../api/scope/lib/fetch';
import logger from '../../../logger/logger';
import { checkVersionCompatibilityOnTheServer } from '../../../scope/network/check-version-compatibility';
import { FETCH_FORMAT_OBJECT_LIST, ObjectList } from '../../../scope/objects/object-list';
import { buildCommandMessage, fromBase64, unpackCommand } from '../../../utils';
import clientSupportCompressedCommand from '../../../utils/ssh/client-support-compressed-command';
import { CommandOptions, LegacyCommand } from '../../legacy-command';

let compressResponse;
export default class Fetch implements LegacyCommand {
  name = '_fetch <path> <args>';
  private = true;
  internal = true;
  description = 'fetch components(s) from a scope';
  alias = '';
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  opts = [
    ['', 'type <string>', 'ids type, options are: ["component", "lane", "object"]'],
    ['n', 'no-dependencies', 'do not include component dependencies'],
    ['', 'include-artifacts', 'include components artifacts objects'],
  ] as CommandOptions;

  action(
    [path, args]: [string, string],
    {
      type,
      noDependencies = false,
      includeArtifacts = false,
    }: {
      type: FETCH_TYPE;
      noDependencies: boolean;
      includeArtifacts: boolean;
    }
  ): Promise<ObjectList> {
    const { payload, headers } = unpackCommand(args);
    compressResponse = clientSupportCompressedCommand(headers.version);
    checkVersionCompatibilityOnTheServer(headers.version);
    logger.info('Checking if a migration is needed');
    const scopePath = fromBase64(path);
    const fetchOptions: FETCH_OPTIONS = {
      type,
      withoutDependencies: noDependencies,
      includeArtifacts,
    };
    return migrate(scopePath, false)
      .then(() => fetch(scopePath, payload, fetchOptions, headers))
      .then((readable) => ObjectList.fromReadableStream(readable));
  }

  report(objectList: ObjectList): string {
    const objectListStr = objectList.toJsonString();
    // No need to use packCommand because we handle all the base64 stuff in a better way inside the ComponentObjects.manyToString
    return JSON.stringify(
      buildCommandMessage(objectListStr, undefined, compressResponse, { format: FETCH_FORMAT_OBJECT_LIST })
    );
  }
}
