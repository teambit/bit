import uidNumber from 'uid-number';

import { BitError } from '@teambit/bit-error';
import logger from '@teambit/legacy/dist/logger/logger';

export default async function resolveGroupId(groupName: string): Promise<number | null | undefined> {
  return new Promise((resolve, reject) => {
    uidNumber(null, groupName, (err, uid, gid) => {
      if (err) {
        logger.error('resolveGroupId', err);
        if (err.message.includes('EPERM')) {
          return reject(
            new BitError(
              `unable to resolve group id of "${groupName}", current user does not have sufficient permissions`
            )
          );
        }
        if (err.message.includes('group id does not exist')) {
          return reject(new BitError(`unable to resolve group id of "${groupName}", the group does not exist`));
        }
        return reject(new BitError(`unable to resolve group id of "${groupName}", got an error ${err.message}`));
      }
      // on Windows it'll always be null
      return resolve(gid);
    });
  });
}
