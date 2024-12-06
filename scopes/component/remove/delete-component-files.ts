import { ComponentIdList } from '@teambit/component-id';
import logger from '@teambit/legacy/dist/logger/logger';
import { DataToPersist, RemovePath } from '@teambit/component.sources';
import { Consumer } from '@teambit/legacy.consumer';

export async function deleteComponentsFiles(consumer: Consumer, bitIds: ComponentIdList) {
  logger.debug(`deleteComponentsFiles, ids: ${bitIds.toString()}`);
  const filesToDelete = getFilesToDelete();
  filesToDelete.addBasePath(consumer.getPath());
  return filesToDelete.persistAllToFS();

  function getFilesToDelete(): DataToPersist {
    const dataToPersist = new DataToPersist();
    bitIds.forEach((id) => {
      const ignoreVersion = consumer.scope.isLocal(id) || !id.hasVersion();
      const componentMap = consumer.bitMap.getComponentIfExist(id, { ignoreVersion });
      if (!componentMap) {
        logger.warn(
          `deleteComponentsFiles was unable to delete ${id.toString()} because the id is missing from bitmap`
        );
        return;
      }
      const rootDir = componentMap.rootDir;
      if (!rootDir) throw new Error(`rootDir is missing from ${id.toString()}`);
      dataToPersist.removePath(new RemovePath(rootDir, true));
    });
    return dataToPersist;
  }
}
