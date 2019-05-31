/** @flow */
import Diagnosis from '../diagnosis';
import type { ExamineBareResult } from '../diagnosis';
import { loadConsumer } from '../../consumer';
import { Symlink, ModelComponent } from '../../scope/models';
import { BitId, BitIds } from '../../bit-id';

export default class OrphanSymlinkObjects extends Diagnosis {
  name = 'orphan-symlink-objects';
  description = 'validate that objects do not have symlinks that point to non exist components';
  category = 'bit-core-files';

  _formatSymptoms(bareResult: ExamineBareResult): string {
    if (!bareResult.data) throw new Error('OrphanSymlinkObjects, bareResult.data is missing');
    return `the following symlink objects point to non-exist components "${bareResult.data.orphanSymlinks.toString()}"`;
  }

  _formatManualTreat(bareResult: ExamineBareResult) {
    if (!bareResult.data) throw new Error('OrphanSymlinkObjects, bareResult.data is missing');
    return `please delete the following paths:\n${bareResult.data.objectsToDelete.join('\n')}`;
  }

  async _runExamine(): Promise<ExamineBareResult> {
    const consumer = await loadConsumer();
    const bitObjects = await consumer.scope.objects.list();
    const symlinks = bitObjects.filter(object => object instanceof Symlink);
    const orphanSymlinks = new BitIds();
    const objectsToDelete = [];
    await Promise.all(
      symlinks.map(async (symlink) => {
        const realComponentId: BitId = symlink.getRealComponentId();
        const realModelComponent = ModelComponent.fromBitId(realComponentId);
        const foundComponent = await consumer.scope.objects.load(realModelComponent.hash());
        if (!foundComponent) {
          orphanSymlinks.push(realComponentId);
          objectsToDelete.push(consumer.scope.objects.objectPath(symlink.hash()));
        }
      })
    );

    return {
      valid: orphanSymlinks.length === 0,
      data: {
        orphanSymlinks,
        objectsToDelete
      }
    };
  }
}
