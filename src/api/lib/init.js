/** @flow */
import { Box } from '../../box';

export default function init(absPath: string) {
  return Box.create(absPath).write();
}
