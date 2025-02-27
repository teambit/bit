import { ComponentIdList } from '@teambit/component-id';
import { Scope } from '@teambit/legacy.scope';
import { logger } from '@teambit/legacy.logger';
import { saveObjects } from '@teambit/export';
import { Lane } from '@teambit/objects';
import { AuthData } from '@teambit/scope.network';
import { Action } from './action';

type Options = { clientId: string };

/**
 * load objects from pending-dir by a client-id and persist them to the object directory.
 * once done, remove the pending-dir to free the resource.
 */
export class ExportPersist implements Action<Options, string[]> {
  async execute(scope: Scope, options: Options, authData?: AuthData): Promise<string[]> {
    const objectList = await scope.readObjectsFromPendingDir(options.clientId);

    logger.debug(`ExportPersist, going to merge ${objectList.objects.length} objects`);
    const bitIds: ComponentIdList = await saveObjects(scope, objectList);

    const componentsIds: string[] = bitIds.map((id) => id.toString());
    await scope.removePendingDir(options.clientId);
    if (ExportPersist.onPutHook) {
      const lanes = (await objectList.toBitObjects()).getLanes();
      ExportPersist.onPutHook(componentsIds, lanes, authData).catch((err) => {
        logger.error(`fatal: ExportPersist.onPutHook encountered an error (this error does not stop the process)`, err);
        // let the process continue. we don't want to stop it when onPutHook failed.
      });
    }
    logger.debug(`ExportPersist, completed successfully, total ${componentsIds.length} components exported`);
    return componentsIds;
  }

  static onPutHook: (ids: string[], lanes: Lane[], authData?: AuthData) => Promise<void>;
}
