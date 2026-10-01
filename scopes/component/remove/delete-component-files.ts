import type { ComponentIdList } from '@teambit/component-id';
import { logger } from '@teambit/legacy.logger';
import { DataToPersist, RemovePath } from '@teambit/component.sources';
import { WORKSPACE_ROOT_DIR } from '@teambit/legacy.bit-map';
import type { Consumer } from '@teambit/legacy.consumer';

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
      if (rootDir === WORKSPACE_ROOT_DIR) {
        // this component's rootDir is the workspace itself. deleting it would wipe the entire
        // workspace - every nested component, .git, .bit and the .bitmap that maps them all.
        // its files are the workspace's own (workspace.jsonc, README, CI config), not component
        // source, so untracking it must leave them in place.
        logger.debug(`deleteComponentsFiles, skipping the files of ${id.toString()}, it owns the workspace root`);
        return;
      }
      dataToPersist.removePath(new RemovePath(rootDir, true));
    });
    return dataToPersist;
  }
}
