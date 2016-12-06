/** @flow */
import { Box } from '../../box';

export default function init(absPath: string): Promise<Box> {
  return Box.create(absPath).write();
}
