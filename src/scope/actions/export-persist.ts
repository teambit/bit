import { Scope } from '..';
import { BitIds } from '../../bit-id';
import logger from '../../logger/logger';
import { mergeObjects } from '../component-ops/export-scope-components';
import { Action } from './action';

type Options = { clientId: string };

export class ExportPersist implements Action<Options, string[]> {
  async execute(scope: Scope, options: Options): Promise<string[]> {
    const objectList = await scope.readObjectsFromPendingDir(options.clientId);

    logger.debugAndAddBreadCrumb('ExportPersist', `going to merge ${objectList.objects.length} objects`);
    const bitIds: BitIds = await mergeObjects(scope, objectList);
    await scope.objects.persist();
    logger.debugAndAddBreadCrumb('ExportPersist', 'objects were written successfully to the filesystem');

    const componentsIds: string[] = bitIds.map((id) => id.toString());
    await scope.removePendingDir(options.clientId);
    return componentsIds;
  }
}
