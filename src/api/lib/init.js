/** @flow */
import { Consumer } from '../../consumer';

export default function init(absPath: string): Promise<Consumer> {
  return Consumer.create(absPath).write();
}
