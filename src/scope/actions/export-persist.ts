import { Scope } from '..';
import { BitIds } from '../../bit-id';
import { exportManyBareScope } from '../component-ops/export-scope-components';
import { Action } from './action';

type Options = { clientId: string };

export class ExportPersist implements Action<Options, string[]> {
  async execute(scope: Scope, options: Options): Promise<string[]> {
    const objectList = await scope.readObjectsFromPendingDir(options.clientId);
    const bitIds: BitIds = await exportManyBareScope(scope, objectList);
    const componentsIds: string[] = bitIds.map((id) => id.toString());
    await scope.removePendingDir(options.clientId);
    return componentsIds;
  }
}
