import BitIds from '../../bit-id/bit-ids';
import logger from '../../logger/logger';
import DataToPersist from '../component/sources/data-to-persist';
import RemovePath from '../component/sources/remove-path';
import Consumer from '../consumer';

export default async function deleteComponentsFiles(consumer: Consumer, bitIds: BitIds, deleteFilesForAuthor: boolean) {
  logger.debug(`deleteComponentsFiles, ids: ${bitIds.toString()}`);
  const filesToDelete = getFilesToDelete();
  filesToDelete.addBasePath(consumer.getPath());
  return filesToDelete.persistAllToFS();

  function getFilesToDelete(): DataToPersist {
    const dataToPersist = new DataToPersist();
    bitIds.forEach((id) => {
      if (!deleteFilesForAuthor) return;
      const ignoreVersion = id.isLocal() || !id.hasVersion();
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
