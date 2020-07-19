import logger from '../../logger/logger';
import BitIds from '../../bit-id/bit-ids';
import { COMPONENT_ORIGINS } from '../../constants';
import Consumer from '../consumer';
import DataToPersist from '../component/sources/data-to-persist';
import RemovePath from '../component/sources/remove-path';
import Dists from '../component/sources/dists';

export default (async function deleteComponentsFiles(
  consumer: Consumer,
  bitIds: BitIds,
  deleteFilesForAuthor: boolean
) {
  logger.debug(`deleteComponentsFiles, ids: ${bitIds.toString()}`);
  const filesToDelete = getFilesToDelete();
  filesToDelete.addBasePath(consumer.getPath());
  return filesToDelete.persistAllToFS();

  function getFilesToDelete(): DataToPersist {
    const dataToPersist = new DataToPersist();
    bitIds.forEach((id) => {
      const ignoreVersion = id.isLocal() || !id.hasVersion();
      const componentMap = consumer.bitMap.getComponentIfExist(id, { ignoreVersion });
      if (!componentMap) {
        logger.warn(
          `deleteComponentsFiles was unable to delete ${id.toString()} because the id is missing from bitmap`
        );
        return null;
      }
      if (componentMap.origin === COMPONENT_ORIGINS.IMPORTED || componentMap.origin === COMPONENT_ORIGINS.NESTED) {
        // $FlowFixMe rootDir is set for non authored
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        const rootDir: string = componentMap.rootDir;
        dataToPersist.removePath(new RemovePath(rootDir, true));
        if (!consumer.shouldDistsBeInsideTheComponent()) {
          const distDir = Dists.getDistDirWhenDistIsOutsideCompDir(consumer.config, rootDir);
          dataToPersist.removePath(new RemovePath(distDir, true));
        }
      } else if (componentMap.origin === COMPONENT_ORIGINS.AUTHORED && deleteFilesForAuthor) {
        const filesToRemove = componentMap.getAllFilesPaths().map((f) => new RemovePath(f));
        dataToPersist.removeManyPaths(filesToRemove);
      }
      return null;
    });
    return dataToPersist;
  }
});
