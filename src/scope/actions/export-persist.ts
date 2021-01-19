import { Scope } from '..';
import { BitIds } from '../../bit-id';
import logger from '../../logger/logger';
import { mergeObjects } from '../component-ops/export-scope-components';
import { Lane } from '../models';
import { AuthData } from '../network/http/http';
import { Action } from './action';

type Options = { clientId: string };

/**
 * load objects from pending-dir by a client-id and persist them to the object directory.
 * once done, remove the pending-dir to free the resource.
 */
export class ExportPersist implements Action<Options, string[]> {
  async execute(scope: Scope, options: Options, authData?: AuthData): Promise<string[]> {
    const objectList = await scope.readObjectsFromPendingDir(options.clientId);

    logger.debugAndAddBreadCrumb('ExportPersist', `going to merge ${objectList.objects.length} objects`);
    const bitIds: BitIds = await mergeObjects(scope, objectList);
    await scope.objects.persist();
    logger.debugAndAddBreadCrumb('ExportPersist', 'objects were written successfully to the filesystem');

    const componentsIds: string[] = bitIds.map((id) => id.toString());
    await scope.removePendingDir(options.clientId);
    if (ExportPersist.onPutHook) {
      const lanes = (await objectList.toBitObjects()).getLanes();
      ExportPersist.onPutHook(componentsIds, lanes, authData).catch((err) => {
        logger.error('fatal: onPutHook encountered an error (this error does not stop the process)', err);
        // let the process continue. we don't want to stop it when onPutHook failed.
      });
    }
    return componentsIds;
  }

  static onPutHook: (ids: string[], lanes: Lane[], authData?: AuthData) => Promise<void>;
}
