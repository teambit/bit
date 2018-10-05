// @flow
import AbstractVinyl from './abstract-vinyl';
import sha1 from '../../../utils/encryption/sha1';

export default function areVinylArrayEqual(filesLeft: AbstractVinyl[], filesRight: AbstractVinyl[]): boolean {
  if (!filesLeft || !filesRight) return false;
  if (filesLeft.length !== filesRight.length) return false;
  return filesLeft.every((fileLeft) => {
    const fileRight = filesRight.find(f => f.relative === fileLeft.relative);
    if (!fileRight) return false;
    return sha1(fileLeft.contents) === sha1(fileRight.contents);
  });
}
