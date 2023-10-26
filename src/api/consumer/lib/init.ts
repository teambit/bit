import fs from 'fs-extra';

import { Consumer } from '../../../consumer';
import { WorkspaceConfigProps } from '../../../consumer/config/workspace-config';
import { Scope } from '../../../scope';
import { Repository } from '../../../scope/objects';
import { findScopePath, isDirEmpty } from '../../../utils';
import ObjectsWithoutConsumer from './exceptions/objects-without-consumer';

export default async function init(
  absPath: string = process.cwd(),
  noGit = false,
  reset = false,
  resetNew = false,
  resetLaneNew = false,
  resetHard = false,
  resetScope = false,
  force = false,
  workspaceConfigProps: WorkspaceConfigProps
): Promise<Consumer> {
  if (reset || resetHard) {
    await Consumer.reset(absPath, resetHard, noGit);
  }
  let consumer: Consumer | undefined;
  try {
    consumer = await Consumer.create(absPath, noGit, workspaceConfigProps);
  } catch (err) {
    // it's possible that at this stage the consumer fails to load due to scope issues.
    // still we want to load it to include its instance of "scope.json", so then later when "consumer.write()", we
    // don't lose some scope metadata
  }
  if (resetScope) {
    const scopePath = findScopePath(process.cwd());
    if (!scopePath) throw new Error(`fatal: scope not found in the path: ${process.cwd()}`);
    await Scope.reset(scopePath, true);
  }
  if (!consumer) consumer = await Consumer.create(absPath, noGit, workspaceConfigProps);
  if (!force && !resetScope) {
    await throwForOutOfSyncScope(consumer);
  }
  if (resetNew) {
    await consumer.resetNew();
  }
  if (resetLaneNew) {
    await consumer.resetLaneNew();
  }
  return consumer.write();
}

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
