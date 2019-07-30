/** @flow */
import fs from 'fs-extra';
import { Consumer } from '../../../consumer';
import { Repository } from '../../../scope/objects';
import { isDirEmpty } from '../../../utils';
import type { WorkspaceConfigProps } from '../../../consumer/config/workspace-config';
import ObjectsWithoutConsumer from './exceptions/objects-without-consumer';

export default (async function init(
  absPath: string = process.cwd(),
  noGit: boolean = false,
  reset: boolean = false,
  resetHard: boolean = false,
  force: boolean = false,
  workspaceConfigProps: WorkspaceConfigProps
): Promise<Consumer> {
  if (reset || resetHard) {
    await Consumer.reset(absPath, resetHard, noGit);
  }
  const consumer: Consumer = await Consumer.create(absPath, noGit, workspaceConfigProps);
  if (!force) {
    await throwForOutOfSyncScope(consumer);
  }
  return consumer.write();
});

/**
 * throw an error when .bitmap is empty but a scope has objects.
 * a user may got into this state for reasons such as:
 * 1. deleting manually .bitmap hoping to re-start Bit from scratch. (probably unaware of `--reset-hard` flag).
 * 2. switching to a branch where Bit wasn't initialized
 * in which case, it's better to stop and show an error describing what needs to be done.
 * it can always be ignored by entering `--force` flag.
 */
async function throwForOutOfSyncScope(consumer: Consumer): Promise<void> {
  if (!consumer.bitMap.isEmpty()) return;
  const scopePath = consumer.scope.getPath();
  const objectsPath = Repository.getPathByScopePath(scopePath);
  const dirExist = await fs.pathExists(objectsPath);
  if (!dirExist) return;
  const hasObjects = !(await isDirEmpty(objectsPath));
  if (hasObjects) {
    throw new ObjectsWithoutConsumer(scopePath);
  }
}
