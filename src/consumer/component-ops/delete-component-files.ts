import BitIds from '../../bit-id/bit-ids';
import { COMPONENT_ORIGINS } from '../../constants';
import logger from '../../logger/logger';
import DataToPersist from '../component/sources/data-to-persist';
import Dists from '../component/sources/dists';
import RemovePath from '../component/sources/remove-path';
import Consumer from '../consumer';

export default async function deleteComponentsFiles(consumer: Consumer, bitIds: BitIds, deleteFilesForAuthor: boolean) {
  logger.debug(`deleteComponentsFiles, ids: ${bitIds.toString()}`);
  const filesToDelete = consumer.isLegacy ? getFilesToDeleteLegacy() : getFilesToDeleteHarmony();
  filesToDelete.addBasePath(consumer.getPath());
  return filesToDelete.persistAllToFS();

  function getFilesToDeleteLegacy(): DataToPersist {
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

  function getFilesToDeleteHarmony(): DataToPersist {
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
