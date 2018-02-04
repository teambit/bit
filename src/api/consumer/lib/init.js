/** @flow */
import { Consumer } from '../../../consumer';

export default function init(absPath: string, noGit: boolean = false): Promise<Consumer> {
  return Consumer.create(absPath, noGit).then(consumer => consumer.write());
}
