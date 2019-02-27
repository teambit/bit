/** @flow */
import fs from 'fs-extra';
import { Consumer } from '../../../consumer';
import BitMap from '../../../consumer/bit-map/bit-map';
import { Repository } from '../../../scope/objects';
import { isDirEmpty } from '../../../utils';
import ObjectsWithoutConsumer from './exceptions/objects-without-consumer';

export default (async function init(
  absPath: string = process.cwd(),
  noGit: boolean = false,
  reset: boolean = false,
  resetHard: boolean = false,
  force: boolean = false
): Promise<Consumer> {
  let overrideBitJson = false;
  if (reset || resetHard) {
    await Consumer.reset(absPath, resetHard, noGit);
    overrideBitJson = true;
  } else if (!force) {
    await throwForOutOfSyncScope(absPath, noGit);
  }
  const consumer: Consumer = await Consumer.create(absPath, noGit);
  return consumer.write({ overrideBitJson });
});

/**
 * throw an error when .bitmap is deleted but a scope has objects.
 * a user may got into this state for reasons such as:
 * 1. deleting manually .bitmap hoping to re-start Bit from scratch. (probably unaware of `--reset-hard` flag).
 * 2. switching to a branch where Bit wasn't initialized
 * in which case, it's better to stop and show an error describing what needs to be done.
 * it can always be ignored by entering `--force` flag.
 */
async function throwForOutOfSyncScope(absPath: string, noGit: boolean): Promise<void> {
  const { currentLocation: bitMapLocation } = BitMap.getBitMapLocation(absPath);
  if (bitMapLocation) return;
  const scopePath = Consumer._getScopePath(absPath, noGit);
  const objectsPath = Repository.getPathByScopePath(scopePath);
  const dirExist = await fs.pathExists(objectsPath);
  if (!dirExist) return;
  const hasObjects = !(await isDirEmpty(objectsPath));
  if (hasObjects) {
    throw new ObjectsWithoutConsumer(scopePath);
  }
}
